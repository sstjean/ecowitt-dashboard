#!/usr/bin/env python3
"""Quorum verification: gate = piezo_near_zero; fault when >= MIN_PROXIES of the
5 proxy signals {temp_crash, humidity_surge, gust_spike, pressure_dip,
daytime solar_collapse} concur. Compares MIN_PROXIES = 3, 4 against the prior
mandatory-trio rule. Read-only against /tmp/ecowitt.sqlite.
"""
import sqlite3
import json
from datetime import datetime, timezone, timedelta

DB = "/tmp/ecowitt.sqlite"
KEYS = ["outdoorTempF", "dewpointF", "gustMph", "outdoorHumidityPct",
        "pressureHpa", "solarWm2", "rainRateInHr", "rainEventIn", "rainDailyIn"]

TEMP_DROP_F = 6.0
HUMIDITY_SURGE_PCT = 10.0
GUST_SPIKE_MPH = 8.0
PRESSURE_DIP_HPA = 0.8
SOLAR_COLLAPSE_FRAC = 0.5
SOLAR_DAY_MIN_WM2 = 50.0
PIEZO_RATE_EPS = 0.01
PIEZO_EVENT_EPS = 0.01
TREND_MIN = 30


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_window(conn, a, b):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings WHERE observed_at >= ? "
        "AND observed_at < ? ORDER BY observed_at ASC", (a, b)).fetchall()
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


def rdrop(recs, key, minutes):
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


def rrise(recs, key, minutes):
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


def signals(recs):
    temp_drop = rdrop(recs, "outdoorTempF", TREND_MIN)
    hum_surge = rrise(recs, "outdoorHumidityPct", TREND_MIN)
    gust_max = smax(recs, "gustMph") or 0.0
    press_dip = rdrop(recs, "pressureHpa", TREND_MIN)
    solar_peak = smax(recs, "solarWm2") or 0.0
    is_day = solar_peak >= SOLAR_DAY_MIN_WM2
    solar_drop = rdrop(recs, "solarWm2", TREND_MIN)
    solar_frac = (solar_drop / solar_peak) if solar_peak > 0 else 0.0
    rate_max = smax(recs, "rainRateInHr") or 0.0
    event_rise = rrise(recs, "rainEventIn", TREND_MIN)
    piezo_near_zero = rate_max <= PIEZO_RATE_EPS and event_rise <= PIEZO_EVENT_EPS

    fired = {
        "temp_crash": temp_drop >= TEMP_DROP_F,
        "humidity_surge": hum_surge >= HUMIDITY_SURGE_PCT,
        "gust_spike": gust_max >= GUST_SPIKE_MPH,
        "pressure_dip": press_dip >= PRESSURE_DIP_HPA,
        "solar_collapse": is_day and solar_frac >= SOLAR_COLLAPSE_FRAC,
    }
    return piezo_near_zero, fired, {
        "temp_drop": round(temp_drop, 2), "hum_surge": round(hum_surge, 2),
        "gust_max": round(gust_max, 2), "press_dip": round(press_dip, 2),
        "solar_frac": round(solar_frac, 3), "is_day": is_day,
        "rate_max": rate_max,
    }


def is_night_window(recs):
    sp = smax(recs, "solarWm2") or 0.0
    return sp < SOLAR_DAY_MIN_WM2


def rule_quorum(piezo, fired, k):
    return piezo and sum(fired.values()) >= k


def rule_trio(piezo, fired):
    return (piezo and fired["temp_crash"] and fired["humidity_surge"]
            and fired["gust_spike"]
            and (fired["pressure_dip"] or fired["solar_collapse"]))


def main():
    conn = sqlite3.connect(DB)
    labels = [
        ("STORM 06-28 (expect True)", "2026-06-28T20:30:00.000Z", "2026-06-28T23:30:00.000Z"),
        ("DEW   06-28 (expect False)", "2026-06-28T01:00:00.000Z", "2026-06-28T09:00:00.000Z"),
        ("RAIN  06-27 (expect False)", "2026-06-27T09:59:00.000Z", "2026-06-27T12:08:00.000Z"),
    ]
    print("=== labelled windows ===")
    for nm, a, b in labels:
        recs = load_window(conn, a, b)
        if len(recs) < 4:
            print(f"{nm}: insufficient"); continue
        piezo, fired, dbg = signals(recs)
        n = sum(fired.values())
        print(f"{nm}: piezo_near_zero={piezo} proxies_fired={n} {[k for k,v in fired.items() if v]}")
        print(f"    q3={rule_quorum(piezo,fired,3)} q4={rule_quorum(piezo,fired,4)} trio={rule_trio(piezo,fired)}  {dbg}")

    rng = conn.execute("SELECT MIN(observed_at), MAX(observed_at) FROM readings").fetchone()
    t = parse_iso(rng[0]); end = parse_iso(rng[1])
    step = timedelta(minutes=30); width = timedelta(minutes=90)
    total = 0
    flagged = {"q3": [], "q4": [], "trio": []}
    night_flags = {"q3": 0, "q4": 0, "trio": 0}
    while t + width <= end:
        ws = t.isoformat().replace("+00:00", "Z")
        we = (t + width).isoformat().replace("+00:00", "Z")
        recs = load_window(conn, ws, we)
        if len(recs) >= 4:
            total += 1
            piezo, fired, dbg = signals(recs)
            night = is_night_window(recs)
            for nm, hit in [("q3", rule_quorum(piezo, fired, 3)),
                            ("q4", rule_quorum(piezo, fired, 4)),
                            ("trio", rule_trio(piezo, fired))]:
                if hit:
                    flagged[nm].append((ws, we, sum(fired.values()),
                                        [k for k, v in fired.items() if v], dbg, night))
                    if night:
                        night_flags[nm] += 1
        t += step
    print(f"\n=== full sweep: {total} windows ===")
    for nm in ("q3", "q4", "trio"):
        print(f"\n--- rule {nm}: {len(flagged[nm])} flags ({night_flags[nm]} NIGHT) ---")
        for ws, we, n, names, dbg, night in flagged[nm]:
            tag = " *** NIGHT FALSE-POS ***" if night else ""
            print(f"  {ws[5:16]}..{we[11:16]} n={n} {names}{tag}")
            print(f"      {dbg}")
    conn.close()


if __name__ == "__main__":
    main()
