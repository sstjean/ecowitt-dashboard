# Feature Specification: LiveMock — Real-Data Dev Source via the Ecowitt Cloud API

**Feature Branch**: `002-livemock`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "LiveMock — a development/testing-only data source that lets the Ecowitt dashboard run against real, live readings pulled from the Ecowitt cloud API when the operator is off the IoT LAN and cannot reach the GW2000B gateway directly."

## Overview

**LiveMock** is a **development/testing-only** upstream data source for the
existing dashboard pipeline. The household GW2000B gateway is only reachable from
the IoT VLAN (`192.168.30.0/24`) through the single poller firewall pinhole
(Feature 001, FR-044), so when the operator is **off the IoT LAN** they cannot
exercise the app against real data. The Ecowitt **cloud API** is reachable from
anywhere with an API key. LiveMock pulls live readings from the cloud API and
feeds the **existing** ingest → store → API → web pipeline **unchanged**, so the
app can be observed behaving with real, current data in real time from off-LAN.

LiveMock is the live sibling of the existing offline `docker-compose.mock.yml`
(which serves a static `livedata.json`). The difference is that LiveMock pulls
**live** cloud data on the normal poll cadence instead of replaying a fixture.

> **It is not a production ingestion path.** Production continues to pull from the
> LAN gateway (Feature 001). LiveMock is activated only by an explicit opt-in
> (`POLLER_SOURCE=cloud`); the production default stays `gateway` and production
> behaviour is unchanged.

The cloud `real_time` payload is **a different shape** from the gateway
`get_livedata_info` payload — the same underlying measurements in a completely
different structure — so the existing mapper would reject it outright. LiveMock
therefore introduces a thin, pure **translation adapter** (cloud JSON → gateway
`get_livedata_info` shape) so that everything downstream of the adapter
(`normalizeToFullMetricMap`, validation, projection, store, API, web) accepts it
with **no changes**. The pipeline downstream of the adapter is unchanged; this
feature is purely a swap of the upstream data source.

## Source of Truth

