# Phase 1 Data Model: Rainfall-Card Cue Layout Refinement (010)

**Feature**: `010-rainfall-cue-layout` | **Date**: 2026-07-01

## No data-model changes

This feature introduces **no new entities, no schema changes, and no changes to
any data contract**. It is a purely presentational (markup + CSS) refinement of
how three already-existing fields are laid out on the rainfall card.

- **Storage**: unchanged (SQLite, `apps/api` / `apps/poller`) — not touched.
- **API envelope** (`/api/v1/latest`): unchanged — no new/renamed/removed fields.
- **Shared package** (`@ecowitt/shared` `LatestSnapshot`): unchanged.

## Consumed (existing) fields

The rainfall card continues to derive both cues **solely** from fields that
already flow through [apps/web/src/render/index.ts](../../apps/web/src/render/index.ts)
into `renderRainfall` (via `RainData`):

| Field | Type | Source | Role (unchanged) |
|-------|------|--------|------------------|
| `reading.isRaining` | `boolean` | `/api/v1/latest` reading | Drives "Raining now" cue (when not suspect) |
| `snapshot.rainSensorSuspect` | `boolean` | `/api/v1/latest` snapshot | Drives fault overlay; suppresses "Raining now" |
| `snapshot.rainSensorReason` | `string \| null` | `/api/v1/latest` snapshot | Fault overlay body text (may be empty/absent) |

`RainData` (the `renderRainfall` input interface in
[apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts)) is
**unchanged**: same `rainDailyIn`, `rainRateInHr`, the six totals, `isRaining`,
`rainSensorSuspect`, `rainSensorReason`.

## Derived view state (presentation only, not persisted)

Only the **visual state machine** that maps the three fields to markup changes.
This is rendering logic, not a data model, but is recorded here for completeness:

| Precedence | Condition | Rendered result |
|-----------|-----------|-----------------|
| 1 (highest) | `rainSensorSuspect === true` | Fault overlay shown (centered, full-card); `.rain-body` dimmed; "Raining now" banner suppressed. `isRaining` ignored. |
| 2 | `!rainSensorSuspect && isRaining === true` | "Raining now" banner shown inside `.rain-main` above Daily Rain; no overlay; body not dimmed. |
| 3 (default) | `!rainSensorSuspect && isRaining === false` | Dry state: no banner, no overlay, no dim; Daily Rain in normal position. |

**Invariant** (unchanged from Feature 008): states 1 and 2 are mutually
exclusive — the overlay and the banner never render simultaneously.
