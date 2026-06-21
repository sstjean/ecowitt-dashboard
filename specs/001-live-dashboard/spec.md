# Feature Specification: Live Weather Dashboard

**Feature Branch**: `001-live-dashboard`

**Created**: 2026-06-20

**Last updated**: 2026-06-21

**Status**: Draft

**Input**: User description: "Create the feature specification for the application's primary live weather dashboard — the foundational MVP of the whole app, delivered as ONE end-to-end vertical slice that spans every tier: pull live readings from the Ecowitt GW2000B gateway over the LAN, validate and store them, serve them through the application's versioned API, and display them in a single glanceable 'now' screen. The UI is modeled on the user's existing Ambient Weather console layout — a single, at-a-glance 'now' screen designed for an always-on kitchen kiosk (a 2014-era Surface Pro 3) and for household iPhone 16 Pro Max phones and a 13" iPad Air M2 over the LAN. This feature covers the live 'now' path only — historical charting/trends and MQTT fan-out to Home Assistant are separate future features. The view presents the most recent readings ingested from the gateway as a set of purpose-built gauges and panels."

## Overview

The Live Weather Dashboard is the application's foundational MVP, delivered as a
**single end-to-end vertical slice** spanning every tier of the system. It is the
embodiment of the project's guiding principle: *we build user-facing features, not
tiers.* The dashboard is only useful if it shows live data, and the data pipeline
is only useful if it reaches the screen — so the entire path ships together as one
feature:

> **pull** live readings from the Ecowitt GW2000B gateway → **validate & store**
> them → **serve** them through the application's versioned API → **display** them
> in the dashboard UI.

The user-facing result is the application's primary, default screen: a single,
glanceable "now" view of current household weather conditions, modeled on the
owner's existing Ambient Weather console layout. It is designed to run always-on
on a kitchen kiosk (a 2014-era Surface Pro 3) and to be opened on household
iPhone 16 Pro Max phones and a 13" iPad Air M2 over the LAN.

The screen is a **two-column, glanceable layout**: the **left column** carries
the large primary outdoor gauges (outdoor temperature ring, a Feels Like ring,
and a wind compass) above a Solar & Sky panel; the **right column** carries the
smaller indoor companion rings (temperature + humidity) above a Rainfall panel
and a Barometer panel. Outdoor conditions are the headline; everything else is
supporting context.

This feature delivers the **ingestion poller, the historical store, the versioned
API, and the live presentation layer** as one MVP. It serves and displays the live
"now" snapshot only; while it persists readings to its own store, **charting that
history over time** and **fanning readings out to Home Assistant over MQTT** are
explicitly deferred to separate future features (see Out of Scope).

## Design Artifacts *(authoritative visual / UX source of truth)*

The pixel-level layout, hierarchy, color, typography, component, and data-state
detail for this feature lives in the design artifacts below. This specification
describes **what** the view must do and **why**; the artifacts define **how** it
looks. Where this spec and the artifacts both describe a behavior, the artifacts
are the binding visual reference and MUST NOT be duplicated here.

- [`design/design-language.md`](design/design-language.md) — the living, authoritative
  design language (layout system, type scale, the temperature→color scale, data
  states, accessibility rules). When the prototype and this document disagree, the
  design language wins.
- [`design/prototype.html`](design/prototype.html) — the working, locked-in reference
  implementation of the design language.
- [`design/AmbientWeatherDashboard.png`](design/AmbientWeatherDashboard.png) — the
  owner's existing Ambient Weather console, the visual model this view is built to
  echo.

Requirements in this spec that touch visual encoding (e.g., the temperature color
scale, the rainfall droplet, data-state dimming) cite the relevant design-language
section so the two stay traceable without copying detail.

## Clarifications

### Session 2026-06-21

- Q: Default cadences for the client UI refresh and the ingestion poll? → A:
  Ingestion poll defaults to 30 s (configurable, 30–60 s range); the client UI
  refresh defaults to 10 s. The two are distinct loops and are not conflated.
- Q: When does a panel become Stale? → A: When the latest reading's observation
  time is older than three times (3×) the ingestion poll cadence.
- Q: How is the sky-condition icon derived (so US6 is objectively testable)? → A:
  **(superseded — see Session 2026-06-21 (b))** Originally deterministic ordered
  rules from the local reading (Night → Rainy → Clear → Cloudy on solar ≥ 500 W/m²).
  Replaced because local sensors cannot faithfully classify sky condition.
- Q: Source of day high/low temperature, 10-minute average wind, and max daily
  gust? → A: **(superseded — see Session 2026-06-21 (c))** Originally assumed the
  gateway supplied all of these as daily-aggregate fields taken as-is. Device-
  verified capture showed the gateway supplies only the max daily gust **speed**;
  day high/low, the 10-minute average wind, and the max-gust **direction** are
  **derived from the application's own stored history**.
- Q: What does the barometer show before 3 hours of history exist? → A: An explicit
  "trend unavailable" state (neutral, no arrow, no delta), never a fabricated steady
  or zero-delta trend.

### Session 2026-06-21 (b)

- Q: Where does the sky-condition icon come from? → A: From the **NWS
  current-conditions API** for the household location (the local sensors can't
  faithfully classify sky condition). The API service fetches + caches the latest
  NWS observation and maps it to the icon vocabulary. "Offline-first" is not
  "offline-only": when NWS is unreachable or its last good fetch is stale, the icon
  greys out (stale) over the last-known value; it never blocks the core slice and is
  never fabricated. This supersedes the earlier deterministic-local-rule answer and
  required a constitution amendment (v2.1.0, Optional External Enrichment).

### Session 2026-06-21 (c) — device-verified gateway payload

> The household GW2000B was queried directly (`GET /get_livedata_info`, HTTP 200)
> during an active rainstorm. The **live device payload is the Source of Truth**;
> vendor documentation is a proxy and is not canonical. Findings below correct
> earlier assumptions encoded in the spec.

- Q: Where does rainfall data come from? → A: From the **WS90 haptic gauge
  (`piezoRain`)**, not the legacy tipping-bucket (`rain`). In the live capture every
  tipping-bucket total read `0.00 in` *during real rain* while `piezoRain` reported
  the true accumulation. The panel is still **labelled "Rain"** in the UI; only the
  data source changes. (This dead-tipping-bucket failure is the reason the project
  exists.) Supersedes any implication that rain comes from the `rain` category.
