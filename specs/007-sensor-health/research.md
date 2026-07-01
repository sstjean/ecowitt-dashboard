# Phase 0 Research: Sensor Battery & Signal Health (007)

**Branch**: `007-sensor-health` | **Date**: 2026-06-30

This document resolves the six design decisions (D1–D6) the plan depends on. Every
threshold below ships as a **tunable named constant** (`SENSOR_HEALTH_DEFAULTS` in
`packages/shared/src/schema.ts`), not a magic number. The per-type battery rules and the
sensor→card map are pinned against the **verified live gateway snapshot** (2026-06-29).

## Method & Provenance

- **Endpoint verified feasible 2026-06-29**: `GET http://<gateway>/get_sensors_info?page=1`
  and `?page=2` return the per-sensor battery/signal data that is **absent** from
  `get_livedata_info`. Confirmed against the gateway on the IoT VLAN with `curl` (the
  gateway ignores ICMP; never `ping`).
- **Live registered set** on our GW2000B (the fixtures are de-identified static captures of
  this exact shape — hex radio ids only, no PII):

| Sensor | `img` | `type` | `id` | `signal` | `batt` | `rssi` | `idst` | Backs |
|--------|-------|-------:|------|:--------:|:------:|------:|:------:|-------|
| **WS90** | `wh90` | 48 | `12FAD` | 4 | 5 (0–5 level) | −74 | 1 | outdoor temp/hum, wind, rain (piezo), solar |
| **wh31 CH2** | `wh31` | 7 | `A0` | 4 | 0 (0/1 flag) | −96 | 1 | extra temp/hum channel |
| **wh25** | `wh25` | 4 | — | — | — (wired) | — | — | indoor temp/hum + barometer (wired to console) |

- All other rows carry placeholder ids `FFFFFFFF` / `FFFFFFFE` (= **not paired**) and are
  excluded from the served set (FR-003).
- **Data hygiene**: only de-identified static captures of the `get_sensors_info` response are
  committed as fixtures. Per the Constitution (Test Data Separation), tests **never** read the
  live gateway or DB at runtime.

---

## D1 — Where does the health snapshot come from? (the architecture decision)

**Question**: `get_sensors_info` is on the gateway. Should the **API** fetch it directly when
building `/latest`, or should the **poller** fetch it and persist a snapshot the API reads?

**Decision**: **The poller fetches + normalizes + persists a single-row snapshot; the API
reads that row.** The web flow is `poller → store → api → web`, identical to readings.

**Rationale — this is forced by the Constitution, not a preference**:

> **Platform Constraints → "Single Cross-VLAN Consumer" (NON-NEGOTIABLE)**: *"The ingestion
> service MUST be the ONLY component that crosses the main→IoT boundary, preserving a single
> auditable firewall pinhole (main host → gateway:80). Other consumers MUST receive data on
> the main network, never by reaching into the IoT VLAN."*

The API runs on the main network and reaches NWS over HTTPS (allowed outbound enrichment), but
it **must not** reach into the IoT VLAN. Having the API call `get_sensors_info` would open a
second main→IoT path and violate the boundary. Therefore the poller — already the sole
cross-VLAN consumer — is the only place the fetch may live.

**Storage shape**: a **dedicated single-row table** `sensor_health(id=1, captured_at TEXT,
sensors_json TEXT)`, upserted each successful cycle. This:
- honors **FR-016** ("MUST NOT introduce a sensor-health history table … only the current live
  snapshot is stored") — it is a *current-state cache*, one row, no time series;
- keeps the API's `/latest` a pure store read, so it still works when the poller is down (the
  snapshot simply ages → `stale`, mirroring how readings go stale);
- is bootstrapped idempotently by both writer (poller) and reader (API), so an API cold start
  before the first poll returns `null` → `available: false` (FR-012 honest-unknown).

**Alternatives considered**:
- *API fetches `get_sensors_info` directly* — **rejected**: violates Single Cross-VLAN
  Consumer (NON-NEGOTIABLE). Non-starter.
- *Stuff health into `readings.metrics_json`* — **rejected**: `readings` is keyed
  `UNIQUE(observed_at)` and its `fullMetricMapSchema` only permits `string | number` values
  (an array of sensor objects would not validate), and health is per-poll *fleet* state, not a
  per-observation metric. Mixing pollutes the historical metric map and conflates two
  responsibilities (SRP). A dedicated single-row snapshot is cleaner.
- *A new `/api/v1/sensors` endpoint* — **rejected** (YAGNI / FR-006): the web needs no separate
  cadence; the set rides the existing `/latest` envelope like Feature 008 did.

---

## D2 — Battery normalization: per-type rules + `Low` thresholds

**Problem**: `batt` has **sensor-type-dependent semantics**. WS90 reports a 0–5 *level*; wh31
reports a 0/1 *low-flag*; wh25 is wired and reports *none*. Rendering a flag or a wired sensor
as "0% empty" is a defect (spec edge cases, FR-005, SC-004).

**Decision**: a small typed **per-type battery-rule registry** keyed by numeric `type`, with a
safe fallback. Battery projects to `OK | Low | Unknown | N/A`.

