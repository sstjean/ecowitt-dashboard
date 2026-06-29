#!/usr/bin/env python3
"""Pass 2: rolling pressure/solar, rainEvent accumulation, and candidate-rule
validation across all three fixtures + every night window in the dataset (SC-004).
Read-only against /tmp/ecowitt.sqlite.
"""
import sqlite3
import json
from datetime import datetime, timezone, timedelta

DB = "/tmp/ecowitt.sqlite"
KEYS = ["outdoorTempF", "dewpointF", "gustMph", "outdoorHumidityPct",
        "pressureHpa", "solarWm2", "rainRateInHr", "rainEventIn"]

# Candidate tunable thresholds
TEMP_DROP_F = 6.0          # over TREND_MIN
HUMIDITY_SURGE_PCT = 10.0  # over TREND_MIN
GUST_SPIKE_MPH = 8.0       # window max
PRESSURE_DIP_HPA = 0.8     # over TREND_MIN (rolling)
SOLAR_COLLAPSE_FRAC = 0.5  # fractional drop from window solar peak (daytime)
SOLAR_DAY_MIN_WM2 = 50.0   # window solar peak above this => treat as daytime
PIEZO_RATE_EPS = 0.01      # in/hr "near zero"
PIEZO_EVENT_EPS = 0.01     # in accumulation "near zero"
TREND_MIN = 30             # rolling trend span (minutes)
CONCURRENCE_K = 3          # dynamic signals required to concur


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_window(conn, start_iso, end_iso):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings "
        "WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at ASC",
        (start_iso, end_iso)).fetchall()
    out = []
    for observed_at, mj in rows:
        m = json.loads(mj)
        rec = {"t": parse_iso(observed_at), "iso": observed_at}
        for k in KEYS:
            v = m.get(k)
            try:
                rec[k] = float(v) if v is not None else None
            except (TypeError, ValueError):
                rec[k] = None
        out.append(rec)
    return out


def rolling_drop(recs, key, minutes):
    best = 0.0
    for i, a in enumerate(recs):
        if a[key] is None:
            continue
        for b in recs[i + 1:]:
            if b[key] is None:
                continue
            if (b["t"] - a["t"]).total_seconds() / 60.0 > minutes:
                break
            best = max(best, a[key] - b[key])
    return best


def rolling_rise(recs, key, minutes):
    best = 0.0
    for i, a in enumerate(recs):
        if a[key] is None:
            continue
        for b in recs[i + 1:]:
            if b[key] is None:
                continue
            if (b["t"] - a["t"]).total_seconds() / 60.0 > minutes:
                break
            best = max(best, b[key] - a[key])
    return best


def smax(recs, key):
    vals = [r[key] for r in recs if r[key] is not None]
    return max(vals) if vals else None


def evaluate(recs):
    """Apply the candidate rule. Returns (suspect, signals_dict)."""
    if len(recs) < 4:
        return False, {"insufficient": True}
    temp_drop = rolling_drop(recs, "outdoorTempF", TREND_MIN)
    hum_surge = rolling_rise(recs, "outdoorHumidityPct", TREND_MIN)
    gust_max = smax(recs, "gustMph") or 0.0
    press_dip = rolling_drop(recs, "pressureHpa", TREND_MIN)
    solar_peak = smax(recs, "solarWm2") or 0.0
    is_day = solar_peak >= SOLAR_DAY_MIN_WM2
    solar_drop = rolling_drop(recs, "solarWm2", TREND_MIN)
    solar_frac = (solar_drop / solar_peak) if solar_peak > 0 else 0.0

    rate_max = smax(recs, "rainRateInHr") or 0.0
    event_rise = rolling_rise(recs, "rainEventIn", TREND_MIN)
    piezo_near_zero = rate_max <= PIEZO_RATE_EPS and event_rise <= PIEZO_EVENT_EPS

    sig = {
        "temp_crash": temp_drop >= TEMP_DROP_F,
        "gust_spike": gust_max >= GUST_SPIKE_MPH,
        "humidity_surge": hum_surge >= HUMIDITY_SURGE_PCT,
        "pressure_dip": press_dip >= PRESSURE_DIP_HPA,
        "solar_collapse": is_day and solar_frac >= SOLAR_COLLAPSE_FRAC,
    }
    count = sum(1 for v in sig.values() if v)
    suspect = piezo_near_zero and count >= CONCURRENCE_K
    return suspect, {
        "temp_drop": round(temp_drop, 2), "hum_surge": round(hum_surge, 2),
        "gust_max": round(gust_max, 2), "press_dip": round(press_dip, 2),
        "solar_peak": round(solar_peak, 2), "is_day": is_day,
        "solar_frac": round(solar_frac, 3), "rate_max": rate_max,
        "event_rise": round(event_rise, 4), "piezo_near_zero": piezo_near_zero,
        "signals": sig, "count": count, "suspect": suspect,
    }


def report(name, recs):
    suspect, d = evaluate(recs)
    print(f"\n--- {name} ---")
    for k, v in d.items():
        print(f"    {k}: {v}")


def main():
    conn = sqlite3.connect(DB)
    storm = load_window(conn, "2026-06-28T20:30:00.000Z", "2026-06-28T23:30:00.000Z")
    dew = load_window(conn, "2026-06-28T01:00:00.000Z", "2026-06-28T09:00:00.000Z")
    rain = load_window(conn, "2026-06-27T09:59:00.000Z", "2026-06-27T12:08:00.000Z")
    report("STORM 06-28 (expect SUSPECT=True)", storm)
    report("DEW 06-28 (expect SUSPECT=False)", dew)
    report("RAIN 06-27 (expect SUSPECT=False)", rain)

    # SC-004: sweep EVERY rolling 90-min window across the whole dataset at night
    # (solar peak < day threshold) and across all data, count false positives.
    print("\n========== SC-004 SWEEP: rolling 90-min windows over all data ==========")
    rng = conn.execute("SELECT MIN(observed_at), MAX(observed_at) FROM readings").fetchone()
    start = parse_iso(rng[0]); end = parse_iso(rng[1])
    step = timedelta(minutes=30); width = timedelta(minutes=90)
    t = start; total = 0; flags = 0; flagged_windows = []
    while t + width <= end:
        ws = t.isoformat().replace("+00:00", "Z")
        we = (t + width).isoformat().replace("+00:00", "Z")
        recs = load_window(conn, ws, we)
        if len(recs) >= 4:
            total += 1
            suspect, d = evaluate(recs)
            if suspect:
                flags += 1
                flagged_windows.append((ws, we, d["count"], d["signals"]))
        t += step
    print(f"  evaluated windows: {total}")
    print(f"  windows flagged SUSPECT: {flags}")
    for fw in flagged_windows:
        print(f"    FLAG {fw[0]} .. {fw[1]} count={fw[2]} {fw[3]}")
    conn.close()


if __name__ == "__main__":
    main()
