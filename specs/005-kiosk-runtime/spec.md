# Feature Specification: Kiosk Runtime Provisioning

**Feature Branch**: `005-kiosk-runtime`

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "Capture the wall-mounted weather kiosk's runtime (currently hand-built and undocumented, living only on the device) as reproducible, version-controlled provisioning in the repo so the kiosk can be rebuilt deterministically from scratch — booting unattended into a full-screen dashboard at native resolution, self-healing, on the correct trusted WLAN, with a one-command provision and a documented rollback."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rebuild the kiosk from the repo after a device failure (Priority: P1)

The kiosk device (a wall-mounted Surface Pro 3 in the kitchen) dies or must be reimaged. An operator takes a freshly installed device, runs a single documented command sourced from this repository, and ends up with a kiosk that boots unattended straight into the full-screen dashboard at the panel's native resolution — with no steps that exist only in someone's memory or only on the old device.

**Why this priority**: This is the entire reason the feature exists. Today the runtime lives only on the device and is undocumented, so a hardware failure means the wall display is unrecoverable without re-deriving everything by hand. A reproducible, repo-sourced provision is the core deliverable and is independently valuable on its own.

**Independent Test**: On a clean device (or VM/spare matching the target OS), run the documented provisioning command from a checkout of the repo, reboot cold, and confirm the device comes up unattended showing the full-screen dashboard at native resolution — without any manual configuration beyond the documented command and its documented inputs.

**Acceptance Scenarios**:

1. **Given** a freshly installed target device and a checkout of this repository, **When** the operator runs the single documented provisioning command with the documented inputs, **Then** the device is configured into the kiosk runtime without further manual steps.
2. **Given** the device has been provisioned, **When** it is power-cycled (cold boot) with no human present, **Then** it boots unattended and displays the full-screen dashboard at the panel's native resolution (2160×1440) with no login screen, desktop, or dialog blocking the view.
3. **Given** a clean device is provisioned from a given repository revision (and, optionally, a VM/spare provisioned from the same revision), **When** the device is re-provisioned with the same inputs (idempotent) or the spare is booted, **Then** the resulting kiosk state is identical (same resolution, same auto-launch, same network membership) — reproducibility demonstrated by deterministic, idempotent re-provision rather than a required two-physical-device test (fleet validation is out of scope).

---

### User Story 2 - The wall display keeps itself running unattended (Priority: P1)

The kiosk runs 24/7 on a wall with nobody tending it. If the browser crashes or the display session dies, the system brings the dashboard back automatically without anyone touching the device.

**Why this priority**: A wall display that needs a human to restart it after every crash defeats its purpose. Self-healing is what makes the unattended deployment trustworthy, and it ships together with the boot-up slice as part of the minimum viable kiosk.

**Independent Test**: With the kiosk running, simulate a browser crash (terminate the browser process) and separately simulate a session failure; in each case confirm the dashboard returns to full-screen automatically within a short, bounded time, with no human interaction.

**Acceptance Scenarios**:

1. **Given** the kiosk is displaying the dashboard, **When** the browser process terminates unexpectedly, **Then** the browser is relaunched automatically and returns to the full-screen dashboard.
2. **Given** the kiosk is displaying the dashboard, **When** the whole display session fails, **Then** the system restarts the session automatically and returns to the full-screen dashboard.
3. **Given** the device boots from cold with no human present, **When** startup completes, **Then** the dashboard appears with no interactive keyring, password, or credential prompt left on screen blocking the display.

---

### User Story 3 - Reliable, correct network membership (Priority: P1)

The kiosk must always be reachable on, and only on, the household's main trusted WLAN so it can load the dashboard — never the isolated IoT network — and it must reconnect on its own after a headless reboot or a brief signal drop.

**Why this priority**: If the kiosk lands on the wrong network or can't rejoin WiFi after a reboot, it shows nothing useful — and joining the isolated IoT VLAN would break dashboard access entirely. Correct, durable networking is a precondition for the display showing anything, so it is part of the minimum viable kiosk.

**Independent Test**: Reboot the provisioned device with no human present and confirm it auto-joins the main trusted WLAN (not the IoT network) and the dashboard loads; confirm the device does not auto-join the IoT network even when it is in range.

**Acceptance Scenarios**:

1. **Given** the device has been provisioned, **When** it boots headless with no user logged in, **Then** it automatically joins the main trusted WLAN using a system-level stored secret (no interactive login or per-user keyring needed) and the dashboard loads successfully.
2. **Given** both the main trusted WLAN and the isolated IoT network are in range, **When** the device chooses a network, **Then** it joins the main trusted WLAN and never auto-joins the IoT network.
3. **Given** the kiosk has been connected and idle, **When** WiFi power-saving behavior would otherwise drop the connection, **Then** the connection remains stable (power-saving is disabled) and the dashboard keeps loading.
4. **Given** a brief WiFi signal interruption, **When** the signal returns, **Then** the device reconnects on its own without human intervention.