| `type` | Model | Scale | Rule → status | Pinned threshold |
|-------:|-------|-------|---------------|------------------|
| 48 | WS90 (`wh90`) | level 0–5 | `batt ≤ WS90_BATTERY_LOW_MAX` ⇒ `Low`, else `OK` | `WS90_BATTERY_LOW_MAX = 1` |
| 7 | wh31 | flag 0/1 | `batt === 1` ⇒ `Low`, `batt === 0` ⇒ `OK` | n/a (binary) |
| 4 | wh25 | wired/none | always `N/A` (no battery) | n/a |
| *other* | unknown | unknown | `Unknown` (never fabricate a level) | n/a |
| *(any, health unobtainable)* | — | — | `Unknown` | n/a |

`SENSOR_HEALTH_DEFAULTS = { WS90_BATTERY_LOW_MAX: 1, ... }` (tunable).

**Rationale for the thresholds** (against the live snapshot + spec assumptions):
- **WS90 `Low` at ≤ 1 of 5** — the spec deferred the exact level to plan-level; the user
  technical context fixes it at "WS90 battery ≤ 1 of 5 = Low." The live WS90 reads `5` (full)
  → `OK`, far from the boundary, so the snapshot validates the healthy path; boundary tests
  cover `1` (Low) and `2` (OK).
- **wh31 flag polarity 0 = OK / 1 = Low** — the live wh31 (`A0`) reports `batt: "0"` while it
  is plainly working (signal 4/4) → `0` must mean **OK**, so `1` means **Low**. This is the
  documented Ecowitt low-battery-flag convention and is consistent with the only live evidence
  we have. *(Assumption, evidence-backed; recorded as such — see Open Items.)*
- **wh25 wired ⇒ `N/A`** — it has no radio battery at all; `N/A`, never `Low` or `0%`.
- **Unknown-type ⇒ `Unknown`** — we will not guess a scale we have not verified; fabricating a
  level for an untyped sensor is exactly the defect FR-005 forbids. YAGNI also: we model the 3
  types we actually have, plus a safe fallback, not a universal sensor database.

**`batteryRaw`** (the original numeric `batt`) is carried on the record for derivation/debug
but is **never** the rendered value — the UI keys off the `battery` enum.

**Alternatives considered**: a single global "0–5 means percentage" mapping — **rejected**: it
is precisely what produces the misleading "0% empty" for flag/wired sensors.

---

## D3 — Staleness: `available` / `stale` semantics + threshold

**Decision**: the **API** computes two booleans on the envelope object (mirroring the existing
server-side `conditionStale` pattern, so the web stays a pure presenter):

| State | `available` | `stale` | When |
|-------|:-----------:|:-------:|------|
| Cold start (no snapshot row yet) | `false` | `true` | API up before first successful poll, or `sensor_health` empty |
| Fresh | `true` | `false` | snapshot `captured_at` within `SENSOR_HEALTH_STALE_SECONDS` of `now` |
| Stale (last-known) | `true` | `true` | a snapshot exists but `captured_at` is older than the threshold (poller wedged / fetch failing) |

`SENSOR_HEALTH_STALE_SECONDS = 300` (5 min, tunable). **Rationale**: at the 30–60 s poll
cadence, 300 s tolerates ~5–10 missed health fetches before declaring stale — enough to ride
out a transient gateway timeout without flapping, short enough that a genuinely wedged poller
surfaces quickly. 300 s matches the container-watchdog freshness floor (Feature 009) for
operator consistency.

**Render rule (FR-012/FR-013)**: when `stale` is `true` **or** `available` is `false`, the UI
presents the affected sensors in an explicit **`Unknown`/stale** visual state (cards: a neutral
"unknown" indicator, *not* empty bars implying "no signal"; page: a stale badge). The per-entry
last-known values are still carried for debugging, but the presenter keys off `stale`/`available`
— it never shows aged values as if current.

**Alternatives considered**: compute staleness web-side via `deriveFreshness` (as panels do) —
viable, but putting it server-side mirrors `conditionStale`, single-sources the threshold, and
keeps the web dumb. Chosen for consistency.

---

## D4 — Sensor → card mapping (US2 / FR-008)

**Decision**: a static `sensorCardMap` associating each `data-panel` card to its backing radio
id. One WS90 backs four cards; the wired wh25 backs two (no radio). wh31 CH2 has **no card** in
the current single-kiosk layout — it appears only on the US3 health page.

| Card (`data-panel`) | Backing sensor | Radio indicator? |
|---------------------|----------------|:----------------:|
| `outdoor` (temp/hum + wind + out-metrics) | WS90 `12FAD` | yes (signal + battery from the one WS90) |
| `solar` | WS90 `12FAD` | yes (same WS90 record) |
| `rain` | WS90 `12FAD` | yes (same WS90 record) |
| `indoor` | wh25 (wired) | **no** → `N/A` battery, no signal |
| `baro` | wh25 (wired) | **no** → `N/A` battery, no signal |

