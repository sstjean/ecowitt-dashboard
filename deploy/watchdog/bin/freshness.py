#!/usr/bin/env python3
"""freshness.py — read-only poller-freshness reader for the container watchdog.

Computes how old the newest stored reading is by reading MAX(observed_at) from
the app SQLite DB **read-only** (it cannot write, lock the writer's WAL, or
corrupt the DB). Emits a single JSON object on stdout and exits 0 when fresh data
is available, 1 otherwise. The caller (lib/health.sh) maps a non-ok result to the
poller verdict `unknown`, which NEVER triggers a restart (FR-014).

python3 stdlib only — the host has no `sqlite3` CLI and no `jq` (research D1).

Output:
  ok:    {"ok": true, "max_observed_at": "<ISO-Z>", "age_seconds": <int>}
  not:   {"ok": false, "reason": "db_missing" | "empty" | "read_error"}
"""
import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

DEFAULT_DB = (
    "/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite"
)


def _parse_iso_utc(value):
    """Parse an ISO-8601 UTC timestamp (…Z or +00:00) to an epoch int.

    Python 3.9's datetime.fromisoformat() does not accept a trailing 'Z', so we
    normalise it. Returns None if the value cannot be parsed.
    """
    if value is None:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def read_freshness(db_path, now_epoch):
    """Return the freshness result dict (does not exit)."""
    if not os.path.exists(db_path):
        return {"ok": False, "reason": "db_missing"}

    try:
        # Read-only URI open + short busy timeout: cannot block or corrupt the
        # writer. immutable is NOT used (the writer mutates the WAL live).
        uri = "file:{}?mode=ro".format(db_path)
        conn = sqlite3.connect(uri, uri=True, timeout=2.0)
        try:
            conn.execute("PRAGMA busy_timeout = 2000")
            row = conn.execute("SELECT MAX(observed_at) FROM readings").fetchone()
        finally:
            conn.close()
    except (sqlite3.Error, OSError):
        return {"ok": False, "reason": "read_error"}

    max_observed = row[0] if row else None
    if max_observed is None:
        return {"ok": False, "reason": "empty"}

    epoch = _parse_iso_utc(max_observed)
    if epoch is None:
        return {"ok": False, "reason": "read_error"}

    return {
        "ok": True,
        "max_observed_at": max_observed,
        "age_seconds": int(now_epoch) - epoch,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Poller freshness reader")
    parser.add_argument("--db", default=DEFAULT_DB, help="path to the SQLite DB")
    parser.add_argument(
        "--now",
        type=int,
        default=None,
        help="epoch override for deterministic tests (default: UTC now)",
    )
    args = parser.parse_args(argv)

    now_epoch = (
        args.now
        if args.now is not None
        else int(datetime.now(tz=timezone.utc).timestamp())
    )

    result = read_freshness(args.db, now_epoch)
    sys.stdout.write(json.dumps(result))
    sys.stdout.write("\n")
    return 0 if result.get("ok") else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
