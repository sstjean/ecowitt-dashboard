#!/usr/bin/env python3
"""Find a real calm-saturation night window with piezo == 0 for the
dew-06-28-calm fixture (proves the QUORUM-not-met exclusion path). Read-only."""
import sqlite3, json
from datetime import timedelta
from datetime import datetime, timezone

DB = "/tmp/ecowitt.sqlite"
KEYS = ["outdoorTempF", "dewpointF", "gustMph", "outdoorHumidityPct",
        "pressureHpa", "solarWm2", "rainRateInHr", "rainEventIn"]


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def load(conn, a, b):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings WHERE observed_at >= ? "
        "AND observed_at < ? ORDER BY observed_at ASC", (a, b)).fetchall()
    out = []
    for oa, mj in rows:
        m = json.loads(mj)
        rec = {"t": parse_iso(oa), "iso": oa}
        for k in KEYS:
            v = m.get(k)
            rec[k] = float(v) if v is not None else None
        out.append(rec)
    return out


def smax(recs, k):
    vs = [r[k] for r in recs if r[k] is not None]
    return max(vs) if vs else None


def smin(recs, k):
    vs = [r[k] for r in recs if r[k] is not None]
    return min(vs) if vs else None


conn = sqlite3.connect(DB)
rng = conn.execute("SELECT MIN(observed_at), MAX(observed_at) FROM readings").fetchone()
t = parse_iso(rng[0]); end = parse_iso(rng[1])
width = timedelta(minutes=90); step = timedelta(minutes=30)
cands = []
while t + width <= end:
    ws = t.isoformat().replace("+00:00", "Z")
    we = (t + width).isoformat().replace("+00:00", "Z")
    recs = load(conn, ws, we)
    if len(recs) >= 6:
        solar = smax(recs, "solarWm2") or 0.0
        rate = smax(recs, "rainRateInHr") or 0.0
        evt = smax(recs, "rainEventIn") or 0.0
        hum = smin(recs, "outdoorHumidityPct") or 0.0
        gust = smax(recs, "gustMph") or 0.0
        spread = None
        sp = [abs((r["outdoorTempF"] or 0) - (r["dewpointF"] or 0)) for r in recs
              if r["outdoorTempF"] is not None and r["dewpointF"] is not None]
        spread = max(sp) if sp else None
        # calm saturated night, piezo dead-zero
        if solar < 50 and rate == 0.0 and hum >= 97 and gust <= 4 and (spread or 9) <= 2:
            cands.append((ws, we, len(recs), round(hum, 1), round(gust, 1),
                          round(spread, 2), rate, evt))
    t += step
for c in cands[:15]:
    print(c)
print(f"total candidates: {len(cands)}")
conn.close()
