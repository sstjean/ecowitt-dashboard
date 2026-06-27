# Phase 1 Data Model: Sky-condition day/night decoupled from the deprecated NWS icon

**Feature**: 003-condition-daynight · Consumed by `apps/api` (`src/nws.ts`,
`src/routes/v1/latest.ts`). This document defines the **reshaped internal entities** and the
**preserved external envelope fields**. The `ConditionIcon` vocabulary, `AstronomicalData`,
and `latestSnapshotSchema` in `packages/shared` are **unchanged** — see the schema at
[packages/shared/src/schema.ts](../../packages/shared/src/schema.ts).

Legend: ➖ removed · ➕ added · ✏️ changed · ✅ unchanged.

---

## 1. `NwsObservation` — normalised NWS input (internal, `nws.ts`)

The shape the `ObservationFetcher` returns and the cache stores text from.

| Field | Before | After | Notes |
|-------|--------|-------|-------|
| `textDescription: string` | ✅ | ✅ | The supported NWS label, e.g. "Mostly Clear" (FR-004). |
| `isDaytime: boolean` | present | ➖ removed | Was derived from the deprecated `icon` URL. Gone entirely (FR-002/FR-003). |

```ts
// After
export interface NwsObservation {
  textDescription: string;
}
```

---

## 2. `LatestObservationResponse` — external NWS HTTP shape (internal, `nws.ts`)

The minimal slice of the NWS `/observations/latest` GeoJSON the fetcher parses.

| Field | Before | After | Notes |
|-------|--------|-------|-------|
| `properties.textDescription: string` | ✅ | ✅ | Mapped into `NwsObservation.textDescription`. |
| `properties.icon: string \| null` | present | ➖ removed | The deprecated field. No longer typed or read (FR-002). |

```ts
// After
interface LatestObservationResponse {
  properties: { textDescription: string };
}
```

The fetcher's return changes from
`{ textDescription, isDaytime: (icon ?? "").includes("/day/") }` to simply
`{ textDescription: latest.properties.textDescription }`.

---

## 3. `ConditionState` — what `NwsClient.current(now)` returns (internal, `nws.ts`)

The cache's view of the world. **No icon** — the icon is now resolved downstream.

| Field | Before | After | Notes |
|-------|--------|-------|-------|
| `conditionIcon: ConditionIcon \| null` | present | ➖ removed | Resolution moves to read time in `buildLatestSnapshot`. |
| `conditionText: string \| null` | ✅ | ✅ | Verbatim cached NWS text; `null` only at cold start here. |
| `conditionStale: boolean` | ✅ | ✅ | Still age-based (`ageMs > staleAfterSeconds*1000`), FR-011. |
| `hasObservation: boolean` | — | ➕ added | `lastGood !== null`. Separates cold-start from an empty-text fetch (D4). |

```ts
// After
export interface ConditionState {
  conditionText: string | null;
  conditionStale: boolean;
  hasObservation: boolean;
}
```

**State semantics**:

| Situation | `hasObservation` | `conditionText` | `conditionStale` |
|-----------|------------------|-----------------|------------------|
| Cold start (no successful fetch) | `false` | `null` | `true` |
| Fresh fetch, good text | `true` | the text | `false` |
| Fresh fetch, empty text (`""`) | `true` | `""` | `false` |
| Aged-out last-good | `true` | the text | `true` |

---

## 4. `NwsClient.lastGood` — internal cache record (internal, `nws.ts`)

| Field | Before | After | Notes |
|-------|--------|-------|-------|
| `icon: ConditionIcon` | present | ➖ removed | Not cached anymore; recomputed per read. |
| `text: string` | ✅ | ✅ | The cached NWS `textDescription`. |
| `atMs: number` | ✅ | ✅ | Fetch timestamp for age-based staleness. |

```ts
// After
let lastGood: { text: string; atMs: number } | null = null;
```

---

## 5. Pure functions (internal, `nws.ts`, exported, no network)

### 5a. `isDaytime(now, sunriseUtc, sunsetUtc): boolean` ➕

```ts
export function isDaytime(now: Date, sunriseUtc: string, sunsetUtc: string): boolean {
  const t = now.getTime();
  return t >= Date.parse(sunriseUtc) && t < Date.parse(sunsetUtc);
}
```

**Boundary rule (D2, FR-001)**: half-open interval `[sunrise, sunset)` — **sunrise instant
= day, sunset instant = night**, applied consistently. Total function; tolerant of any
valid ISO instants.