**Rationale (FR-008)**: the outdoor/wind/solar/rain cards are all driven by the single WS90
array, so they reflect **one** sensor's health — they must not imply four independent radios.
The indicator helper is given the WS90 record for all four. The wired wh25 cards get a
no-radio/`N/A` rendering (FR-009). wh31 CH2 is intentionally card-less (no UI surface for the
extra channel today) — it is still listed on the health page (US3) because it is a registered
sensor.

**Alternatives considered**: deriving the map dynamically from `idst`/type — **rejected**
(YAGNI): the physical wiring of cards→sensors is fixed and known; a static map is the simplest
sufficient design and is trivially testable.

---

## D5 — US3 page placement that preserves the single-viewport kiosk e2e

**Constraint**: `apps/web/e2e/kiosk.spec.ts` asserts the dashboard at 2160×1440 has **no
vertical scroll** (`scrollHeight − clientHeight ≤ 1`). The app is currently a single
router-less kiosk view. A naïvely-added health section would push content past the viewport and
break that test.

**Decision (confirmed with Steve 2026-06-30)**: the Sensor Health page is reached through the
**existing header hamburger menu** — not a new affordance. The header already renders a
hamburger button that toggles `nav.h-nav` with placeholder items (Live / History / Trends /
Records / Settings). US3 **adds a "Sensors" nav item** to that existing menu; selecting it
opens the Sensor Health view as an **overlay panel that is hidden by default**. Hidden-by-default
means the **default kiosk layout is byte-for-byte unchanged**, so the kiosk no-scroll test stays
green without modification. When toggled open, the overlay covers the stage (`position: fixed`,
its own scroll context if needed) and lists every registered sensor; selecting "Live" (or
closing) restores the kiosk view. No client-side router is introduced (YAGNI); the toggle flips
a `hidden`/class on the overlay element.

**Menu legibility + touch upgrade (part of US3, per Steve)**: the current menu is too small for
the wall kiosk — `.nav-item` text is **14px** and the hamburger's effective touch area/icon feel
tiny. US3 enlarges the hamburger touch target + icon prominence and bumps the nav-item font size
and hit areas to be comfortably touch-friendly and legible at wall-display distance. This is a
small, contained legibility fix bundled with adding the "Sensors" entry (the menu is the access
path, so it ships fixed). Respect the existing kiosk legibility contract (004) and the
`--cp-*` tokens.

**Test guard**: the US3 page tests assert the overlay is `hidden` on load (kiosk default
intact) and visible after choosing "Sensors"; `kiosk.spec.ts` is left asserting no-scroll on the
default view (a regression guard that the overlay does not leak into the kiosk layout).

**Rationale**: it satisfies "dedicated in-dashboard page" (#25) by extending the navigation the
app already has, without a router, without touching the kiosk default layout, and without
breaking the legibility/no-scroll contract.

**Alternatives considered**:
- *Always-visible health strip on the dashboard* — **rejected**: would overflow the fixed
  kiosk viewport and break `kiosk.spec.ts`.
- *Client-side hash router with a `/health` route* — viable but adds routing machinery (YAGNI)
  for one extra view; the toggleable overlay is simpler.

---

## D6 — LiveMock / cloud-source behavior

**Decision**: `get_sensors_info` is a **gateway-only** endpoint. When `POLLER_SOURCE=cloud`
(LiveMock), there is no gateway to fetch it from, so the poller simply **does not write a
health snapshot** and the API serves `available: false` (Unknown) — the same honest-degradation
path as a failed fetch (US4/FR-012). No fabricated cloud health is invented.

**Rationale**: keeps the cloud path a clean subset; Unknown is the correct, honest state when
the data source structurally cannot provide health. The web already renders Unknown.

---

## Resolved Open Items (assumptions recorded, not blockers)

These were deferred from the spec to plan-level and are now pinned. None block implementation;
each is a tunable default or an evidence-backed assumption. *(Per /speckit rules, the spec/issues
remain the source of truth — these are recorded here, not silently changed in the spec.)*

| Item | Resolution | Confidence |
|------|------------|------------|
| WS90 `Low` level | `batt ≤ 1` of 5 (tunable `WS90_BATTERY_LOW_MAX`) | High — matches user technical context |
| wh31 flag polarity | `0 = OK`, `1 = Low` | High — live `A0` reads `0` while working |
| Staleness threshold | `300 s` (tunable `SENSOR_HEALTH_STALE_SECONDS`) | Med — operator-consistent default |
| US3 placement | new "Sensors" item in the **existing hamburger menu** → hidden-by-default overlay (no router); + menu touch/legibility upgrade | **Confirmed** (Steve 2026-06-30) |
| Cloud source | no snapshot ⇒ `available: false` (Unknown) | High — endpoint is gateway-only |

> **Note for /speckit.tasks**: there are **no `[NEEDS CLARIFICATION]` blockers**. The staleness
> default (`300 s`) is the one remaining medium-confidence tunable; US3 placement is now
> **confirmed** (existing hamburger menu + touch/legibility upgrade). Flag staleness for a quick
> confirm during review but do not block.