- Q: Where does barometric pressure come from? → A: From the **`wh25`** category
  (`abs`/`rel`, in inHg → hPa), not `common_list`.
- Q: Source of day high/low temperature, 10-minute average wind, and max-gust
  direction? → A: **Derived from the application's own stored history** (the gateway
  does not report them): day high/low = max/min outdoor temp since local midnight;
  10-minute average wind = rolling mean of polled wind speed; max-gust direction =
  wind direction recorded at the largest gust observed since local midnight. Only
  the max daily gust **speed** (`common_list 0x19`) is taken from the gateway as-is.
  Supersedes Session 2026-06-21 item "Taken from the gateway's daily-aggregate
  fields as-is".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable outdoor "now" at a glance (Priority: P1)

A household member walks past the always-on kitchen kiosk and, without touching
it, instantly reads the current outdoor temperature, the day's high and low, and
how it feels outside, alongside the current date and time. The screen stays
current on its own as new readings arrive.

**Why this priority**: This is the core reason the screen exists and the minimum
viable product. The large outdoor temperature ring, the Feels Like ring, plus a
live, correctly-zoned header clock deliver standalone value even if every other
panel were absent.

**Independent Test**: Load the dashboard with a known set of current readings and
confirm the outdoor temperature ring shows the current value as the centerpiece,
the day's high (↑) and low (↓); confirm a Feels Like ring sits between the
outdoor temperature ring and the wind compass; confirm the Feels Like, Dewpoint,
and Outdoor Humidity supporting readouts appear; confirm the header shows the
current date (with ordinal suffix) and time in US Eastern; then deliver a new
reading and confirm the view updates without a manual refresh.

**Acceptance Scenarios**:

1. **Given** the latest reading reports an outdoor temperature of 72°F with a day
   high of 81°F and a day low of 58°F, **When** the dashboard loads, **Then** the
   outdoor ring shows 72°F as the centerpiece with 81°F marked as the high (↑) and
   58°F marked as the low (↓).
2. **Given** the latest reading includes Feels Like, Dewpoint, and Outdoor
   Humidity values, **When** the dashboard loads, **Then** a Feels Like ring
   renders between the temperature ring and the wind compass, and the Feels Like,
   Dewpoint, and Outdoor Humidity readouts appear with their °F / % units.
3. **Given** the current Eastern date/time is Tuesday, June 19th, 2026 at 2:05 PM,
   **When** the dashboard renders the header, **Then** the date appears centered
   as "Tuesday, June 19th, 2026" (with an ordinal suffix) and the time appears
   right-aligned, both rendered in `America/New_York` regardless of the device's
   locale, with no timezone label.
4. **Given** the dashboard is displayed, **When** a newer reading becomes
   available, **Then** the outdoor ring, Feels Like ring, and header update to the
   new values without any user interaction.
5. **Given** the outdoor temperature changes from a cold value to a hot value
   across refreshes, **When** the ring re-renders, **Then** the ring color shifts
   smoothly along the visible-spectrum scale — violet (coldest) → blue → cyan →
   green → yellow → orange → red (hottest) — per the design-language temperature
   scale ([`design/design-language.md` §5.3](design/design-language.md)).
6. **Given** a Feels Like value of 105°F on a summer afternoon, **When** the Feels
   Like ring renders, **Then** its color maps to a clear hot red on the
   visible-spectrum scale (not a near-black or saturated-out color), because the
   scale extends to 120°F.

---

### User Story 2 - Read the wind at a glance (Priority: P2)

A household member checks current wind conditions before going outside: how hard
the wind is blowing, from which direction, how strong the gusts are, and the
recent trend.

**Why this priority**: Wind is a primary "should I go out / secure things"
signal and a prominent panel on the reference console, but the screen is still
useful without it (P1 covers the headline conditions).

**Independent Test**: Provide a reading with wind speed, direction (degrees),
gust, 10-minute average, and max daily gust, and confirm the compass gauge shows
the current speed in mph, the cardinal direction plus bearing in degrees, the
current gust, the 10-minute average, and the max daily gust (direction + speed).

**Acceptance Scenarios**:

1. **Given** a reading with wind from 45° at 8 mph gusting 14 mph, **When** the
   wind panel renders, **Then** it shows 8 mph, the cardinal direction "NE" with
   the bearing "45°", and a current gust of 14 mph.
2. **Given** a reading with a 10-minute average wind of 6 mph, **When** the wind
   panel renders, **Then** it displays the 10-Minute Average as 6 mph.
3. **Given** the day's max gust was 22 mph from the west, **When** the wind panel
   renders, **Then** it displays a Max Daily Gust of 22 mph from "W".
4. **Given** the wind direction is due north, **When** the compass renders,
   **Then** the direction indicator points to N (0°/360°).

---

### User Story 3 - See today's rainfall and accumulation (Priority: P2)

A household member checks how much rain has fallen today and over recent periods,
seeing an at-a-glance droplet that fills with the day's rainfall.

**Why this priority**: Rainfall is a high-value, frequently-checked panel,
especially in wet seasons, but is not part of the headline P1 conditions.

**Independent Test**: Provide a reading with daily, event, hourly, weekly,
monthly, and yearly rain totals and confirm the droplet fills proportionally to
the daily total and all six totals are shown in inches.

**Acceptance Scenarios**:

1. **Given** a daily rain total of 0.00 in, **When** the rainfall panel renders,
   **Then** the droplet appears empty and the Daily Rain total reads 0.00 in.
2. **Given** a daily rain total equal to the configured "full droplet" amount,
   **When** the rainfall panel renders, **Then** the droplet appears full.
3. **Given** a daily rain total between empty and full, **When** the rainfall
   panel renders, **Then** the droplet fill level is proportional to the daily
   total relative to the configured full amount.
4. **Given** a daily rain total that exceeds the configured "full droplet"
   amount, **When** the rainfall panel renders, **Then** the droplet renders as
   full (clamped) and the Daily Rain total still shows the true value.
5. **Given** a reading with event, hourly, weekly, monthly, and yearly rain
   values, **When** the rainfall panel renders, **Then** all five totals plus the
   Daily total are displayed in inches with the Daily total most prominent.

---

### User Story 4 - Read solar, UV, and the sun/moon position (Priority: P3)

