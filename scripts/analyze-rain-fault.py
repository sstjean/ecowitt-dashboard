#!/usr/bin/env python3
"""Read-only empirical analysis of the three rain-fault fixture windows.

Derives candidate thresholds for OQ-1..OQ-4 from the production SQLite snapshot
at /tmp/ecowitt.sqlite. Never writes to the DB.
"""
import sqlite3
import json
from datetime import datetime, timezone

DB = "/tmp/ecowitt.sqlite"

KEYS = [
    "outdoorTempF", "dewpointF", "gustMph", "windMph", "outdoorHumidityPct",
    "pressureHpa", "solarWm2", "rainRateInHr", "rainEventIn", "rainDailyIn",
    "isRaining",
]


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_window(conn, start_iso, end_iso):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings "
        "WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at ASC",
        (start_iso, end_iso),
    ).fetchall()
    out = []
    for observed_at, mj in rows:
        m = json.loads(mj)
        rec = {"t": parse_iso(observed_at), "iso": observed_at,
               "rain_0x": any(k.startswith("rain_") for k in m)}
        for k in KEYS:
            v = m.get(k)
            try:
                rec[k] = float(v) if v is not None else None
            except (TypeError, ValueError):
                rec[k] = None
        out.append(rec)
    return out


def rolling_max_drop(recs, key, minutes):
    """Largest (earlier - later) drop in `key` within any `minutes` span."""
    best = 0.0
    for i, a in enumerate(recs):
        if a[key] is None:
            continue
        for b in recs[i + 1:]:
            if b[key] is None:
                continue
            dt = (b["t"] - a["t"]).total_seconds() / 60.0
            if dt > minutes:
                break
            drop = a[key] - b[key]
            if drop > best:
                best = drop
    return best


def rolling_max_rise(recs, key, minutes):
    best = 0.0
    for i, a in enumerate(recs):
        if a[key] is None:
            continue
        for b in recs[i + 1:]:
            if b[key] is None:
                continue
            dt = (b["t"] - a["t"]).total_seconds() / 60.0
            if dt > minutes:
                break
            rise = b[key] - a[key]
            if rise > best:
                best = rise
    return best


def stat(recs, key, fn):
    vals = [r[key] for r in recs if r[key] is not None]
    return fn(vals) if vals else None


def summarize(name, recs):
    print(f"\n========== {name} ==========")
    if not recs:
        print("  (no readings in window)")
        return
    print(f"  readings: {len(recs)}")
    print(f"  span: {recs[0]['iso']} -> {recs[-1]['iso']}")
    print(f"  has Ambient rain_0x* fields: {any(r['rain_0x'] for r in recs)}")
    # cadence
    gaps = [(recs[i+1]['t'] - recs[i]['t']).total_seconds()/60.0 for i in range(len(recs)-1)]
    if gaps:
        print(f"  cadence min/median/max (min): {min(gaps):.2f} / "
              f"{sorted(gaps)[len(gaps)//2]:.2f} / {max(gaps):.2f}")

    for key in ["outdoorTempF", "gustMph", "pressureHpa", "outdoorHumidityPct", "solarWm2"]:
        lo = stat(recs, key, min)
        hi = stat(recs, key, max)
        print(f"  {key:20s} min={lo} max={hi} range={None if lo is None else round(hi-lo,2)}")

    # temp-dewpoint spread
    spreads = [r["outdoorTempF"] - r["dewpointF"] for r in recs
               if r["outdoorTempF"] is not None and r["dewpointF"] is not None]
    if spreads:
        print(f"  temp-dewpoint spread  min={round(min(spreads),2)} max={round(max(spreads),2)}")

    # piezo rain
    rr = [r["rainRateInHr"] for r in recs if r["rainRateInHr"] is not None]
    re = [r["rainEventIn"] for r in recs if r["rainEventIn"] is not None]
    rd = [r["rainDailyIn"] for r in recs if r["rainDailyIn"] is not None]
    if rr:
        print(f"  rainRateInHr          min={min(rr)} max={max(rr)}")
    if re:
        print(f"  rainEventIn           start={re[0]} end={re[-1]} delta={round(re[-1]-re[0],4)} max={max(re)}")
    if rd:
        print(f"  rainDailyIn           start={rd[0]} end={rd[-1]} delta={round(rd[-1]-rd[0],4)}")

    # dynamic signatures (rolling over several spans)
    print("  --- dynamic signature (rolling spans) ---")
    for mins in (15, 30, 60):
        td = rolling_max_drop(recs, "outdoorTempF", mins)
        hs = rolling_max_rise(recs, "outdoorHumidityPct", mins)
        print(f"    {mins}min: maxTempDrop={round(td,2)}F  maxHumiditySurge={round(hs,2)}%")
    # pressure dip across whole window
    pmax = stat(recs, "pressureHpa", max)
    pmin = stat(recs, "pressureHpa", min)
    if pmax is not None:
        print(f"    whole-window pressure dip (max-min) = {round(pmax-pmin,2)} hPa")


def find_rain_event(conn, day):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings "
        "WHERE observed_at >= ? AND observed_at < ? ORDER BY observed_at ASC",
        (f"{day}T00:00:00.000Z", f"{day}T23:59:59.999Z"),
    ).fetchall()
    hits = []
    for observed_at, mj in rows:
        m = json.loads(mj)
        rr = m.get("rainRateInHr")
        re = m.get("rainEventIn")
        try:
            rrf = float(rr) if rr is not None else 0.0
            ref = float(re) if re is not None else 0.0
        except (TypeError, ValueError):
            rrf = ref = 0.0
        if rrf > 0 or ref > 0:
            hits.append((observed_at, rrf, ref))
    if hits:
        print(f"\n[{day}] nonzero piezo rain readings: {len(hits)}")
        print(f"  first: {hits[0]}")
        print(f"  last:  {hits[-1]}")
        rr_all = [h[1] for h in hits]
        print(f"  rainRateInHr peak: {max(rr_all)}")
    else:
        print(f"\n[{day}] no nonzero piezo rain readings found")
    return hits


def main():
    conn = sqlite3.connect(DB)
    # Locate the 06-27 normal rain event
    hits = find_rain_event(conn, "2026-06-27")

    storm = load_window(conn, "2026-06-28T20:30:00.000Z", "2026-06-28T23:30:00.000Z")
    dew = load_window(conn, "2026-06-28T01:00:00.000Z", "2026-06-28T09:00:00.000Z")
    summarize("WINDOW 1: STORM (dead gauge) 06-28 20:30-23:30 UTC", storm)
    summarize("WINDOW 2: NIGHTLY DEW 06-28 01:00-09:00 UTC", dew)

    if hits:
        # build a tight window around the rain event
        start = hits[0][0]
        end = hits[-1][0]
        s = parse_iso(start)
        e = parse_iso(end)
        # pad 60 min each side
        from datetime import timedelta
        ws = (s - timedelta(minutes=60)).isoformat().replace("+00:00", "Z")
        we = (e + timedelta(minutes=60)).isoformat().replace("+00:00", "Z")
        normal = load_window(conn, ws, we)
        summarize(f"WINDOW 3: NORMAL RAIN (healthy) 06-27 {start} .. {end}", normal)

    conn.close()


if __name__ == "__main__":
    main()
