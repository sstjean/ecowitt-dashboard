# Contract: `freshness.py` (poller freshness reader)

**Feature**: `009-container-watchdog` | python3 stdlib only (no `sqlite3` CLI /
`jq` on host). Read-only DB access (Decision 1). Resolves FR-003/014.

## Invocation

```sh
python3 freshness.py --db <path> [--now <epoch>]
```

- `--db` path to the SQLite DB (default
  `/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite`).
- `--now` optional epoch override (for deterministic tests; defaults to UTC now).

## DB access (safety)

Opens read-only via URI: `sqlite3.connect("file:<path>?mode=ro", uri=True)` with
a short `busy_timeout`. Runs only `SELECT MAX(observed_at) FROM readings`. Cannot
write, lock the writer, or corrupt the DB.

## Output (stdout JSON)

**Fresh / stale (DB readable, has rows):**

```json
{ "ok": true, "max_observed_at": "2026-06-29T18:42:00Z", "age_seconds": 42 }
```

**Not OK (caller maps to verdict `unknown`, never restarts — FR-014):**

```json
{ "ok": false, "reason": "db_missing" }
{ "ok": false, "reason": "empty" }
{ "ok": false, "reason": "read_error" }
```

| `reason` | Trigger |
|----------|---------|
| `db_missing` | file does not exist |
| `empty` | table empty / `MAX(observed_at)` is NULL (first-boot) |
| `read_error` | locked / unreadable / unparseable timestamp / OperationalError |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | `ok:true` emitted |
| 1 | `ok:false` emitted (still valid JSON on stdout) |

The orchestrator parses stdout regardless of exit code and never crashes on a
non-zero exit.

## Verdict mapping (in `lib/health.sh`)

| freshness result | poller verdict | reason string |
|------------------|----------------|---------------|
| `ok:true`, `age ≤ MAX_AGE` | `healthy` | `fresh age=<n>s` |
| `ok:true`, `age > MAX_AGE` | `unhealthy` | `stale age=<n>s>${MAX_AGE}s` |
| `ok:false` (any reason) | `unknown` | the `reason` |

## Timezone

Stored `observed_at` is UTC; `now` is UTC epoch. Comparison is UTC-vs-UTC
(no naive local conversion).
