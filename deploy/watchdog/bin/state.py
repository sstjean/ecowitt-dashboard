#!/usr/bin/env python3
"""state.py — atomic JSON restart-state store for the container watchdog.

Persists per-service restart bookkeeping so the watchdog can enforce a cooldown
and a per-window restart cap across runs and reboots, and track api/web
consecutive-failure streaks. python3 stdlib only (the host has no `jq`).

Invocation:
    state.py --file <path> [--now <epoch>] <subcommand> <service> [args]

A missing or corrupt state file is treated as the empty default (all services
zeroed) — never a crash. Writes are atomic (temp file + os.replace). See
data-model.md §3 and contracts/state-store.md.
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone

DEFAULT_STATE_PATH = "/var/lib/ecowitt-watchdog/state.json"
SERVICES = ("poller", "api", "web")


def _empty_service():
    return {"last_restart": 0, "restarts_window": [], "fail_streak": 0}


def _empty_state():
    return {"version": 1, "services": {s: _empty_service() for s in SERVICES}}


def load_state(path):
    """Load and normalise the state file; missing/corrupt → empty default."""
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return _empty_state()
    if not isinstance(data, dict) or "services" not in data:
        return _empty_state()

    state = _empty_state()
    services = data.get("services") or {}
    for svc in SERVICES:
        sub = services.get(svc)
        if isinstance(sub, dict):
            state["services"][svc] = {
                "last_restart": int(sub.get("last_restart", 0)),
                "restarts_window": [int(t) for t in sub.get("restarts_window", [])],
                "fail_streak": int(sub.get("fail_streak", 0)),
            }
    return state


def write_state(path, state):
    """Atomically persist state (temp file in the same dir + os.replace)."""
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".state.", suffix=".tmp")
    with os.fdopen(fd, "w") as fh:
        json.dump(state, fh)
    os.replace(tmp, path)


def _prune(window, now, window_s):
    cutoff = now - window_s
    return [t for t in window if t > cutoff]


def cmd_can_restart(state, svc, now, cooldown_s, window_s, cap):
    s = state["services"][svc]
    window = _prune(s["restarts_window"], now, window_s)
    if now - s["last_restart"] < cooldown_s:
        out = {
            "allow": False,
            "reason": "cooldown",
            "retry_after_s": cooldown_s - (now - s["last_restart"]),
        }
    elif len(window) >= cap:
        out = {"allow": False, "reason": "cap", "window_count": len(window)}
    else:
        out = {"allow": True, "reason": "ok"}
    return json.dumps(out), False


def cmd_record_restart(state, svc, now, window_s):
    s = state["services"][svc]
    s["restarts_window"] = _prune(s["restarts_window"], now, window_s)
    s["last_restart"] = now
    s["restarts_window"].append(now)
    return "", True


def cmd_incr_streak(state, svc, now):
    s = state["services"][svc]
    s["fail_streak"] += 1
    return str(s["fail_streak"]), True


def cmd_reset(state, svc, now):
    s = state["services"][svc]
    s["fail_streak"] = 0
    s["restarts_window"] = []
    return "", True


def cmd_get(state, svc, now):
    return json.dumps(state["services"][svc]), False


def main(argv=None):
    parser = argparse.ArgumentParser(description="Watchdog restart-state store")
    parser.add_argument("--file", default=DEFAULT_STATE_PATH)
    parser.add_argument("--now", type=int, default=None)
    parser.add_argument("subcommand")
    parser.add_argument("service")
    parser.add_argument("args", nargs="*")
    a = parser.parse_args(argv)

    if a.service not in SERVICES:
        sys.stderr.write("unknown service: {}\n".format(a.service))
        return 1

    now = (
        a.now
        if a.now is not None
        else int(datetime.now(tz=timezone.utc).timestamp())
    )
    state = load_state(a.file)

    try:
        if a.subcommand == "can-restart":
            cooldown_s, window_s, cap = (int(x) for x in a.args[:3])
            out, write = cmd_can_restart(
                state, a.service, now, cooldown_s, window_s, cap
            )
        elif a.subcommand == "record-restart":
            window_s = int(a.args[0])
            out, write = cmd_record_restart(state, a.service, now, window_s)
        elif a.subcommand == "incr-streak":
            out, write = cmd_incr_streak(state, a.service, now)
        elif a.subcommand == "reset":
            out, write = cmd_reset(state, a.service, now)
        elif a.subcommand == "get":
            out, write = cmd_get(state, a.service, now)
        else:
            sys.stderr.write("unknown subcommand: {}\n".format(a.subcommand))
            return 1
    except (IndexError, ValueError):
        sys.stderr.write("bad arguments for {}\n".format(a.subcommand))
        return 1

    if write:
        write_state(a.file, state)
    if out:
        sys.stdout.write(out)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
