# Feature Specification: Kiosk Self-Heal on Deploy

**Feature Branch**: `012-kiosk-self-heal`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "Kiosk self-heal on deploy — the wall kiosk must automatically pick up new server code without a manual restart, and recover from transient outages instead of stranding on an error page."

## User Scenarios & Testing *(mandatory)*

The wall-mounted kiosk (a fixed display running the dashboard in full-screen mode) is expected to stay current and available without anyone physically touching it. Today it does not: after a new version of the dashboard is deployed, the screen keeps showing the previous version until someone logs into the device and restarts it by hand (which requires a password at the machine). Separately, a brief server interruption during a deploy can leave the screen stuck on a browser "site can't be reached" error until a human intervenes. These user stories close both gaps.

### User Story 1 - New deploy reaches the screen automatically (Priority: P1)

As the operator of the wall kiosk, when I deploy a new version of the dashboard, I want the kiosk screen to switch to the new version on its own, within a short and predictable window, so that I never have to walk to the device and manually restart it.

**Why this priority**: This is the core pain. Every code change we ship is currently invisible on the wall display until a manual, password-gated restart. Automating this removes the single most repeated piece of manual toil and is the minimum viable slice — it delivers standalone value even if the other stories are never built.

**Independent Test**: Deploy a build carrying a distinct version identifier while the kiosk is displaying an older build. Without any manual interaction, confirm the screen refreshes itself to the new build within one polling interval. Then confirm that when the deployed version identifier is unchanged, the screen does NOT refresh (no reload churn).

**Acceptance Scenarios**:

1. **Given** the kiosk is displaying build A, **When** build B (a different version identifier) is deployed and served, **Then** the kiosk automatically reloads once and begins displaying build B within one polling interval, with no human action.
2. **Given** the kiosk is displaying build A, **When** the served version identifier is still build A on the next check, **Then** the kiosk does NOT reload.
3. **Given** the kiosk has just reloaded to build B, **When** subsequent checks report build B, **Then** the kiosk does NOT reload again (it settles and does not loop).
4. **Given** the kiosk is displaying build A, **When** a version check fails to complete (temporary error, no answer), **Then** the kiosk does NOT reload and simply tries again on the next interval.

---

### User Story 2 - Kiosk recovers on its own after a transient outage (Priority: P2)

As the operator of the wall kiosk, when the dashboard server briefly becomes unavailable during a deploy or a momentary network blip, I want the kiosk to keep trying and recover its live data automatically once the server returns, so that a one-second interruption does not leave a dead screen requiring a manual kick.

**Why this priority**: A deploy recreates the serving container and drops the connection for roughly a second. During that window data requests fail; today the display can strand and never recover on its own. Making the data refresh loop retry indefinitely turns a multi-minute manual recovery into a self-healing blip. It is second priority because it mitigates a shorter, less frequent failure than US1, and US1 alone already delivers value.

**Independent Test**: While the kiosk is displaying live data, take the server offline briefly, then bring it back. Confirm the data cards recover automatically once the server returns, without any manual interaction, and that a subtle "reconnecting" indication (if shown) clears once data flows again.

**Acceptance Scenarios**:

1. **Given** the kiosk is displaying live data, **When** the server becomes briefly unavailable and data requests fail, **Then** the kiosk keeps retrying and does not give up.
2. **Given** the kiosk failed one or more data requests during an outage, **When** the server becomes reachable again, **Then** the data cards refresh with current values automatically, with no human action.
3. **Given** the kiosk is in a failed-request state, **When** the outage persists, **Then** the display shows a subtle "reconnecting" affordance rather than a blank or error state, and continues retrying.
4. **Given** the kiosk recovered from an outage, **When** data is flowing again, **Then** any "reconnecting" affordance is cleared.

---

### User Story 3 - Kiosk waits for the dashboard before showing anything at boot (Priority: P3)

