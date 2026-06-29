#!/usr/bin/env python3
"""Unit tests for bin/state.py (state-store contract).

In-process (imported) tests drive the 100%-coverage gate; two subprocess tests
pin the CLI/stdout/exit contract that lib/state.sh depends on.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "..", "bin", "state.py")

_spec = importlib.util.spec_from_file_location("state", STATE)
state = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(state)

NOW = 1_751_220_000
COOLDOWN = 600
WINDOW = 3600
CAP = 3


class TempFileMixin(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.path = os.path.join(self.tmp, "state.json")

    def tearDown(self):
        for root, _dirs, files in os.walk(self.tmp, topdown=False):
            for f in files:
                os.remove(os.path.join(root, f))
            os.rmdir(root)

    def run_main(self, argv):
        from io import StringIO

        buf = StringIO()
        old = sys.stdout
        sys.stdout = buf
        try:
            code = state.main(argv)
        finally:
            sys.stdout = old
        return code, buf.getvalue()

    def read(self):
        with open(self.path) as fh:
            return json.load(fh)


class LoadStateTest(TempFileMixin):
    def test_missing_file_is_empty_default(self):
        st = state.load_state(self.path)
        self.assertEqual(st["version"], 1)
        self.assertEqual(set(st["services"]), {"poller", "api", "web"})
        self.assertEqual(st["services"]["poller"], state._empty_service())

    def test_corrupt_file_is_empty_default(self):
        with open(self.path, "w") as fh:
            fh.write("{not json")
        st = state.load_state(self.path)
        self.assertEqual(st["services"]["api"]["fail_streak"], 0)

    def test_non_object_json_is_empty_default(self):
        with open(self.path, "w") as fh:
            json.dump([1, 2, 3], fh)
        self.assertEqual(state.load_state(self.path), state._empty_state())

    def test_object_without_services_is_default(self):
        with open(self.path, "w") as fh:
            json.dump({"version": 1}, fh)
        self.assertEqual(state.load_state(self.path), state._empty_state())

    def test_partial_and_malformed_services_are_backfilled(self):
        with open(self.path, "w") as fh:
            json.dump(
                {
                    "version": 1,
                    "services": {
                        "poller": {
                            "last_restart": 100,
                            "restarts_window": [200, 300],
                            "fail_streak": 0,
                        },
                        "api": None,  # malformed sub-object → default
                        # web omitted entirely → default
                    },
                },
                fh,
            )
        st = state.load_state(self.path)
        self.assertEqual(st["services"]["poller"]["last_restart"], 100)
        self.assertEqual(st["services"]["poller"]["restarts_window"], [200, 300])
        self.assertEqual(st["services"]["api"], state._empty_service())
        self.assertEqual(st["services"]["web"], state._empty_service())


class PruneTest(unittest.TestCase):
    def test_prune_drops_entries_outside_window(self):
        window = [NOW - 4000, NOW - 1000, NOW - 10]
        self.assertEqual(state._prune(window, NOW, WINDOW), [NOW - 1000, NOW - 10])


class CanRestartTest(TempFileMixin):
    def _can(self, argv_extra):
        code, out = self.run_main(
            ["--file", self.path, "--now", str(NOW), "can-restart"] + argv_extra
        )
        return code, json.loads(out)

    def test_ok_when_clean(self):
        code, out = self._can(["api", str(COOLDOWN), str(WINDOW), str(CAP)])
        self.assertEqual(code, 0)
        self.assertTrue(out["allow"])
        self.assertEqual(out["reason"], "ok")

    def test_cooldown_blocks_recent_restart(self):
        state.write_state(
            self.path,
            {
                "version": 1,
                "services": {
                    "poller": state._empty_service(),
                    "api": {
                        "last_restart": NOW - 100,
                        "restarts_window": [NOW - 100],
                        "fail_streak": 0,
                    },
                    "web": state._empty_service(),
                },
            },
        )
        code, out = self._can(["api", str(COOLDOWN), str(WINDOW), str(CAP)])
        self.assertFalse(out["allow"])
        self.assertEqual(out["reason"], "cooldown")
        self.assertEqual(out["retry_after_s"], 500)

    def test_cap_blocks_when_window_full(self):
        state.write_state(
            self.path,
            {
                "version": 1,
                "services": {
                    "poller": state._empty_service(),
                    "api": {
                        "last_restart": NOW - 1000,
                        "restarts_window": [NOW - 1000, NOW - 800, NOW - 700],
                        "fail_streak": 0,
                    },
                    "web": state._empty_service(),
                },
            },
        )
        code, out = self._can(["api", str(COOLDOWN), str(WINDOW), str(CAP)])
        self.assertFalse(out["allow"])
        self.assertEqual(out["reason"], "cap")
        self.assertEqual(out["window_count"], 3)


class MutationTest(TempFileMixin):
    def test_record_restart_sets_last_and_appends(self):
        code, _ = self.run_main(
            ["--file", self.path, "--now", str(NOW), "record-restart", "poller", str(WINDOW)]
        )
        self.assertEqual(code, 0)
        s = self.read()["services"]["poller"]
        self.assertEqual(s["last_restart"], NOW)
        self.assertEqual(s["restarts_window"], [NOW])

    def test_record_restart_prunes_old_entries(self):
        state.write_state(
            self.path,
            {
                "version": 1,
                "services": {
                    "poller": {
                        "last_restart": NOW - 5000,
                        "restarts_window": [NOW - 5000, NOW - 100],
                        "fail_streak": 0,
                    },
                    "api": state._empty_service(),
                    "web": state._empty_service(),
                },
            },
        )
        self.run_main(
            ["--file", self.path, "--now", str(NOW), "record-restart", "poller", str(WINDOW)]
        )
        s = self.read()["services"]["poller"]
        self.assertEqual(s["restarts_window"], [NOW - 100, NOW])

    def test_incr_streak_increments_and_prints(self):
        code, out = self.run_main(
            ["--file", self.path, "--now", str(NOW), "incr-streak", "api"]
        )
        self.assertEqual(code, 0)
        self.assertEqual(out, "1")
        code, out = self.run_main(
            ["--file", self.path, "--now", str(NOW), "incr-streak", "api"]
        )
        self.assertEqual(out, "2")
        self.assertEqual(self.read()["services"]["api"]["fail_streak"], 2)

    def test_reset_clears_streak_and_window(self):
        state.write_state(
            self.path,
            {
                "version": 1,
                "services": {
                    "poller": {
                        "last_restart": NOW - 10,
                        "restarts_window": [NOW - 10],
                        "fail_streak": 5,
                    },
                    "api": state._empty_service(),
                    "web": state._empty_service(),
                },
            },
        )
        self.run_main(["--file", self.path, "--now", str(NOW), "reset", "poller"])
        s = self.read()["services"]["poller"]
        self.assertEqual(s["fail_streak"], 0)
        self.assertEqual(s["restarts_window"], [])

    def test_get_returns_service_subobject(self):
        code, out = self.run_main(
            ["--file", self.path, "--now", str(NOW), "get", "web"]
        )
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), state._empty_service())


class MainErrorTest(TempFileMixin):
    def test_unknown_service_is_usage_error(self):
        code, _ = self.run_main(
            ["--file", self.path, "--now", str(NOW), "get", "backup"]
        )
        self.assertEqual(code, 1)

    def test_unknown_subcommand_is_usage_error(self):
        code, _ = self.run_main(
            ["--file", self.path, "--now", str(NOW), "frobnicate", "api"]
        )
        self.assertEqual(code, 1)

    def test_missing_args_is_usage_error(self):
        code, _ = self.run_main(
            ["--file", self.path, "--now", str(NOW), "can-restart", "api"]
        )
        self.assertEqual(code, 1)

    def test_now_defaults_to_utc_when_omitted(self):
        # No --now: exercises the wall-clock default branch.
        code, out = self.run_main(["--file", self.path, "incr-streak", "api"])
        self.assertEqual(code, 0)
        self.assertEqual(out, "1")


class CliContractTest(TempFileMixin):
    def test_cli_incr_streak_prints_int_exit_zero(self):
        proc = subprocess.run(
            [sys.executable, STATE, "--file", self.path, "--now", str(NOW),
             "incr-streak", "api"],
            capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, "1")

    def test_cli_unknown_service_exit_one(self):
        proc = subprocess.run(
            [sys.executable, STATE, "--file", self.path, "get", "nope"],
            capture_output=True, text=True,
        )
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    unittest.main()
