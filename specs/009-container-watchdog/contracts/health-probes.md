# Contract: health probes & verdict mapping

**Feature**: `009-container-watchdog` | Defines how each service's verdict is
produced (FR-002/003/004) in `lib/health.sh`. Each probe is **independent**
(FR-005).

## poller — freshness (no container required)

Delegates to [`freshness.py`](./freshness-reader.md) against `WATCHDOG_DB_PATH`.
Verdict from `age_seconds` vs `WATCHDOG_POLLER_MAX_AGE_SECONDS` (default 300).
`ok:false` ⇒ `unknown` (never restart). The poller does **not** use K-streak —
the freshness threshold (≈10 missed cycles) is already a sustained condition.

## api — HTTP health

```sh
curl -fsS -m 5 http://localhost:8090/api/v1/health
```

- Probe **fails** if: non-2xx, connection refused/timeout, **or** body
  `status != "ok"` (parsed with `python3`; `degraded` counts as failed).
- Probe **passes** if HTTP 2xx **and** `status == "ok"`.

## web — HTTP root

```sh
curl -fsS -m 5 -o /dev/null http://localhost:8090/
```

- Probe **passes** on HTTP 2xx; **fails** otherwise (non-2xx / unreachable).

## K-consecutive logic (api/web only, FR-004)

Cross-run streak via [`state.py`](./state-store.md):

| Probe result | state action | verdict |
|--------------|--------------|---------|
| pass | `reset <svc>` | `healthy` |
| fail | `incr-streak <svc>` → `n` | `unhealthy` if `n ≥ K` else `unknown` (`reason=watching streak=n/K`) |

`unknown` while `n < K` ⇒ no restart yet — absorbs single-blip failures so a
working service is never restarted (SC-004). Default `K=3` ≈ 3 min sustained.

## Verdict → action (orchestrator)

| Verdict | Action |
|---------|--------|
| `healthy` | none; counters reset (FR-009) |
| `unknown` | log reason; **no restart** (FR-014) |
| `unhealthy` | `state.py can-restart` gate → `docker restart <container>` (FR-006) or skip with logged cooldown/cap reason (FR-007/008) |

Every verdict and every action is logged with a reason + timestamp to the
journal (FR-010, SC-007). A failed `docker restart` is logged at `warn` and the
run continues (FR-015).