As the operator of the wall kiosk, when the device powers on (or its display process restarts) while the dashboard server is not yet reachable, I want the kiosk to wait for the dashboard to become reachable before presenting it, so that the screen shows a "waiting/retry" state rather than a dead browser error page that cannot recover on its own.

**Why this priority**: This is the one failure the in-page auto-recovery (US1/US2) cannot fix — if the page never successfully loaded, there is no running page logic to retry. It is lowest priority because it only occurs at cold boot or display-process restart while the server is down (a rare ordering), and it lives in the device launcher rather than the dashboard itself.

**Independent Test**: With the dashboard server unreachable, start (or restart) the kiosk display process. Confirm it does not immediately present a dead error page; it waits and only presents the dashboard once the server becomes reachable. Then start the display process while the server is already reachable and confirm it presents the dashboard promptly.

**Acceptance Scenarios**:

1. **Given** the dashboard server is unreachable, **When** the kiosk display process starts, **Then** it waits (does not present a dead error page) until the dashboard becomes reachable.
2. **Given** the kiosk display process is waiting for the server, **When** the dashboard becomes reachable, **Then** it presents the dashboard.
3. **Given** the dashboard server is already reachable, **When** the kiosk display process starts, **Then** it presents the dashboard promptly without an unnecessary long delay.

---

### Edge Cases

- **Version check fails during an outage**: A failed or unanswered version check MUST be treated as "unknown", never as "changed". The kiosk MUST NOT reload on a failed check — only on a check that confirms a genuinely different identifier — to avoid reload storms while the server is flapping.
- **Rapid successive deploys**: If two deploys happen close together, the kiosk reloads to whichever version identifier is being served at its next check; it does not need to visit every intermediate build, only converge on the currently served one.
- **Reload does not loop**: After reloading, the running build's identifier matches the served identifier, so the next check finds no difference and no further reload occurs.
- **Cached version marker**: The served version marker MUST be fetched in a way that never returns a stale cached copy, otherwise the kiosk could miss a new deploy.
- **Long outage**: The data refresh loop retries indefinitely; there is no maximum retry count after which it gives up.
- **Server reachable but returning errors at boot (US3)**: The launcher's reachability check should treat a healthy response as "ready"; a persistent unhealthy response keeps it waiting rather than presenting a broken page.

## Requirements *(mandatory)*

### Functional Requirements

#### Build version identity (US1)

- **FR-001**: Each deployed build of the dashboard MUST carry a single, unique version identifier that is stable within a build and different across builds. Two identical builds MUST produce the same identifier; any new build MUST produce a different one.
- **FR-002**: The running dashboard MUST know its own build's version identifier (the identifier it was built with) without any network request.
- **FR-003**: The deployed dashboard MUST expose the currently served build's version identifier at a well-known location that the running dashboard can retrieve at runtime.
- **FR-004**: The running identifier (FR-002) and the served identifier (FR-003) MUST originate from the same single source per build, so that a freshly loaded dashboard always finds its running identifier equal to the served identifier.

#### Auto-reload on new deploy (US1)