---

### User Story 4 - Recover by reverting to a normal desktop (Priority: P2)

When an operator needs to debug the device or temporarily take it out of kiosk mode, they run a single documented rollback step that returns the device to a normal interactive desktop, and can later restore kiosk mode.

**Why this priority**: Locking a device into an unattended kiosk with no documented escape hatch makes debugging and recovery painful. A rollback path is important for operability but the kiosk is already valuable without it, so it is P2.

**Independent Test**: On a provisioned kiosk, run the documented rollback step, reboot, and confirm the device comes up as a normal interactive desktop; then re-provision and confirm kiosk mode returns.

**Acceptance Scenarios**:

1. **Given** a device running in kiosk mode, **When** the operator runs the documented rollback step and reboots, **Then** the device boots to a normal interactive desktop instead of the kiosk.
2. **Given** a device that has been rolled back to the desktop, **When** the operator re-runs the documented provisioning, **Then** the device returns to kiosk mode.
3. **Given** the rollback and provisioning steps, **When** an operator reads the repository documentation, **Then** both paths are documented clearly enough to follow without prior knowledge of the device's hand-built history.

---

### Edge Cases

- **Dashboard temporarily unreachable at boot** (network not yet up, or the dashboard service is down): the kiosk MUST keep attempting to display the dashboard and recover to it once it becomes reachable, rather than leaving a permanent error/blank state needing a human.
- **Wrong rendered size**: the previous stack rendered the dashboard too small; provisioning MUST result in the dashboard rendering at the panel's native 2160×1440 so the large/legible wall layout is used.
- **Credential/keyring prompt on cold boot**: a headless boot MUST NOT surface an interactive keyring or password dialog that blocks the screen.
- **IoT network in range**: the device MUST NOT auto-join the isolated IoT network even when its signal is strong.
- **Re-running provisioning on an already-provisioned device**: re-running the documented provisioning MUST converge to the same working kiosk state rather than breaking it.
- **Drift from "works on my device"**: the captured runtime MUST be pinned/documented enough that a rebuild reproduces the same behavior, so a future rebuild does not silently diverge.

## Requirements *(mandatory)*

### Functional Requirements

#### Reproducible provisioning

