#!/usr/bin/env python3
"""Generate committed STATIC-CAPTURE fixtures for the 008 rain-fault detector
from the real local DB copy (/tmp/ecowitt.sqlite). Each fixture is a trimmed,
downsampled (~5-min cadence), deterministic `StoredReading[]` extracted from a
real observed window. Self-verifies each window's expected verdict (quorum rule,
MIN_PROXIES=4) before writing. Read-only against the DB. No PII in this app.
"""
import sqlite3, json, os
from datetime import datetime, timezone

DB = "/tmp/ecowitt.sqlite"
OUT = "apps/api/tests/fixtures/rainFault"
# Detector-relevant keys kept in each trimmed reading (+ one real ghost field
# `rain_0x0D` so the "ignore Ambient tipping-bucket" invariant FR-002 is testable).
KEEP = ["outdoorTempF", "dewpointF", "gustMph", "outdoorHumidityPct",
        "pressureHpa", "solarWm2", "rainRateInHr", "rainEventIn", "rainDailyIn",
        "rain_0x0D"]

# Reference thresholds (mirror RAIN_FAULT_DEFAULTS) for self-verification only.
TEMP_DROP_F, HUMIDITY_SURGE_PCT, GUST_SPIKE_MPH = 6.0, 10.0, 8.0
PRESSURE_DIP_HPA, SOLAR_COLLAPSE_FRAC, SOLAR_DAY_MIN_WM2 = 0.8, 0.5, 50.0
PIEZO_RATE_EPS, PIEZO_EVENT_EPS, TREND_MIN, MIN_PROXIES = 0.01, 0.01, 30, 4


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def load(conn, a, b, bucket_min=5):
    rows = conn.execute(
        "SELECT observed_at, metrics_json FROM readings WHERE observed_at >= ? "
        "AND observed_at < ? ORDER BY observed_at ASC", (a, b)).fetchall()
    seen, out = set(), []
    for oa, mj in rows:
        t = parse_iso(oa)
        key = int(t.timestamp() // (bucket_min * 60))  # first row of each bucket
        if key in seen:
            continue
        seen.add(key)
        out.append((oa, json.loads(mj)))
    return out


def num(m, k):
    v = m.get(k)
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def rdrop(recs, k):
    best = 0.0
    for i, (ta, a) in enumerate(recs):
        if num(a, k) is None:
            continue
        for tb, b in recs[i + 1:]:
            if num(b, k) is None:
                continue
            if (parse_iso(tb) - parse_iso(ta)).total_seconds() / 60.0 > TREND_MIN:
                break
            best = max(best, num(a, k) - num(b, k))
    return best


def rrise(recs, k):
    best = 0.0
    for i, (ta, a) in enumerate(recs):
        if num(a, k) is None:
            continue
        for tb, b in recs[i + 1:]:
            if num(b, k) is None:
                continue
            if (parse_iso(tb) - parse_iso(ta)).total_seconds() / 60.0 > TREND_MIN:
                break
            best = max(best, num(b, k) - num(a, k))
    return best


def smax(recs, k):
    vs = [num(m, k) for _, m in recs if num(m, k) is not None]
    return max(vs) if vs else 0.0


def verdict(recs):
    temp_drop = rdrop(recs, "outdoorTempF")
    hum_surge = rrise(recs, "outdoorHumidityPct")
    gust_max = smax(recs, "gustMph")
    press_dip = rdrop(recs, "pressureHpa")
    solar_peak = smax(recs, "solarWm2")
    is_day = solar_peak >= SOLAR_DAY_MIN_WM2
    solar_drop = rdrop(recs, "solarWm2")
    solar_frac = (solar_drop / solar_peak) if solar_peak > 0 else 0.0
    rate_max = smax(recs, "rainRateInHr")
    event_rise = rrise(recs, "rainEventIn")
    piezo_near_zero = rate_max <= PIEZO_RATE_EPS and event_rise <= PIEZO_EVENT_EPS
    fired = {
        "temp_crash": temp_drop >= TEMP_DROP_F,
        "humidity_surge": hum_surge >= HUMIDITY_SURGE_PCT,
        "gust_spike": gust_max >= GUST_SPIKE_MPH,
        "pressure_dip": press_dip >= PRESSURE_DIP_HPA,
        "solar_collapse": is_day and solar_frac >= SOLAR_COLLAPSE_FRAC,
    }
    suspect = piezo_near_zero and sum(fired.values()) >= MIN_PROXIES
    return suspect, piezo_near_zero, sum(fired.values()), \
        [k for k, v in fired.items() if v], {
            "temp_drop": round(temp_drop, 2), "hum_surge": round(hum_surge, 2),
            "gust_max": round(gust_max, 2), "press_dip": round(press_dip, 2),
            "solar_frac": round(solar_frac, 3), "is_day": is_day,
            "rate_max": round(rate_max, 3), "event_rise": round(event_rise, 3)}


def trim(oa, m):
    out = {k: m[k] for k in KEEP if k in m}
    return {"observedAt": oa, "metrics": out}


def write_fixture(conn, name, a, b, expect_suspect):
    recs = load(conn, a, b)
    sus, gate, n, names, dbg = verdict(recs)
    status = "OK" if sus == expect_suspect else "*** MISMATCH ***"
    print(f"{name}: rows={len(recs)} suspect={sus} (expect {expect_suspect}) "
          f"{status}\n    gate={gate} proxies={n} {names} {dbg}")
    if sus != expect_suspect:
        raise SystemExit(f"verdict mismatch for {name}")
    fixture = [trim(oa, m) for oa, m in recs]
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        json.dump(fixture, f, indent=2)
        f.write("\n")
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    conn = sqlite3.connect(DB)
    write_fixture(conn, "storm-06-28.json",
                  "2026-06-28T20:30:00.000Z", "2026-06-28T23:30:00.000Z", True)
    write_fixture(conn, "dew-06-28-gate.json",
                  "2026-06-28T01:00:00.000Z", "2026-06-28T09:00:00.000Z", False)
    write_fixture(conn, "dew-06-28-calm.json",
                  "2026-06-27T07:36:00.000Z", "2026-06-27T09:06:00.000Z", False)
    write_fixture(conn, "rain-06-27.json",
                  "2026-06-27T09:59:00.000Z", "2026-06-27T12:08:00.000Z", False)
    conn.close()


if __name__ == "__main__":
    main()
