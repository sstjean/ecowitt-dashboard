# Feature Specification: Sky-condition day/night decoupled from the deprecated NWS icon

**Feature Branch**: `003-condition-daynight`

**Created**: 2026-06-26

**Status**: Draft

**Source of Truth**: GitHub Feature issue [#19](https://github.com/sstjean/ecowitt-dashboard/issues/19) and its User Story sub-issue [#20](https://github.com/sstjean/ecowitt-dashboard/issues/20) (repo `sstjean/ecowitt-dashboard`). This `spec.md` is a derived implementation tool. **If this document ever disagrees with #19 or #20, the issues win.**

**Input**: User description: "Sky-condition day/night decoupled from the deprecated NWS icon. Derive day/night from the household's own astro sunrise/sunset (not the deprecated NWS `icon` URL); keep the condition itself from the supported NWS `textDescription`; tolerate empty/missing text without falling through to a false `night`; remove all dependence on the deprecated NWS observation `icon` field."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Condition icon reflects real local day/night and tolerates missing NWS text (Priority: P1)

As the household watching the wall display, I want the sky-condition icon to match the actual time of day and current conditions, so that a clear noon never shows a moon and a brief gap in NWS data never blanks or falsifies the icon.

**Why this priority**: This is the entire feature. The deprecated NWS `icon` field (used today to decide day vs night) returns `null` intermittently. When it does, a clear midday sky renders as `night` (a moon) and an empty NWS `textDescription` leaves the label blank. This was observed in production on 2026-06-26 (host `homeautomation`, gateway mode): at ~11:40 AM Eastern the panel showed a night/moon icon with an empty condition label, and it did **not** self-correct over the following hour. Day/night is deterministic from the household's own sunrise/sunset, so it must never depend on a remote, deprecated field.

**Independent Test**: Can be fully tested by driving the pure condition mapping with injected inputs — an NWS `textDescription` value plus the household sunrise/sunset instants and a "current local time" — and asserting the resolved icon and label across daytime, after-dark, empty-text, precipitation-keyword, and sunrise/sunset-boundary cases, with no live network. Delivers a correct, resilient sky-condition icon end to end (mapping → API envelope → wall display).

**Acceptance Scenarios**:

1. **Clear day, good NWS text**: **Given** the current local (Eastern) time is between the household's sunrise and sunset and the most recent NWS `textDescription` is "Mostly Clear", **When** the condition is resolved, **Then** the icon is `clear` (daytime) and the label is "Mostly Clear".
2. **Clear day, EMPTY NWS text**: **Given** the current local time is daytime and the most recent NWS `textDescription` is empty (`""`) and/or the NWS observation `icon` is `null`, **When** the condition is resolved, **Then** the icon is `clear` (NOT `night`) and the label is omitted — no blank placeholder is shown and the icon is not prematurely greyed/stale.
3. **After dark, clear**: **Given** the current local time is after sunset or before sunrise and conditions are clear, **When** the condition is resolved, **Then** the icon is `night`.
4. **Precip/cloud keywords win regardless of day/night**: **Given** the NWS `textDescription` contains a rain, snow, thunder, fog, or cloud keyword, **When** the condition is resolved, **Then** the corresponding icon (`rainy` / `snow` / `thunderstorm` / `fog` / `cloudy` / `partly-cloudy`) is shown independent of day or night.
5. **Boundary crossing without a new fetch**: **Given** a cached clear NWS observation and no new NWS request, **When** the local clock crosses sunset (and later sunrise), **Then** the icon flips `clear` → `night` (and back to `clear`) on time, without requiring a fresh NWS fetch.
6. **No NWS `icon` dependency**: **Given** otherwise identical inputs, **When** the NWS observation `icon` field is a day URL, a night URL, or `null`, **Then** the resolved icon and label are identical in all three cases.
7. **Eastern astro basis (FR-009)**: **Given** the household sunrise/sunset instants already computed for the solar panel, **When** day vs night is decided for the condition icon, **Then** it is reckoned on the same `America/New_York` (Eastern) basis as the solar panel — storage stays UTC and display stays Eastern — with no separate timezone source introduced.
8. **Pure and offline (FR-010)**: **Given** injected `textDescription`, `sunriseUtc`, `sunsetUtc`, and `now`, **When** the condition is resolved, **Then** the result is computed with no network access and is deterministic (identical inputs always yield the identical icon and label).
9. **Staleness and cold-start preserved (FR-011)**: **Given** a last-good observation that has aged past the configured staleness threshold (or no successful fetch yet at cold start), **When** the condition is read, **Then** the existing behaviour is unchanged — the last-good icon greys (stale) by age, and before the first successful fetch the state is “unavailable” (no icon, no label, marked stale).

---

### Edge Cases

- **Null `icon` at midday** (the production failure): a clear-sky observation whose `icon` is `null` MUST resolve to `clear` in the daytime, never `night`.
- **Empty `textDescription`**: the condition still resolves clear-day vs night from astro; the text label is omitted entirely (no blank string rendered as a label, and the icon is not marked stale solely because the text was empty).
- **Exactly at sunrise / sunset**: the day/night boundary is well-defined and deterministic at the sunrise and sunset instants (no flicker or ambiguous state); the chosen boundary inclusivity is applied consistently.
- **Cached observation that ages out**: an observation that has not been refreshed past the configured staleness threshold still greys (becomes stale) by age as it does today; the day/night decoupling does not change existing staleness behaviour.
- **No NWS observation yet** (cold start, before the first successful fetch): the existing "condition unavailable" state is unchanged — no icon, no label, marked stale.
- **Mixed-keyword text** (e.g. "Partly Cloudy" vs "Mostly Clear"): keyword/cloud-cover precedence is unchanged from today; only the day/night source changes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Day vs night for the sky-condition icon MUST be derived from the household's own astro sunrise and sunset instants (the same `sunriseUtc`/`sunsetUtc` already computed for the solar panel), compared against the current local (Eastern) time.
- **FR-002**: The sky-condition icon MUST NOT use the NWS observation `icon` URL (or any `/day/` string match within it) to decide day vs night, or for any other purpose.
- **FR-003**: All dependence on the deprecated NWS observation `icon` field MUST be removed from condition resolution; the resolved icon and label MUST be identical whether that field is a day URL, a night URL, or `null`.
- **FR-004**: The condition itself (clear / partly-cloudy / cloudy / fog / rainy / snow / thunderstorm) MUST continue to be sourced from the supported, non-deprecated NWS `textDescription`.
- **FR-005**: When the NWS `textDescription` is empty or missing, the condition MUST still resolve clear-day vs night correctly from astro (a clear daytime sky MUST resolve to `clear`, never `night`).
- **FR-006**: When the NWS `textDescription` is empty or missing, the human-readable condition label MUST be omitted (no blank/placeholder label rendered), and the icon MUST NOT be marked stale solely because the text was empty.
- **FR-007**: With a cached NWS observation and no new fetch, the resolved icon MUST flip `clear` ↔ `night` as the current local time crosses sunset and sunrise, so the displayed icon stays correct between NWS refreshes.
- **FR-008**: Precipitation, thunder, fog, and cloud-cover conditions MUST map to their corresponding icons independent of day/night, preserving the existing keyword/cloud-cover precedence.
- **FR-009**: The day/night reckoning MUST use the same `America/New_York` (Eastern) basis as the solar panel; storage remains UTC and display remains Eastern, unchanged.
- **FR-010**: The condition-to-icon mapping MUST remain a pure function unit-testable with injected inputs (NWS text, astro sunrise/sunset, and current time) without any live network access.
- **FR-011**: Existing condition staleness behaviour (greying a last-good icon once it ages past the configured threshold, and the cold-start "unavailable" state before the first successful fetch) MUST be preserved.

### Key Entities *(include if feature involves data)*

- **NWS observation (normalised)**: The latest condition reading consumed by the mapping. Carries the supported `textDescription`. It MUST NO LONGER carry a derived day/night flag sourced from the deprecated `icon` URL; the `icon` URL is not consumed.
- **Astro context**: The household's sunrise and sunset instants (already computed for the solar panel) plus the current local time, used to decide day vs night for the condition icon.
- **Resolved condition state**: The output shown on the wall display — an icon from the fixed vocabulary (`clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm | night`), an optional text label (omitted when NWS text is empty/missing), and a staleness flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a clear-sky observation during local daytime, the displayed icon is `clear` in 100% of cases, including when the NWS observation `icon` field is `null` (the production failure no longer reproduces).
- **SC-002**: With a single cached clear observation and no additional NWS fetches, the resolved icon is `night` on the first `/api/v1/latest` read taken after the local clock passes sunset (and `clear` again on the first read after sunrise) — i.e. the icon is correct on every read, not echoed from the last fetch. (The wall display's worst-case lag is then bounded by the web tier's poll interval, which is outside this feature's `apps/api` scope.)
- **SC-003**: When the NWS `textDescription` is empty, no blank or placeholder condition label is ever displayed, and the icon still correctly reflects day vs night.
- **SC-004**: The resolved icon and label are byte-for-byte identical across three observations that differ only in their NWS `icon` field (day URL, night URL, `null`).
- **SC-005**: The condition mapping and resolution are fully exercised by tests with injected inputs and no live network, meeting the project's 100% coverage gate.

## Assumptions

- The household sunrise/sunset instants currently computed for the solar panel are available at the point where the condition icon is resolved, and are accurate enough to decide day vs night for icon purposes.
- The supported NWS `textDescription` field remains available and is the intended long-term source for the condition keyword (this feature does not replace NWS as the condition source).
- The existing condition-icon vocabulary (`clear | partly-cloudy | cloudy | fog | rainy | snow | thunderstorm | night`) is unchanged; only the source of the day/night decision changes.
- "Current local time" for the day/night decision is the same clock used elsewhere on the dashboard (Eastern), and crossing the sunrise/sunset boundary is evaluated each time the condition is read so it updates between NWS refreshes.

## Out of Scope

- Changing the condition-icon vocabulary itself (the keyword set stays the same).
- Replacing NWS as the source of the condition keyword/`textDescription`.
- Any change to UTC storage or to the Eastern display convention beyond reusing the existing astro day/night reckoning for the condition icon.
