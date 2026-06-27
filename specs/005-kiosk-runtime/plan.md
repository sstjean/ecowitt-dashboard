# Implementation Plan: Kiosk Runtime Provisioning

**Branch**: `005-kiosk-runtime` | **Date**: 2026-06-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-kiosk-runtime/spec.md`

## Summary

Codify the already-working, hand-built kitchen wall kiosk runtime (validated
on-device at `kitchen-kiosk` / 192.168.10.156 by a passing cold-boot reboot
test) into reproducible, version-controlled provisioning under
`deploy/kiosk/`. The shipped runtime is **cage** (wlroots Wayland kiosk
compositor) launching **google-chrome-stable (the .deb, NOT snap)** in
`--kiosk` mode, supervised by a **systemd** unit on tty1 with
`PAMName=login` (logind seat) and `Restart=always`, self-relaunching via a
bash loop, on the **main trusted WLAN** (system-owned NetworkManager
connection, power-save off, IoT VLAN never auto-joined). A single
`provision.sh` applies packages + user + launcher + unit + rollback helper +
network config + boot wiring idempotently; a documented rollback returns the
device to the GNOME/gdm desktop. This **replaces** the retired GNOME/snap
`deploy/kiosk/` artifacts that currently live on `main`.

This feature is **OS host provisioning**, not application code: it consumes
the existing dashboard over HTTP and changes nothing in `apps/` or
`packages/`.

## Technical Context

**Language/Version**: POSIX/bash shell scripts (bash 5.x, Ubuntu 24.04). No
compiled language in this feature.

**Primary Dependencies** (pinned to the validated device):
- `cage` 0.1.5+20240127-2build1 — wlroots Wayland kiosk compositor.
- `google-chrome-stable` 149.0.7827.200-1 — the **.deb** from Google's apt
  repo. **NOT** the snap (snap could not drive native Wayland this session
  and crash-looped; deb Chrome on cage renders native Wayland at full
  2160×1440, dpr=1).
- `grim` 1.4.0+ds-2build2 — verification screenshots (works on cage's
  wlroots compositor; does NOT work on GNOME/mutter).
- `systemd` + `logind` (PAM `login`) — init/supervision and seat.
- `NetworkManager` — WiFi connection management (system-owned profiles).

**Storage**: N/A — no database. The operator-supplied WiFi secret lives only
in `/etc/NetworkManager/system-connections/*` on the device (mode 0600),
never in the repo.

**Testing**: `shellcheck` lint on all scripts (CI-runnable); pure helper
logic (arg/env parsing, idempotency guards) unit-testable with `bats` and
mocked commands. End-to-end acceptance is the on-device cold-boot test
(already proven) documented in [quickstart.md](quickstart.md). See
Constitution Check + Complexity Tracking for the coverage deviation.

**Target Platform**: Surface Pro 3, Ubuntu 24.04.4 LTS, x86_64, native panel
2160×1440 (3:2). Dedicated local user `kiosk` (uid 1001, `/home/kiosk`).

**Project Type**: Host OS provisioning (shell + systemd + NetworkManager
declarative config). Single-device, not a fleet.

**Performance Goals**: Self-heal (browser/session crash → back to full-screen
dashboard) within a short bounded time — `RestartSec=2` for the unit plus a
2 s relaunch sleep in the launcher loop (well under a minute, per SC-003).

**Constraints**:
- Headless cold boot MUST NOT surface a GNOME-keyring "choose password"
  dialog — solved by Chrome `--password-store=basic`.
- Must render at native 2160×1440, dpr=1 — `--ozone-platform=wayland` +
  `--force-device-scale-factor=1` on cage.
- Kiosk MUST be on the main WLAN (`marbles`, 192.168.10.0/24) only; never
  auto-join the isolated IoT VLAN (`Marbles-iot`).
- WiFi PSK MUST be stored system-level (psk-flags=0) so it survives a
  headless boot; MUST NOT be committed to the repo.

**Scale/Scope**: One wall kiosk. ~6 small artifacts in `deploy/kiosk/` plus a
README/quickstart. No multi-device orchestration (explicitly out of scope).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v2.1.0.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Simplicity | ✅ PASS | Minimal **logind** path: systemd unit drives cage directly via `PAMName=login`. `greetd`/`seatd`/`wlr-randr` were installed during exploration but are **NOT** used by the shipped unit — provisioning deliberately omits them. |
| II. YAGNI | ✅ PASS | Single device. No fleet config, no templating engine, no speculative options beyond the documented operator inputs (WiFi SSID/PSK, dashboard URL). |
| III. SRP | ✅ PASS | `provision.sh` orchestrates focused, independently-testable steps (`install_packages`, `ensure_user`, `install_artifacts`, `configure_network`, `wire_boot`) in `lib/*.sh`; shared concerns (idempotent file install w/ mode, logging) extracted to helpers, not copy-pasted. |
| IV. TDD / 100% coverage | ⚠️ JUSTIFIED DEVIATION | Host provisioning against a physical Surface Pro 3 cannot be fully exercised in CI with mock data. Mitigation: `shellcheck` gate on all scripts; `bats` unit tests on pure helpers (arg/env parse, idempotency guards) with command mocks; the end-to-end acceptance is the on-device cold-boot test already proven and documented in quickstart. See Complexity Tracking. |
| Display Timezone | ✅ PASS | The dashboard app already renders Eastern; the kiosk only displays it. The verification step confirms the clock reads `America/New_York`. |
| Secrets Management | ✅ PASS | WiFi PSK is an operator-supplied provision-time input (env var / prompt), written only to `/etc/NetworkManager/system-connections` (0600). The repo ships an `.env.example` template with placeholders; the real PSK is `.gitignore`-protected and never committed. |
| Containerization | ⚠️ JUSTIFIED EXCEPTION | The constitution's containerization rule governs the **long-running service components** (poller, API, frontend, MQTT). The kiosk is the **display head / HTTP client** — host-level OS config (compositor + browser + seat) that by nature cannot run in a container. It consumes the dashboard over the LAN. See Complexity Tracking. |
| Network Boundary Integrity | ✅ PASS | Reinforces the boundary: the kiosk joins the **main** VLAN only and is configured to **never** auto-join the isolated IoT VLAN. No new main→IoT pinhole. |
| Data Backup | ✅ N/A | No database/state owned by this feature. |
| GitHub Sync (workflow) | ✅ PASS (downstream) | Each User Story has/needs a tracking issue; `tasks.md` checklist items roll up under their story issue (handled in `/speckit.tasks`). |

**Result**: Gate PASS with two documented, justified deviations (coverage,
containerization) recorded in Complexity Tracking. No unjustified violations.

## Project Structure

### Documentation (this feature)

```text
specs/005-kiosk-runtime/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — pinned runtime decisions
├── data-model.md        # Phase 1 output — config entities & artifact map
├── quickstart.md        # Phase 1 output — provision + reboot + grim verify
├── contracts/           # Phase 1 output — interface contracts
│   ├── provision-cli.md
│   ├── kiosk-service.md
│   ├── kiosk-launcher.md
│   ├── network-profile.md
│   └── rollback.md
├── checklists/
│   └── requirements.md  # (already present)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

This feature produces a self-contained provisioning tree under
`deploy/kiosk/` and **retires** the old GNOME/snap artifacts.

```text
deploy/kiosk/
├── provision.sh                 # Single one-command entry point (idempotent)
├── rollback.sh                  # Thin wrapper → installs/invokes kiosk-rollback
├── lib/
│   ├── common.sh                # logging, install_file (path+mode), guards
│   ├── packages.sh              # install_packages: cage, google-chrome-stable, grim
│   ├── user.sh                  # ensure_user: kiosk uid 1001 if missing
│   ├── artifacts.sh             # install launcher + unit + rollback helper
│   ├── network.sh               # configure_network: system WLAN, priority, powersave, IoT off
│   └── boot.sh                  # wire_boot: unhook gdm, enable kiosk.service, set graphical.target
├── bin/
│   ├── kiosk-weather            # launcher → /usr/local/bin/kiosk-weather (0755)
│   └── kiosk-rollback           # recovery → /usr/local/bin/kiosk-rollback (0755)
├── systemd/
│   └── kiosk.service            # → /etc/systemd/system/kiosk.service
├── .env.example                 # operator template (KIOSK_WIFI_SSID/PSK/URL placeholders)
└── README.md                    # quickstart + rollback + break-glass (GRUB recovery)
```

**RETIRED (must be `git rm`'d when this branch lands)** — these live on
`origin/main` (GNOME/snap stack) and are superseded:

```text
deploy/kiosk/ecowitt-kiosk.desktop   # autostart .desktop (GNOME)
deploy/kiosk/install-kiosk.sh        # old installer
deploy/kiosk/kiosk-weather.sh        # old launcher
deploy/kiosk/setup-kiosk.sh          # old setup
deploy/kiosk/start-kiosk.sh          # old start
```

> NOTE: the current `005-kiosk-runtime` branch was cut from a merge-base
> *before* `deploy/kiosk/` existed, so the old files are not in this branch's
> working tree but DO ship on `main`. A plain merge would keep them.
> Implementation MUST explicitly delete the five old files (and commit the
> deletion) so the new tree fully replaces the old one.

**Structure Decision**: One self-contained provisioning directory
(`deploy/kiosk/`). `provision.sh` is the only entry point; SRP-focused steps
live in `lib/*.sh`; the three authoritative on-device files
(`kiosk-weather`, `kiosk.service`, `kiosk-rollback`, captured verbatim at
`/tmp/kiosk-capture/`) are vendored under `bin/` and `systemd/` and installed
to their canonical paths. No application source (`apps/`, `packages/`) is
touched.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| TDD 100% CI coverage not met for shell provisioning | The deliverable is host OS configuration (compositor, deb browser, systemd seat, NetworkManager profiles) targeting one physical Surface Pro 3. Its true behavior (cold boot → cage+Chrome at 2160×1440, keyring-free, on main VLAN) can only be exercised on the device. | A CI harness that mocks systemd/logind/NetworkManager/Wayland would test the mocks, not the runtime, giving false confidence. Instead: `shellcheck` gate + `bats` unit tests on pure helpers (parsing, idempotency guards) + a **proven, documented on-device cold-boot acceptance test** (quickstart) is the honest, sufficient verification for a single-device head. |
| Kiosk runtime is not containerized | The kiosk is the **display head** — a Wayland compositor + browser bound to a physical seat/tty and GPU. That cannot run in a container; it is the client that *renders* the dashboard, not one of the dashboard's service tiers. | Containerizing a compositor/browser bound to tty1 + DRM is not feasible and adds no reproducibility benefit. The constitution's containerization rule targets the long-running service components (poller/API/frontend/MQTT), which remain containerized; this feature only configures the consuming display. |
