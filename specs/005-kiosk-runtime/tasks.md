---
description: "Task list for Kiosk Runtime Provisioning (005-kiosk-runtime)"
---

# Tasks: Kiosk Runtime Provisioning

**Input**: Design documents from `/specs/005-kiosk-runtime/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included — plan.md explicitly requires a `shellcheck`
gate on all scripts and `bats` unit tests on pure helper logic (the TDD/coverage
deviation mitigation). End-to-end acceptance is the on-device cold-boot test
(manual/operator-run, documented in quickstart.md).

**Organization**: Tasks are grouped by user story (US1–US4) to enable
independent implementation and testing. This is **host OS provisioning** under
`deploy/kiosk/` — no `apps/` or `packages/` source is touched.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1, US2, US3, US4)
- All paths are repo-relative; install targets/modes come from
  [data-model.md](data-model.md) §E3 and the [contracts/](contracts/).

## Path Conventions

Self-contained provisioning tree (per [plan.md](plan.md) Project Structure):

```text
deploy/kiosk/{provision.sh,rollback.sh,.env.example,README.md}
deploy/kiosk/lib/{common.sh,packages.sh,user.sh,artifacts.sh,network.sh,boot.sh}
deploy/kiosk/bin/{kiosk-weather,kiosk-rollback}
deploy/kiosk/systemd/kiosk.service
deploy/kiosk/tests/   # bats unit tests for pure helpers
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the provisioning tree, protect secrets, and retire the
superseded GNOME/snap artifacts that ship on `origin/main`.

- [ ] T001 Create the `deploy/kiosk/` tree: `bin/`, `lib/`, `systemd/`, `tests/` directories per [plan.md](plan.md) Project Structure.
- [ ] T002 [P] Add `deploy/kiosk/.env` to the repo root `.gitignore` so the operator-supplied WiFi PSK is never committed (Secrets gate; [provision-cli.md](contracts/provision-cli.md) Security).
- [ ] T003 [P] Create `deploy/kiosk/.env.example` with placeholder vars only (`KIOSK_WIFI_SSID`, `KIOSK_WIFI_PSK=<your-wpa2-psk>`, `KIOSK_IOT_SSID`, `KIOSK_URL`, `KIOSK_USER`, `KIOSK_UID`) — NO real PSK ([data-model.md](data-model.md) §E1).
- [ ] T004 **RETIREMENT**: `git rm` the five old GNOME/snap stack files that exist on this branch from `origin/main` — `deploy/kiosk/ecowitt-kiosk.desktop`, `deploy/kiosk/install-kiosk.sh`, `deploy/kiosk/kiosk-weather.sh`, `deploy/kiosk/setup-kiosk.sh`, `deploy/kiosk/start-kiosk.sh` — and commit the deletion so the new tree fully replaces the old one ([plan.md](plan.md) "RETIRED").

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared helpers and the `provision.sh` orchestrator skeleton that
every user story's step plugs into.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.
Phase 2 follows the constitution's TDD cycle: the preflight test (T006) is
authored and confirmed **RED before** the `provision.sh` preflight is
implemented in the T007 skeleton (**GREEN**).

- [ ] T005 Implement `deploy/kiosk/lib/common.sh` — `log()`/`die()` logging, `install_file <src> <dst> <mode> <owner>` (copy + chmod + chown, idempotent), idempotency guards, and a PSK-redaction guard that NEVER echoes `KIOSK_WIFI_PSK` ([plan.md](plan.md) SRP row; [data-model.md](data-model.md) §E3).
- [ ] T006 **[TEST — RED FIRST]** Add a `bats` test in `deploy/kiosk/tests/provision_preflight.bats` asserting `provision.sh` preflight fails fast (exit 1/2) on missing `KIOSK_WIFI_SSID`/`KIOSK_WIFI_PSK` and never prints the PSK (mock root/OS checks). Author and confirm this test **RED** (provision.sh preflight not yet implemented) before T007. (Was T008; moved up to honor TDD ordering — its implementation is the T007 skeleton.)
- [ ] T007 Implement the `deploy/kiosk/provision.sh` skeleton — preflight (assert root, assert Ubuntu 24.04 / x86_64, assert required env present, fail fast without echoing the PSK) **making T006 GREEN**, source `deploy/kiosk/.env` if present, ordered step dispatch (placeholders for `install_packages` → `ensure_user` → `install_artifacts` → `configure_network` → `wire_boot`), postflight summary + quickstart pointer, and exit codes 0/1/2/3 ([provision-cli.md](contracts/provision-cli.md)).
- [ ] T008 [P] Add the `shellcheck` + `bats` test harness wiring: a root `package.json` script (e.g. `test:kiosk`) and CI step that (a) obtains the tools (system `shellcheck`/`bats`, e.g. `apt-get install shellcheck bats` or a CI action) and (b) lints every file under `deploy/kiosk/**` with `shellcheck` and runs `deploy/kiosk/tests/*.bats`, so both gates are enforceable in CI ([plan.md](plan.md) Testing; Constitution coverage mitigation).

