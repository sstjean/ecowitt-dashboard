# Implementation Plan: Rainfall-Card Cue Layout Refinement (010)

**Branch**: `010-rainfall-cue-layout` | **Date**: 2026-07-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-rainfall-cue-layout/spec.md`

## Summary

Redesign the two mutually-exclusive rainfall-card cues shipped by Feature 008 so
neither clips the fixed-height, `overflow: hidden` rainfall card at the kiosk
viewport. **"Raining now"** moves from a card-level full-width banner into the
left/main column directly above the Daily Rain value (its only layout effect is
to push Daily Rain + label down). The **sensor-fault indicator** becomes an
absolutely-positioned, centered, full-card overlay that dims the card content
behind it. This is a **web-only** change to
[apps/web/src/render/rainfall.ts](../../apps/web/src/render/rainfall.ts) and
[apps/web/src/styles.css](../../apps/web/src/styles.css); the `/api/v1/latest`
data contract (`reading.isRaining`, `snapshot.rainSensorSuspect`,
`snapshot.rainSensorReason`) is **unchanged**. A mandatory Playwright layout-
containment guard at the kiosk viewport is added because the original overflow
was invisible to DOM-presence unit tests.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), type-checked by `tsc --noEmit`; browser DOM.

**Primary Dependencies**: No new runtime deps. Vanilla DOM via the existing
`el`/`svgEl` helpers ([apps/web/src/render/dom.ts](../../apps/web/src/render/dom.ts));
CSS in [apps/web/src/styles.css](../../apps/web/src/styles.css). Vite 8 build.

**Storage**: N/A — no persistence, no schema, no API/poller/shared changes.

**Testing**: Vitest + jsdom (unit/DOM) at 100% coverage; Playwright 1.61 (e2e
layout-containment guard) at the kiosk viewport.

**Target Platform**: LAN web dashboard rendered on the wall kiosk (Surface Pro 3,
native 2160×1440, viewed ~3 m) and household phones.

**Project Type**: Web (monorepo `apps/web` frontend). Only the frontend is touched.

**Performance Goals**: No new runtime cost; pure markup/CSS reshaping. UI stays
within the existing <500 ms responsiveness envelope (trivially met).

**Constraints**: Card is a fixed-height grid/flex cell with `overflow: hidden`
and `position: relative` (already set on `.card`). Nothing may grow the card or
clip content in any of the three states. No timestamp (and specifically no raw
UTC) may appear in the fault overlay (Eastern-time / no-UTC rule). Kiosk
legibility (Feature 004) conventions apply. Strict TDD, Red verified before Green.

**Scale/Scope**: One render module + its CSS; three visual states (Raining now;
sensor fault; neither); 2 unit test files + 1 e2e guard + fixtures updated.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment |
|-----------|------------|
| I. Simplicity | ✅ Reuses existing `el`/`svgEl` DOM helpers and existing CSS custom properties. No new abstractions, no JS libraries. In-column banner + absolute overlay + a body-dim class is the minimal sufficient design. |
| II. YAGNI | ✅ No new config, no extension points. Only the two required states are re-laid-out; dry state is behaviorally untouched. |
| III. Single Responsibility | ✅ `renderRainfall` stays the single rainfall composer; SRP+DRY honored by extracting the cue/overlay/body assembly into small local builders (see research.md) rather than duplicating markup across branches. |
| IV. TDD / 100% coverage / AAA | ✅ Red→Green enforced. `rainfall.test.ts` + `index.test.ts` cover every branch (banner shown/hidden, overlay present/absent, dim class applied, mutual exclusion, empty/missing reason). Playwright guard covers rendered layout containment. AAA comments required. |
| Test Data Separation | ✅ Unit tests use synthetic `rain()` fixture; e2e uses deterministic routed mock fixtures — no live gateway. |
| Display Timezone / No-UTC | ✅ Overlay renders **no** timestamp (FR-007); rule satisfied by construction. |
| Local Type-Check Parity | ✅ `npm run typecheck` (`tsc --noEmit`) unchanged and runnable locally. |
| Platform (local-first, containerized, no cloud) | ✅ Web-only presentation change; no network, no cloud, no VLAN-boundary impact. Ship amd64 web image only. |
| DevOps CI coverage gate | ✅ Change maintains 100% combined coverage; all suites already run in CI. |

**Result**: PASS (initial and post-design). No violations; Complexity Tracking table intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/010-rainfall-cue-layout/
├── plan.md              # This file (/speckit.plan)
├── research.md          # Phase 0 — layout/CSS decisions, TDD & guard strategy
├── data-model.md        # Phase 1 — records "no data-model change"
├── quickstart.md        # Phase 1 — validation/run guide for the three states
├── contracts/
│   └── render-rainfall.md   # Phase 1 — renderRainfall DOM/state render contract
├── checklists/          # (pre-existing spec checklists)
└── tasks.md             # Phase 2 — created by /speckit.tasks, NOT here
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── render/
│   │   ├── rainfall.ts        # CHANGED — cue markup/placement + body-dim + overlay
│   │   └── index.ts           # UNCHANGED behavior; covered by index.test.ts
│   └── styles.css             # CHANGED — in-column banner, .card overlay, dimming
├── tests/
│   └── render/
│       ├── rainfall.test.ts   # CHANGED — new state/branch assertions
│       └── index.test.ts      # CHANGED/VERIFIED — snapshot→render wiring
└── e2e/
    ├── dashboard.spec.ts      # CHANGED — layout-containment guard (3 states)
    ├── kiosk.spec.ts          # OPTIONALLY CHANGED — kiosk-viewport containment
    └── fixtures.ts            # CHANGED — add raining / sensor-fault fixtures
```

**Structure Decision**: Monorepo web frontend (`apps/web`). All edits are confined
to the render module, its stylesheet, its two unit-test files, and the Playwright
e2e guard + fixtures. No `apps/api`, `apps/poller`, or `packages/shared` changes.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Deployment Note (post-green)

After the full suite (unit + coverage + typecheck + Playwright) is green and the
change is merged, rebuild and ship the **web image only** per the documented
ship-images procedure (repo memory `prod-deploy.md`):

- Build amd64: `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build web`
- Ship: `docker save ecowitt/web:1.0.0 | gzip -1 | ssh steve@192.168.10.5 'gunzip | docker load'`
- Bring up on host `~/ecowitt-dashboard`: `docker compose up -d web` (no `--build`).
- Verify at **http://192.168.10.5:8090/** (WEB_PORT 8090). `api`/`poller` unchanged.
