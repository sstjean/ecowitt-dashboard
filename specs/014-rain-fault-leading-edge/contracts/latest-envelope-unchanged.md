# Contract: `/api/v1/latest` Envelope — UNCHANGED

**Branch**: `014-rain-fault-leading-edge` | **Date**: 2026-07-06

This document exists to state **explicitly** that Feature 014 introduces **no change** to
the `/api/v1/latest` response contract. It is recorded so reviewers and consumers can
confirm the guarantee without diffing the schema.

## Guarantee (SC-006, FR-010, FR-011)

The `/api/v1/latest` envelope is **byte-for-byte unchanged in shape**. Feature 014 changes
*when* `rainSensorSuspect` is `true`, not the field, its type, or any other field. No
consumer of `/api/v1/latest` or the rainfall card needs to change to benefit from the fix.

## Fields relevant to the rain fault (already present from Feature 008 — unchanged)

| Field | Zod type | 014 change |
|-------|----------|------------|
| `rainSensorSuspect` | `z.boolean()` | **none** — same field; only the detector logic that sets it is tightened |
| `rainSensorReason` | `z.union([z.string(), z.null()])` | **none** — same type; only the *string content* now notes the signature was sustained (FR-012) |

- **No new field** is added (FR-010).
- **No new endpoint** is introduced (FR-010).
- **No schema change** in `packages/shared/src/schema.ts` — `latestSnapshotSchema` (a
  `z.strictObject`) is untouched; the `RainFaultState` type is unchanged.
- **Both envelope branches** (`ok` data branch and `no-data` branch) in
  `buildLatestSnapshot` keep their existing behaviour; `no-data` still yields
  `rainSensorSuspect: false`, `rainSensorReason: null`.

## Downstream — UNCHANGED

- **Web** (`apps/web`) renders the (now more trustworthy) `rainSensorSuspect` exactly as
  before — the Feature 010 rainfall overlay / Feature 004 legible indicator is untouched
  (FR-011). Eastern-time display conventions continue to apply to the unchanged indicator.
- **Poller** (`apps/poller`) is unrelated to detection and untouched.

## Verification

- Existing `apps/api/tests/latest.test.ts` (which asserts the envelope carries the two
  rain-fault fields) continues to pass **unchanged** — evidence that the contract shape did
  not move. No new envelope-level assertions are required by this feature.
