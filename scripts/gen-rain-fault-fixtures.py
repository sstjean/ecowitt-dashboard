#!/usr/bin/env python3
"""Generate committed STATIC-CAPTURE fixtures for the rain-fault detector from a
read-only local DB copy. Each fixture is a trimmed, downsampled (~5-min cadence),
deterministic `StoredReading[]` extracted from a real observed window.

Self-verifies each window's expected verdict before writing:
  * 008 = full-window signature (piezo gate + >= MIN_PROXIES quorum).
  * 014 = 008 AND the same signature ALSO holds over the sub-window ending
    SUSTAIN_MIN minutes before `now` (the sustained-duration gate).

The original 008 fixtures (storm/dew/rain) are regenerated from the 008 DB copy
(`/tmp/ecowitt.sqlite`) when present. The 014 leading-edge fixture is generated
from the 014 capture (`/tmp/ecowitt-014capture.sqlite`), and the committed
`storm-06-28.json` is 014-self-verified IN PLACE (loaded, not rewritten) so it
stays byte-for-byte unchanged. Read-only against the DB. No PII in this app.
"""
import sqlite3, json, os
from datetime import datetime, timezone, timedelta

DB = "/tmp/ecowitt.sqlite"                     # 008 fixtures (storm/dew/rain)
DB_014 = "/tmp/ecowitt-014capture.sqlite"      # 014 leading-edge capture (read-only)
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
MIN_READINGS, SUSTAIN_MIN = 4, 45              # 014: sustained-gate sub-window (min)


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


def signature_held(recs, end_dt):
    """Mirror the detector's `signatureFired`: the 008 storm signature holds over
    `recs` (already filtered to t <= end_dt) when the sub-window is assessable
    (>= MIN_READINGS rows AND spans >= TREND_MIN minutes) AND the piezo gate
    holds AND >= MIN_PROXIES proxies concur. Returns True/False."""
    if len(recs) < MIN_READINGS:
        return False
    span_min = (end_dt - parse_iso(recs[0][0])).total_seconds() / 60.0
    if span_min < TREND_MIN:
        return False
    suspect, _gate, _n, _names, _dbg = verdict(recs)
    return suspect


def verdict_014(recs, now_dt):
    """Compose the sustained-duration verdict: 008 (full window @ now) AND the
    signature ALSO holding over the sub-window ending now - SUSTAIN_MIN.
    Returns (v008, v014, sub_proxies)."""
    full = [(oa, m) for oa, m in recs if parse_iso(oa) <= now_dt]
    v008 = signature_held(full, now_dt)
    end_sub = now_dt - timedelta(minutes=SUSTAIN_MIN)
    sub = [(oa, m) for oa, m in full if parse_iso(oa) <= end_sub]
    sub_held = signature_held(sub, end_sub)
    _s, _g, sub_n, _names, _dbg = verdict(sub) if sub else (False, False, 0, [], {})
    return v008, (v008 and sub_held), sub_n


def last_now(recs):
    """The instant of the window's last reading (the detector's `now`)."""
    return parse_iso(recs[-1][0])


def write_leading_edge_fixture(conn, name, a, b, expect_008, expect_014):
    """Generate a 014 fixture from the capture and self-verify BOTH the 008
    full-window verdict and the 014 sustained sub-window verdict before writing."""
    recs = load(conn, a, b)
    now_dt = last_now(recs)
    v008, v014, sub_n = verdict_014(recs, now_dt)
    ok = v008 == expect_008 and v014 == expect_014
    status = "OK" if ok else "*** MISMATCH ***"
    print(f"{name}: rows={len(recs)} now={recs[-1][0]} "
          f"008={v008} (expect {expect_008}) 014={v014} (expect {expect_014}) "
          f"{status}\n    sub-window(now-{SUSTAIN_MIN}) proxies={sub_n}")
    if not ok:
        raise SystemExit(f"verdict mismatch for {name}")
    fixture = [trim(oa, m) for oa, m in recs]
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        json.dump(fixture, f, indent=2)
        f.write("\n")
    return path


def verify_existing_014(name, expect_014):
    """014-self-verify an ALREADY-COMMITTED fixture IN PLACE (load, do NOT
    rewrite) so byte-for-byte identity is preserved. Confirms the sustained gate
    still fires the committed positive fixture."""
    path = os.path.join(OUT, name)
    with open(path) as f:
        fixture = json.load(f)
    recs = [(r["observedAt"], r["metrics"]) for r in fixture]
    now_dt = last_now(recs)
    v008, v014, sub_n = verdict_014(recs, now_dt)
    ok = v014 == expect_014
    status = "OK" if ok else "*** MISMATCH ***"
    print(f"{name} (existing, not rewritten): rows={len(recs)} "
          f"008={v008} 014={v014} (expect {expect_014}) {status}\n    "
          f"sub-window(now-{SUSTAIN_MIN}) proxies={sub_n}")
    if not ok:
        raise SystemExit(f"014 verdict mismatch for {name}")
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    # --- 008 fixtures (regenerated only when the 008 DB copy is present) -------
    if os.path.exists(DB):
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
    else:
        print(f"[skip] 008 DB {DB} absent \u2014 leaving committed 008 fixtures untouched")

    # --- 014 leading-edge fixture (from the read-only capture) -----------------
    if os.path.exists(DB_014):
        cap = sqlite3.connect(DB_014)
        # 07-06 leading edge: window ends just before the 21:15Z rain onset, so
        # the full signature has fired (008=True) but only within the last
        # < SUSTAIN_MIN minutes \u2014 the now-45 sub-window is below quorum (014=False).
        write_leading_edge_fixture(
            cap, "leading-edge-07-06.json",
            "2026-07-06T19:42:00.000Z", "2026-07-06T21:15:00.000Z", True, False)
        cap.close()
    else:
        print(f"[skip] 014 capture {DB_014} absent \u2014 cannot generate leading-edge fixture")

    # --- 014 re-verify of the committed positive fixture (NOT rewritten) -------
    # The storm-06-28 signature is sustained for hours, so the now-45 sub-window
    # still fires the full signature \u2192 014 stays True.
    verify_existing_014("storm-06-28.json", True)


if __name__ == "__main__":
    main()