> **GitHub Feature issue [#11](https://github.com/sstjean/ecowitt-dashboard/issues/11)
> and its User Story sub-issues [#14](https://github.com/sstjean/ecowitt-dashboard/issues/14)
> (US1), [#15](https://github.com/sstjean/ecowitt-dashboard/issues/15) (US2),
> [#16](https://github.com/sstjean/ecowitt-dashboard/issues/16) (US3), and
> [#17](https://github.com/sstjean/ecowitt-dashboard/issues/17) (US4) are the
> source of truth.** This `spec.md` is a derived implementation tool. If this
> markdown and an Issue disagree, **the Issue wins.** The user stories below
> correspond one-to-one to #14–#17.

## Locked Decisions *(do not re-open as clarifications)*

- **Decision A — Synthesize the two missing fields in the adapter.** The cloud
  `real_time` endpoint does **not** provide `maxDailyGustMph` (gateway
  `common_list 0x19`) or `windAvg10mDirDeg` (gateway `common_list 0x6D`), both of
  which the ingest projection strictly requires. The adapter **synthesizes** them
  from the current reading: `maxDailyGustMph` ← current `wind.wind_gust`;
  `windAvg10mDirDeg` ← current `wind.wind_direction`. The existing strict schema
  is **kept** (no relaxation, no second cloud call); the values self-correct as
  the app's own derived history accrues.
- **Adapter location.** The cloud→gateway translation adapter lives in
  **`packages/shared`** as a pure, unit-testable module (e.g. `cloudMapping.ts`),
  so it can be tested in isolation at 100% coverage.
- **Production default stays `gateway`.** `POLLER_SOURCE=cloud` is a dev/test
  source only; there are **no production behaviour changes**.
- **Secrets handling.** Credentials (`application_key`, `api_key`, device MAC) live
  in a **gitignored `.env`**; placeholders only in `.env.example`. Secrets are
  never committed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Poller pulls live readings from the Ecowitt cloud API (Priority: P1)

As a developer working **off the IoT LAN**, I want the poller to pull live
readings from the **Ecowitt cloud API** (`GET /api/v3/device/real_time`) instead
of the LAN gateway, so the existing ingest → store → API → web pipeline runs on
real, current data without my being on the gateway's VLAN.

**Why this priority**: This is the foundational slice — without a working cloud
fetch wired into the pipeline, there is nothing to adapt, store, or display. It
delivers the core value (real off-LAN data into the existing pipeline) on its own.

**Independent Test**: With `POLLER_SOURCE=cloud` and valid credentials, run a
single poll cycle and confirm a reading is produced through the unchanged
downstream pipeline; with `POLLER_SOURCE` unset or `gateway`, confirm behaviour
is identical to today.

**Acceptance Scenarios**:

1. **Given** `POLLER_SOURCE=cloud` and valid credentials, **When** a poll cycle
   runs, **Then** it fetches `real_time` and produces a stored reading via the
   unchanged downstream pipeline.
2. **Given** `POLLER_SOURCE` is unset or `gateway`, **When** the poller runs,
   **Then** behaviour is identical to today (gateway pull, no cloud calls).
3. **Given** a cloud poll cycle, **When** the request is built, **Then** it
   includes `application_key`, `api_key`, `mac`, `call_back`, and unit ids that
   default to the app's display units (℉, mph, in, inHg, W/m²).
4. **Given** the cloud fetcher, **When** unit-tested, **Then** its success,
   timeout, and error paths are covered at 100%.

---

### User Story 2 - Cloud payload faithfully adapted to the gateway shape (Priority: P1)

As the system, I want the cloud `real_time` JSON faithfully translated into the
gateway `get_livedata_info` shape so the **existing** `normalizeToFullMetricMap`
mapper, validation, and projection accept it **unchanged**.

**Why this priority**: A raw cloud fetch is useless to the pipeline without the
adapter — the mapper parses `common_list`/`wh25`/`piezoRain` and would reject the
cloud envelope outright. This story makes the fetched data ingestible.

**Independent Test**: Feed a captured cloud `real_time` payload through the pure
adapter and assert the output passes `normalizeToFullMetricMap` and
`projectLiveReading` with no schema errors, including the two synthesized fields.

**Acceptance Scenarios**:

1. **Given** a valid cloud `real_time` payload, **When** it is run through the
   adapter, **Then** the output passes `normalizeToFullMetricMap` and
   `projectLiveReading` with no schema errors.
2. **Given** the adapter output, **When** pressure is examined, **Then** it is
   emitted in **inHg** (the mapper converts to hPa), while temperature, wind, and
   rain pass through in display units.
3. **Given** the adapter output, **When** the two cloud-absent fields are
   examined, **Then** `maxDailyGustMph` equals the current wind gust and
   `windAvg10mDirDeg` equals the current wind direction (Decision A).
4. **Given** rain on/off, **When** the adapter derives rain state, **Then**
   `isRaining` is `true` iff `rainfall_piezo.rain_rate > 0` (cloud has no
   `srain` flag), using the **piezo** rain group and **ignoring** the tipping
   bucket.
5. **Given** the adapter and its zod schema, **When** unit-tested, **Then** every
   mapped field, both synthesized fallbacks, and rain-on/rain-off are covered at
   100%.

---

### User Story 3 - Run LiveMock off-LAN and see real data on the dashboard (Priority: P1)

As the operator, I want to launch LiveMock **off-LAN** with a single compose
override and my Ecowitt credentials in a gitignored `.env`, and see **real,
current** household data on the dashboard.

**Why this priority**: This is the operator-facing payoff — the whole reason
LiveMock exists is to *see* the app running on real data from off-LAN. It ties
US1 and US2 together into a runnable, observable experience.

**Independent Test**: Bring the stack up with the LiveMock override and valid
credentials, open the dashboard, and confirm live (non-em-dash, non-stale) values
that refresh on the poll cadence — with no secrets committed to the repository.

**Acceptance Scenarios**:

1. **Given** valid credentials in a gitignored `.env`, **When** the stack is
   brought up with `docker compose -f docker-compose.yml -f docker-compose.livemock.yml up`,
   **Then** the web UI shows live values (not em-dashes, not stale) that refresh
   on the poll cadence.
2. **Given** the repository, **When** secrets are reviewed, **Then** no secrets are
   committed, `.env` is gitignored, and `.env.example` documents the required keys
   with placeholders.
3. **Given** the device's cloud upload interval, **When** successive polls run,
   **Then** the effective refresh rate is bounded by that interval (documented),
   and duplicate observations are ignored by the store.

---

### User Story 4 - Cloud-source failures degrade honestly (Priority: P2)

As the operator, I want cloud-source failures (bad key, non-zero `code`, timeout,
rate limiting) handled with the **same honest degradation** as gateway hiccups
(Feature 001 US9) — the pipeline keeps running and the UI never shows fabricated
data.

**Why this priority**: Resilience hardens the experience, but the happy path
(US1–US3) already delivers the core value; honest degradation is the safety net
that prevents the dev source from misleading the operator.

**Independent Test**: Drive the fetcher with a non-zero `code` envelope, a timeout,
and a rate-limit response and assert each is surfaced as a typed failure that skips
the cycle without crashing; then confirm sustained failure lets freshness lapse so
the UI shows em-dashes rather than fabricated zeros.

**Acceptance Scenarios**:

1. **Given** a cloud response with `code !== 0` (e.g. `40010 "Invalid application
   Key"`), **When** the fetcher processes it, **Then** the non-zero code is
   surfaced as a typed failure carrying the API message — **not** thrown.
2. **Given** a timeout, network error, or rate-limit response, **When** a cycle
   runs, **Then** the cycle is skipped via the existing error path without
   crashing the poller.
3. **Given** sustained cloud failure, **When** the store goes stale, **Then** the
   existing freshness logic degrades the UI to em-dashes — never fabricated zeros.
4. **Given** the fetcher error handling, **When** unit-tested, **Then** the
   error, timeout, and non-zero-code branches are covered at 100%.

---

### Edge Cases

- **Duplicate observations**: the cloud upload interval (often ~1 min) is longer
  than the LAN cadence, so successive polls may return an identical `time`. The
  store already rejects duplicate observations, so this is benign; the effective
  refresh rate is bounded by the device's upload interval, not `POLL_CADENCE_SECONDS`.
- **Partial payloads / `call_back` scope**: only the mapped groups (`outdoor`,
  `indoor`, `solar_and_uvi`, `rainfall_piezo`, `wind`, `pressure`) are consumed;
  any other groups returned by the cloud are ignored by the adapter.
- **Rate limiting**: keep cadence ≥ 30 s (the existing clamp suffices) to respect
  Ecowitt API limits; a rate-limit response is treated as a recoverable failure.
- **Missing credentials / misconfiguration**: with `POLLER_SOURCE=cloud` but
  absent/invalid credentials, startup configuration validation must fail loudly
  (consistent with the existing config-validation behaviour).
- **No-data window**: the cloud endpoint returns data only within the past ~2
  hours; an empty/`code:0`-but-no-data (or schema-invalid `data`) response is
  caught at the poller wiring and degrades like any other recoverable failure
  (FR-022), never crashing the poller.

## Requirements *(mandatory)*

### Functional Requirements

**Source switch & fetcher (US1)**

- **FR-001**: The poller MUST support a source switch `POLLER_SOURCE` with values
  `gateway` (default) and `cloud`; when unset or `gateway`, behaviour MUST be
  identical to Feature 001.
- **FR-002**: When `POLLER_SOURCE=cloud`, the poller MUST fetch live readings from
  the Ecowitt cloud API endpoint `GET https://api.ecowitt.net/api/v3/device/real_time`
  instead of the LAN gateway, wiring the cloud fetcher (and adapter) into the
  existing poll cycle.
- **FR-003**: The cloud fetcher MUST mirror the gateway client's typed result
  contract `{ ok: true, data } | { ok: false, error }` and MUST never throw on a
  failed fetch (using an `AbortController` timeout, like the gateway client).
- **FR-004**: The cloud request MUST include `application_key`, `api_key`, the
  device identifier (`mac`), `call_back`, and unit-id parameters that
  default to the app's display units: `temp_unitid=2` (℉), `wind_speed_unitid=9`
  (mph), `rainfall_unitid=13` (in), `pressure_unitid=4` (inHg),
  `solar_irradiance_unitid=16` (W/m²).
- **FR-005**: Pressure MUST be requested in **inHg** (`pressure_unitid=4`) because
  the existing mapper always interprets `wh25.abs`/`wh25.rel` as inHg (the adapter
  then emits inHg per FR-013).
- **FR-006**: Production behaviour MUST be unchanged: enabling LiveMock requires
  the explicit `POLLER_SOURCE=cloud` opt-in and MUST NOT alter the production LAN
  gateway path.

**Translation adapter (US2)**

- **FR-007**: A **pure** adapter MUST live in `packages/shared` (e.g.
  `cloudMapping.ts`) that converts a validated cloud `real_time` `data` object
  into a `get_livedata_info`-shaped object (`common_list[]` hex ids + `wh25` +
  `piezoRain`) that the existing `normalizeToFullMetricMap` accepts unchanged.
- **FR-008**: A zod schema for the cloud `real_time` response MUST be added (to the
  shared `schema.ts`) and the adapter MUST validate the cloud payload before
  translating it.
- **FR-009**: The adapter MUST map cloud fields to gateway targets exactly per the
  [Cloud → Gateway Field Mapping](#appendix-cloud--gateway-field-mapping)
  appendix.
- **FR-010**: The adapter MUST use the **piezo** rain group (`rainfall_piezo.*`)
  as the real rain source and MUST ignore the tipping-bucket group
  (`data.rainfall.*`).
- **FR-011**: The adapter MUST derive `isRaining` as `rainfall_piezo.rain_rate > 0`
  (the cloud payload has no `srain` flag).
- **FR-012**: The adapter MUST synthesize the two fields the cloud `real_time`
  endpoint does not provide (Decision A): `maxDailyGustMph` ← current
  `wind.wind_gust`; `windAvg10mDirDeg` ← current `wind.wind_direction`. The
  existing strict schema MUST NOT be relaxed.
- **FR-013**: The adapter MUST emit pressure values in inHg (the request side is
  FR-005) and pass temperature, wind, and rain values through in display units, so
  the existing unit-conversion logic (`inHgToHpa`, `toF`/`toMph`/`toIn`) behaves
  correctly without change.
- **FR-014**: Adapter output MUST pass `normalizeToFullMetricMap` and
  `projectLiveReading` with no schema errors.

**Off-LAN run & secrets (US3)**

- **FR-015**: A compose override `docker-compose.livemock.yml` MUST be provided
  (mirroring `docker-compose.mock.yml`) that sets `POLLER_SOURCE=cloud` and the
  cloud environment and includes **no** mock-gateway service, runnable via
  `docker compose -f docker-compose.yml -f docker-compose.livemock.yml up`.
- **FR-016**: The poller configuration MUST accept new environment variables:
  `POLLER_SOURCE`, `ECOWITT_APP_KEY`, `ECOWITT_API_KEY`, `ECOWITT_MAC`, and
  optional `ECOWITT_API_BASE_URL` (default `https://api.ecowitt.net`).
- **FR-017**: Credentials MUST be supplied via a **gitignored `.env`**; `.env`
  MUST be gitignored and `.env.example` MUST document the required keys with
  placeholders. No secrets are ever committed (Feature 001 FR-055).
- **FR-018**: With valid credentials, bringing up the LiveMock stack MUST surface
  live values on the web UI that refresh on the poll cadence (not em-dashes, not
  stale).
- **FR-019**: The effective refresh rate is bounded by the device's cloud upload
  interval and MUST be documented; the store MUST continue to ignore duplicate
  observations (identical `time`).
- **FR-020**: The poll cadence MUST remain ≥ 30 s (existing clamp) to respect
  Ecowitt API rate limits.

**Honest degradation (US4)**

- **FR-021**: A cloud response with a non-zero `code` (success is `code:0`) MUST
  be surfaced as a typed `{ ok: false, error }` failure carrying the API message
  — never thrown.
- **FR-022**: Timeouts, network errors, rate-limit responses, and a `code:0`
  response whose `data` is empty or fails the cloud zod schema (a partial or
  malformed payload, surfaced as an adapter validation error) MUST be treated as
  recoverable failures that log and skip the cycle (reusing the existing `onError`
  path in the poll cycle) without crashing the poller.
- **FR-023**: On sustained cloud failure, the store MUST go stale and the UI MUST
  degrade to em-dashes via the existing freshness logic — never fabricated zeros
  (the same honest degradation as gateway hiccups, Feature 001 US9).

**Quality**

- **FR-024**: The cloud fetcher, the shared adapter, and the new configuration
  parsing MUST have 100% unit-test coverage, including success, timeout, error,
  non-zero-code, every mapped field, the synthesized fallbacks, and rain-on/off.

### Key Entities *(include if feature involves data)*

- **Cloud `real_time` response**: the Ecowitt cloud envelope
  `{ code, msg, time, data }`, where `data` contains named nested groups
  (`outdoor`, `indoor`, `solar_and_uvi`, `wind`, `pressure`, `rainfall_piezo`, …)
  and each metric is an object `{ time, unit, value }`. Success is `code:0`;
  errors carry a non-zero `code` and `data:[]`.
- **Gateway-shaped payload (adapter output)**: a `get_livedata_info`-shaped object
  with `common_list[]` hex-id items (`{ id, val, unit? }`), a `wh25` group
  (indoor T/RH + barometric pressure in inHg), and a `piezoRain` group — the exact
  shape the existing mapper consumes.
- **Cloud source credentials**: `application_key`, `api_key`, and the device MAC;
  held only in a gitignored `.env`.
- **Typed fetch result**: `{ ok: true, data } | { ok: false, error }` — the shared
  contract between the cloud fetcher and the poll cycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With valid credentials and `POLLER_SOURCE=cloud`, an operator
  off-LAN sees real, current household readings on the dashboard within ~2 device
  cloud-upload intervals (≤ ~2 minutes) of starting the LiveMock stack.
- **SC-002**: With `POLLER_SOURCE` unset or `gateway`, the application behaves
  identically to before this feature (no observable production change, zero cloud
  calls).
- **SC-003**: 100% of the fields the existing pipeline requires are populated from
  a single cloud `real_time` poll (including the two synthesized fields), so a
  reading is stored with no schema errors on the first valid poll.
- **SC-004**: When the cloud source fails (bad key, non-zero code, timeout, or
  rate limit), the poller continues running and the dashboard degrades to
  em-dashes — never fabricated or zero values — within the existing staleness
  window.
- **SC-005**: A repository scan confirms no credentials are committed; `.env` is
  gitignored and `.env.example` carries only placeholders.
- **SC-006**: The cloud fetcher, shared adapter, and new config parsing reach 100%
  unit-test coverage.

## Assumptions

- The operator possesses a valid Ecowitt cloud `application_key`, `api_key`, and
  the device MAC, and the device is uploading to the Ecowitt cloud.
- `call_back` requests the six mapped groups (`outdoor,indoor,solar_and_uvi,rainfall_piezo,wind,pressure`)
  as a trimmed CSV to minimize payload; requesting `call_back=all` is also
  acceptable since the adapter ignores unmapped groups.
- The cloud is requested in the app's display units (℉, mph, in, inHg, W/m²) so the
  adapter needs minimal conversion and can pass values through with benign unit
  strings; the mapper's existing conversion logic remains the single source of
  truth for unit handling.
- The downstream pipeline (`normalizeToFullMetricMap`, validation, projection,
  store, API, web, freshness/staleness logic) is reused **unchanged**; this
  feature adds only an upstream fetcher, a shared adapter, configuration, and a
  compose override.
- The API tier already derives `dayHighF`, `dayLowF`, `windAvg10mMph`, and
  `maxDailyGustDir` from stored history (Feature 001 §7b); only `maxDailyGustMph`
  and `windAvg10mDirDeg` are hard ingest requirements and are handled by
  Decision A.
- The device's cloud upload interval (often ~1 min) bounds the effective refresh
  rate regardless of the configured poll cadence.

## Out of Scope

- Production ingestion — production stays on the LAN gateway (Feature 001).
- Historical/backfill ingestion from the cloud history endpoint.
- Any UI changes — LiveMock is purely a swap of the upstream data source.
- Relaxing the shared validation schema or making a second cloud call for the two
  missing fields (explicitly rejected in favor of Decision A).

## Appendix: Cloud → Gateway Field Mapping

The adapter MUST map cloud fields to the gateway-shaped targets the existing
mapper consumes exactly as follows (locked per Feature #11):

| Gateway target        | Hex/key (gateway shape) | Cloud source                |
| --------------------- | ----------------------- | --------------------------- |
| `outdoorTempF`        | `common_list 0x02`      | `outdoor.temperature`       |
| `outdoorHumidityPct`  | `common_list 0x07`      | `outdoor.humidity`          |
| `feelsLikeF`          | `common_list "3"`       | `outdoor.feels_like`        |
| `dewpointF`           | `common_list 0x03`      | `outdoor.dew_point`         |
| `windMph`             | `common_list 0x0B`      | `wind.wind_speed`           |
| `gustMph`             | `common_list 0x0C`      | `wind.wind_gust`            |
| `windDirDeg`          | `common_list 0x0A`      | `wind.wind_direction`       |
| `solarWm2`            | `common_list 0x15`      | `solar_and_uvi.solar`       |
| `uvIndex`             | `common_list 0x17`      | `solar_and_uvi.uvi`         |
| `indoorTempF`         | `wh25.intemp`           | `indoor.temperature`        |
| `indoorHumidityPct`   | `wh25.inhumi`           | `indoor.humidity`           |
| `pressureHpa`         | `wh25.abs` (inHg→hPa)   | `pressure.absolute`         |
| `relPressureHpa`      | `wh25.rel` (inHg→hPa)   | `pressure.relative`         |
| `rainEventIn`         | `piezoRain 0x0D`        | `rainfall_piezo.event`      |
| `rainRateInHr`        | `piezoRain 0x0E`        | `rainfall_piezo.rain_rate`  |
| `rainHourlyIn`        | `piezoRain 0x7C`        | `rainfall_piezo.hourly`     |
| `rainDailyIn`         | `piezoRain 0x10`        | `rainfall_piezo.daily`      |
| `rainWeeklyIn`        | `piezoRain 0x11`        | `rainfall_piezo.weekly`     |
| `rainMonthlyIn`       | `piezoRain 0x12`        | `rainfall_piezo.monthly`    |
| `rainYearlyIn`        | `piezoRain 0x13`        | `rainfall_piezo.yearly`     |
| `isRaining`           | `piezoRain srain_piezo` | **derive**: `rainfall_piezo.rain_rate > 0` |
| `maxDailyGustMph`     | `common_list 0x19`      | **synthesize (Decision A)**: current `wind.wind_gust` |
| `windAvg10mDirDeg`    | `common_list 0x6D`      | **synthesize (Decision A)**: current `wind.wind_direction` |