- **FR-005**: The dashboard MUST periodically retrieve the served version identifier on a predictable interval.
- **FR-006**: The dashboard MUST retrieve the served version identifier in a manner that never yields a stale cached value.
- **FR-007**: When the retrieved served identifier differs from the running identifier, the dashboard MUST reload itself exactly once to load the newly deployed build.
- **FR-008**: When the retrieved served identifier equals the running identifier, the dashboard MUST NOT reload.
- **FR-009**: When retrieval of the served identifier fails or returns no usable value, the dashboard MUST NOT reload and MUST retry on the next interval.
- **FR-010**: After an auto-reload, the dashboard MUST NOT enter a repeated reload loop (the newly running build's identifier now matches the served identifier).

#### Never-give-up reconnect (US2)

- **FR-011**: The live-data refresh loop MUST continue retrying indefinitely after a failed data request; it MUST NOT stop retrying after any fixed number of failures.
- **FR-012**: When the server becomes reachable again after one or more failed data requests, the dashboard MUST resume displaying current data automatically, without human interaction.
- **FR-013**: While data requests are failing, the dashboard MAY present a subtle "reconnecting" affordance; if presented, it MUST be cleared automatically once data flows again.
- **FR-014**: A failed data request MUST NOT clear, blank, or corrupt the last-known values already on screen beyond any intentional "reconnecting" affordance.

#### Boot / hard-error resilience in the device launcher (US3)

- **FR-015**: The kiosk display launcher MUST verify the dashboard is reachable before presenting it, so that a server-down-at-boot condition results in a waiting/retry state rather than a dead browser error page.
- **FR-016**: When the dashboard is not yet reachable, the launcher MUST keep waiting and re-checking until it becomes reachable, then present it.
- **FR-017**: When the dashboard is already reachable at launch, the launcher MUST present it promptly without imposing an unnecessary long delay.

#### Cross-cutting constraints

- **FR-018**: This feature MUST NOT change the existing live-data contract, existing dashboard panels, or the values they display.
- **FR-019**: This feature MUST NOT introduce any user-visible timestamps or alter existing time-of-day/timezone presentation.
- **FR-020**: The primary auto-reload and reconnect behaviour (US1, US2) MUST be achievable within the dashboard web layer alone (serving the version marker alongside the existing dashboard assets), without changes to the data ingestion or data-serving layers. The device launcher hardening (US3) is confined to the kiosk device configuration.

### Key Entities *(include if feature involves data)*

- **Build Version Identifier**: A short token that uniquely and deterministically identifies one build of the dashboard (e.g., a content hash or build timestamp). Baked into the running build and also published at a runtime-retrievable location. Equal within a build; different across builds.
- **Served Version Marker**: The runtime-retrievable publication of the currently deployed build's version identifier, fetched with no-caching semantics so it always reflects what is actually deployed.
- **Reconnect State**: The transient condition of the dashboard while live-data requests are failing, driving an optional subtle "reconnecting" affordance and continuous retry until data resumes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a new build is deployed, the wall kiosk begins displaying it automatically within one polling interval, with zero manual interaction at the device (no manual restart step required for any routine deploy).
- **SC-002**: When the served version identifier is unchanged, the kiosk performs zero reloads over an extended observation window (no reload churn).
- **SC-003**: A transient server outage of a few seconds during a deploy results in automatic recovery of live data with zero manual interaction, and the screen never remains stuck on a browser error page.
- **SC-004**: During a sustained outage, the kiosk issues repeated retry attempts continuously (never stops trying) and recovers within one polling interval of the server returning.
- **SC-005**: When the device display process starts while the server is unreachable, it never presents a dead error page; it presents the dashboard within one reachability-check interval of the server becoming available.
- **SC-006**: The number of manual kiosk restarts required per deploy drops to zero for routine deploys (measured across subsequent deploys).

## Assumptions

- The wall kiosk keeps its display process (and therefore the running dashboard) alive across a deploy in the common case; in-page auto-reload (US1) and reconnect (US2) rely on page logic still running. The only case where page logic is not running is a cold boot / display-process restart, which US3 covers.
- A single polling cadence already exists in the dashboard for live data; the version check can piggyback on that cadence or run on a similar predictable interval. An exact interval is not mandated by this spec — "within one polling interval" is the yardstick.
- "Reachable" for the launcher means the dashboard responds successfully to a simple request; a persistent unhealthy response is treated as not-yet-ready.
- Deploys produce a new build image with a new version identifier; a redeploy of the identical build produces the same identifier and correctly triggers no reload.
- The dashboard is served on the local network to a fixed display; there is no authenticated multi-user flow to preserve across an auto-reload.
- The device launcher (US3) is implemented in the existing kiosk device configuration and is validated with the existing device-level test approach; US1 and US2 are validated in the dashboard web layer with strict test-first development and full coverage, including an end-to-end check that a changed served identifier triggers exactly one reload and an unchanged identifier triggers none.
