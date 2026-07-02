# Implementation Plan: Kiosk Self-Heal on Deploy

**Branch**: `012-kiosk-self-heal` | **Date**: 2026-07-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/012-kiosk-self-heal/spec.md](./spec.md)

## Summary

The wall kiosk must pick up a new dashboard build on its own (US1), keep polling
forever and self-recover after a transient outage (US2), and wait for the server
at cold boot instead of stranding on a browser error page (US3).

Technical approach:

- **US1 (auto-reload on deploy)** — Bake a single, deterministic **build id** per
  build from one source: a small Vite plugin in
  [apps/web/vite.config.ts](../../apps/web/vite.config.ts) that (a) `define`s a
  compile-time constant `__BUILD_ID__` into the bundle, and (b) emits a static
  `version.json` (`{ "buildId": "…" }`) into `dist`. nginx already serves `dist`
  statically, so the marker is reachable at `/version.json` with no API/poller
  change. A new [apps/web/src/selfHeal.ts](../../apps/web/src/selfHeal.ts) module
  fetches `/version.json` with `cache: 'no-store'`, compares the served `buildId`
  to the baked `__BUILD_ID__`, and calls `location.reload()` **exactly once** on a
  genuine difference — never on equality, never on fetch failure, guarded against
  reload loops. It is wired into the poll loop on a configurable check cadence.
- **US2 (never-give-up reconnect)** — `startPollLoop` in
  [apps/web/src/main.ts](../../apps/web/src/main.ts) already retries forever via
  `setInterval` (errors route to `onError`, the interval is never cleared on
  failure). Harden and make it observable: add an optional `reconnecting` state
  that sets on failure and clears on the next success, without blanking
  last-known values.
- **US3 (boot resilience)** — Harden
  [deploy/kiosk/bin/kiosk-weather](../../deploy/kiosk/bin/kiosk-weather) to
  `curl`-wait for `KIOSK_URL` reachability (loop until HTTP-reachable) before
  launching Chrome, so server-down-at-boot shows a wait rather than a dead error
  page. Validated with the existing `bats` harness under
  [deploy/kiosk/tests](../../deploy/kiosk/tests).

No data-model / API-envelope change: the version marker is a **build artifact**,
not application data (FR-018, FR-020).

## Technical Context

**Language/Version**: TypeScript 5.x (ES modules), Bash (kiosk launcher)

**Primary Dependencies**: Vite 8 (build + dev server + `define`/plugin), Vitest
(jsdom unit), Playwright (e2e against the real `vite preview` build), nginx
(static serving of `dist`), `bats` (kiosk launcher tests), `curl` (US3 reachability)

**Storage**: N/A — this feature adds no persisted data. `version.json` is a
build-time static asset in `dist`.

**Testing**: Vitest unit (100% coverage on `apps/web`, `selfHeal.ts` + poll-loop
changes), Playwright e2e (reload-on-changed-id, no-reload-on-equal-id,
no-reload-on-failed-fetch), `bats` for the kiosk curl-wait.

**Target Platform**: Web app served by nginx in the `web` Docker image; kiosk =
2014-era Surface Pro 3 on Ubuntu running Chrome via the vendored launcher.

**Project Type**: Web application (frontend `apps/web`) + device launcher
(`deploy/kiosk`). No backend/API/poller/shared change.

**Performance Goals**: Auto-reload converges within one check interval (piggybacks
the existing ~10 s UI refresh or a slower configurable cadence); reconnect
recovers within one poll interval of the server returning; boot curl-wait
presents promptly (sub-second) once reachable.

**Constraints**: `version.json` MUST be fetched with no-store semantics (FR-006);
reload exactly once and never loop (FR-007, FR-010); a failed check is "unknown",
never "changed" (FR-009); last-known values MUST survive a failed data request
(FR-014); no user-visible timestamp / timezone change (FR-019); auto-reload +
reconnect achievable in the web layer alone (FR-020).