A household member sees the current solar radiation and UV index, where the sun
is in its daily arc right now, the sunrise/sunset times, and the current moon
phase.

**Why this priority**: Useful context (sun exposure, daylight remaining) but
secondary to temperature, wind, and rain.

**Independent Test**: Provide a reading with solar radiation and UV, plus the
day's sunrise and sunset, at a known current time, and confirm the Solar & Sky
panel shows solar radiation in W/m², the UV index, sunrise and sunset in Eastern,
a day arc with a sun marker at the interpolated current position, and a moon-phase
indicator.

**Acceptance Scenarios**:

1. **Given** a reading with solar radiation 540 W/m² and UV index 5, **When** the
   Solar & Sky panel renders, **Then** it shows 540 W/m² and a UV index of 5.
2. **Given** sunrise at 5:25 AM and sunset at 8:31 PM Eastern, **When** the panel
   renders, **Then** it shows those sunrise and sunset times in `America/New_York`
   format and draws a day arc between them.
3. **Given** the current Eastern time is exactly midway between sunrise and
   sunset, **When** the panel renders, **Then** the sun marker sits at the apex
   (midpoint) of the day arc.
4. **Given** the current Eastern time is before sunrise or after sunset, **When**
   the panel renders, **Then** the sun marker is shown at the start/end of the arc
   (or in a night state) rather than at an out-of-range position.
5. **Given** the current date corresponds to a known moon phase, **When** the
   panel renders, **Then** the moon-phase indicator reflects that phase.

---

### User Story 5 - Check indoor temperature and humidity (Priority: P3)

A household member checks the indoor climate — current indoor temperature and
indoor relative humidity — on the same screen.

**Why this priority**: Helpful for comfort decisions but secondary to outdoor
conditions on a weather dashboard.

**Independent Test**: Provide a reading with indoor temperature and indoor
humidity and confirm two ring gauges display the indoor temperature in °F and the
indoor relative humidity in %.

**Acceptance Scenarios**:

1. **Given** a reading with an indoor temperature of 70°F, **When** the indoor
   temperature ring renders, **Then** it shows 70°F as its value.
2. **Given** a reading with an indoor relative humidity of 48%, **When** the
   indoor humidity ring renders, **Then** it shows 48%.
3. **Given** the indoor temperature ring shares the outdoor temperature color
   scale, **When** the indoor temperature changes across refreshes, **Then** its
   ring color follows the same visible-spectrum (violet→red) scale as the outdoor
   ring.

---

### User Story 6 - Read barometric pressure trend and current condition (Priority: P3)

A household member sees the current barometric pressure with a short-term trend
(rising / steady / falling) and an icon reflecting present conditions
(e.g., sun / cloud).

**Why this priority**: A classic weather-forecasting cue, but lower priority than
the live temperature, wind, and rain panels.

**Independent Test**: Provide successive readings with changing pressure and
confirm the barometer panel shows absolute pressure in hPa with a
rising/steady/falling indicator and delta; provide a condition signal and confirm
the condition icon reflects it.

**Acceptance Scenarios**:

1. **Given** an absolute barometric pressure of 1013 hPa, **When** the barometer
   panel renders, **Then** it shows 1013 hPa.
2. **Given** pressure has increased over the configured trend window, **When** the
   barometer panel renders, **Then** it shows a rising indicator (↑) and the delta
   of change.
3. **Given** pressure has decreased over the trend window, **When** the barometer
   panel renders, **Then** it shows a falling indicator (↓) and the delta.
4. **Given** pressure is essentially unchanged over the trend window, **When** the
   barometer panel renders, **Then** it shows a steady indicator.
5. **Given** the NWS current-conditions API reports a clear sky for the household
   location, **When** the dashboard renders, **Then** the current-condition icon
   shows the clear state.
6. **Given** the NWS feed is unreachable or its last successful fetch is older than
   the configured staleness window, **When** the dashboard renders, **Then** the
   condition icon is shown **greyed-out (stale)** over the last-known icon (or a
   neutral icon if none has been fetched) and no other panel is affected.

---

### User Story 7 - Live readings flow from the gateway to the screen (Priority: P1)

The household's real weather conditions, measured by the Ecowitt GW2000B gateway,
appear on the dashboard on their own — without anyone exporting data, touching the
gateway, or refreshing the page. New conditions outside become visible on the
kiosk shortly after they happen.

**Why this priority**: This is the data backbone of the MVP. Without it the
dashboard has nothing real to show. The ingestion poller, the store, and the
versioned API are what turn the UI from a mockup into a live instrument. This
story is what makes User Stories 1–6 display *actual* household weather rather
than fixtures.

**Independent Test**: Point the ingestion service at a stand-in for the gateway
that serves a known live-data payload, let one poll cycle run, then query the
application's versioned API and confirm it returns a latest-reading snapshot
matching the payload; then load the dashboard and confirm the panels show those
same values, and that when the stand-in's payload changes, the next poll causes
the API snapshot and the dashboard to update without manual intervention.

**Acceptance Scenarios**:

1. **Given** the gateway's local API reports a current outdoor temperature of
   72°F, **When** the ingestion service completes a poll cycle, **Then** the
   application's versioned API returns a latest-reading snapshot whose outdoor
   temperature is 72°F.
2. **Given** a reading has been ingested and stored, **When** the dashboard
   requests the latest snapshot from the versioned API, **Then** it receives that
   reading and renders it in the appropriate panels.
3. **Given** the gateway's reported conditions change between poll cycles, **When**
   the next poll completes, **Then** the API snapshot reflects the new values and
   the dashboard updates to match without any user interaction.
4. **Given** the ingestion service is the only component permitted to reach the
   gateway, **When** the dashboard needs data, **Then** it obtains that data solely
   from the versioned API and never connects to the gateway or the data store
   directly.

---

### User Story 8 - The dashboard survives a fresh install with no data yet (Priority: P1)

On first deployment — before the ingestion service has ever successfully polled
the gateway — the dashboard still loads cleanly and honestly shows that no live
readings have arrived yet, rather than crashing or displaying fabricated zeros.

**Why this priority**: A new self-hosted install starts with an empty store. The
slice must degrade gracefully from the very first page load, or the owner's first
impression is a broken screen. This guarantees the "no data yet" path is handled
end-to-end (empty store → API → UI Missing state), not just the steady-state.

