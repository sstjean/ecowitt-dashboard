# Feature Specification: Sensor Battery & Signal Health (007)

**Feature Branch**: `007-sensor-health`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Pull per-sensor battery level and RF signal strength from the Ecowitt gateway, store/serve them through the API, and display them in the web dashboard in two complementary surfaces: an at-a-glance signal+battery indicator on the existing dashboard cards (issue #36) and a dedicated in-dashboard Sensor Health page listing every sensor reporting to the gateway (issue #25). Both surfaces are one feature; the shared lower tiers (poller fetch, store, API envelope) are built once and feed both UIs. Live snapshot only — no history/trends in this slice."

## Source of Truth

> **GitHub Issues are the source of truth for this feature. This markdown is a
> derived implementation tool. If they ever disagree, the Issues win.**

- **Parent Feature**: [#25 — Sensor Battery & Signal Health Page (007)](https://github.com/sstjean/ecowitt-dashboard/issues/25)
- **Cards surface**: [#36 — Show per-sensor signal strength + battery on dashboard cards](https://github.com/sstjean/ecowitt-dashboard/issues/36)
- **US1–US4**: future User Story sub-issues to be created under #25 when implementation begins.

## Background — why this feature exists

During the 2026-06-28 storm investigation we confirmed the gateway's live
`get_livedata_info` payload (the only endpoint the poller currently consumes)
carries **no battery, signal, or sensor-health fields at all** — verified against
the full stored metric-key set. We have **zero** visibility into sensor power or
link state. A sensor can brown out or drop its radio link and the dashboard has no
way to show it; the readings simply go stale or wrong with no warning.

This feature is the **observability half** of the sensor-health story. It covers
*power/link* faults (battery low, sensor offline/unlinked) that a heuristic should
not have to infer. The companion Feature 008 (rain-gauge fault detection) covers
*measurement* faults that battery/signal cannot catch. Together they answer two
different questions: "is the sensor powered and linked?" (this feature) and "is the
sensor measuring correctly?" (008).

## Data source (verified feasible 2026-06-29)

The data is **NOT** in `/get_livedata_info`. It comes from a separate gateway
endpoint: `GET http://<gateway>/get_sensors_info?page=1` (and `?page=2`). This
requires an **additional fetch** per poll cycle.

Each entry looks like:

```json
{"img":"wh90","type":"48","name":"Temp & Humidity & Solar & Wind & Rain","version":"160","id":"12FAD","batt":"5","rssi":"-74","signal":"4","idst":"1"}
```

| Field | Meaning |
|-------|---------|
| `img` | Sensor model icon key (e.g. `wh90`, `wh31`, `wh25`) |
| `type` | Numeric sensor type (48 = WS90, 7 = wh31, 4 = wh25) |
| `name` | Human-readable description |
| `id` | Hex sensor id (the radio identity) |
| `batt` | Battery — **scale depends on sensor**: WS90 0–5 level; wh31 0/1 low flag; wired/console report none/0 |
| `rssi` | Signal strength in dBm (negative) |
| `signal` | Signal bars, 0–4 |
| `idst` | Registration / active state |

Live snapshot of the **active** sensors on our gateway (id `12FAD` etc.):

| Sensor | Backs which cards | id | signal | batt | rssi |
|--------|-------------------|----|--------|------|------|
| **WS90** (`wh90`, type 48) | Outdoor temp/humidity, Wind, Rain (piezo), Solar | `12FAD` | 4/4 | 5/5 | −74 dBm |
| `wh31` CH2 (type 7) | Extra temp/humidity channel | `A0` | 4/4 | 0 (flag) | −96 dBm |
| `wh25` (type 4) | Indoor temp/humidity + Pressure (wired to console) | — | — | — | — |

All other rows on the gateway have placeholder ids (`FFFFFFFF` / `FFFFFFFE`) =
not paired. The single **WS90 array (id `12FAD`)** is the radio source behind
several cards. The `wh25` is wired/console with no radio signal or battery.

## Battery & signal semantics (normalized projection)

Raw per-sensor encodings MUST NOT leak to the UI. The system normalizes each
sensor to a **health projection**:

- **Battery status** is one of `OK | Low | Unknown | N/A`:
  - 0–5 level sensors (e.g. WS90): map low levels to `Low`, healthy levels to `OK`.
  - 0/1 low-flag sensors (e.g. wh31): flag set ⇒ `Low`, clear ⇒ `OK`. The UI MUST
    NOT render this as "0% / empty battery."
  - Wired/console sensors (e.g. wh25) report no battery ⇒ `N/A`.
  - Sensor health currently unobtainable (extra fetch failed/stale) ⇒ `Unknown`.
- **Signal** is the 0–4 bar scale; `rssi` (dBm) is supplementary detail.

## Scope decisions already made

- **Live snapshot only** for this slice: expose current per-sensor battery/signal on
  the latest envelope and render current state. **NO** new history table and **NO**
  trend sparklines in this feature (history is a later enhancement).
- Timezone rule applies to any "last seen" timestamp: storage UTC, display
  America/New_York (Eastern).
- Both UI surfaces (cards + dedicated page) ship together as one feature on top of
  shared lower tiers (poller fetch, store, API envelope) built once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Poller fetches and serves per-sensor battery & signal (Priority: P1)

As the dashboard backend, I want each poll cycle to also fetch `get_sensors_info`,
normalize every registered sensor to a health projection (id, model, name, battery
status, signal bars, rssi, registration state, last seen), and expose the current set
through the API, so the upper UI tiers have a single trustworthy source for sensor
health.

**Why this priority**: This is the shared foundation. Both UI surfaces depend on it;
without it neither card indicators nor the health page can render real data.

**Independent Test**: Feed a captured `get_sensors_info` payload (both pages) through
the poller's normalization and confirm the API returns one health record per
registered sensor with correctly normalized battery status, signal bars, rssi, and
last-seen; confirm unpaired placeholder ids (`FFFFFFFF`/`FFFFFFFE`) are excluded.

**Acceptance Scenarios**:

1. **Given** a `get_sensors_info` response containing the WS90 (`12FAD`, batt 5,
   signal 4, rssi −74, idst 1), **When** the poller normalizes it, **Then** the API
   exposes a health record with battery status `OK`, signal 4 bars, rssi −74 dBm, and
   a last-seen timestamp.
2. **Given** a `get_sensors_info` response containing the wh31 CH2 (`A0`, batt 0/1
   low-flag, signal 4, rssi −96), **When** normalized, **Then** its battery is
   projected as `OK`/`Low` per the flag — never as "0% empty."
3. **Given** the wh25 wired/console sensor reporting no radio battery/signal, **When**
   normalized, **Then** its battery status is `N/A` and signal is omitted/`N/A`.
4. **Given** rows with placeholder ids (`FFFFFFFF` / `FFFFFFFE`), **When** normalized,
   **Then** they are excluded from the served set (not paired).
5. **Given** both `?page=1` and `?page=2` responses, **When** the poller fetches,
   **Then** sensors from both pages are merged into one set with no duplicates.

---

### User Story 2 - Dashboard cards show at-a-glance signal + battery (Priority: P2)

As a household member glancing at the kiosk, I want each dashboard card backed by a
physical sensor to show a small signal-strength indicator (bars) plus battery state —
like the Ecowitt phone app — so radio/battery health is visible right next to the
readings it affects.

**Why this priority**: High-value, at-a-glance health surfacing (issue #36) layered
on the US1 foundation. Valuable but secondary to the dedicated page that is the formal
007 deliverable.

**Independent Test**: Serve a latest envelope with the sensor health set and confirm
each sensor-backed card renders the correct bars + battery state for its mapped
sensor; confirm the WS90-backed cards (outdoor, wind, rain, solar) all reflect the
single WS90 radio, and the wired indoor/pressure card shows no radio indicator.

**Acceptance Scenarios**:

1. **Given** the latest envelope reports the WS90 at signal 4 / battery `OK`, **When**
   the outdoor, wind, rain, and solar cards render, **Then** each shows a 4-bar signal
   indicator and an `OK` battery state mapped from the single WS90 sensor.
2. **Given** a sensor's battery status is `Low`, **When** its card renders, **Then**
   the card shows a distinct low-battery cue (not a numeric "0%").
3. **Given** the indoor temp/humidity + pressure card backed by the wired wh25,
   **When** it renders, **Then** it shows no radio-signal indicator (and `N/A`
   battery), because that sensor has no radio link.
4. **Given** any "last seen" timestamp is displayed on a card, **When** it renders,
   **Then** it is shown in America/New_York (Eastern) time.

---

### User Story 3 - Dedicated Sensor Health page lists every sensor (Priority: P1)

As the household, I want a dedicated in-dashboard Sensor Health page/panel that lists
**every** sensor currently reporting to the gateway with its battery level and RF
signal, so I can spot a sensor running low or losing its link *before* it silently
stops producing good data.

**Why this priority**: This is the formal 007 deliverable (issue #25) — the single
place to audit the whole sensor fleet. It is the core observability surface this
feature exists to provide.

**Independent Test**: Serve the sensor health set and confirm the page lists each
registered sensor with name/model, battery status, signal bars + rssi, and last-seen,
with clear `Low` / `Lost-link` visual states and correct handling of `N/A` (wired) and
`Unknown` (stale) cases.

**Acceptance Scenarios**:

1. **Given** the served health set includes WS90, wh31 CH2, and wh25, **When** the
   Sensor Health page renders, **Then** it lists all three with their names, battery
   status, signal bars + rssi, and last-seen timestamps (Eastern).
2. **Given** a sensor's battery status is `Low`, **When** the page renders, **Then**
   that row shows a clear low-battery warning state distinct from `OK`.
3. **Given** a sensor's signal is 0 bars or it is no longer registered, **When** the
   page renders, **Then** that row shows a clear lost-link / offline state.
4. **Given** a wired/console sensor (wh25) with no radio, **When** the page renders,
   **Then** its battery shows `N/A` and signal shows `N/A` rather than a misleading
   empty/zero indicator.
5. **Given** the set of registered sensors changes (a sensor pairs or drops per
   `idst`), **When** the page re-renders on the next poll, **Then** it reflects the
   currently-registered set.

---

### User Story 4 - Honest degradation when get_sensors_info is unavailable (Priority: P1)

As the household, I want sensor readings to keep flowing and the health indicators to
show an honest "unknown / stale" state when the extra `get_sensors_info` fetch fails
or returns garbage, so a health-data outage never crashes the dashboard or blocks the
core readings.

**Why this priority**: Honest degradation is constitution-mandated (offline-first,
graceful degradation). The extra fetch is a new failure surface; it must never take
down the readings that already work.

**Independent Test**: Make `get_sensors_info` unreachable / return malformed data
while `get_livedata_info` still succeeds; confirm readings continue to be stored and
served, and the health indicators (cards + page) render an `Unknown`/stale state
rather than throwing or showing fabricated values.

**Acceptance Scenarios**:

1. **Given** `get_sensors_info` is unreachable but `get_livedata_info` succeeds,
   **When** the poll cycle runs, **Then** readings are still stored and served and no
   exception propagates.
2. **Given** `get_sensors_info` returns malformed/garbage data, **When** the poller
   parses it, **Then** the bad payload is rejected and the previously-known health (or
   an `Unknown` state) is served — never fabricated battery/signal values.
3. **Given** health data is unavailable/stale, **When** the cards and the Sensor
   Health page render, **Then** they show an explicit `Unknown` / stale state for the
   affected sensors instead of empty bars implying "no signal."
4. **Given** health data was previously available and then the fetch starts failing,
   **When** time passes beyond a staleness threshold, **Then** the displayed health is
   marked stale rather than presented as current.

---

### Edge Cases

- **Battery scale ambiguity**: A sensor whose `batt` is a 0/1 low flag must never be
  rendered as "0% / empty battery"; it maps to `OK`/`Low`. A wired sensor reporting
  `0`/none maps to `N/A`, not `Low`.
- **One sensor backs many cards**: The WS90 (id `12FAD`) is the radio source for
  outdoor, wind, rain, and solar cards; all four reflect the same single sensor's
  health — they must not imply four independent radios.
- **Wired/console sensors**: wh25 (indoor/pressure) has no radio link; its card and
  health row show `N/A` for signal and battery, not zero bars.
- **Two-page fetch**: `get_sensors_info` is paginated (`?page=1`, `?page=2`); both
  pages must be merged. A failure on one page must degrade honestly, not drop the
  other page silently in a way that fabricates state.
- **Sensors come and go**: Registration state (`idst`) changes as sensors pair/unpair;
  the health page reflects the currently-registered set and surfaces a dropped sensor
  as lost-link/offline.
- **Partial garbage**: Some entries valid, some malformed — valid entries are served;
  malformed ones are skipped (no whole-payload rejection if salvageable, no fabricated
  values for the bad ones).
- **rssi vs bars disagreement**: Display keys off the 0–4 bar `signal`; rssi is
  supplementary. A very negative rssi with nonzero bars is still presented per the bar
  scale.
- **Last-seen timezone**: Stored UTC, displayed America/New_York; never render a
  timestamp with an undefined/browser-default timezone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The poller MUST, on each normal poll cycle, additionally fetch
  `GET /get_sensors_info` for all pages (`?page=1` and `?page=2`) from the gateway,
  separately from the existing `get_livedata_info` fetch.
- **FR-002**: The system MUST merge both pages of `get_sensors_info` into a single
  set of sensors with no duplicate sensor ids.
- **FR-003**: The system MUST exclude unpaired/placeholder sensor entries (ids
  `FFFFFFFF` / `FFFFFFFE`) from the served health set.
- **FR-004**: The system MUST normalize each registered sensor to a health record
  containing: sensor id, model/icon key, human name, battery status, signal bars
  (0–4), rssi (dBm), registration state, and a last-seen timestamp (UTC).
- **FR-005**: The system MUST project battery to one of `OK | Low | Unknown | N/A`
  using sensor-type-aware rules: 0–5 level sensors map low levels to `Low`; 0/1
  low-flag sensors map the flag to `Low`/`OK`; wired/no-battery sensors map to `N/A`;
  currently-unobtainable health maps to `Unknown`. The system MUST NOT present a
  binary-flag or not-applicable battery as a numeric "0% / empty" value.
- **FR-006**: The API MUST expose the current per-sensor health set to the web client
  on the existing latest envelope (no separate polling cadence required by the web).
- **FR-007**: Each dashboard card backed by a physical sensor MUST display a signal
  indicator (0–4 bars) and battery state mapped from that card's backing sensor.
- **FR-008**: All cards backed by the single WS90 array (outdoor, wind, rain, solar)
  MUST reflect the same one WS90 sensor's health, not independent radios.
- **FR-009**: Cards backed by a wired/console sensor (e.g. wh25 indoor/pressure) MUST
  show no radio-signal indicator and an `N/A` battery state.
- **FR-010**: The web MUST provide a dedicated Sensor Health page/panel (route/nav
  entry) listing every currently-registered sensor with name/model, battery status,
  signal bars + rssi, and last-seen.
- **FR-011**: The Sensor Health page MUST render clear, visually-distinct states for
  `OK`, `Low` battery, lost-link/offline (0 bars or unregistered), `N/A` (wired), and
  `Unknown`/stale.
- **FR-012**: When `get_sensors_info` is unreachable or returns malformed data, the
  system MUST continue to store and serve `get_livedata_info` readings without error,
  and MUST surface affected sensors as `Unknown`/stale rather than fabricating values.
- **FR-013**: When previously-available health data goes stale beyond a staleness
  threshold, the displayed health MUST be marked stale rather than presented as
  current.
- **FR-014**: Any displayed "last seen" timestamp MUST be rendered in America/New_York
  (Eastern) time; stored timestamps remain UTC.
- **FR-015**: The Sensor Health page MUST reflect the currently-registered set of
  sensors (per `idst`) as sensors pair or drop across poll cycles.
- **FR-016**: This slice MUST NOT introduce a sensor-health history table or trend
  sparklines; only the current live snapshot is stored/served and rendered.
- **FR-017**: Health indicators (cards and page) MUST be legible at kiosk distance per
  Feature 004 legibility conventions.

### Key Entities *(include if feature involves data)*

- **Sensor health record**: The normalized per-sensor projection served to the UI —
  sensor id (hex), model/icon key (`img`), numeric type, human name, battery status
  (`OK|Low|Unknown|N/A`), raw battery (for derivation/debug), signal bars (0–4), rssi
  (dBm), registration state (`idst`), and last-seen timestamp (UTC).
- **Sensor → card mapping**: The association of each physical sensor to the dashboard
  cards it backs — e.g. WS90 (`12FAD`) → outdoor temp/humidity, wind, rain, solar;
  wh31 CH2 (`A0`) → extra temp/humidity; wh25 (wired) → indoor temp/humidity +
  pressure (no radio).
- **Latest envelope (health extension)**: The current per-sensor health set attached
  to the existing latest API response, plus a freshness/staleness marker so the web
  can render `Unknown`/stale honestly.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given a captured `get_sensors_info` payload (both pages), the API serves
  exactly one normalized health record per registered sensor, with placeholder/unpaired
  entries excluded.
- **SC-002**: A household member can look at any sensor-backed card and tell, at a
  glance, that sensor's signal strength and whether its battery is OK or low — without
  opening another screen.
- **SC-003**: A household member can open the Sensor Health page and see every
  reporting sensor's battery and signal in one place, and identify a low or
  lost-link sensor without additional explanation.
- **SC-004**: A sensor reporting a 0/1 low-battery flag or no battery is never shown
  as "0% / empty"; it is shown as `OK`/`Low`/`N/A` as appropriate.
- **SC-005**: When `get_sensors_info` is made unreachable or returns garbage, the
  core readings continue to be stored and served with zero errors, and the health
  indicators show `Unknown`/stale rather than fabricated or empty-bar values.
- **SC-006**: The current per-sensor health reaches the web client through the
  existing latest envelope with no additional web-initiated API call.
- **SC-007**: All displayed "last seen" timestamps render in America/New_York time.

## Assumptions

- The gateway endpoint `GET /get_sensors_info?page=1|2` is reachable from the prod
  poller host over the existing main→IoT VLAN pinhole (the gateway ignores ICMP; reach
  it with `curl`, never `ping`).
- The existing poll cadence is acceptable for the extra `get_sensors_info` fetch; no
  separate, faster cadence is required for this slice.
- The existing latest-envelope plumbing can carry the per-sensor health set without a
  new endpoint, consistent with how Feature 008 attaches state to `latest`.
- Battery thresholds (what level counts as `Low` on a 0–5 sensor) and the staleness
  threshold (how long before health is marked stale) are reasonable defaults to be
  fixed during /speckit.plan against the live snapshot; they do not change scope.
- Feature 004 legibility conventions and the project's Eastern-time display rule apply
  to the new indicators without redefinition here.
- History/trends of battery and signal are explicitly deferred to a later feature.
