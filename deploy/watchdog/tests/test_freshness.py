#!/usr/bin/env python3
"""Unit tests for bin/freshness.py.

Two layers:

1. In-process tests (import the module) exercise every branch of
   `_parse_iso_utc`, `read_freshness`, and `main` directly. These drive the
   100%-coverage gate — a subprocess cannot be measured by coverage.py without
   extra machinery, and these functions are pure enough to call in-process.

2. CLI contract tests invoke the script as a subprocess (exactly as the
   orchestrator's lib/health.sh does) to pin the stdout-JSON + exit-code
   contract the shell layer depends on.
"""
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
FRESHNESS = os.path.join(HERE, "..", "bin", "freshness.py")

# Import bin/freshness.py as a module for in-process branch coverage.
_spec = importlib.util.spec_from_file_location("freshness", FRESHNESS)
freshness = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(freshness)

# A fixed reference instant for deterministic age math.
NOW = 1_751_220_000  # epoch seconds (UTC)


def iso_utc(epoch):
    """Format an epoch as the app's stored ISO-8601 UTC string (…Z)."""
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def make_db(path, observed_values):
    """Create a readings table and insert the given observed_at strings."""
    conn = sqlite3.connect(path)
    try:
        conn.execute("CREATE TABLE readings (observed_at TEXT NOT NULL UNIQUE)")
        conn.executemany(
            "INSERT INTO readings (observed_at) VALUES (?)",
            [(v,) for v in observed_values],
        )
        conn.commit()
    finally:
        conn.close()


class TempDbMixin(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        for root, _dirs, files in os.walk(self.tmp, topdown=False):
            for f in files:
                os.remove(os.path.join(root, f))
            os.rmdir(root)


class ParseIsoUtcTest(unittest.TestCase):
    def test_none_returns_none(self):
        self.assertIsNone(freshness._parse_iso_utc(None))

    def test_z_suffix_is_normalised(self):
        self.assertEqual(
            freshness._parse_iso_utc("2025-06-29T18:00:00Z"),
            int(datetime(2025, 6, 29, 18, 0, 0, tzinfo=timezone.utc).timestamp()),
        )

    def test_explicit_offset_is_accepted(self):
        self.assertEqual(
            freshness._parse_iso_utc("2025-06-29T18:00:00+00:00"),
            int(datetime(2025, 6, 29, 18, 0, 0, tzinfo=timezone.utc).timestamp()),
        )

    def test_naive_timestamp_is_treated_as_utc(self):
        # No 'Z' and no offset → fromisoformat yields a naive dt; the code must
        # assume UTC rather than the host's local zone.
        self.assertEqual(
            freshness._parse_iso_utc("2025-06-29T18:00:00"),
            int(datetime(2025, 6, 29, 18, 0, 0, tzinfo=timezone.utc).timestamp()),
        )

    def test_unparseable_returns_none(self):
        self.assertIsNone(freshness._parse_iso_utc("not-a-timestamp"))


class ReadFreshnessTest(TempDbMixin):
    def test_fresh_row_is_ok_with_small_age(self):
        db = os.path.join(self.tmp, "fresh.sqlite")
        make_db(db, [iso_utc(NOW - 42)])
        out = freshness.read_freshness(db, NOW)
        self.assertTrue(out["ok"])
        self.assertEqual(out["age_seconds"], 42)
        self.assertEqual(out["max_observed_at"], iso_utc(NOW - 42))

    def test_stale_row_wedge_signature_is_ok_but_old(self):
        db = os.path.join(self.tmp, "stale.sqlite")
        make_db(db, [iso_utc(NOW - 7320)])  # ~2h, the 06-29 wedge
        out = freshness.read_freshness(db, NOW)
        self.assertTrue(out["ok"])
        self.assertEqual(out["age_seconds"], 7320)

    def test_max_is_used_not_an_arbitrary_row(self):
        db = os.path.join(self.tmp, "multi.sqlite")
        make_db(db, [iso_utc(NOW - 9000), iso_utc(NOW - 100), iso_utc(NOW - 5000)])
        out = freshness.read_freshness(db, NOW)
        self.assertEqual(out["age_seconds"], 100)

    def test_missing_db_is_not_ok_db_missing(self):
        out = freshness.read_freshness(os.path.join(self.tmp, "nope.sqlite"), NOW)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "db_missing")

    def test_empty_table_is_not_ok_empty(self):
        db = os.path.join(self.tmp, "empty.sqlite")
        make_db(db, [])
        out = freshness.read_freshness(db, NOW)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "empty")

    def test_unparseable_timestamp_is_read_error(self):
        db = os.path.join(self.tmp, "garbage_ts.sqlite")
        make_db(db, ["not-a-timestamp"])
        out = freshness.read_freshness(db, NOW)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "read_error")

    def test_corrupt_db_file_is_read_error(self):
        db = os.path.join(self.tmp, "corrupt.sqlite")
        with open(db, "wb") as fh:
            fh.write(b"this is not a sqlite database at all")
        out = freshness.read_freshness(db, NOW)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "read_error")


class MainTest(TempDbMixin):
    def _capture_main(self, argv):
        from io import StringIO

        buf = StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            code = freshness.main(argv)
        finally:
            sys.stdout = old
        return code, json.loads(buf.getvalue())

    def test_main_ok_returns_zero_and_writes_json(self):
        db = os.path.join(self.tmp, "ok.sqlite")
        make_db(db, [iso_utc(NOW - 30)])
        code, out = self._capture_main(["--db", db, "--now", str(NOW)])
        self.assertEqual(code, 0)
        self.assertTrue(out["ok"])
        self.assertEqual(out["age_seconds"], 30)

    def test_main_not_ok_returns_one(self):
        code, out = self._capture_main(
            ["--db", os.path.join(self.tmp, "gone.sqlite"), "--now", str(NOW)]
        )
        self.assertEqual(code, 1)
        self.assertFalse(out["ok"])

    def test_main_now_defaults_to_utc_now(self):
        db = os.path.join(self.tmp, "defaultnow.sqlite")
        now = int(datetime.now(tz=timezone.utc).timestamp())
        make_db(db, [iso_utc(now - 5)])
        code, out = self._capture_main(["--db", db])
        self.assertEqual(code, 0)
        self.assertTrue(out["ok"])
        self.assertGreaterEqual(out["age_seconds"], 5)
        self.assertLess(out["age_seconds"], 30)


class CliContractTest(TempDbMixin):
    """Pin the subprocess stdout/exit contract the orchestrator relies on."""

    def test_cli_ok_exit_zero(self):
        db = os.path.join(self.tmp, "cli_ok.sqlite")
        make_db(db, [iso_utc(NOW - 42)])
        proc = subprocess.run(
            [sys.executable, FRESHNESS, "--db", db, "--now", str(NOW)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 0)
        out = json.loads(proc.stdout)
        self.assertTrue(out["ok"])
        self.assertEqual(out["age_seconds"], 42)

    def test_cli_missing_db_exit_one(self):
        proc = subprocess.run(
            [sys.executable, FRESHNESS, "--db", os.path.join(self.tmp, "x.sqlite")],
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 1)
        out = json.loads(proc.stdout)
        self.assertFalse(out["ok"])
        self.assertEqual(out["reason"], "db_missing")


if __name__ == "__main__":
    unittest.main()
