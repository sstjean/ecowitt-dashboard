# Implementation Plan: Container Watchdog / Self-Healing

**Branch**: `009-container-watchdog` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-container-watchdog/spec.md`

**Source of truth**: Issues [#31](https://github.com/sstjean/ecowitt-dashboard/issues/31)
(parent) + [#32](https://github.com/sstjean/ecowitt-dashboard/issues/32)/[#33](https://github.com/sstjean/ecowitt-dashboard/issues/33)/[#34](https://github.com/sstjean/ecowitt-dashboard/issues/34)/[#35](https://github.com/sstjean/ecowitt-dashboard/issues/35).
If this plan and the Issues disagree, the Issues win.

## Summary

A host-side **watchdog** on `homeautomation` (192.168.10.5) that judges each
docker-compose service's **logical health** (not just process liveness) every
~60 s via a systemd timer + oneshot service, and `docker restart`s only the
specific stalled/unhealthy service — with per-service cooldown + a per-hour cap
so a real outage surfaces loudly rather than being masked. It exists to catch
the 2026-06-29 wedge class: a poller `Up` for 23 h but with frozen readings,
which docker's own `restart:` policy cannot detect.

**Technical approach** (all resolved in [research.md](./research.md)): the
deliverable is **100% deploy-side** under `deploy/watchdog/`, mirroring the
existing `deploy/kiosk` layout and idioms (extended with a python
unittest+coverage gate for the logic-bearing helpers). Poller freshness is read **read-only from
the SQLite DB on the host named volume via a `python3` stdlib helper** (the host
has no `sqlite3` CLI and no `jq`, and `/api/v1/health` would have returned `ok`
during the wedge — so a DB read is the only ground truth and needs no container
up). api/web health is `curl` to `:8090/api/v1/health` (status `ok`) and `:8090/`
(HTTP 2xx) with K-consecutive-failure gating. Cooldown/cap/streak state persists
in a host JSON file managed by a second `python3` helper. **No application code
changes.**

## Technical Context

**Language/Version**: Bash (orchestration; `set -euo pipefail`) + Python 3 stdlib
(`sqlite3`, `json`, `argparse`) for the freshness reader and state store. No Node
on the host.

**Primary Dependencies**: `bash`, `coreutils`, `curl`, `docker` CLI, `python3`
stdlib, `systemd`. Dependency-light by design — no pip packages, no `jq`, no
`sqlite3` CLI.

**Storage**: Reads (read-only) the existing app SQLite DB at
`/var/lib/docker/volumes/ecowitt-dashboard_sqlite-data/_data/ecowitt.sqlite`
(table `readings`, column `observed_at` ISO-8601 UTC). Writes watchdog state to
`/var/lib/ecowitt-watchdog/state.json`. No schema changes.

**Testing**: `shellcheck` + `bats` (shell logic) and `python3 -m unittest`
(freshness + state helpers, with `coverage.py`), gated by
`deploy/watchdog/run-checks.sh` — mirroring `deploy/kiosk`.

**Target Platform**: Single Linux host (`homeautomation`, Ubuntu) running the
docker-compose stack; watchdog runs as root via systemd timer.

**Project Type**: Deploy/operations tooling (host provisioning tree), not an app
component.

**Performance Goals**: Each run completes well under the 60 s interval; recovery
of a wedge within ≈ freshness threshold + one interval (~6 min worst case) vs.
the ~2 h lost on 06-29.

**Constraints**: Offline/LAN-only (no cloud dependency, FR-001); UTC-vs-UTC
freshness math; must never crash on missing/empty/locked DB or a missing
container (FR-014/015); each service independent (FR-005).

**Scale/Scope**: 3 supervised services (`poller`, `api`, `web`); `backup`
excluded. ~2 entry scripts + 5 libs + 2 python helpers + 2 systemd units + tests.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v2.1.0.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | Oneshot+timer + two small python helpers + bash glue. No daemon, no in-process loop, no pip deps. Simplest sufficient design for "run a short job periodically". |
| II. YAGNI | ✅ PASS | Only the 3 services that wedge are supervised; no plugin/abstraction. Knobs exist because the spec requires them as tunables. |
| III. SRP | ✅ PASS | `health.sh` (pure probing) / `state.py` (persistence) / `actions.sh` (restart gating) / orchestrator (glue) are separable & independently testable. Shared bash helpers (`log/die/install_file`) live in `lib/common.sh` (no copy-paste). |
| IV. Testing/TDD + 100% coverage | ✅ PASS (with precedent) | Logic-bearing code is the two python helpers → real unit tests + `coverage.py` to 100% of their branches. Shell scripts are gated by `shellcheck` + `bats` exactly as `deploy/kiosk` is — the established, constitution-accepted approach for the deploy tree (005-kiosk-runtime precedent). RED-before-GREEN per US. |
| Display Timezone | ✅ N/A→PASS | No user-facing time rendering. Internal freshness math is UTC-vs-UTC (storage is UTC), satisfying the spirit of the rule. |
| Local Type-Checking Parity | ✅ N/A | Bash/Python stdlib; no static type checker in this tree. `shellcheck` is the local static gate and is runnable locally. |
| Platform: Self-Hosted/Local-First | ✅ PASS | Runs on the household host with zero cloud dependency (FR-001). |
| Platform: Network Boundary | ✅ PASS | Watchdog touches only `localhost` (DB file + `:8090`); introduces no new main→IoT access. |
| Security: Secrets | ✅ PASS | No secrets involved; `.env.example` tracked, `.env` gitignored (mirrors kiosk). |
| DevOps: Idempotent provisioning + rollback | ✅ PASS | `install_file`-based idempotent provision + clean rollback (FR-011/012). |
| DevOps: CI gate | ✅ PASS | `run-checks.sh` wired as `npm run test:watchdog` for CI, like kiosk. |

**Result**: PASS. No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-container-watchdog/
├── plan.md              # This file
├── research.md          # Phase 0 — all Open Questions + FR-003 resolved
├── data-model.md        # Phase 1 — config/state/verdict/freshness entities
├── quickstart.md        # Phase 1 — validation/run guide
├── contracts/           # Phase 1 — CLI + unit + probe contracts
│   ├── provision-cli.md
│   ├── rollback-cli.md
│   ├── watchdog-units.md
│   ├── freshness-reader.md
│   ├── state-store.md
│   └── health-probes.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

`deploy/watchdog/` mirrors `deploy/kiosk/`'s structure and idioms (FR-013),
extended with python `unittest`+`coverage` for the two helpers:

```text
deploy/watchdog/
├── .env.example                 # tracked template for optional knob overrides
├── README.md                    # operator guide (provision / tune / rollback / verify)
├── provision.sh                 # idempotent install (entry point, run as root)
├── rollback.sh                  # clean removal (--purge for state/config)
├── run-checks.sh                # CI gate: shellcheck + bats + python unittest
├── bin/
│   ├── ecowitt-watchdog-run     # orchestrator (sources libs; invoked by oneshot)
│   ├── freshness.py             # read-only SQLite freshness reader (python3 stdlib)
│   └── state.py                 # atomic JSON state store (cooldown/cap/streak)
├── lib/
│   ├── common.sh                # log/warn/die, require_env, default_env, install_file
│   ├── config.sh                # default_env for every knob (data-model §2)
│   ├── health.sh                # per-service verdict (poller→freshness.py, api/web→curl)
│   ├── state.sh                 # thin bash wrapper over state.py
│   └── actions.sh               # restart gating (cooldown/cap) + docker restart + loud cap log
├── systemd/
│   ├── ecowitt-watchdog.service # Type=oneshot, EnvironmentFile, ExecStart=…-run
│   └── ecowitt-watchdog.timer   # OnUnitActiveSec=60s, Persistent=true
└── tests/
    ├── test_freshness.py        # python unittest: fresh/stale/empty/missing/locked + UTC math
    ├── test_state.py            # python unittest: cooldown/window-prune/cap/streak/reset/atomic
    ├── config_validation.bats   # config.sh: defaults + malformed-knob warn-and-default
    ├── orchestrator_isolation.bats # run loop: per-service fault isolation + healthy→reset
    ├── freshness_verdict.bats   # health.sh poller verdict mapping (stub freshness.py)
    ├── http_probe.bats          # health.sh api/web probe + K-streak (stub curl + state.py)
    ├── actions_cooldown_cap.bats# actions.sh gating (stub docker + state.py)
    └── provision_preflight.bats # provision.sh preflight + idempotency (PATH stubs)