- **FR-001**: The kiosk runtime MUST be fully captured as version-controlled artifacts and documentation in this repository, such that no required configuration exists only on the physical device.
- **FR-002**: The repository MUST provide a single documented command to provision a fresh, freshly-installed target device into the kiosk runtime.
- **FR-003**: Provisioning MUST require only the single documented command plus its documented inputs (e.g. the WiFi secret); it MUST NOT require undocumented manual steps.
- **FR-004**: Provisioning MUST be idempotent: re-running it on an already-provisioned device MUST converge to the same working kiosk state rather than corrupting it.
- **FR-005**: All components of the runtime that affect behavior MUST be pinned or documented to a degree that a rebuild from the same repository revision yields the same kiosk behavior. NOTE: `google-chrome-stable` is pinned at **channel** granularity (Google's apt repo serves only the latest stable build); the validated build is recorded in research.md §D2 and in-browser auto-update is suppressed, so channel-level pinning is the accepted reproducibility granularity for the browser.
- **FR-006**: The repository MUST document the target device/OS assumptions the provisioning relies on (so an operator knows what a valid target looks like).

#### Unattended boot and display

- **FR-007**: After provisioning, the device MUST boot unattended with no human login and require no interactive input to reach the running kiosk.
- **FR-008**: On boot, the device MUST display the dashboard web app full-screen with no surrounding desktop, window chrome, browser UI, or other on-screen elements visible.
- **FR-009**: The dashboard MUST be rendered at the panel's native resolution (2160×1440) so the large/legible wall layout is used.
- **FR-010**: A cold (power-off) boot MUST NOT leave any interactive keyring, password, or credential prompt on screen that blocks the dashboard.
- **FR-011**: The displayed dashboard MUST render correctly with respect to time, showing clock/time values in the Eastern (America/New_York) timezone as the rest of the product does.

#### Self-healing

- **FR-012**: If the browser process terminates unexpectedly, the system MUST relaunch it automatically and return to the full-screen dashboard without human interaction.
- **FR-013**: If the whole display session fails, the system MUST restart it automatically and return to the full-screen dashboard without human interaction.
- **FR-014**: While the dashboard is temporarily unreachable, the kiosk MUST continue attempting to display it and recover to it automatically once it becomes reachable, rather than settling into a state that needs a human.

#### Networking

- **FR-015**: The device MUST automatically join the household's MAIN trusted WLAN on a headless boot, using a secret stored at the system level (not tied to an interactive user login or per-user keyring).
- **FR-016**: The device MUST NOT auto-join the isolated IoT network under any circumstances, even when it is in range.
- **FR-017**: WiFi power-saving MUST be disabled so the connection does not intermittently drop while the display is idle.
- **FR-018**: After a brief signal loss or a reboot, the device MUST reconnect to the main trusted WLAN on its own without human intervention.
- **FR-019**: The provisioning MUST give the main trusted WLAN connection precedence so the device prefers it over any other known network.

#### Rollback / recovery

- **FR-020**: The repository MUST provide a documented rollback path that returns a kiosk device to a normal interactive desktop for debugging/recovery.
- **FR-021**: After a rollback, re-running the documented provisioning MUST restore the kiosk runtime.

### Key Entities *(include if feature involves data)*

- **Kiosk device**: The single wall-mounted display in the kitchen (a Surface Pro 3, native panel 2160×1440). The one target this feature provisions.
- **Kiosk runtime**: The set of repo-captured artifacts and configuration that, applied to a target device, produce unattended full-screen dashboard behavior — encompassing boot/auto-launch, the full-screen browser session, self-healing supervision, and network membership.
- **Main trusted WLAN**: The household's primary/trusted wireless network the kiosk must join to reach the dashboard.
- **Isolated IoT network**: A separate, isolated wireless network the kiosk must never auto-join.
- **WiFi secret**: The credential for the main trusted WLAN, supplied as a documented provisioning input and stored at the system level on the device.
- **Provisioning command**: The single documented entry point that applies the kiosk runtime to a fresh device.
- **Rollback step**: The single documented action that returns a kiosk device to a normal interactive desktop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can take a fresh target device and reach a working unattended kiosk using only the repository's documented one-command provisioning plus its documented inputs — with zero steps that exist only on the old device or in someone's memory.
- **SC-002**: After a cold (power-off) boot with no human present, the device reaches the full-screen dashboard at 2160×1440 with no login, desktop, or blocking dialog visible.
- **SC-003**: After a simulated browser crash and, separately, a simulated session failure, the full-screen dashboard returns automatically within a short bounded time — target ~2 s (launcher `sleep 2` relaunch and unit `RestartSec=2`), well under a minute — with no human interaction, in 100% of trials.
- **SC-004**: On a headless boot, the device joins the main trusted WLAN and loads the dashboard successfully, and never auto-joins the isolated IoT network — verified across repeated reboots.
- **SC-005**: WiFi power-saving is disabled so the connection does not drop while idle and the dashboard remains loaded. Verified primarily by asserting the disabled power-save setting (`802-11-wireless.powersave=2`); a continuous multi-hour idle soak is an optional confirming observation, not a required CI/acceptance gate.
- **SC-006**: An operator can run the documented rollback to return the device to a normal desktop and then re-provision back to kiosk mode, following only the repository documentation.
- **SC-007**: Reproducibility is demonstrated by determinism rather than a two-physical-device test (fleet is out of scope): the runtime is pinned/documented (see FR-005) and an idempotent re-provision of the same repository revision converges to identical kiosk state (resolution, auto-launch, network membership). Re-validating on a VM/spare from the same revision is an optional confirming check.

## Assumptions

- The working runtime already exists on the current device and was validated by a cold-boot reboot test (full 2160×1440 layout, no keyring dialog, on the main VLAN, dashboard returning a healthy response, clock in Eastern). This feature codifies that validated state into the repo; it is not inventing new runtime behavior.
- The target hardware is a single Surface Pro 3 wall kiosk with a native 2160×1440 panel; multi-device fleet provisioning is out of scope (see Out of Scope).
- The dashboard web app is served and reachable on the main trusted WLAN; this feature consumes the existing dashboard and does not change it.
- The main trusted WLAN and the isolated IoT network already exist as distinct wireless networks; this feature configures which one the kiosk joins, not the networks themselves.
- The WiFi secret is provided to the operator as a provisioning input; storing/handling it securely at the system level is in scope, but managing the household's network infrastructure is not.
- An operator performing provisioning or rollback has the necessary administrative access to the target device.

## Out of Scope

- Changes to the dashboard web app itself, including its CSS/layout/legibility — that is the separate feature 004-kiosk-legibility.
- Auditing or changing network firewall rules — the observed IoT-VLAN-to-LAN reachability gap is a separate operational follow-up, not part of this feature.
- Multi-device or fleet kiosk management — this feature targets the single kitchen kiosk only.
- Provisioning or managing the wireless network infrastructure (access points, VLANs) beyond selecting which existing network the kiosk joins.
