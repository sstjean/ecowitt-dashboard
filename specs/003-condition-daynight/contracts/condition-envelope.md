# Contract: `/api/v1/latest` condition fields (PRESERVED)

**Feature**: 003-condition-daynight · **Status**: external contract **unchanged** — this is a
**regression guard**, not a new contract. The day/night source moves from the deprecated NWS
`icon` URL to the household astro context, but the wire format the wall display consumes is
byte-compatible before and after.

Schema of record: `latestSnapshotSchema` in
[packages/shared/src/schema.ts](../../../packages/shared/src/schema.ts) (not edited by this
feature).

---

## Condition fields in the `/api/v1/latest` envelope

| Field | Type | Meaning | Change |
|-------|------|---------|--------|
| `conditionIcon` | `"clear" \| "partly-cloudy" \| "cloudy" \| "fog" \| "rainy" \| "snow" \| "thunderstorm" \| "night" \| null` | Resolved sky-condition icon; `null` only before the first successful NWS fetch (cold start). | **Source only** — now resolved at read time from cached NWS text + household astro, no longer from the NWS `icon` URL. Type & vocabulary identical. |
| `conditionStale` | `boolean` | `true` when the last-good observation has aged past the staleness threshold, or at cold start. | Unchanged (age-based). NOT set `true` merely because the text was empty (FR-006). |
| `conditionText` | `string \| null` | Verbatim NWS label (e.g. `"Mostly Clear"`); `null` when the NWS text is empty/missing or at cold start. | Unchanged type. Empty text now yields `null` (label omitted), never a blank string (FR-006). |

These three fields appear in **both** envelope statuses (`status: "ok"` and
`status: "no-data"`), exactly as today.

---

## Behavioural contract (what callers may rely on)

1. **No NWS `icon` dependency** (FR-002/FR-003, SC-004): for otherwise-identical inputs, the
   emitted `conditionIcon`/`conditionText`/`conditionStale` are identical whether the
   upstream NWS `icon` field is a day URL, a night URL, or `null`. (The field is no longer
   read, so this is structurally guaranteed.)
2. **Day/night correctness** (FR-001/FR-005, SC-001): during local daytime a clear sky
   emits `conditionIcon: "clear"` — including when NWS text is empty — never `"night"`.
3. **Boundary flip without refetch** (FR-007, SC-002): with a single cached clear
   observation and no new fetch, `conditionIcon` transitions `"clear" → "night"` as `now`
   crosses sunset and back at sunrise. Boundary inclusivity: sunrise = day, sunset = night.
4. **Empty text omits the label** (FR-006, SC-003): when NWS text is empty, `conditionText`
   is `null` (no blank placeholder) and `conditionStale` is **not** forced `true` by the
   empty text alone.
5. **Keyword/cloud precedence preserved** (FR-008): rain/snow/thunder/fog/cloud keywords map
   to their icons independent of day/night, with the same precedence as before.
6. **Cold-start & staleness preserved** (FR-011): before the first successful fetch,
   `conditionIcon: null`, `conditionText: null`, `conditionStale: true`; a last-good icon
   greys by age as before.

---

## Example envelope (abridged, condition fields only)

```jsonc
// Clear midday, good text, NWS icon field was null (the old failure case)
{ "conditionIcon": "clear", "conditionStale": false, "conditionText": "Mostly Clear" }

// Clear midday, EMPTY NWS text — icon still correct, label omitted, not greyed
{ "conditionIcon": "clear", "conditionStale": false, "conditionText": null }

// Same cached clear observation read after sunset — flips to night, no refetch
{ "conditionIcon": "night", "conditionStale": false, "conditionText": "Mostly Clear" }

// Cold start — never fetched yet
{ "conditionIcon": null, "conditionStale": true, "conditionText": null }
```

---

## Contract test (regression guard)

The existing `apps/api/tests/latest.test.ts` assertions on these three fields MUST continue
to pass unchanged in shape (the JSON keys, types, and null semantics are identical).
New assertions are **added** for the empty-text and boundary-flip behaviours above, but no
existing external-shape assertion is removed — proving the internal source swap is invisible
to consumers.