**Independent Test**: Start the application with an empty store and no successful
poll yet, request the latest snapshot from the versioned API, and confirm it
reports a no-data condition rather than failing; load the dashboard and confirm
every panel renders in its Missing state (em-dash `—` on a neutral gauge) with no
fabricated zeros.

**Acceptance Scenarios**:

1. **Given** a fresh install whose store contains no readings, **When** the
   dashboard requests the latest snapshot, **Then** the versioned API responds with
   an explicit no-data result and does not error.
2. **Given** the no-data result, **When** the dashboard renders, **Then** every
   panel shows its Missing state (em-dash `—`, neutral gauge) and no panel displays
   a `0` as though it were a real reading.
3. **Given** the ingestion service then completes its first successful poll,
   **When** the dashboard next refreshes, **Then** the affected panels transition
   from Missing to Fresh and show the newly ingested values.

---

### User Story 9 - Ingestion keeps running through gateway hiccups (Priority: P2)

When the gateway is briefly unreachable or returns a bad response, the data
pipeline does not crash and the dashboard does not show a misleading value; once
the gateway recovers, fresh readings resume automatically.

**Why this priority**: The gateway is on an isolated IoT VLAN and is a consumer-
grade device; transient failures are expected. The slice must tolerate them so the
always-on kiosk stays trustworthy, but the headline value (US 7/8) is what makes
the MVP work, so resilience is P2.

**Independent Test**: Drive the ingestion service against a stand-in gateway that
intermittently times out and intermittently returns malformed/partial payloads,
and confirm the service does not crash, does not persist the bad payloads, retries
on the next cadence, and that the last good reading is what the API/UI continue to
surface (eventually flipping to Stale) until a valid poll succeeds.

**Acceptance Scenarios**:

1. **Given** the gateway fails to respond on a poll attempt, **When** the cadence
   elapses, **Then** the ingestion service retries on the next cycle and does not
   crash or exit.
2. **Given** the gateway returns a malformed or partial payload, **When** the
   ingestion service processes it, **Then** the payload is rejected, nothing
   corrupt is written to the store, and the last valid reading remains the latest
   snapshot.
3. **Given** the gateway has been unreachable longer than the staleness threshold,
   **When** the dashboard renders, **Then** the affected panels show the Stale
   state (dimmed, `STALE` tag) over the last good value rather than a fabricated or
   silently-old reading.
4. **Given** the gateway recovers, **When** the next poll succeeds, **Then** a new
   reading is stored and the dashboard returns to the Fresh state.

---

### Edge Cases

- **Missing or stale reading**: When a given metric is missing or its most recent
  value is older than the freshness threshold, the corresponding panel MUST show
  an explicit degraded state — **Stale** (dim the panel and show a `STALE` tag) or
  **Missing** (an em-dash `—` on a neutral gauge) — rather than a misleading zero
  or a stale value presented as current. Degradation is **per-panel**, never
  whole-screen (see [`design/design-language.md` §8](design/design-language.md)).
- **No readings at all yet**: When the application has no readings to present
  (e.g., fresh install before the first successful poll), the view MUST render its
  panels in a no-data state rather than failing to load.
- **Out-of-range astro time**: Before sunrise or after sunset, the sun marker MUST
  remain within or at the bounds of the day arc (or display a night state) and
  never render outside the arc.
- **Rainfall over capacity**: A daily rain total exceeding the 4.0 in full-scale
  cap MUST clamp the droplet at full and escalate its color (blue → amber → red)
  while still showing the true numeric total.
- **Barometer trend before 3h of history**: When fewer than 3 hours of stored
  readings exist (fresh install or early run), the barometer panel MUST show the
  current pressure with an explicit "trend unavailable" indicator (neutral, no
  arrow, no delta) rather than fabricating a steady trend or a zero delta.
- **Temperature on the color scale**: The temperature→color mapping is a smooth
  visible-spectrum interpolation, so any temperature MUST resolve to a single,
  deterministic color with no abrupt banding or flicker between adjacent hues.
- **Feels Like above 100°F**: Summer heat-index values regularly exceed 100°F; the
  Feels Like ring MUST map such values to a distinct hot red on the scale (which
  runs to 120°F) and never saturate to a near-black or undifferentiated color.
- **Wind calm**: A wind speed of 0 mph MUST render as calm (0 mph) and MUST NOT
  imply a misleading direction.
- **Slow device**: On the slowest target device (2014-era Surface Pro 3), the view
  MUST remain legible and responsive, and auto-refresh MUST NOT cause the screen
  to become unresponsive or visually thrash.
- **Narrow viewport (phone)**: On an iPhone 16 Pro Max (large-phone class,
  ~440 CSS px wide in portrait), all panels MUST remain legible and reachable
  (reflowed/stacked as needed) without horizontal scrolling of the primary content.
  The layout SHOULD also accommodate the forthcoming iPhone 18 Pro Max (a
  same-or-larger phone, expected within a year) without redesign.
- **Tablet (iPad Air M2)**: On a 13" iPad Air M2 in landscape (~1366×1024 CSS px),
  the two-column layout MUST fit the viewport without scrolling the primary
  content; in portrait (~1024×1366) the view MUST remain fully legible, reflowing
  as needed without horizontal scrolling.
- **Empty store / before first poll**: On a fresh install, before the ingestion
  service has ever stored a reading, the versioned API MUST return an explicit
  no-data result (never an error and never fabricated zeros) and the UI MUST render
  every panel in its Missing state.
- **Gateway unreachable**: When a poll attempt fails (timeout, connection refused,
  IoT VLAN hiccup), the ingestion service MUST NOT crash; it MUST retry on the next
  cadence, and the API/UI MUST continue surfacing the last good reading, flipping
  to Stale once it ages past the staleness threshold.
- **Malformed / partial gateway payload**: When the gateway returns an
  unparseable, malformed, or partial response, the ingestion service MUST reject it
  without persisting anything and without corrupting the store, leaving the last
  valid reading as the latest snapshot.
- **Slow or paused ingestion**: If the ingestion cadence is delayed or paused, the
  store's latest reading ages naturally and the UI MUST reflect that age via the
  Stale state rather than presenting an old value as current.

## Requirements *(mandatory)*

### Functional Requirements

#### Layout & structure

