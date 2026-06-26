# Phase 0 Research: Sky-condition day/night decoupled from the deprecated NWS icon

**Feature**: 003-condition-daynight · Consumed by `apps/api`. This document records the
decisions that resolve the spec's design questions. No `NEEDS CLARIFICATION` remained after
the agreed target design; the items below are the rationale behind that locked design.

---

## D1 — Source of day/night: household astro, not the NWS `icon` URL

**Decision**: Derive day vs night from the household's own `astro.sunriseUtc` /
`astro.sunsetUtc` (already computed by `computeAstro` via SunCalc), compared against `now`.
Stop reading `latest.properties.icon` entirely.

**Rationale**: The NWS observation `icon` field is **deprecated** and was observed
returning `null` at 11:40 AM Eastern on 2026-06-26, which made a clear midday sky resolve
to `night` (a moon) with a blank label, and it did not self-correct (spec User Story 1,
FR-002/FR-003). Day/night at a fixed location is **deterministic** from sunrise/sunset, so
relying on a remote, deprecated, intermittently-null field is both unnecessary and
incorrect. The astro instants are already in the envelope for the solar panel, so the
authoritative source is already on hand at resolution time (FR-001).

**Alternatives considered**:
- *Keep the icon URL but fall back to astro when it is `null`* — rejected: still couples
  correctness to a deprecated field, and produces two day/night code paths that can
  disagree (the very bug class we are removing). FR-003 requires the result be **identical**
  whether the icon field is a day URL, a night URL, or `null` — only full removal
  guarantees that.
- *A second NWS call (forecast `isDaytime`)* — rejected: extra network dependency for a
  value we compute locally for free; violates Simplicity/YAGNI and Offline-First.

---

## D2 — Boundary inclusivity: sunrise inclusive (day), sunset inclusive (night)

**Decision**: `isDaytime(now, sunriseUtc, sunsetUtc) = t >= Date.parse(sunriseUtc) &&
t < Date.parse(sunsetUtc)` where `t = now.getTime()`. So **exactly at sunrise → day**,
**exactly at sunset → night**. Documented in the function JSDoc and in data-model.md.