```

Installed host paths (provisioner targets) are listed in
[data-model.md](./data-model.md) §6.

**Structure Decision**: Operations/deploy tree. The watchdog is not an app
component (no `apps/*` or `packages/*` change) and makes **no** application code
change; it lives entirely under `deploy/watchdog/`, mirroring the proven
`deploy/kiosk` structure, idioms (`set -euo pipefail`, sourced libs, `install_file`,
`.env.example`), and `run-checks.sh` test gate.

## Pinned configuration (final)

| Knob | Value | Rationale (full detail in research.md Decision 5) |
|------|-------|----------------------------------------------------|
| Poller freshness threshold | **300 s** | ~10 missed 30 s cycles ⇒ clearly stalled |
| api/web K consecutive failures | **3** | ~3 min sustained at 60 s interval; absorbs blips |
| Restart cooldown | **600 s** | covers restart + first poll + age-recovery |
| Per-window cap | **3 / 3600 s** | ≤3/hr then stop + loud log |
| Watchdog interval | **60 s** | bounds lost history to ≈6 min |

All tunable at runtime via `/etc/ecowitt-watchdog/watchdog.env`, **except the
watchdog interval** — it sets the systemd timer cadence, which a `.timer` unit
cannot read from an `EnvironmentFile`, so the provisioner substitutes it into
the installed `.timer` and changing it requires a re-provision.

## Complexity Tracking

> No constitution violations — section intentionally empty.

## Phase status

- [x] Phase 0 — research.md (FR-003 + OQ-1..7 all resolved)
- [x] Phase 1 — data-model.md, contracts/ (6), quickstart.md, agent context updated
- [ ] Phase 2 — tasks.md (created by `/speckit.tasks`, not this command)