- **FR-001**: The view MUST present a single screen containing the following
  panels: a header (menu / date / time), an outdoor temperature ring, a Feels Like
  ring, a wind compass, a Solar & Sky panel, an indoor temperature ring, an indoor
  humidity ring, a Rainfall panel, and a Barometer panel (which also carries the
  sky-condition icon).
- **FR-002**: On kiosk / desktop widths the view MUST use a **two-column** layout:
  the **left column** holds the large outdoor gauges (temperature ring, Feels Like
  ring, wind compass) above the Solar & Sky panel; the **right column** holds the
  smaller indoor companion rings (temperature + humidity) above the Rainfall panel
  and the Barometer panel — mirroring the reference console
  ([`design/AmbientWeatherDashboard.png`](design/AmbientWeatherDashboard.png)).
- **FR-003**: The view MUST NOT reproduce the reference console's bottom toolbar of
  hardware-button labels. In-app page navigation is provided by the header menu
  (FR-004a); no other navigation controls are defined in this feature.

#### Header (menu / date / time)

- **FR-004**: The header MUST be a three-zone row: a hamburger menu control
  (left), the current date centered, and the current time right-aligned.
- **FR-004a**: The hamburger menu MUST open in-app page navigation, with the Live
  dashboard as the active page; History / Trends / Records / Settings entries are
  placeholders for future features and define no behavior here.
- **FR-005**: The time MUST be displayed in 12-hour format with AM/PM and advance
  every second while the view is displayed.
- **FR-006**: The date MUST be displayed as weekday + month + day with an ordinal
  suffix (e.g., "Tuesday, June 19th").
- **FR-007**: All header date/time values MUST be rendered in the
  `America/New_York` (US Eastern) timezone with daylight-saving transitions
  handled automatically, and MUST NOT rely on the device's browser-locale default.
- **FR-008**: The header clock and all panels MUST update live as new readings
  arrive, with no manual refresh required.

#### Outdoor temperature ring

- **FR-009**: The outdoor temperature ring MUST display the current outdoor
  temperature in °F as the panel's centerpiece and the largest readout on screen.
- **FR-010**: The outdoor ring MUST display the day's high temperature marked with
  an up indicator (↑) and the day's low temperature marked with a down indicator
  (↓).
- **FR-011**: The outdoor panel MUST display Feels Like (°F), Dewpoint (°F), and
  Outdoor Humidity (%) as supporting readouts.

#### Feels Like ring

- **FR-011a**: The view MUST present a dedicated **Feels Like** temperature ring
  positioned between the outdoor temperature ring and the wind compass, sized as a
  smaller companion dial (not co-equal with the outdoor temperature ring).
- **FR-011b**: The Feels Like ring MUST use the same temperature→color scale as the
  outdoor ring and MUST color correctly across the full range up to 120°F, so that
  summer heat-index values exceeding 100°F render as clear hot reds.

#### Temperature color scale (outdoor, Feels Like, indoor)

- **FR-012**: Temperature rings MUST encode their value by color along a
  **visible-spectrum** scale running from violet (coldest) through blue, cyan,
  green, yellow, and orange to red (hottest), spanning roughly 10°F to 120°F. The
  color MUST vary smoothly (interpolated), not in hard steps.
- **FR-013**: Temperatures at or above 100°F MUST map to clear, legible hot reds
  (never a near-black or undifferentiated color). The authoritative anchor stops
  and interpolation are defined in
  ([`design/design-language.md` §5.3](design/design-language.md)); this spec does
  not restate the per-degree color values.

#### Wind compass

- **FR-014**: The wind panel MUST display the current wind speed in mph.
- **FR-015**: The wind panel MUST display the current wind direction as a cardinal
  point (e.g., N, NE) together with the bearing in degrees.
- **FR-016**: The wind panel MUST display the current gust in mph.
- **FR-017**: The wind panel MUST display the 10-minute average wind speed in mph.
- **FR-017a**: The wind panel MUST pair the 10-minute average wind speed (FR-017)
  with the 10-minute average wind **direction** shown as a cardinal point. Unlike
  the average speed, the average direction **is** supplied by the gateway
  (`common_list 0x6D`) and MUST be taken from each reading as-is, not derived.
- **FR-018**: The wind panel MUST display the maximum daily gust as a direction
  plus speed (mph).
- **FR-018a**: The wind direction MUST be shown on a compass-style gauge using a
  **rim marker** rotated to the bearing (not a full-diameter needle), positioned so
  it never overlaps the center readout.
- **FR-018b**: The maximum daily gust **speed** (FR-018) MUST be taken from the
  gateway's corresponding field as supplied in each reading (the gateway resets it at
  local midnight). The day's high/low outdoor temperature (FR-010), the 10-minute
  average wind speed (FR-017), and the max daily gust **direction** (FR-018) are
  **NOT** supplied by the gateway and MUST be **derived by the application from its
  own stored reading history**: day high/low = max/min outdoor temperature since the
  most recent local (`America/New_York`) midnight; 10-minute average wind = rolling
  mean of polled wind speed over the trailing 10 minutes; max-gust direction = the
  wind direction recorded at the largest gust observed since local midnight. Where
  insufficient history exists, the value falls back to the current reading's
  instantaneous equivalent rather than a fabricated zero. The 10-minute average wind
  **direction** (FR-017a) is the exception — it **is** supplied by the gateway
  (`common_list 0x6D`) and is used as-is.

#### Solar & Sky

- **FR-019**: The Solar & Sky panel MUST display solar radiation in W/m² as a
  primary readout.
- **FR-020**: The Solar & Sky panel MUST display the UV index (unitless) as a
  primary readout.
- **FR-021**: The Solar & Sky panel MUST display the day's sunrise and sunset
  times rendered in `America/New_York`.
- **FR-022**: The Solar & Sky panel MUST draw a day arc between sunrise and sunset
  and place a sun marker showing the sun's current position, interpolated by the
  present Eastern time between sunrise and sunset.
- **FR-023**: The Solar & Sky panel MUST display a moon-phase indicator for the
  current date.

#### Indoor rings

- **FR-024**: The indoor temperature ring MUST display the current indoor
  temperature in °F.
- **FR-025**: The indoor humidity ring MUST display the current indoor relative
  humidity in %.
- **FR-026**: The indoor temperature ring MUST use the same visible-spectrum
  temperature color scale as the outdoor and Feels Like rings (FR-012).
