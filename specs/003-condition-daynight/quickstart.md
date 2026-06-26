# Quickstart: verify the day/night condition fix

**Feature**: 003-condition-daynight · This guide validates the feature end to end —
pure mapping → API envelope → wall display — and the redeploy to the household host. It is a
**validation guide**, not an implementation guide; concrete edits live in `tasks.md`.

Prerequisites: repo checked out on branch `003-condition-daynight`; Node 22 + npm; Docker
(for the redeploy step); LAN access to host `192.168.10.5`.

---

## 1. Unit tests + 100% coverage (no network)

The whole feature is exercised by pure unit tests with injected inputs (FR-010,
Test Data Separation). Run the API workspace tests with coverage:

```bash
npm --workspace apps/api run test:coverage
```

**Expect**: all suites green; coverage **100%** for `apps/api/src/nws.ts` and
`apps/api/src/routes/v1/latest.ts`. Key cases that must be present and passing:

- `isDaytime`: daytime `true`; after-sunset `false`; before-sunrise `false`; **exact
  sunrise** `true` (day); **exact sunset** `false` (night). (D2)
- `resolveConditionIcon`: each keyword (`thunderstorm/snow/rainy/fog`), `cloudy` vs
  `partly-cloudy`, clear-day → `clear`, clear-night → `night`, **empty-text day → `clear`**
  (not `night`), empty-text night → `night`, and an **icon-field-independence** case driven
  only by text+astro. (FR-005/FR-008, SC-004)
- `createNwsClient`: cold start → `{ conditionText: null, conditionStale: true,
  hasObservation: false }`; text cached & reused within TTL, refetched past it; last-good
  text kept on failure and greyed by age. (FR-011)
- `buildLatestSnapshot`: cold-start passthrough (`null/null/true`); **empty-text →
  `conditionText: null` with `conditionStale` NOT forced true** (FR-006); a single cached
  clear observation flips `clear → night` across an injected sunset and back at sunrise
  (FR-007, SC-002).

## 2. Type-check parity

```bash
npm --workspace apps/api run typecheck
```

**Expect**: clean. The `ConditionState` reshape (drop `conditionIcon`, add `hasObservation`)
makes `tsc` flag any consumer that still reads the old shape — there should be none left.

---

## 3. API end — curl the live envelope (manual, live data)

Run the API locally (or hit the deployed one) and inspect the condition fields:

```bash
curl -s http://localhost:8080/api/v1/latest | jq '{conditionIcon, conditionStale, conditionText, sunrise: .astro.sunriseUtc, sunset: .astro.sunsetUtc, serverTime}'
```

**Expect** (during local Eastern daytime, clear sky): `conditionIcon: "clear"` (NOT
`"night"`), a sensible `conditionText` or `null` if NWS text is empty, `conditionStale:
false` once a fetch has landed, and `serverTime` between `sunriseUtc` and `sunsetUtc`.

**The production failure must NOT reproduce**: a clear midday reading whose upstream NWS
`icon` is `null` resolves to `"clear"`, never `"night"` (SC-001).

To prove boundary behaviour without waiting for real sunset, drive the pure functions
directly (this is what the unit tests automate):

```bash
node --experimental-strip-types -e '
import { resolveConditionIcon } from "./apps/api/src/nws.ts";
const sr = "2026-06-26T09:30:00Z", ss = "2026-06-27T00:25:00Z";
console.log("noon  ", resolveConditionIcon("Mostly Clear", new Date("2026-06-26T16:00:00Z"), sr, ss)); // clear
console.log("dusk  ", resolveConditionIcon("Mostly Clear", new Date("2026-06-27T00:30:00Z"), sr, ss)); // night
console.log("empty ", resolveConditionIcon("",             new Date("2026-06-26T16:00:00Z"), sr, ss)); // clear
'
```

---

## 4. UI end — wall display visual QA (Playwright/Chrome)

Open the dashboard in Chrome (Playwright), screenshot it, and inspect as the household would:

- During daytime, a clear sky shows the **sun/clear** icon, **not a moon** (the bug).
- When NWS text is empty, **no blank label** is rendered under the icon, and the icon is not
  greyed solely for that reason (FR-006, SC-003).
- Times/labels remain in Eastern (storage UTC / display Eastern, FR-009 — unchanged).
- No console errors / failed network calls.

---

## 5. Redeploy to the household host (after Green)

Rebuild the `api` image for amd64 and ship it to `192.168.10.5` (ship-images flow), then
confirm the live envelope on the host shows the corrected `conditionIcon` for the current
time of day. Use an explicit immutable image tag so rollback to the prior image is possible
(DevOps gate).

**Done when**: unit tests + coverage 100% green, typecheck clean, the live envelope returns
the correct day/night icon (including the empty-text and `icon: null` cases), the wall
display shows the sun (not a moon) at midday with no blank label, and the rebuilt `api`
image is running on `192.168.10.5`.