### 5b. `resolveConditionIcon(textDescription, now, sunriseUtc, sunsetUtc): ConditionIcon` ➕ (replaces `conditionIcon`)

Precedence is **identical** to the old `conditionIcon` (FR-008); only the final day/night
read changes from `observation.isDaytime` to `isDaytime(now, sunriseUtc, sunsetUtc)`:

| Order | Match (case-insensitive `includes`) | Result icon |
|-------|--------------------------------------|-------------|
| 1 | `thunder` | `thunderstorm` |
| 2 | `snow` / `sleet` / `flurries` / `ice` | `snow` |
| 3 | `rain` / `drizzle` / `shower` | `rainy` |
| 4 | `fog` / `haze` / `mist` / `smoke` | `fog` |
| 5 | `cloud` / `overcast` (and `partly`) | `partly-cloudy` |
| 5 | `cloud` / `overcast` (no `partly`) | `cloudy` |
| 6 | none of the above, daytime | `clear` |
| 6 | none of the above, night | `night` |

Empty `textDescription` falls through to rule 6, so an empty-text daytime sky → `clear`
(never `night`) — FR-005.

### 5c. `conditionIcon(observation)` ➖ removed

Replaced by `resolveConditionIcon`. Every call site (only `NwsClient.refresh` today) moves
to read-time resolution.

---

## 6. `UNAVAILABLE_CONDITION` — cold-start placeholder (internal, `latest.ts`)

| Field | Before | After |
|-------|--------|-------|
| `conditionIcon: null` | present | ➖ removed (no longer in `ConditionState`) |
| `conditionText: null` | ✅ | ✅ |
| `conditionStale: true` | ✅ | ✅ |
| `hasObservation: false` | — | ➕ added |

```ts
// After
const UNAVAILABLE_CONDITION: ConditionState = {
  conditionText: null,
  conditionStale: true,
  hasObservation: false,
};
```

---

## 7. Read-time resolution in `buildLatestSnapshot` (internal, `latest.ts`)

`buildLatestSnapshot` already computes `astro = computeAstro(lat, lon, now)` and holds
`now`. It now resolves the three **external** envelope condition fields from the
`ConditionState` plus `astro`:

```ts
// Pseudocode for the resolution block
let conditionIcon: ConditionIcon | null;
let conditionText: string | null;
let conditionStale: boolean;

if (!condition.hasObservation) {
  // Cold start — unchanged "unavailable" (FR-011)
  conditionIcon = null;
  conditionText = null;
  conditionStale = true;
} else {
  conditionIcon = resolveConditionIcon(
    condition.conditionText ?? "",
    now,
    astro.sunriseUtc,
    astro.sunsetUtc,
  );
  const trimmed = (condition.conditionText ?? "").trim();
  conditionText = trimmed !== "" ? condition.conditionText : null; // FR-006
  conditionStale = condition.conditionStale;                        // passthrough, FR-006
}
```

These three values flow unchanged into both the `no-data` and `ok` `latestSnapshotSchema.parse(...)`
calls, exactly as the current code wires `condition.conditionIcon/Stale/Text`.

---

## 8. External envelope condition fields — PRESERVED (`packages/shared`, unchanged)

| Field | Type | Status | Source after this feature |
|-------|------|--------|---------------------------|
| `conditionIcon` | `ConditionIcon \| null` | ✅ preserved | `resolveConditionIcon(text, now, astro)` at read time |
| `conditionStale` | `boolean` | ✅ preserved | age-based from `current(now)`, passthrough |
| `conditionText` | `string \| null` | ✅ preserved | trimmed cached text, `null` when empty/cold |

The `ConditionIcon` enum and `latestSnapshotSchema` are not edited. See
[contracts/condition-envelope.md](./contracts/condition-envelope.md).

---

## 9. Reused, unchanged entities

- `AstronomicalData` (`sunriseUtc`, `sunsetUtc`, `sunAltitudeFraction`, `moonPhase`) — the
  day/night source; produced by `computeAstro` (FR-001/FR-009). ✅
- `ConditionIcon` vocabulary (`clear | partly-cloudy | cloudy | fog | rainy | snow |
  thunderstorm | night`). ✅
- `NwsClient` surface (`current(now)`, `refresh(now)`), `NwsClientOptions`,
  `ObservationFetcher`, `createHttpObservationFetcher` (minus the `icon` read). ✅ (shapes
  preserved except the documented removals).