**Checkpoint**: Helpers + RED preflight test + GREEN orchestrator skeleton + CI gate wiring ready — user stories can begin.

---

## Phase 3: User Story 1 - Rebuild the kiosk from the repo (Priority: P1) 🎯 MVP

**Goal**: One documented command on a fresh device produces an unattended,
full-screen dashboard at native 2160×1440 — no steps living only on the old
device.

**Independent Test**: On a clean device, run `sudo deploy/kiosk/provision.sh`
with documented inputs, cold-boot, and confirm it comes up unattended into the
full-screen dashboard at native resolution with no login/desktop/dialog.

### Tests for User Story 1 ⚠️

> The US1 preflight test was moved up to **T006** (Phase 2) to satisfy the
> constitution's RED-before-GREEN ordering — see Phase 2. No separate US1
> test task remains here; T006 already guards US1's preflight contract.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Vendor the launcher verbatim into `deploy/kiosk/bin/kiosk-weather` exactly as in [contracts/kiosk-launcher.md](contracts/kiosk-launcher.md) (must include `--password-store=basic`, `--ozone-platform=wayland`, `--force-device-scale-factor=1`, the `while true` relaunch loop) — installs to `/usr/local/bin/kiosk-weather` (0755).
- [ ] T010 [P] [US1] Vendor the systemd unit verbatim into `deploy/kiosk/systemd/kiosk.service` exactly as in [contracts/kiosk-service.md](contracts/kiosk-service.md) (`ExecStart=/usr/bin/cage -- /usr/local/bin/kiosk-weather`, `PAMName=login`, `TTYPath=/dev/tty1`, `Restart=always`, `RestartSec=2`, `WantedBy=graphical.target`) — installs to `/etc/systemd/system/kiosk.service` (0644).
- [ ] T011 [US1] Implement `deploy/kiosk/lib/packages.sh` `install_packages` — install `cage`, `google-chrome-stable` (add Google's apt repo + key), and `grim`; MUST NOT install `greetd`/`seatd`/`wlr-randr` ([research.md](research.md); [provision-cli.md](contracts/provision-cli.md) step 2). Idempotent.
- [ ] T012 [US1] Implement `deploy/kiosk/lib/user.sh` `ensure_user` — create `KIOSK_USER` (uid `KIOSK_UID`, home `/home/kiosk`) only if missing ([data-model.md](data-model.md) §E2). Idempotent no-op if present.
- [ ] T013 [US1] Implement `deploy/kiosk/lib/artifacts.sh` `install_artifacts` — use `common.sh`'s `install_file` to place launcher (0755) + unit (0644), create the Chrome profile dir `/home/kiosk/.config/kiosk-chrome` (0700, owned by kiosk), then `systemctl daemon-reload` ([data-model.md](data-model.md) §E3).
- [ ] T014 [US1] Implement `deploy/kiosk/lib/boot.sh` `wire_boot` — remove the `/etc/systemd/system/display-manager.service` symlink (no-op if gone), `systemctl enable kiosk.service`, set default `graphical.target` ([data-model.md](data-model.md) §E7; [contracts/kiosk-service.md](contracts/kiosk-service.md)). Idempotent.
- [ ] T015 [US1] Wire `install_packages` → `ensure_user` → `install_artifacts` → `wire_boot` into `deploy/kiosk/provision.sh` in order (network step added in US3) ([provision-cli.md](contracts/provision-cli.md) Behavior).
- [ ] T016 [US1] Write the `deploy/kiosk/README.md` provision section: target/OS assumptions (Surface Pro 3, Ubuntu 24.04.x x86_64, 2160×1440), the single `sudo deploy/kiosk/provision.sh` command, and documented inputs (FR-001/002/003/006).

**Checkpoint**: Fresh device → one command → cold boot → full-screen dashboard at native res. MVP complete.

---

## Phase 4: User Story 2 - Wall display keeps itself running (Priority: P1)

**Goal**: Browser crash or session failure auto-recovers to the full-screen
dashboard within a short bounded time, with no human and no blocking keyring.

**Independent Test**: With the kiosk running, kill Chrome and separately kill the
session; confirm the dashboard returns full-screen within ~2 s each time, and a
cold boot leaves no keyring/credential prompt on screen.

### Tests for User Story 2 ⚠️

- [ ] T017 [P] [US2] Add a `bats` test in `deploy/kiosk/tests/launcher_selfheal.bats` asserting `deploy/kiosk/bin/kiosk-weather` contains the `while true` relaunch loop with a `sleep 2` and the `--password-store=basic` flag (guards FR-010/FR-012 regressions in the vendored launcher).

### Implementation for User Story 2

- [ ] T018 [US2] Document self-heal behavior in `deploy/kiosk/README.md`: launcher loop relaunches Chrome ~2 s after exit (FR-012), unit `Restart=always`/`RestartSec=2` restarts the session (FR-013), and an unreachable dashboard at boot self-recovers on Chrome's auto-retry (FR-014) — referencing the launcher/unit contracts rather than re-deriving behavior.

**Checkpoint**: Self-heal (browser + session) is verifiable and documented; keyring-free cold boot guaranteed by the vendored launcher flag.

---

## Phase 5: User Story 3 - Reliable, correct network membership (Priority: P1)

**Goal**: Headless boot auto-joins ONLY the main trusted WLAN (system-stored
secret, priority, powersave off); never auto-joins the isolated IoT VLAN.

**Independent Test**: Reboot headless and confirm it auto-joins the main WLAN
(not IoT) and the dashboard loads; confirm it does not auto-join IoT even in
range; confirm powersave is disabled.

### Tests for User Story 3 ⚠️

- [ ] T019 [P] [US3] Add a `bats` test in `deploy/kiosk/tests/network_args.bats` asserting `configure_network` builds the `nmcli` invocation with `psk-flags 0`, `autoconnect-priority 10`, `powersave 2`, and sets the IoT profile `autoconnect no` — using a mocked `nmcli` and a dummy PSK, asserting the real PSK is never logged.

### Implementation for User Story 3

- [ ] T020 [US3] Implement `deploy/kiosk/lib/network.sh` `configure_network` — create/modify the system-owned main WLAN profile (`key-mgmt wpa-psk`, `psk` from `KIOSK_WIFI_PSK`, `psk-flags 0`, `autoconnect yes`, `autoconnect-priority 10`, `powersave 2`) and set the IoT profile (`KIOSK_IOT_SSID`) `autoconnect no` if known; write only to the 0600 system-connection file, never log the PSK ([contracts/network-profile.md](contracts/network-profile.md); [data-model.md](data-model.md) §E6). Idempotent via `nmcli con modify`.
- [ ] T021 [US3] Add WiFi env validation in `deploy/kiosk/provision.sh` preflight (required `KIOSK_WIFI_SSID`/`KIOSK_WIFI_PSK`, optional `KIOSK_IOT_SSID`) and wire `configure_network` into the step order after `install_artifacts` ([provision-cli.md](contracts/provision-cli.md) step 5).
- [ ] T022 [US3] Add the network section to `deploy/kiosk/README.md`: main-WLAN-only membership, IoT never auto-joined, powersave off, priority precedence (FR-015–FR-019), and that the PSK is an operator-supplied secret.

**Checkpoint**: Headless boot lands on the main VLAN only, durably, with the secret stored system-level.

---

## Phase 6: User Story 4 - Recover by reverting to a normal desktop (Priority: P2)

**Goal**: One documented rollback returns the device to a normal GNOME/gdm
desktop; re-running provision restores kiosk mode.

**Independent Test**: On a provisioned kiosk run the rollback, reboot, confirm a
normal desktop; re-run provision, confirm kiosk mode returns.

### Implementation for User Story 4

- [ ] T023 [P] [US4] Vendor the rollback helper verbatim into `deploy/kiosk/bin/kiosk-rollback` exactly as in [contracts/rollback.md](contracts/rollback.md) (disable+stop `kiosk.service`, re-enable+start gdm/gdm3) — installs to `/usr/local/bin/kiosk-rollback` (0755).
- [ ] T024 [US4] Implement `deploy/kiosk/rollback.sh` — thin wrapper that installs `kiosk-rollback` (via `common.sh` `install_file`) if missing and invokes `/usr/local/bin/kiosk-rollback` ([contracts/rollback.md](contracts/rollback.md)).
- [ ] T025 [US4] Add rollback + break-glass docs to `deploy/kiosk/README.md`: `sudo deploy/kiosk/rollback.sh` → reboot, re-provision to restore (FR-020/021), and the GRUB recovery-mode break-glass path ([contracts/rollback.md](contracts/rollback.md)).

**Checkpoint**: Documented rollback ↔ re-provision round-trip works.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verification gates and the on-device acceptance.

- [ ] T026 [P] Run `shellcheck` on every `deploy/kiosk/**` script and fix all findings (CI-runnable gate; [quickstart.md](quickstart.md) Notes).
- [ ] T027 [P] Run the `bats` helper suite (`deploy/kiosk/tests/*.bats`) green for the pure helpers (preflight parse, launcher self-heal, network args) — no real device required.
- [ ] T028 **ON-DEVICE ACCEPTANCE (MANUAL / OPERATOR-RUN)**: Per [quickstart.md](quickstart.md) §2–§5 on the target Surface Pro 3 — `provision.sh` → cold reboot → `grim /tmp/wall.png` shows the full 2160×1440 layout with NO keyring dialog (SC-002), `nmcli` confirms the main VLAN (not IoT) and that power-save is the disabled setting `802-11-wireless.powersave=2` (SC-004; SC-005 verified as the setting, not a multi-hour soak — see analyze G2), dashboard returns HTTP 200, clock reads Eastern (`America/New_York`, FR-011), and browser/session kills self-heal within ~2 s (SC-003). Then **re-run `provision.sh` and confirm it converges with no change to the resulting kiosk state** (idempotency, FR-004) — this is the practical reproducibility check standing in for SC-007 on a single device (a VM/spare re-provision from the same revision is an optional confirming check; fleet is out of scope). Covers SC-002/003/004/005/006/007, FR-007–FR-019. Cannot run in CI — operator executes on hardware.
- [ ] T029 [P] Finalize `deploy/kiosk/README.md` cross-links (quickstart, contracts) and confirm `.env.example` placeholders match `provision.sh` inputs; verify no secret is present anywhere in `deploy/kiosk/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately. T004 (retirement) is independent of the new tree and can run any time in this phase.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (every story's lib step uses `common.sh` and plugs into `provision.sh`).
- **User Stories (Phase 3–6)**: All depend on Foundational. US1 (P1) is the MVP. US2 (P1) depends on US1's vendored launcher/unit existing (it verifies/documents them). US3 (P1) and US4 (P2) are independent of US1's outcome and of each other.
- **Polish (Phase 7)**: Depends on all desired stories. T028 (on-device acceptance) depends on US1+US2+US3 (and US4 for the rollback check).

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P1)**: After US1 (artifacts T009/T010 must exist to verify/document self-heal).
- **US3 (P1)**: After Foundational. Independent of US1/US2/US4.
- **US4 (P2)**: After Foundational. Independent of US1/US2/US3.

### Within Each User Story

- Tests (bats) authored before/with implementation, RED before GREEN.
- Vendored artifacts (T009/T010/T023) before the lib steps that install them.
- `common.sh` helpers before any lib step.
- README sections after the corresponding step is implemented.

### Parallel Opportunities

- Setup: T002, T003 in parallel; T004 anytime.
- Foundational: T005 (common.sh) and T006 (preflight test) can be authored in parallel; T006 (RED) precedes T007 (skeleton, GREEN); T008 (shellcheck/bats harness) parallels T005–T007.
- US1: T009, T010 in parallel (two verbatim vendored files — the US1 preflight test is now T006 in Phase 2); lib steps T011–T014 touch separate files and can largely parallelize, then T015 wires them.
- US3 and US4 can be developed in parallel with US1/US2 once Foundational is done.
- Polish: T026, T027, T029 in parallel; T028 is manual and gated last.

---

## Parallel Example: User Story 1

```bash
# US1's preflight test is T006 (Phase 2). In US1, vendor both verbatim artifacts together:
Task: "Vendor deploy/kiosk/bin/kiosk-weather verbatim"                        # T009
Task: "Vendor deploy/kiosk/systemd/kiosk.service verbatim"                    # T010

# Then implement the independent lib steps in parallel:
Task: "lib/packages.sh install_packages"   # T011
Task: "lib/user.sh ensure_user"            # T012
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (incl. retiring the 5 old files, T004).
2. Phase 2 Foundational (`common.sh` + preflight test RED → `provision.sh` skeleton GREEN + shellcheck/bats harness).
3. Phase 3 US1 — vendor artifacts + packages/user/artifacts/boot + README.
4. **STOP and VALIDATE**: provision a clean device, cold boot, confirm
   full-screen dashboard at 2160×1440 (the on-device acceptance, T028, exercises
   this end to end).

### Incremental Delivery

- Add US2 (self-heal verification/docs), then US3 (network) — both P1, complete
  the minimum viable kiosk.
- Add US4 (rollback, P2) for operability.
- Finish with Polish: shellcheck + bats green, then the manual on-device
  acceptance.

---

## Format Validation

All tasks above use the required checklist format: `- [ ]` checkbox + sequential
`Txxx` ID + optional `[P]` + story label (`[US1]`–`[US4]`) on user-story tasks
only + an explicit file path. Setup/Foundational/Polish tasks carry no story
label by design.

**Retirement task present**: ✅ T004 (`git rm` the 5 old GNOME/snap files).

**On-device acceptance present**: ✅ T028 (manual/operator-run cold-boot test).