- **FR-026a**: The indoor temperature and humidity rings MUST be presented as
  smaller secondary companion dials, intentionally not co-equal in size with the
  primary outdoor gauges.

#### Rainfall panel

- **FR-027**: The rainfall panel MUST present a water-droplet visual that fills
  proportionally to the amount of rain that has fallen today (empty = no rain;
  fuller = more rain).
- **FR-028**: The droplet fill MUST be proportional to the daily rain total
  relative to an engineered full-scale cap of **4.0 in**, and MUST clamp the fill
  at full when the daily total meets or exceeds that cap.
- **FR-028a**: When the daily total exceeds the 4.0 in cap, the droplet MUST stay
  full and its color MUST escalate (blue → amber → red) to flag an extreme rain
  day, while the numeric Daily Rain total continues to show the true value.
- **FR-029**: The rainfall panel MUST prominently display the Daily Rain total and
  also display Event, Hourly, Weekly, Monthly, and Yearly totals.
- **FR-029a**: The rainfall panel MUST display the current rain **rate** in in/hr,
  sourced from the piezo gauge (`piezoRain 0x0E`).
- **FR-029b**: The rainfall panel MUST show a **"raining now"** indicator when the
  gateway's piezo rain flag (`piezoRain srain_piezo`) is set, and hide it when the
  flag is clear.
- **FR-030**: All rainfall totals MUST be displayed in inches.

#### Barometer & condition

- **FR-031**: The barometer panel MUST display the absolute barometric pressure in
  hPa.
- **FR-032**: The barometer panel MUST display a **3-hour** trend indicator
  (rising ↗ / steady → / falling ↘ arrow) together with the delta of change over
  that window, never relying on color alone.
- **FR-032a**: When fewer than 3 hours of readings are available to compute the
  trend window (FR-032), the system MUST represent the trend as explicitly
  **unavailable** (neutral indicator, no arrow, no delta) rather than reporting a
  steady or zero-delta trend, and the UI MUST render that "trend unavailable" state.
- **FR-033**: The barometer panel MUST carry a current sky-condition icon sourced
  from the **National Weather Service (NWS) current-conditions API**
  (`api.weather.gov`) for the household location — a complex classification the
  local sensors cannot reproduce faithfully. The API service fetches the latest NWS
  observation for the configured location, maps it (incl. NWS day/night) to the
  application's condition-icon vocabulary, caches the result, and exposes it to the
  web client, which renders the icon. The NWS→icon mapping MUST be a pure,
  unit-tested function.
  - **Graceful degradation (offline-first, not offline-only)**: when NWS is
    unreachable, times out, or its last successful fetch is older than the
    configured staleness window, the icon MUST render in a **stale (greyed-out)**
    state over the last-known icon (or a neutral icon if none has ever been
    fetched). A missing NWS feed MUST NOT crash the service, block sensor
    ingestion/serving, or fabricate a condition — it only greys this single,
    non-headline icon.
  - **Testability (FR-057)**: NWS access MUST sit behind an injectable client so
    automated tests use mocked responses only and never reach the network.

#### Liveness, data freshness & resilience

- **FR-034**: The view MUST auto-refresh as new readings arrive so it remains
  "live" without user interaction.
- **FR-034a**: The web client MUST poll the versioned API for the latest snapshot
  on its own **UI refresh cadence**, configurable and defaulting to **10 seconds**,
  independent of the ingestion **poll cadence** (FR-045). Throughout this spec,
  *poll cadence* refers to the ingestion service → gateway interval and *UI refresh
  cadence* refers to the client → API interval; the two are distinct and MUST NOT
  be conflated.
- **FR-035**: Each panel MUST present one of three data-freshness states, degrading
  **per-panel** (never whole-screen):
  - **Fresh** (normal): the latest reading is current.
  - **Stale**: the latest reading's observation time is older than **three times
    (3×) the ingestion poll cadence** (FR-045) — the affected panel MUST be dimmed
    and show a `STALE` tag while still displaying the last value.
  - **Missing**: no value is available — the panel MUST show an em-dash `—` on a
    neutral gauge and MUST NEVER fabricate a `0`.

  The authoritative visual treatment is defined in
  ([`design/design-language.md` §8](design/design-language.md)).
- **FR-036**: The web client MUST consume readings exclusively through the
  application's versioned API contract and MUST NOT access the data store or the
  gateway directly. This is an internal-architecture boundary on the *client*; the
  versioned API, the data store, and the ingestion poller behind it are all
  delivered **by this feature** (see the Ingestion, Storage, and Serving
  requirements below).
- **FR-037**: Units for this view are fixed: temperature in °F, wind speed in mph,
  rainfall in inches, pressure in hPa, solar radiation in W/m², humidity in %, and
  UV index unitless.

#### Responsive behavior

- **FR-038**: At desktop / kiosk widths (≈ 900px and wider) the view MUST use the
  two-column layout (FR-002) and fit the viewport without scrolling the primary
  content.
- **FR-039**: Below ≈ 900px the view MUST collapse to a single outdoor-first
  stacked column in the order Outdoors → Solar & Sky → Indoors → Rainfall →
  Barometer, where vertical scrolling is permitted.
- **FR-039a**: The view MUST support the **13" iPad Air M2** screen size (both
  orientations) as a first-class target: in **landscape** (≈ 1366px wide) it MUST
  present the two-column layout (FR-002) fitting the viewport without scrolling the
  primary content; in **portrait** (≈ 1024px wide) it MUST remain fully legible,
  using the stacked single-column reflow (FR-039) where the width falls below the
  two-column threshold, without horizontal scrolling of the primary content.

#### Accessibility & device performance

- **FR-040**: The headline outdoor dials MUST be legible at ~10 feet (kiosk
  glance distance).
- **FR-041**: Interactive controls (the hamburger menu and its items) MUST show a
  visible keyboard focus outline and MUST present touch targets of at least 44px.
- **FR-042**: The view MUST render legibly and remain responsive on the slowest
  target device (a 2014-era Surface Pro 3 kitchen kiosk), on household iPhone 16
  Pro Max phones, and on the 13" iPad Air M2 (either orientation), and auto-refresh
  MUST NOT cause the screen to thrash or become unresponsive.
- **FR-042a**: The responsive layout SHOULD additionally accommodate the
  forthcoming **iPhone 18 Pro Max** (expected within a year, same-or-larger
  large-phone class) without a redesign. This is a forward-looking nice-to-have,
  not a release-blocking requirement.

