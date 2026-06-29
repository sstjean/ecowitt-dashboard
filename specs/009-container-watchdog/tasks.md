---
description: "Dependency-ordered, TDD task list for Feature 009 — Container Watchdog / Self-Healing"
---

# Tasks: Container Watchdog / Self-Healing

**Input**: Design documents from `/specs/009-container-watchdog/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [quickstart.md](./quickstart.md),
[contracts/](./contracts/) (provision-cli, rollback-cli, watchdog-units,
freshness-reader, state-store, health-probes).

**Source of truth**: Issues [#31](https://github.com/sstjean/ecowitt-dashboard/issues/31)
(parent) + [#32](https://github.com/sstjean/ecowitt-dashboard/issues/32) (US1) /
[#33](https://github.com/sstjean/ecowitt-dashboard/issues/33) (US2) /
[#34](https://github.com/sstjean/ecowitt-dashboard/issues/34) (US3) /
[#35](https://github.com/sstjean/ecowitt-dashboard/issues/35) (US4). If a task and the
Issues disagree, the Issues win.

**Tests**: REQUIRED (Constitution Principle IV + `run-checks.sh` gate). The deploy
tree mirrors `deploy/kiosk`: `shellcheck -x` + `bats` for shell, `python3 -m unittest`
+ `coverage.py` for python. **Every implementation task is preceded by a failing test
(RED) and an explicit RED-verify gate before the production edit (GREEN).**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 (Setup/Foundational/Polish carry no story tag)
- All paths are exact, under `deploy/watchdog/`

## Hard constraints (apply to every task)

- bash + python3 **stdlib** + curl + docker only — **no Node on the host**, no `jq`,
  no `sqlite3` CLI, no pip packages.
- Each service (`poller`, `api`, `web`) is evaluated and acted on **independently**
  (FR-005); `backup` is excluded.
- Never crash on missing/empty/locked DB or a missing container (FR-014/FR-015).
- Freshness verdict `unknown` MUST **never** trigger a restart (FR-014).
- DB access is **read-only** (`file:<path>?mode=ro`); storage is UTC, freshness math
  is UTC-vs-UTC.
- Container names: `ecowitt-dashboard-{poller,api,web}-1` (compose-default prefix).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `deploy/watchdog/` tree skeleton and the CI gate harness so
test files are runnable from task one.

- [x] T001 Create the `deploy/watchdog/` skeleton directories `bin/`, `lib/`, `systemd/`, `tests/` (mirror `deploy/kiosk` layout, FR-013)
- [x] T002 [P] Create [deploy/watchdog/run-checks.sh](../../deploy/watchdog/run-checks.sh) CI gate harness (mirror `deploy/kiosk/run-checks.sh`): `shellcheck -x` over the shell file list + `bats tests/` + `python3 -m unittest discover tests` with `coverage.py`; `set -euo pipefail`. Full green is the Polish gate; individual suites run per story.
- [x] T003 [P] Add `deploy/watchdog/.env` to repository `.gitignore` (the tracked `.env.example` template lands in US4, mirroring kiosk's `.env.example` → gitignored `.env`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared bash libs (no copy-paste, SRP) + the orchestrator that ties
health → state → actions **per service independently**. Blocks all user stories.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T004 Create [deploy/watchdog/lib/common.sh](../../deploy/watchdog/lib/common.sh): `log`/`warn`/`die` (journal-friendly stdout/stderr with reason + timestamp, FR-010), `require_env`, `default_env`, idempotent `install_file`, and a **lib/bin path resolver** `WATCHDOG_LIB_DIR` (env override, else derived from the running script's own dir) so the orchestrator sources `lib/*.sh` and invokes `freshness.py`/`state.py` correctly in **both** the repo-dev context (`deploy/watchdog/{lib,bin}`) and the installed context (`/usr/local/lib/ecowitt-watchdog/{lib,*.py}`) — mirrors kiosk's path-resolution idiom — extracted from kiosk idioms; `set -euo pipefail` discipline
- [x] T005 [P] **(TDD bundle)** Create [deploy/watchdog/lib/config.sh](../../deploy/watchdog/lib/config.sh) test-first: (a) write [deploy/watchdog/tests/config_validation.bats](../../deploy/watchdog/tests/config_validation.bats) (`bats`, source `config.sh`) asserting each unset knob resolves to its pinned default **and** a malformed numeric knob (e.g. `WATCHDOG_POLLER_MAX_AGE_SECONDS=foo`) falls back to the default **with a logged `warn`** (never crashes); (b) **RED-verify**: run `bats tests/config_validation.bats`, confirm it FAILS; (c) implement `default_env` for all 10 knobs with pinned defaults (`WATCHDOG_PROJECT=ecowitt-dashboard`, `WATCHDOG_DB_PATH`, `WATCHDOG_STATE_PATH`, `WATCHDOG_BASE_URL=http://localhost:8090`, `WATCHDOG_POLLER_MAX_AGE_SECONDS=300`, `WATCHDOG_HTTP_FAIL_THRESHOLD=3`, `WATCHDOG_RESTART_COOLDOWN_SECONDS=600`, `WATCHDOG_RESTART_WINDOW_SECONDS=3600`, `WATCHDOG_RESTART_WINDOW_CAP=3`, `WATCHDOG_INTERVAL_SECONDS=60`) + non-negative-integer validation that warns-and-defaults on malformed values (data-model.md §2). Make the test GREEN.
- [x] T006 [P] Create sourced lib stubs [deploy/watchdog/lib/health.sh](../../deploy/watchdog/lib/health.sh), [deploy/watchdog/lib/actions.sh](../../deploy/watchdog/lib/actions.sh), [deploy/watchdog/lib/state.sh](../../deploy/watchdog/lib/state.sh) with function placeholders + `# shellcheck source=` directives so the orchestrator sources/shellchecks cleanly (real bodies land in US1–US3)
- [x] T007 **(TDD bundle)** Create [deploy/watchdog/bin/ecowitt-watchdog-run](../../deploy/watchdog/bin/ecowitt-watchdog-run) orchestrator test-first: (a) write [deploy/watchdog/tests/orchestrator_isolation.bats](../../deploy/watchdog/tests/orchestrator_isolation.bats) (`bats`, stub `health.sh`/`actions.sh`/`state.sh`) asserting — one service's verdict erroring **never aborts the run or affects another** (remaining services still evaluated; run exits 0), every service emits a verdict line to stdout (journal), `unhealthy` calls the action gate, `unknown` calls **no** action (FR-014), and a **`healthy` verdict calls `state reset` for that service — including the poller** (FR-009); (b) **RED-verify**: run `bats tests/orchestrator_isolation.bats`, confirm it FAILS; (c) implement the orchestrator: resolve libs via `WATCHDOG_LIB_DIR` (T004) and source them; iterate `poller`/`api`/`web` in an **independent, fault-isolated** loop (a fault evaluating one service never aborts the run or affects another — FR-005/FR-014/FR-015); per service compute verdict → log it → on `healthy` reset that service's counters (FR-009), on `unknown` do nothing, on `unhealthy` call the action gate; emit every verdict + action to the journal with reason + timestamp (FR-010, SC-007). Make the test GREEN. Depends on T004–T006.

**Checkpoint**: Tree sources and shellchecks; orchestrator loop exists with safe placeholder probes/actions. User stories can now begin.

---

## Phase 3: User Story 1 — Restart a poller that is `Up` but logically stalled (Priority: P1) 🎯 MVP

**Goal**: Detect the 2026-06-29 wedge signature (container `Up`, readings frozen) by
reading `MAX(observed_at)` read-only from the SQLite DB on the named volume, classify
the poller `unhealthy`, and `docker restart` only the poller — while `unknown`
(missing/empty/locked DB) **never** restarts.

**Independent Test**: Point `freshness.py` at a fixture DB whose `MAX(observed_at)` is
2 h old → poller verdict `unhealthy` → orchestrator issues `docker restart` for the
poller container only and logs reason + timestamp. Make readings fresh → no action.
Missing/empty/locked DB → `unknown` → no restart.

### Tests for User Story 1 (RED first) ⚠️

- [x] T008 [P] [US1] Write [deploy/watchdog/tests/test_freshness.py](../../deploy/watchdog/tests/test_freshness.py) (`python3 -m unittest`): temp fixture SQLite DB cases — fresh row (42 s old, `--now` pinned) → `{"ok":true,"age_seconds":42}`; stale row (2 h, wedge signature) → `{"ok":true,"age_seconds":7320}`; missing file → `{"ok":false,"reason":"db_missing"}`; empty/NULL `MAX` → `{"ok":false,"reason":"empty"}`; locked/unreadable/unparseable → `{"ok":false,"reason":"read_error"}`; UTC-vs-UTC math; exit 0 on ok / exit 1 on not-ok (freshness-reader contract)
- [x] T009 [US1] **RED-verify gate**: run `python3 -m unittest tests/test_freshness.py` and confirm it FAILS (no `bin/freshness.py` yet). Do not proceed until Red is confirmed.

### Implementation for User Story 1 (GREEN)

- [x] T010 [US1] Create [deploy/watchdog/bin/freshness.py](../../deploy/watchdog/bin/freshness.py) (python3 stdlib): `--db`/`--now` args, read-only `sqlite3.connect("file:<db>?mode=ro", uri=True)` + short `busy_timeout`, run only `SELECT MAX(observed_at) FROM readings`, emit the contract JSON, exit 0/1; tolerate missing/empty/locked (FR-014). Make T008 GREEN.

### Verdict + restart for User Story 1 (RED → GREEN)

- [x] T011 [P] [US1] Write [deploy/watchdog/tests/freshness_verdict.bats](../../deploy/watchdog/tests/freshness_verdict.bats) (`bats`, stub `freshness.py` + `docker`): `ok:true age≤MAX_AGE` → `healthy` (no `docker restart`); `ok:true age>MAX_AGE` → `unhealthy` (`reason=stale age=<n>s>300s`) → `docker restart ecowitt-dashboard-poller-1` invoked; `ok:false` (any reason) → `unknown` → **no `docker restart`** (FR-014 safety)
- [x] T012 [US1] **RED-verify gate**: run `bats tests/freshness_verdict.bats` and confirm it FAILS (poller verdict + restart not implemented). Do not proceed until Red is confirmed.
- [x] T013 [US1] Implement the poller verdict in [deploy/watchdog/lib/health.sh](../../deploy/watchdog/lib/health.sh) (delegate to `freshness.py`, map per freshness-reader contract) **and** a minimal `watchdog_restart <service>` in [deploy/watchdog/lib/actions.sh](../../deploy/watchdog/lib/actions.sh) (`docker restart <container>` + log reason/timestamp + FR-015 failure tolerance), then wire the poller path in [deploy/watchdog/bin/ecowitt-watchdog-run](../../deploy/watchdog/bin/ecowitt-watchdog-run). Make T011 GREEN.
- [x] T014 [US1] Run US1 suites green (`tests/test_freshness.py` + `tests/freshness_verdict.bats` + `shellcheck -x` on touched files) and confirm the US1 Independent Test (quickstart §2 stale/fresh/empty rows).

**Checkpoint**: US1 self-heals a wedged poller end-to-end and never restarts on `unknown`. Independently shippable MVP.

---

## Phase 4: User Story 2 — Restart an unreachable/unhealthy api or web container (Priority: P1)

**Goal**: Probe `api` (`/api/v1/health` HTTP 2xx **and** body `status == "ok"`) and
`web` (`/` HTTP 2xx) via `curl` to `localhost:8090`; require **K=3 consecutive**
failures before restart; act on each independently.

**Independent Test**: Stub `curl` so api fails K times → only the api container is
restarted; stub web failing → only web restarted; a stalled poller never triggers an
api/web restart and vice-versa.

### Tests for User Story 2 (RED first) ⚠️

- [x] T015 [P] [US2] Write [deploy/watchdog/tests/http_probe.bats](../../deploy/watchdog/tests/http_probe.bats) (`bats`, stub `curl` + stub `state.py`): api 2xx+`status:ok` → pass → `reset` → `healthy`; api `status:degraded` or non-2xx or connection failure → fail; web 2xx → pass, web non-2xx/unreachable → fail; K-streak — `incr-streak` returns `n`, `n<3` → `unknown` (`reason=watching streak=n/3`, no restart), `n≥3` → `unhealthy`; independence (poller stub stale + api/web healthy ⇒ no api/web restart) — health-probes contract
- [x] T016 [US2] **RED-verify gate**: run `bats tests/http_probe.bats` and confirm it FAILS (api/web probes + K-streak not implemented). Do not proceed until Red is confirmed.

### Implementation for User Story 2 (GREEN)

- [x] T017 [US2] Implement the api + web probe functions and K-consecutive-failure verdict logic in [deploy/watchdog/lib/health.sh](../../deploy/watchdog/lib/health.sh) (`curl -fsS -m 5`; parse `status` with `python3`; cross-run streak via `state.py incr-streak`/`reset`; `n<K` → `unknown`, `n≥K` → `unhealthy`) and wire the api/web paths in [deploy/watchdog/bin/ecowitt-watchdog-run](../../deploy/watchdog/bin/ecowitt-watchdog-run). Make T015 GREEN.
- [x] T018 [US2] Run US2 suite green (`tests/http_probe.bats` + `shellcheck -x`) and confirm the US2 Independent Test (api-only / web-only restart + cross-service independence).

**Checkpoint**: api and web recover after K sustained failures, independently of the poller and of each other.

---

## Phase 5: User Story 3 — Restart cooldown + per-window cap prevents loops (Priority: P2)

**Goal**: Persist per-service state (`last_restart`, rolling `restarts_window`,
`fail_streak`) atomically to `/var/lib/ecowitt-watchdog/state.json`; enforce a 600 s
cooldown and a 3-per-3600 s cap; on cap-hit log **loudly** and stop; reset counters on
recovery (FR-007/008/009).

**Independent Test**: Drive a service unhealthy across runs — not restarted again until
cooldown elapses; after the cap is reached, no further restarts + a loud journal log;
once a healthy check is observed, the restart counter resets.

### Tests for User Story 3 (RED first) ⚠️

- [x] T019 [P] [US3] Write [deploy/watchdog/tests/test_state.py](../../deploy/watchdog/tests/test_state.py) (`python3 -m unittest`, `--now` pinned, temp state file): `can-restart` → `ok` / `cooldown`(+`retry_after_s`) / `cap`(+`window_count`); `record-restart` sets `last_restart`+appends; `incr-streak` increments; `reset` clears streak+window (FR-009); `get` returns sub-object; rolling-window prune to `> now − WINDOW`; atomic `temp`+`os.replace` write; missing/corrupt file → empty default (no crash) — state-store contract
- [x] T020 [US3] **RED-verify gate**: run `python3 -m unittest tests/test_state.py` and confirm it FAILS (no `bin/state.py` yet). Do not proceed until Red is confirmed.

### State store implementation (GREEN)

- [x] T021 [US3] Create [deploy/watchdog/bin/state.py](../../deploy/watchdog/bin/state.py) (python3 stdlib): `--file`/`--now` + `can-restart`/`record-restart`/`incr-streak`/`reset`/`get` subcommands, window prune, atomic write, corrupt/missing tolerance (data-model.md §3). Make T019 GREEN.

### Cooldown/cap gating (RED → GREEN)

- [x] T022 [P] [US3] Write [deploy/watchdog/tests/actions_cooldown_cap.bats](../../deploy/watchdog/tests/actions_cooldown_cap.bats) (`bats`, stub `docker` + stub `state.py`): `unhealthy` within cooldown → **no** `docker restart` (logged `cooldown`); cap reached → **no** restart + **loud** `warning`/`error` cap log (SC-005); under budget + past cooldown → `docker restart` + `record-restart`; recovery → `reset` clears counters (FR-009) **for any service including a recovered `poller` (its `restarts_window` is cleared so it re-earns full budget)**
- [x] T023 [US3] **RED-verify gate**: run `bats tests/actions_cooldown_cap.bats` and confirm it FAILS (gating not implemented). Do not proceed until Red is confirmed.
- [x] T024 [US3] Implement [deploy/watchdog/lib/state.sh](../../deploy/watchdog/lib/state.sh) (thin bash wrapper over `state.py`) and extend [deploy/watchdog/lib/actions.sh](../../deploy/watchdog/lib/actions.sh) with the cooldown/cap gate (`state.py can-restart` → restart or skip with logged reason; loud cap log; `record-restart` after a restart) + wire gating into [deploy/watchdog/bin/ecowitt-watchdog-run](../../deploy/watchdog/bin/ecowitt-watchdog-run); ensure the orchestrator's `healthy → state.sh reset` (T007) now resolves to the **real** `state.py reset` for **all** services including the poller (FR-009). Make T022 GREEN.
- [x] T025 [US3] Run US3 suites green (`tests/test_state.py` + `tests/actions_cooldown_cap.bats` + `shellcheck -x`) and confirm the US3 Independent Test (cooldown blocks, cap surfaces loudly, recovery resets).

**Checkpoint**: A genuinely broken service is capped + surfaced loudly instead of hammered; healthy recovery re-earns full budget.

---

## Phase 6: User Story 4 — Idempotent host install/uninstall via systemd timer (Priority: P2)

**Goal**: Idempotent `provision.sh` / `rollback.sh` installing
`ecowitt-watchdog.service` (oneshot) + `.timer` (every 60 s) at their canonical host
paths, journald observability, `.env.example`, `README.md`, and `run-checks.sh` wiring
(`npm run test:watchdog`).

**Independent Test**: Run `provision.sh` → timer enabled+active, first run in journal;
re-run → no-op (idempotent). Run `rollback.sh` → units removed cleanly; `--purge`
also removes state/config.

### Tests for User Story 4 (RED first) ⚠️

- [x] T026 [P] [US4] Write [deploy/watchdog/tests/provision_preflight.bats](../../deploy/watchdog/tests/provision_preflight.bats) (`bats`, PATH stubs for `id`/`docker`/`python3`/`systemctl`): preflight exits 2 when not root, 2 when `docker` or `python3` missing, 1 on a malformed numeric knob; idempotency (second run is a no-op / content-stable installs); rollback removes units cleanly + is a no-op when already absent (provision-cli + rollback-cli contracts)
- [x] T027 [US4] **RED-verify gate**: run `bats tests/provision_preflight.bats` and confirm it FAILS (no `provision.sh`/`rollback.sh` yet). Do not proceed until Red is confirmed.

### Implementation for User Story 4 (GREEN)

- [x] T028 [P] [US4] Create [deploy/watchdog/systemd/ecowitt-watchdog.service](../../deploy/watchdog/systemd/ecowitt-watchdog.service) (`Type=oneshot`, `EnvironmentFile=-/etc/ecowitt-watchdog/watchdog.env`, `ExecStart=/usr/local/bin/ecowitt-watchdog-run`, `After=/Wants=docker.service`) and [deploy/watchdog/systemd/ecowitt-watchdog.timer](../../deploy/watchdog/systemd/ecowitt-watchdog.timer) with `OnUnitActiveSec=__WATCHDOG_INTERVAL_SECONDS__s` (a substitution placeholder — a `.timer` cannot read `EnvironmentFile`, so the interval is templated at provision time, not runtime), plus `OnBootSec=60s`, `AccuracySec=5s`, `Persistent=true`, `WantedBy=timers.target` — watchdog-units contract
- [x] T029 [US4] Create [deploy/watchdog/provision.sh](../../deploy/watchdog/provision.sh): source the optional gitignored `deploy/watchdog/.env` if present (provision-cli contract); preflight (root + `docker`/`python3` + knob validation); `install_file` artifacts to canonical host paths (data-model.md §6); **substitute `WATCHDOG_INTERVAL_SECONDS` into the installed `.timer`'s `OnUnitActiveSec` (replacing the `__WATCHDOG_INTERVAL_SECONDS__` placeholder) so the configured interval is actually applied**; write `/etc/ecowitt-watchdog/watchdog.env` only if absent; ensure `/var/lib/ecowitt-watchdog/` (0755); `daemon-reload`; `enable --now ecowitt-watchdog.timer`; idempotent re-run (re-substitution is content-stable). Make T026 preflight/idempotency cases GREEN.
- [x] T030 [US4] Create [deploy/watchdog/rollback.sh](../../deploy/watchdog/rollback.sh): `disable --now` timer + stop service (tolerate absent); remove both units + `daemon-reload`; remove `/usr/local/bin/ecowitt-watchdog-run` + `/usr/local/lib/ecowitt-watchdog/`; `--purge` also removes `/etc/ecowitt-watchdog/` + `/var/lib/ecowitt-watchdog/`; idempotent. Make T026 rollback cases GREEN.
- [x] T031 [P] [US4] Create [deploy/watchdog/.env.example](../../deploy/watchdog/.env.example): tracked template documenting every knob override (data-model.md §2); mirrors kiosk `.env.example` → gitignored `.env`
- [x] T032 [US4] Wire `"test:watchdog": "bash deploy/watchdog/run-checks.sh"` into [package.json](../../package.json) and finalize [deploy/watchdog/run-checks.sh](../../deploy/watchdog/run-checks.sh) explicit `shellcheck -x` file list (`provision.sh rollback.sh run-checks.sh lib/*.sh bin/ecowitt-watchdog-run`), mirroring `deploy/kiosk` / `npm run test:kiosk`
- [x] T033 [P] [US4] Create [deploy/watchdog/README.md](../../deploy/watchdog/README.md): operator guide — provision / tune knobs / rollback / verify in journal (`journalctl -u ecowitt-watchdog.service`)
- [x] T034 [US4] Run US4 suite green (`tests/provision_preflight.bats` + full `shellcheck -x`) and confirm the US4 Independent Test (idempotent provision + clean rollback).

**Checkpoint**: The watchdog installs/uninstalls cleanly on `homeautomation` with journald observability.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full CI gate green, coverage, and end-to-end quickstart validation
(including the live wedge-recovery proof).

- [x] T035 Run the full [deploy/watchdog/run-checks.sh](../../deploy/watchdog/run-checks.sh) green: `shellcheck -x` (all shell) + `bats tests/` (all 4 suites) + `python3 -m unittest discover tests` — the deploy-tree constitution CI gate
- [x] T036 [P] Confirm `coverage.py` shows **100%** of `bin/freshness.py` and `bin/state.py` branches (Constitution Principle IV); add any missing-branch tests to `tests/test_freshness.py` / `tests/test_state.py`
- [ ] T037 Validate quickstart [§1–§3](./quickstart.md) and success criteria SC-001..SC-007 — unit proofs (fresh/stale/empty/missing/locked, cooldown, cap, reset, K-streak, independence) + idempotent provision/clean rollback
- [ ] T038 Live wedge-recovery validation on `homeautomation` (192.168.10.5), quickstart [§4–§5](./quickstart.md): `docker pause ecowitt-dashboard-poller-1` → self-heal within ≈ threshold + one interval (SC-001/002); `docker pause` api then web → restart after K checks (SC-003); confirm every verdict + restart in `journalctl -u ecowitt-watchdog.service` (SC-007)
- [ ] T039 [P] Final [deploy/watchdog/README.md](../../deploy/watchdog/README.md) pass: tuning table, journal verification, and the live wedge-recovery runbook

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–6)**: all depend on Foundational. US1 and US2 are both P1
  (US1 first as MVP). US3/US4 are P2. US4 (provision) is best done after the runtime
  exists, but its preflight/idempotency tests are independent.
- **Polish (Phase 7)**: depends on all user stories.

### Story dependencies & independence

- **US1 (P1)**: independent — pure freshness detection + minimal restart. MVP.
- **US2 (P1)**: independent — api/web probes use a **stubbed** `state.py` in tests, so
  it does not require US3's real `state.py` to be testable.
- **US3 (P2)**: independent — delivers the real `state.py` + cooldown/cap gating; US1/US2
  remain usable without it.
- **US4 (P2)**: independent — host install/uninstall; preflight tests use PATH stubs.

### Shared-file notes (not parallel across stories)

- `lib/health.sh`: poller verdict (US1, T013) + api/web probes (US2, T017) — sequential.
- `lib/actions.sh`: minimal restart (US1, T013) + cooldown/cap gate (US3, T024) — sequential.
- `bin/ecowitt-watchdog-run`: wired incrementally in T007 → T013 → T017 → T024 — sequential.
- `run-checks.sh`: harness (T002) → finalized file list (T032).

### Within each story

Test (RED) → **RED-verify gate** → implementation (GREEN) → suite-green confirmation.
Never edit production code before the matching test is confirmed failing.

---

## Parallel Opportunities

- **Setup**: T002, T003 in parallel (after T001 creates dirs).
- **Foundational**: T005, T006 in parallel (after T004); T007 depends on T004–T006.
- **RED test authoring** across stories is parallelizable (distinct files): T008, T011,
  T015, T019, T022, T026 are each `[P]`.
- **US4 config/docs**: T028, T031, T033 in parallel; T039 in parallel during Polish.
- **Polish**: T036 and T039 in parallel.

### Parallel example — RED test authoring (distinct files)

```bash
Task T008: tests/test_freshness.py        (US1)
Task T011: tests/freshness_verdict.bats   (US1)
Task T015: tests/http_probe.bats          (US2)
Task T019: tests/test_state.py            (US3)
Task T022: tests/actions_cooldown_cap.bats(US3)
Task T026: tests/provision_preflight.bats (US4)
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1: `freshness.py` + `health.sh` poller verdict + minimal restart.
3. **STOP and VALIDATE**: a fixture-stale poller self-heals; `unknown` never restarts.
4. Ship — this is the exact 06-29 wedge fix.

### Incremental delivery

1. Setup + Foundational → tree ready.
2. US1 (poller freshness) → test → ship (MVP).
3. US2 (api/web probes) → test → ship.
4. US3 (cooldown/cap) → test → ship.
5. US4 (provision/rollback/systemd) → test → ship.
6. Polish → full `run-checks.sh` green + live wedge-recovery proof.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every implementation task is gated by a confirmed-failing test (RED-verify) before
  the production edit (GREEN) — Constitution Principle IV.
- The deploy tree's accepted gate is `shellcheck` + `bats` (shell) and `python3
  unittest` + `coverage.py` (python), mirroring `deploy/kiosk` (005-kiosk-runtime
  precedent). Full green = `npm run test:watchdog`.
- No application code changes — this feature is 100% under `deploy/watchdog/`.
