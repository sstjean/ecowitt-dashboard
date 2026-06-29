#!/usr/bin/env python3
"""Pass 3: tightened rule. Mandatory = piezo_near_zero AND temp_crash AND
humidity_surge AND gust_spike; corroborating = pressure_dip OR (daytime)
solar_collapse (>=1). Characterize every remaining flagged window and dump
06-26 afternoon rain context. Read-only against /tmp/ecowitt.sqlite.
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


def evaluate(recs):
    if len(recs) < 4:
        return False, {"insufficient": True}
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

    temp_crash = temp_drop >= TEMP_DROP_F
    humidity_surge = hum_surge >= HUMIDITY_SURGE_PCT
    gust_spike = gust_max >= GUST_SPIKE_MPH
    pressure_dip = press_dip >= PRESSURE_DIP_HPA
    solar_collapse = is_day and solar_frac >= SOLAR_COLLAPSE_FRAC
    corroborators = sum([pressure_dip, solar_collapse])

    suspect = (piezo_near_zero and temp_crash and humidity_surge
               and gust_spike and corroborators >= 1)
    return suspect, {
        "temp_drop": round(temp_drop, 2), "hum_surge": round(hum_surge, 2),
        "gust_max": round(gust_max, 2), "press_dip": round(press_dip, 2),
        "solar_peak": round(solar_peak, 2), "solar_frac": round(solar_frac, 3),
        "is_day": is_day, "rate_max": rate_max, "event_rise": round(event_rise, 4),
        "piezo_near_zero": piezo_near_zero, "temp_crash": temp_crash,
        "humidity_surge": humidity_surge, "gust_spike": gust_spike,
        "pressure_dip": pressure_dip, "solar_collapse": solar_collapse,
        "suspect": suspect,
    }


def main():
    conn = sqlite3.connect(DB)
    for nm, a, b in [
        ("STORM 06-28 (expect True)", "2026-06-28T20:30:00.000Z", "2026-06-28T23:30:00.000Z"),
        ("DEW 06-28 (expect False)", "2026-06-28T01:00:00.000Z", "2026-06-28T09:00:00.000Z"),
        ("RAIN 06-27 (expect False)", "2026-06-27T09:59:00.000Z", "2026-06-27T12:08:00.000Z"),
    ]:
        s, d = evaluate(load_window(conn, a, b))
        print(f"\n--- {nm} => suspect={s}")
        print(f"    {d}")

    print("\n========== TIGHTENED SWEEP (90-min windows, all data) ==========")
    rng = conn.execute("SELECT MIN(observed_at), MAX(observed_at) FROM readings").fetchone()
    t = parse_iso(rng[0]); end = parse_iso(rng[1])
    step = timedelta(minutes=30); width = timedelta(minutes=90)
    total = 0; flags = []
    while t + width <= end:
        ws = t.isoformat().replace("+00:00", "Z")
        we = (t + width).isoformat().replace("+00:00", "Z")
        recs = load_window(conn, ws, we)
        if len(recs) >= 4:
            total += 1
            s, d = evaluate(recs)
            if s:
                flags.append((ws, we, d))
        t += step
    print(f"  evaluated windows: {total}")
    print(f"  flagged SUSPECT: {len(flags)}")
    for ws, we, d in flags:
        print(f"    FLAG {ws} .. {we}")
        print(f"        tempdrop={d['temp_drop']} humsurge={d['hum_surge']} "
              f"gust={d['gust_max']} pressdip={d['press_dip']} "
              f"solarfrac={d['solar_frac']} rate_max={d['rate_max']} "
              f"event_rise={d['event_rise']}")

    print("\n========== 06-26 afternoon rain context (15:36-21:00 UTC) ==========")
    ctx = load_window(conn, "2026-06-26T15:36:00.000Z", "2026-06-26T21:00:00.000Z")
    rd = [r["rainDailyIn"] for r in ctx if r["rainDailyIn"] is not None]
    re = [r["rainEventIn"] for r in ctx if r["rainEventIn"] is not None]
    rr = [r["rainRateInHr"] for r in ctx if r["rainRateInHr"] is not None]
    print(f"  rainDailyIn: start={rd[0] if rd else None} end={rd[-1] if rd else None} max={max(rd) if rd else None}")
    print(f"  rainEventIn: start={re[0] if re else None} end={re[-1] if re else None} max={max(re) if re else None}")
    print(f"  rainRateInHr: max={max(rr) if rr else None}")
    print(f"  tempF min/max: {smax([{'v':-r['outdoorTempF']} for r in ctx if r['outdoorTempF'] is not None],'v')}")
    temps = [r['outdoorTempF'] for r in ctx if r['outdoorTempF'] is not None]
    hums = [r['outdoorHumidityPct'] for r in ctx if r['outdoorHumidityPct'] is not None]
    print(f"  tempF min={min(temps)} max={max(temps)}  humidity min={min(hums)} max={max(hums)}")
    conn.close()


if __name__ == "__main__":
    main()
