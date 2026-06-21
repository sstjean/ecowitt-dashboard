# Feature Specification: Live Weather Dashboard View

**Feature Branch**: `001-live-dashboard`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Create the feature specification for the application's primary live weather dashboard view, which is the visual foundation of the whole app. It is modeled on the user's existing Ambient Weather console layout (a single, glanceable, at-a-time 'now' screen designed for an always-on kitchen kiosk and household phones over the LAN). This feature covers the live 'now' view only — historical charting is a separate future feature."

## Overview

The Live Weather Dashboard View is the application's primary, default screen: a
single, glanceable "now" view of current household weather conditions, modeled
on the owner's existing Ambient Weather console layout. It is designed to run
always-on on a kitchen kiosk (a 2014-era Surface Pro 3) and to be opened on
household phones over the LAN. It presents the most recent readings sourced from
the Ecowitt GW2000B gateway (already ingested and exposed through the
application's API) as a set of purpose-built gauges and panels.

This feature is the **presentation layer for the live readings only**. Historical
charting/graphing is a separate, future feature; this view may later become the
entry point to it, but no history UI is in scope here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable outdoor "now" at a glance (Priority: P1)

A household member walks past the always-on kitchen kiosk and, without touching
it, instantly reads the current outdoor temperature, the day's high and low, and
how it feels outside, alongside the current date and time. The screen stays
current on its own as new readings arrive.

**Why this priority**: This is the core reason the screen exists and the minimum
viable product. The large outdoor temperature ring plus a live, correctly-zoned
header clock delivers standalone value even if every other panel were absent.

**Independent Test**: Load the dashboard with a known set of current readings and
confirm the outdoor temperature ring shows the current value as the centerpiece,
the day's high (↑) and low (↓), and the Feels Like, Dewpoint, and Humidity
readouts beneath it; confirm the header shows the current date and time in US
Eastern; then deliver a new reading and confirm the view updates without a manual
refresh.

**Acceptance Scenarios**:

1. **Given** the latest reading reports an outdoor temperature of 72°F with a day
   high of 81°F and a day low of 58°F, **When** the dashboard loads, **Then** the
   outdoor ring shows 72°F as the centerpiece with 81°F marked as the high (↑) and
   58°F marked as the low (↓).
2. **Given** the latest reading includes Feels Like, Dewpoint, and Outdoor
   Humidity values, **When** the dashboard loads, **Then** those three supporting
   readouts appear beneath the outdoor ring with their values and °F / % units.
3. **Given** the current Eastern time is 2:05 PM on Tuesday 19 June, **When** the
   dashboard renders the header, **Then** it displays the time as "2:05 PM"
   (12-hour with AM/PM) and the date as "Tuesday, 19 June", rendered in
   `America/New_York` regardless of the device's locale.
4. **Given** the dashboard is displayed, **When** a newer reading becomes
   available, **Then** the outdoor ring and header update to the new values
   without any user interaction.
5. **Given** the outdoor temperature changes from a cold value to a hot value
   across refreshes, **When** the ring re-renders, **Then** the ring color shifts
   along the cold→hot gradient (deep blue → light blue → green → yellow → orange →
   red) according to the configured temperature thresholds.

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
day's sunrise and sunset, at a known current time, and confirm the strip shows
solar radiation in W/m², the UV index, sunrise and sunset in Eastern, a day arc
with a sun marker at the interpolated current position, and a moon-phase
indicator.

**Acceptance Scenarios**:

1. **Given** a reading with solar radiation 540 W/m² and UV index 5, **When** the
   solar/astro strip renders, **Then** it shows 540 W/m² and a UV index of 5.
2. **Given** sunrise at 5:25 AM and sunset at 8:31 PM Eastern, **When** the strip
   renders, **Then** it shows those sunrise and sunset times in `America/New_York`
   format and draws a day arc between them.
3. **Given** the current Eastern time is exactly midway between sunrise and
   sunset, **When** the strip renders, **Then** the sun marker sits at the apex
   (midpoint) of the day arc.
4. **Given** the current Eastern time is before sunrise or after sunset, **When**
   the strip renders, **Then** the sun marker is shown at the start/end of the arc
   (or in a night state) rather than at an out-of-range position.
5. **Given** the current date corresponds to a known moon phase, **When** the
   strip renders, **Then** the moon-phase indicator reflects that phase.

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
   scale (default assumption), **When** the indoor temperature changes across
   refreshes, **Then** its ring color follows the same cold→hot gradient as the
   outdoor ring.

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
5. **Given** the present conditions indicate clear skies, **When** the dashboard
   renders, **Then** the current-condition icon reflects a sunny/clear state.

---

### Edge Cases

- **Missing or stale reading**: When a given metric is missing or its most recent
  value is older than the freshness threshold, the corresponding gauge MUST show
  an explicit no-data / stale state rather than a misleading zero or a stale value
  presented as current. (Exact treatment is an owner clarification — see
  Outstanding Clarifications.)
- **No readings at all yet**: When the application has no readings to present
  (e.g., fresh install before the first successful poll), the view MUST render its
  panels in a no-data state rather than failing to load.
- **Out-of-range astro time**: Before sunrise or after sunset, the sun marker MUST
  remain within or at the bounds of the day arc (or display a night state) and
  never render outside the arc.
- **Rainfall over capacity**: A daily rain total exceeding the configured "full
  droplet" amount MUST clamp the droplet at full while still showing the true
  numeric total.
- **Temperature at a color threshold boundary**: A temperature exactly on a
  configured color breakpoint MUST resolve deterministically to a single band (no
  flicker between two colors).
- **Wind calm**: A wind speed of 0 mph MUST render as calm (0 mph) and MUST NOT
  imply a misleading direction.
- **Slow device**: On the slowest target device (2014-era Surface Pro 3), the view
  MUST remain legible and responsive, and auto-refresh MUST NOT cause the screen
  to become unresponsive or visually thrash.
- **Narrow viewport (phone)**: On a phone-width screen, all panels MUST remain
  legible and reachable (reflowed/stacked as needed) without horizontal scrolling
  of the primary content.

## Requirements *(mandatory)*

### Functional Requirements

#### Layout & structure

- **FR-001**: The view MUST present a single screen containing the following
  panels: a header (date/time), an outdoor temperature ring, a wind compass, a
  solar/astro strip, an indoor temperature ring, an indoor humidity ring, a
  rainfall panel, a barometer panel, and a current-condition icon.
- **FR-002**: The panel arrangement MUST follow the reference console's left→right
  ordering as the design intent, while remaining responsive across target screen
  sizes.
- **FR-003**: The view MUST NOT reproduce the reference console's bottom toolbar of
  hardware-button labels. The bottom strip MUST be reserved as a future location
  for in-app page-navigation controls, with no such controls defined in this
  feature.

#### Header (date/time)

- **FR-004**: The header MUST display the current date and time.
- **FR-005**: The time MUST be displayed in 12-hour format with AM/PM (HH:MM AM/PM).
- **FR-006**: The date MUST be displayed as weekday + day + month
  (e.g., "Tuesday, 19 June").
- **FR-007**: All header date/time values MUST be rendered in the
  `America/New_York` (US Eastern) timezone and MUST NOT rely on the device's
  browser-locale default.
- **FR-008**: The header time MUST advance to stay current while the view is
  displayed.

#### Outdoor temperature ring

- **FR-009**: The outdoor temperature ring MUST display the current outdoor
  temperature in °F as the panel's centerpiece.
- **FR-010**: The outdoor ring MUST display the day's high temperature marked with
  an up indicator (↑) and the day's low temperature marked with a down indicator
  (↓).
- **FR-011**: Beneath the outdoor ring, the panel MUST display Feels Like (°F),
  Dewpoint (°F), and Outdoor Humidity (%).
- **FR-012**: The outdoor ring color MUST vary with the temperature value along a
  cold→hot gradient ordered deep blue (coldest) → light blue → green → yellow →
  orange → red (hottest).
- **FR-013**: The temperature→color transition thresholds MUST be defined as
  explicit Fahrenheit breakpoints. The default proposed scale (pending owner
  confirmation) is: deep blue below 20°F; light blue 20–39°F; green 40–59°F;
  yellow 60–74°F; orange 75–89°F; red 90°F and above.

#### Wind compass

- **FR-014**: The wind panel MUST display the current wind speed in mph.
- **FR-015**: The wind panel MUST display the current wind direction as a cardinal
  point (e.g., N, NE) together with the bearing in degrees.
- **FR-016**: The wind panel MUST display the current gust in mph.
- **FR-017**: The wind panel MUST display the 10-minute average wind speed in mph.
- **FR-018**: The wind panel MUST display the maximum daily gust as a direction
  plus speed (mph).

#### Solar / astro strip

- **FR-019**: The solar/astro strip MUST display solar radiation in W/m².
- **FR-020**: The solar/astro strip MUST display the UV index (unitless).
- **FR-021**: The solar/astro strip MUST display the day's sunrise and sunset
  times rendered in `America/New_York`.
- **FR-022**: The solar/astro strip MUST draw a day arc between sunrise and sunset
  and place a marker showing the sun's current position, interpolated by the
  present Eastern time between sunrise and sunset.
- **FR-023**: The solar/astro strip MUST display a moon-phase indicator for the
  current date.

#### Indoor rings

- **FR-024**: The indoor temperature ring MUST display the current indoor
  temperature in °F.
- **FR-025**: The indoor humidity ring MUST display the current indoor relative
  humidity in %.
- **FR-026**: The indoor temperature ring MUST use the same temperature color
  scale as the outdoor ring (default proposed behavior, pending owner
  confirmation).

#### Rainfall panel

- **FR-027**: The rainfall panel MUST present a water-droplet visual that fills
  proportionally to the amount of rain that has fallen today (empty = no rain;
  fuller = more rain).
- **FR-028**: The droplet fill MUST be proportional to the daily rain total
  relative to a configured "full droplet" amount, and MUST clamp at full when the
  daily total meets or exceeds that amount.
- **FR-029**: The rainfall panel MUST prominently display the Daily Rain total and
  also display Event, Hourly, Weekly, Monthly, and Yearly totals.
- **FR-030**: All rainfall totals MUST be displayed in inches.

#### Barometer & condition

- **FR-031**: The barometer panel MUST display the absolute barometric pressure in
  hPa.
- **FR-032**: The barometer panel MUST display a short-term trend indicator
  (rising ↑ / steady / falling ↓) together with the delta of change over the trend
  window.
- **FR-033**: The view MUST display a current-condition icon (e.g., sun / cloud)
  reflecting present conditions.

#### Liveness, resilience & performance

- **FR-034**: The view MUST auto-refresh as new readings arrive so it remains
  "live" without user interaction.
- **FR-035**: When a metric's reading is missing or older than the configured
  freshness threshold, the corresponding gauge MUST display an explicit no-data /
  stale state rather than a misleading zero or a stale value presented as current.
  (Exact visual treatment is an owner clarification — see Outstanding
  Clarifications.)
- **FR-036**: The view MUST render legibly and remain responsive on the slowest
  target device (a 2014-era Surface Pro 3 kitchen kiosk) and on phones.
- **FR-037**: The view MUST consume readings through the application's versioned
  API contract and MUST NOT access the data store or the gateway directly.
- **FR-038**: Units for this view are fixed: temperature in °F, wind speed in mph,
  rainfall in inches, pressure in hPa, solar radiation in W/m², humidity in %, and
  UV index unitless.

### Key Entities *(include if feature involves data)*

- **Live Reading Snapshot**: The most recent set of current weather values to
  display, including outdoor temperature, feels-like, dewpoint, outdoor humidity,
  wind speed/direction/gust, 10-minute average wind, max daily gust (direction +
  speed), solar radiation, UV index, indoor temperature, indoor humidity, rainfall
  totals (event/hourly/daily/weekly/monthly/yearly), absolute barometric pressure,
  current-condition signal, and the observation time of the reading.
- **Daily Extremes**: The day's high and low outdoor temperature and the day's max
  gust, used by the outdoor ring and wind panel.
- **Astronomical Data**: Sunrise time, sunset time, and moon phase for the current
  date and location, used by the solar/astro strip and to interpolate the sun's
  current arc position.
- **Barometric Trend**: The pressure change over a short-term window used to derive
  the rising/steady/falling indicator and delta.
- **Temperature Color Scale**: The ordered set of Fahrenheit breakpoints mapping a
  temperature value to a ring color band, shared (by default) by the outdoor and
  indoor temperature rings.
- **Freshness/No-Data State**: The per-metric indication of whether the latest
  value is current, stale, or absent, driving the no-data presentation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A household member can read the current outdoor temperature, the
  day's high/low, and the current Eastern date/time within 3 seconds of glancing
  at the kiosk, without interacting with it.
- **SC-002**: 100% of date, time, sunrise, and sunset values displayed are in US
  Eastern (`America/New_York`), verified across at least one standard-time date and
  one daylight-saving date.
- **SC-003**: The view updates to reflect a newly arrived reading within one poll
  cadence interval without any manual refresh.
- **SC-004**: On the slowest target device (2014-era Surface Pro 3), the initial
  view becomes legible and interactive within 2 seconds, and remains responsive
  while auto-refresh is active.
- **SC-005**: When a metric is missing or stale, 100% of affected gauges show a
  no-data / stale state and none display a misleading zero or present a stale value
  as current.
- **SC-006**: On a phone-width viewport, all nine panels remain legible and
  reachable without horizontal scrolling of the primary content.
- **SC-007**: The outdoor (and indoor, by default) temperature ring color matches
  the configured cold→hot band for the displayed temperature in 100% of sampled
  test temperatures spanning each band.
- **SC-008**: The rainfall droplet fill level is proportional to the daily total
  (clamped at the configured full amount) for 100% of sampled daily totals from
  zero through and beyond full.
- **SC-009**: The sun marker's position on the day arc corresponds to the current
  Eastern time between sunrise and sunset (apex at solar midpoint; bounded before
  sunrise / after sunset) for 100% of sampled times.

## Assumptions

- The application already ingests readings from the Ecowitt GW2000B local API and
  exposes them through a versioned API; this feature only presents those readings
  and does not change ingestion.
- Sunrise, sunset, and moon-phase values are derived for a fixed household location
  (the deployment site) and the current date; the location is a configured
  constant for this single-household deployment.
- The barometer panel's "absolute" pressure refers to the gateway's absolute
  (station) pressure reading, in hPa, as supplied by the API.
- The "short-term" barometric trend window and the per-metric freshness threshold
  are configurable values with sensible defaults; their exact numbers are
  implementation/configuration details, not user-facing requirements.
- The current-condition icon is derived from available readings/signals (e.g.,
  solar radiation, time of day, and any condition field exposed by the API); a
  full meteorological forecast engine is out of scope.
- Historical charts/graphs are out of scope and handled by a separate future
  feature; this view may later link to them but defines no history UI now.
- The reserved bottom navigation strip defines no controls in this feature (YAGNI).

### Outstanding Clarifications (owner confirmation requested)

These four items use proposed defaults so the specification is complete and
testable, but the owner SHOULD confirm or adjust them before or during planning:

- **CL-001 — Temperature→color breakpoints**: Confirm the exact Fahrenheit
  thresholds for the cold→hot ring gradient. Proposed default: deep blue < 20°F;
  light blue 20–39°F; green 40–59°F; yellow 60–74°F; orange 75–89°F; red ≥ 90°F.
- **CL-002 — Indoor ring color scale**: Confirm whether the indoor temperature
  ring shares the outdoor color scale. Proposed default: yes, same scale.
- **CL-003 — "Full droplet" rainfall amount**: Confirm the daily rainfall amount
  (in inches) that corresponds to a completely full droplet. Proposed default:
  1.00 in = full (with totals above clamping the droplet at full).
- **CL-004 — Stale/missing reading presentation**: Confirm how a missing or stale
  reading should be displayed. Proposed default: the affected gauge shows an
  explicit no-data state (e.g., dashes "--" with a muted/greyed gauge and a "stale"
  marker) instead of a zero or a stale value shown as current; confirm the
  freshness threshold after which a value is considered stale.