#### Ingestion (pull-only across the VLAN boundary)

- **FR-043**: The system MUST include an ingestion service that **pulls** live
  readings from the Ecowitt GW2000B gateway's local HTTP API (e.g.,
  `get_livedata_info`). Ingestion MUST be pull-based; push-based ingestion
  (gateway → application) is architecturally impossible across the one-way
  main→IoT firewall and MUST NOT be designed for.
- **FR-044**: The ingestion service MUST initiate its connection from the main
  network into the IoT VLAN through the single permitted firewall pinhole, and MUST
  be the **only** component that crosses the main→IoT boundary. No other component
  (including the API, the UI, or any future consumer) may reach into the IoT VLAN.
- **FR-045**: The poll cadence MUST be configurable and MUST default to **30
  seconds** (the configurable valid range is **30–60 seconds**).
- **FR-046**: A missed or failed poll MUST be retried on the next cadence and MUST
  NOT crash, exit, or wedge the ingestion service.
- **FR-047**: The ingestion service MUST validate and sanitize each gateway
  response before persisting it. Malformed or partial responses MUST be rejected
  without persisting them and without corrupting the existing store or the latest
  snapshot.

#### Storage

- **FR-048**: Ingested readings MUST be persisted to the application's own
  **SQLite** store, which it owns independently of the gateway or any external
  system (the application is the system of record for its history).
- **FR-049**: All readings MUST be stored in **UTC**, with each reading carrying
  its observation time, in a schema that supports efficient time-range queries
  (the persisted history backs both the live snapshot and future history features).
- **FR-050**: A reading MUST only be written to the store after it passes ingestion
  validation (FR-047), so the store never contains malformed or partial readings.

#### Serving (versioned API)

- **FR-051**: The application MUST expose, through its **versioned** API contract,
  the latest reading snapshot that the dashboard consumes (FR-036), drawn from the
  store.
- **FR-052**: The latest-snapshot response MUST carry enough information (e.g., the
  reading's observation time) for the UI to derive each panel's freshness state —
  Fresh / Stale / Missing (FR-035) — without the client reaching the store or the
  gateway.
- **FR-053**: Before the first successful poll (fresh install / empty store), the
  API MUST return an explicit **no-data** result so the UI can render the Missing
  state. The API MUST NEVER fabricate `0` values or synthesize a reading that was
  not ingested.

#### Cross-cutting (timezone, secrets, deployment, testing)

- **FR-054**: Storage MUST be **UTC** and all user-facing display MUST be in
  **`America/New_York`** (US Eastern), with daylight-saving handled automatically,
  across every tier — never relying on a device or server locale default.
- **FR-055**: Secrets and environment-specific configuration (the gateway address,
  poll cadence, location, etc.) MUST be supplied via environment variables or a
  gitignored local config file and MUST NEVER be committed to source control; an
  example template MUST document the required values.
- **FR-056**: The full slice (ingestion poller, store, API, and UI) MUST run
  self-hosted as containers with **no cloud dependency** and MUST keep collecting
  and serving data with no internet connectivity. The NWS-sourced sky-condition
  icon (FR-033) is the one permitted **optional online enrichment**; when the
  internet or NWS is unavailable it MUST degrade to a greyed stale state and MUST
  NOT prevent the core slice from collecting, storing, serving, or displaying
  sensor data.
- **FR-057**: The slice MUST be developed test-first to **100% coverage**, and all
  automated tests MUST use mock or synthetic data only — they MUST NOT depend on
  the gateway, the network, or any external service being reachable.

### Key Entities *(include if feature involves data)*

- **Live Reading Snapshot**: The most recent set of current weather values to
  display, including outdoor temperature, feels-like, dewpoint, outdoor humidity,
  wind speed/direction/gust, 10-minute average wind, max daily gust (direction +
  speed), solar radiation, UV index, indoor temperature, indoor humidity, rainfall
  totals (event/hourly/daily/weekly/monthly/yearly), absolute barometric pressure,
  and the observation time of the reading.
- **Daily Extremes**: The day's high and low outdoor temperature and the max daily
  gust direction, **derived by the application from its own stored history** since
  local midnight; the gateway supplies the max daily gust speed as-is. Used by the
  outdoor ring and wind panel.
- **Astronomical Data**: Sunrise time, sunset time, and moon phase for the current
  date and location, used by the Solar & Sky panel and to interpolate the sun's
  current arc position.
- **Barometric Trend**: The pressure change over a short-term window used to derive
  the rising/steady/falling indicator and delta.
- **Temperature Color Scale**: A visible-spectrum (violet→red) interpolation from
  roughly 10°F to 120°F that maps a temperature value to a ring color, shared by
  the outdoor, Feels Like, and indoor temperature rings.
- **Data Freshness State**: The per-panel indication of whether the latest value
  is **Fresh**, **Stale**, or **Missing**, driving the degraded presentation.
- **Gateway Response**: The raw payload pulled from the GW2000B local API on each
  poll, which must be validated and sanitized before any of it is persisted; a
  malformed or partial response is rejected, not stored.
- **Stored Reading**: A validated reading persisted to the application's SQLite
  store in UTC with its observation time, forming the application-owned history
  that backs the live snapshot (and, later, history features).
- **Latest Snapshot (API resource)**: The versioned API resource the dashboard
  consumes — the most recent Stored Reading plus enough metadata (observation time)
  for the UI to derive Fresh / Stale / Missing — or an explicit no-data result when
  the store is empty.
- **Ingestion Configuration**: The configurable, secret/environment-supplied inputs
  to the poller (gateway address, poll cadence defaulting to 30 s within a 30–60 s
  range, household location), never committed to source control.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A household member can read the current outdoor temperature, the
  day's high/low, and the current Eastern date/time within 3 seconds of glancing
  at the kiosk, without interacting with it.
- **SC-002**: 100% of date, time, sunrise, and sunset values displayed are in US
  Eastern (`America/New_York`), verified across at least one standard-time date and
  one daylight-saving date.
- **SC-003**: A newly stored reading is reflected on the dashboard within **one
  ingestion poll cadence plus one UI refresh cadence** of the reading being
  persisted, without any manual refresh.
- **SC-004**: On the slowest target device (2014-era Surface Pro 3), the initial
  view becomes legible and interactive within 2 seconds, and remains responsive
  while auto-refresh is active.
- **SC-005**: When a metric is missing or stale, 100% of affected gauges show a
  no-data / stale state and none display a misleading zero or present a stale value
  as current.
- **SC-006**: On an iPhone 16 Pro Max (large-phone class, portrait), all panels
  remain legible and reachable without horizontal scrolling of the primary content.
- **SC-006a**: On a 13" iPad Air M2, the view is fully legible with no horizontal
  scrolling of the primary content in both orientations: landscape presents the
  two-column layout fitting the viewport without scrolling the primary content,
  and portrait reflows (stacking where below the two-column threshold) while
  remaining legible.
- **SC-007**: The outdoor, Feels Like, and indoor temperature ring colors match the
  visible-spectrum scale for the displayed temperature in 100% of sampled test
  temperatures spanning the 10°F–120°F range, including values at and above 100°F
  rendering as clear hot reds.
- **SC-008**: The rainfall droplet fill level is proportional to the daily total
  (clamped at the 4.0 in cap, with color escalation beyond it) for 100% of sampled
  daily totals from zero through and beyond the cap.
- **SC-009**: The sun marker's position on the day arc corresponds to the current
  Eastern time between sunrise and sunset (apex at solar midpoint; bounded before
  sunrise / after sunset) for 100% of sampled times.
- **SC-010**: A reading reported by the gateway becomes visible on the dashboard,
  end-to-end (poll → store → API → UI), within **one ingestion poll cadence plus
  one UI refresh cadence** of the ingestion service pulling it, with no manual
  export or refresh.
- **SC-011**: On a fresh install with an empty store, the dashboard loads
  successfully and 100% of panels show the Missing state — zero panels show a
  fabricated `0` and the page does not error.
- **SC-012**: Across a test run in which the gateway intermittently fails and
  returns malformed payloads, the ingestion service stays running for 100% of the
  run (never crashes/exits), persists zero malformed readings, and resumes storing
  valid readings automatically once the gateway recovers.
- **SC-013**: 100% of persisted readings are stored in UTC and 100% of user-facing
  date/time values are displayed in `America/New_York`, verified across one
  standard-time and one daylight-saving date.
- **SC-014**: The full slice (poller, store, API, UI) starts and serves the
  dashboard with no internet connectivity and with no value-bearing configuration
  committed to source control (secrets supplied via environment / gitignored local
  config).

## Out of Scope

This feature delivers the live "now" slice end-to-end (ingestion → storage → API →
display). The following are explicitly **out of scope** and are deferred to
**separate future user-facing features**:

- **Historical charting / trends / graphs over time** *(separate future feature)*:
  This slice **stores** readings to its own history but does **not** chart, graph,
  or trend them. The live dashboard serves and displays the current "now" snapshot
  only; a History / Trends / Records experience built on the persisted store is its
  own later feature (this view may eventually link to it but defines no history UI
  now).
- **MQTT fan-out to Home Assistant** *(separate future interoperability feature)*:
  Publishing readings to an MQTT broker for Home Assistant to consume is a distinct
  interoperability feature and is not part of this MVP slice.

Also out of scope for this feature:

- Settings persistence and any settings UI beyond the placeholder menu entry.
- Authentication flows beyond the project's LAN-trust model.

## Assumptions

- This feature **delivers** ingestion from the Ecowitt GW2000B local API, the
  SQLite store, and the versioned API that serves the live snapshot; they are not
  preexisting. The gateway is reachable from the main network on its local API port
  through the single permitted main→IoT firewall pinhole.
- Sunrise, sunset, and moon-phase values are derived for a fixed household location
  (the deployment site) and the current date; the location is a configured
  constant for this single-household deployment.
- The barometer panel's "absolute" pressure refers to the gateway's absolute
  (station) pressure reading, taken from the gateway's `wh25` category (reported in
  inHg) and normalised to hPa by the ingestion service before storage.