**Rationale**: The spec's Edge Case "exactly at sunrise/sunset" requires a well-defined,
deterministic, non-flickering boundary with **consistent inclusivity**. A half-open
interval `[sunrise, sunset)` gives every instant exactly one classification with no gap or
overlap, and the choice (sunrise belongs to day, sunset belongs to night) matches intuitive
"the day starts at sunrise and ends at sunset". SC-002 ("transitions … within the same
minute that the local clock passes sunset") is satisfied because the flip is exact at the
sunset instant.

**Alternatives considered**:
- *Closed interval `[sunrise, sunset]`* (both inclusive) — rejected: makes the sunset
  instant ambiguous (clear could be either), contradicting "well-defined boundary".
- *Open at sunrise `(sunrise, sunset)`* — rejected: leaves the sunrise instant as night,
  which reads wrong for a sky that is, by definition, lit at sunrise.

---

## D3 — Cache raw text only; resolve the icon at read time

**Decision**: `NwsClient.lastGood` caches `{ text: string; atMs: number }` (no icon).
`current(now)` returns `{ conditionText, conditionStale, hasObservation }`. The icon is
computed in `buildLatestSnapshot` at **read time** from the cached text + the read-time
`astro` + `now`.

**Rationale**: This is what makes FR-007 / SC-002 **automatic**. Today the icon is baked
into `lastGood.icon` at refresh time, so between fetches it cannot flip from `clear` to
`night` even when the clock crosses sunset. By caching only the (slowly-changing) text and
re-resolving day/night on every read, the displayed icon always reflects the current clock
with **no refetch** — the boundary crossing is free. `buildLatestSnapshot` is the right
home because it already computes `astro` and holds `now` (Single Responsibility: it owns
envelope assembly, and day/night is an assembly-time concern now).

**Alternatives considered**:
- *Keep resolving at refresh time and force a refresh near the boundary* — rejected: adds a
  scheduler/boundary-watcher, more network calls, and still races the clock. Strictly more
  complex than recomputing a pure function per read.

---

## D4 — `hasObservation` flag separates cold-start from an empty-text fetch

**Decision**: `ConditionState.hasObservation = lastGood !== null`. `buildLatestSnapshot`
branches on it: `!hasObservation` → cold-start (`null` icon, `null` text, `stale: true`);
otherwise resolve normally.

**Rationale**: After the reshape, `conditionText` can legitimately be `null` for **two
different reasons**: (a) no fetch has ever succeeded (cold start), and (b) a fetch succeeded
but returned empty text. These must behave differently — (a) shows the existing
"unavailable" state (icon null, stale), while (b) must still show a correct day/night icon
with the label omitted (FR-005/FR-006). A boolean that records "did we ever get an
observation" cleanly distinguishes them without overloading `conditionText`'s nullability.

**Alternatives considered**:
- *Use `conditionText === null` to mean cold-start and `""` to mean empty fetch* — rejected:
  fragile (an upstream that emits `null` vs `""` would flip behaviour) and conflates two
  concepts in one nullable string. An explicit boolean is clearer and fully testable.

---

## D5 — Empty text omits the label and does NOT force stale

**Decision**: In the resolved (non-cold-start) branch, `conditionText = text.trim() !== ""
? text : null`; `conditionStale` passes through from `current(now)` unchanged.

**Rationale**: FR-006 is explicit: an empty/missing `textDescription` must omit the label
(no blank placeholder) **and** must not grey the icon "solely because the text was empty".
Trimming-then-nulling omits the label cleanly; passing `conditionStale` through means
staleness is still decided only by **age** (D6), exactly as today, so an empty-text-but-fresh
observation shows a live (non-grey) day/night icon with no label (SC-003).

**Alternatives considered**:
- *Treat empty text as a failed fetch (stale)* — rejected: directly violates FR-006 and
  reproduces the original blank+grey symptom.

---

## D6 — Staleness stays age-based; cold-start "unavailable" unchanged

**Decision**: `conditionStale` is still `ageMs > staleAfterSeconds * 1000` in
`current(now)`, and the cold-start state (no successful fetch) is still icon `null`, text
`null`, `stale: true`. Only the *shape* of `ConditionState` changes, not these behaviours.

**Rationale**: FR-011 requires existing staleness and cold-start behaviour be preserved.
The day/night decoupling is orthogonal to staleness; keeping the age check verbatim avoids
regressing the "greys once it ages past the threshold" guarantee and the Edge Case "cached
observation that ages out".

**Alternatives considered**: none — this is a preservation constraint, not a design choice.

---

## D7 — Keyword/cloud precedence and the icon vocabulary are unchanged

**Decision**: `resolveConditionIcon` keeps the exact precedence of the old `conditionIcon`:
`thunder → snow/sleet/flurries/ice → rain/drizzle/shower → fog/haze/mist/smoke →
cloud|overcast (partly ? partly-cloudy : cloudy) → else isDaytime ? clear : night`. The
`ConditionIcon` enum (`clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm |
night`) is untouched.

**Rationale**: FR-008 and the spec's Out-of-Scope section require that **only the day/night
source** change; the keyword mapping and vocabulary stay identical so existing precipitation
/cloud behaviour and the web tier's icon assets keep working unchanged. The only structural
edit is swapping the final `observation.isDaytime` read for an `isDaytime(now, sunriseUtc,
sunsetUtc)` call.

**Alternatives considered**: none in scope.

---

## D8 — External contract preserved; change is internal only

**Decision**: `/api/v1/latest` still emits `conditionIcon | conditionStale | conditionText`
with the same types (`ConditionIcon | null`, `boolean`, `string | null`) and the same
`latestSnapshotSchema`. `packages/shared` and `apps/web` are not modified.

**Rationale**: Consumers (the wall display) must see no breaking change; this is a
correctness fix, not an API change. Keeping the envelope identical means the web tier needs
no redeploy logic change and the contract test in
[contracts/condition-envelope.md](./contracts/condition-envelope.md) is a *regression guard*
(it must still pass), proving the source swap is invisible externally.

**Alternatives considered**:
- *Expose `isDaytime` in the envelope* — rejected: YAGNI; the UI only needs the resolved
  icon, and the day/night decision is fully server-side.

---

## D9 — Test strategy: pure units + injected inputs, no live network

**Decision**: Author tests first (Red), covering: `isDaytime` (daytime / after-sunset /
before-sunrise / exact-sunrise / exact-sunset), `resolveConditionIcon` (each keyword,
cloud vs partly, clear-day, clear-night, empty-text-day, empty-text-night, and an
icon-field-independence assertion driven purely by text+astro), `createNwsClient`
(`hasObservation:false` cold start, text cache + TTL reuse/refetch, stale-by-age, failure
keeps last-good text), and `buildLatestSnapshot` (cold-start passthrough, empty-text label
omission **without** forced stale, and a single cached clear observation flipping
`clear`↔`night` across injected sunset/sunrise). All `now`/sunrise/sunset/text are injected;
the HTTP fetcher path is exercised in `nws.http.test.ts` with an injected `fetchImpl`.

**Rationale**: FR-010 and Test Data Separation require pure, network-free unit tests at
100% coverage. Because every new function is pure and takes its day/night inputs as
arguments, the boundary and empty-text edge cases are trivially reproducible without a
clock or a network, satisfying SC-004/SC-005.

**Alternatives considered**: none — mandated by the constitution.
