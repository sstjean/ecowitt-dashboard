import sqlite3, json
from datetime import datetime, timezone, timedelta

DB = "/tmp/ecowitt-014capture.sqlite"
conn = sqlite3.connect(DB)

# 07-06 window: 17:00Z .. now, ~5-min cadence (first row per bucket)
rows = conn.execute(
    "SELECT observed_at, metrics_json FROM readings WHERE observed_at >= '2026-07-06T17:00:00Z' ORDER BY observed_at ASC"
).fetchall()

def num(m, k):
    v = m.get(k)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None

seen = {}
out = []
for oa, mj in rows:
    t = datetime.fromisoformat(oa.replace("Z","+00:00"))
    key = int(t.timestamp() // 300)
    if key in seen: continue
    seen[key] = True
    m = json.loads(mj)
    out.append((t, m))

# EDT = UTC-4
def edt(t): return (t - timedelta(hours=4)).strftime("%H:%M")

print(f"{'EDT':>6} {'temp':>5} {'hum':>4} {'gust':>5} {'press':>8} {'solar':>6} {'rate':>5} {'evt':>5} {'daily':>5}")
for t, m in out:
    print(f"{edt(t):>6} {num(m,'outdoorTempF'):>5} {num(m,'outdoorHumidityPct'):>4} "
          f"{num(m,'gustMph'):>5} {num(m,'pressureHpa'):>8.1f} {num(m,'solarWm2'):>6} "
          f"{num(m,'rainRateInHr'):>5} {num(m,'rainEventIn'):>5} {num(m,'rainDailyIn'):>5}")