**Scale/Scope**: Single wall kiosk on the LAN; one new source module
(`selfHeal.ts`), a Vite build-id plugin, a minimal poll-loop reconnect hook, and
a launcher curl-wait. No multi-user/auth state to preserve across reload.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| **I. Simplicity** | PASS — reuses the existing poll loop and nginx static serving; the build id is a single `define` + one emitted file. No new service, no new dependency. |
| **II. YAGNI** | PASS — only US1/US2/US3 behaviours are built. No version history, no update UI, no rollback tooling, no config server. The `reconnecting` affordance is optional and minimal. |
| **III. SRP** | PASS — `selfHeal.ts` separates *fetch the served id* from *decide whether to reload* (pure decision fn + thin effectful wrapper), each independently testable. The Vite plugin owns build-id emission only. |
| **IV. TDD + 100% coverage** | PASS (by construction) — strict Red→Green on `selfHeal.ts` and poll-loop changes; adversarial e2e for changed/equal/failed cases; `bats` Red first for the curl-wait. `bootstrap.ts` remains coverage-excluded so wiring lives there. |
| **Display Timezone** | N/A — no timestamps added (FR-019). |
| **Local Type-Check Parity** | PASS — `npm run typecheck` (tsc `--noEmit`) already covers the new module; `__BUILD_ID__` is declared in an ambient `.d.ts`. |
| **Platform / Offline-First** | PASS — no cloud, no cross-VLAN change; `version.json` is same-origin from nginx. Launcher curl-wait targets the LAN dashboard only. |
| **Client–Server Contract** | PASS — no API contract change; `version.json` is a static asset, not a versioned API endpoint, and carries no telemetry. |

**Result**: PASS — no violations. Complexity Tracking table intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/012-kiosk-self-heal/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output — decisions & rationale
├── data-model.md        # Phase 1 output — entities (no envelope change)
├── quickstart.md        # Phase 1 output — validation guide
├── contracts/
│   └── version-json.md   # version.json shape + selfHeal reload decision table
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/web/
├── vite.config.ts                 # + build-id plugin: define __BUILD_ID__, emit version.json
├── src/
│   ├── selfHeal.ts                # NEW — fetch /version.json (no-store) + reload-once decision
│   ├── main.ts                    # startPollLoop — add optional reconnecting state hook
│   ├── bootstrap.ts               # wire selfHeal into the loop (coverage-excluded)
│   ├── build-id.d.ts              # NEW — ambient decl for __BUILD_ID__
│   └── render/…                   # optional subtle "reconnecting" affordance (US2)
├── tests/
│   ├── selfHeal.test.ts           # NEW — decision table + effect wrapper (100%)
│   └── main.test.ts               # + reconnect-state assertions
└── e2e/
    └── selfheal.spec.ts           # NEW — changed→reload, equal→no-reload, fail→no-reload

deploy/kiosk/
├── bin/kiosk-weather              # + curl-wait for KIOSK_URL before launching Chrome (US3)
└── tests/
    └── launcher_selfheal.bats     # + curl-wait reachability assertions
```

**Structure Decision**: Web-app + device-launcher layout. US1/US2 land entirely in
`apps/web` (new `selfHeal.ts`, a Vite build-id plugin, a small poll-loop reconnect
hook) and ship in the **web-only** Docker image — `version.json` is served by the
existing nginx from `dist`, so no `api`/`poller`/`shared` change. US3 is a
`deploy/kiosk` provisioning change re-applied via `provision.sh` on the Surface.

## Complexity Tracking

> No Constitution Check violations — this table is intentionally empty.

## Deployment Notes

- **US1/US2**: rebuild and deploy the **web image only**. `version.json` is served
  by the existing nginx from `dist`; no `api`/`poller`/`shared` changes.
- **First-time onboarding of the self-heal code**: after deploying the web image
  carrying `selfHeal.ts`, **one final manual kiosk kick** is still required to load
  the self-heal-capable build onto the screen. Every deploy *after that* is picked
  up automatically (that is the whole point of US1).
- **US3**: a `deploy/kiosk` change — re-run `provision.sh` on the Surface to
  vendor the hardened launcher. It is independent of the web image.