- The barometric trend is computed over a **3-hour** window and the per-panel
  freshness threshold is three times the ingestion poll cadence (Stale at > 3×);
  the poll cadence is configurable and defaults to 30 s (valid range 30–60 s), and
  the client UI refresh cadence is configurable and defaults to 10 s.
- The current-condition icon is **sourced from the NWS current-conditions API**
  (`api.weather.gov`) for the household location and mapped to the app's icon
  vocabulary; it greys out (stale) when NWS is unreachable and never blocks the core
  slice (FR-033). It is **not** derived from local sensor readings — the local
  sensors cannot faithfully classify sky condition.
- Rainfall totals are sourced from the **WS90 haptic gauge (`piezoRain`)**, not the
  legacy tipping-bucket (`rain`) category, which reads zero during real rain on this
  deployment (device-verified). The UI panel is still labelled "Rain".
- Day high/low outdoor temperature, the 10-minute average wind speed, and the max
  daily gust direction are **derived by the API from stored history** (the gateway
  does not report them); only the max daily gust speed is taken from the gateway.
- In-app page navigation lives in the header hamburger menu; History / Trends /
  Records / Settings are placeholders for future features and define no behavior
  here (YAGNI).

### Resolved Design Decisions

The four items previously tracked as owner clarifications have been **resolved** and
locked into the design language ([`design/design-language.md`](design/design-language.md)).
They are recorded here for traceability:

- **CL-001 — Temperature→color scale** *(resolved)*: A smooth visible-spectrum
  interpolation, violet (coldest) → red (hottest), from ~10°F to 120°F; values
  ≥100°F map to clear hot reds. The temperature rings render as closed gradient
  rings (value encoded by hue, not by an arc fraction). See design-language §5.3.
- **CL-002 — Indoor ring color scale** *(resolved)*: The indoor temperature ring
  shares the outdoor/Feels Like scale; indoor is de-emphasized by size, not color.
- **CL-003 — Rainfall full-scale cap** *(resolved)*: 4.0 in fills the droplet (an
  engineered cap for the deployment site); beyond the cap the droplet stays full
  and escalates color blue → amber → red.
- **CL-004 — Stale/missing presentation** *(resolved)*: Per-panel degradation —
  **Stale** (older than 3× the ingestion poll cadence) dims the panel and shows a
  `STALE` tag; **Missing** shows an em-dash `—` on a neutral gauge, never a `0`.
