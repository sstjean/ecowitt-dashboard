# Contract: `state.py` (restart state store)

**Feature**: `009-container-watchdog` | python3 stdlib only (no `jq` on host).
Atomic JSON persistence for cooldown timers, rolling-window restart counts, and
api/web fail-streaks. Resolves FR-007/008/009 + OQ-7. Schema:
[data-model.md](../data-model.md) §3.

## Invocation

```sh
python3 state.py --file <path> [--now <epoch>] <subcommand> <service> [args]
```

`--now` overrides UTC-now for deterministic tests. A missing/corrupt file is
treated as the empty default (all services zeroed) and logged — never a crash.
Every mutating subcommand prunes `restarts_window` to entries newer than
`now − WINDOW_SECONDS` before writing, and writes atomically (`temp` +
`os.replace`).

## Subcommands

| Subcommand | Args | Reads/Writes | stdout |
|------------|------|--------------|--------|
| `can-restart` | `<service> <cooldown_s> <window_s> <cap>` | read | JSON verdict (below) |
| `record-restart` | `<service> <window_s>` | write | — |
| `incr-streak` | `<service>` | write | new streak (int) |
| `reset` | `<service>` | write | — (clears streak + window) |
| `get` | `<service>` | read | service sub-object JSON |

### `can-restart` output

```json
{ "allow": true,  "reason": "ok" }
{ "allow": false, "reason": "cooldown", "retry_after_s": 312 }
{ "allow": false, "reason": "cap",      "window_count": 3 }
```

- `cooldown` ⇒ `now − last_restart < cooldown_s` (FR-007).
- `cap` ⇒ pruned `len(restarts_window) ≥ cap` (FR-008) — caller logs **loudly**.

### State transitions enforced

| Subcommand | Effect |
|------------|--------|
| `record-restart` | `last_restart = now`; append `now` to `restarts_window` |
| `incr-streak` | `fail_streak += 1` |
| `reset` | `fail_streak = 0`; `restarts_window = []` (FR-009 healthy reset) |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success |
| 1 | usage error (unknown subcommand/service) |

`record-restart`/`reset`/`incr-streak` always exit 0 even if the prior file was
missing/corrupt (they recreate a valid file).
