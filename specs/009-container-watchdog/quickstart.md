# Quickstart: Container Watchdog / Self-Healing

**Feature**: `009-container-watchdog` | Validation/run guide. Implementation
detail lives in [contracts/](./contracts/) and [data-model.md](./data-model.md);
this guide proves the feature end-to-end.

## Prerequisites

- Repo checked out; `shellcheck` + `bats` installed locally
  (`brew install shellcheck bats-core`) and `python3` available.
- For host validation: SSH to `homeautomation` (`ssh steve@192.168.10.5`), root
  via `sudo`, docker stack `ecowitt-dashboard-{poller,api,web}-1` running.

## 1. Local CI gate (run before any push)

```sh
deploy/watchdog/run-checks.sh
# == shellcheck (all shell) + bats (tests/) + python3 -m unittest (freshness/state) ==
npm run test:watchdog   # same gate, wired into package.json
```

Expected: shellcheck clean, all bats pass, all python unit tests pass. This is
the constitution CI gate for the deploy tree (mirrors `deploy/kiosk`).

## 2. Unit-level proofs (no host needed)

| Scenario | How | Expected |
|----------|-----|----------|
| Stale poller (06-29 wedge) | `freshness.py` against a fixture DB whose `MAX(observed_at)` is 2 h old, `--now` pinned | `{"ok":true,"age_seconds":7320}` → verdict `unhealthy` |
| Fresh poller | fixture DB, newest row 42 s old | verdict `healthy`, no action |
| Empty / missing / locked DB | fixture variants | `ok:false` (`empty`/`db_missing`/`read_error`) → verdict `unknown`, **no restart** (FR-014) |
| Cooldown | `state.py can-restart` after a recorded restart within 600 s | `{"allow":false,"reason":"cooldown"}` (FR-007) |
| Window cap | 3 restarts recorded in window | `{"allow":false,"reason":"cap"}` + loud log (FR-008/SC-005) |
| Healthy reset | `state.py reset` after a streak/restarts | streak 0, window cleared (FR-009) |
| K-streak | 2 failed api probes then check | verdict `unknown` (watching); 3rd ⇒ `unhealthy` (FR-004) |
| Independence | stub poller stale, api/web healthy | only poller restart attempted (FR-005) |

Map to user stories: US1 (poller freshness), US2 (api/web + independence), US3
(cooldown/cap/reset), US4 (provision/rollback idempotency, below).

## 3. Provision / rollback idempotency (US4)

```sh
sudo deploy/watchdog/provision.sh            # install
sudo deploy/watchdog/provision.sh            # 2nd run = no-op (idempotent, FR-011)
systemctl is-enabled ecowitt-watchdog.timer  # -> enabled
systemctl is-active  ecowitt-watchdog.timer  # -> active
journalctl -u ecowitt-watchdog.service -n 20 # verdicts + reasons + timestamps (FR-010)

sudo deploy/watchdog/rollback.sh             # remove cleanly (FR-012)
systemctl list-unit-files | grep ecowitt-watchdog   # -> empty
```

## 4. Live wedge recovery proof (host, manual — uses live data)

Reproduce the 06-29 signature and confirm self-heal (SC-001/002):

```sh
# 1. Observe baseline freshness
python3 /usr/local/lib/ecowitt-watchdog/freshness.py \
  --db /var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite

# 2. Simulate a wedge: pause the poller so readings freeze while it stays "Up"
docker pause ecowitt-dashboard-poller-1
#    (wait > WATCHDOG_POLLER_MAX_AGE_SECONDS + one interval)

# 3. The watchdog detects staleness and restarts the poller; confirm in journal:
journalctl -u ecowitt-watchdog.service -f
#    expect: poller verdict=unhealthy reason=stale ... -> docker restart ...

# 4. Confirm readings resume and freshness recovers (verdict healthy, counter reset)
```

> Note: `docker pause` freezes the process while it reports `Up` — the exact
> "logically stalled, not exited" condition docker's own `restart:` policy
> cannot catch.

## 5. api / web recovery proof (host, manual)

```sh
docker pause ecowitt-dashboard-api-1   # /api/v1/health goes unreachable
# after K (3) consecutive watchdog runs -> only the api container is restarted
journalctl -u ecowitt-watchdog.service -f   # api verdict=unhealthy (streak 3/3) -> restart
# repeat with ecowitt-dashboard-web-1 and http://localhost:8090/
```

## Success criteria mapping

| SC | Proven by |
|----|-----------|
| SC-001/002 | §4 live wedge recovery within ≈ threshold + one interval |
| SC-003 | §5 api/web recovery within K checks |
| SC-004 | §2 fresh/healthy cases ⇒ zero restarts |
| SC-005 | §2 window-cap ⇒ loud log, no further restarts |
| SC-006 | §3 idempotent provision + clean rollback |
| SC-007 | §3/§4 journal shows every verdict + restart with reason + timestamp |
