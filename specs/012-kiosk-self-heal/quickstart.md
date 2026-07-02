# Quickstart & Validation: Kiosk Self-Heal on Deploy

Runnable validation for each user story. Run all commands from the repo root unless
noted. Implementation details live in `tasks.md` and the source; this guide proves
the feature works end-to-end.

## Prerequisites

- Node deps installed (`npm install` at repo root — workspaces).
- `bats` available for the kiosk launcher tests (`brew install bats-core`).
- Playwright browsers installed (`npx playwright install chromium` in `apps/web`).

## US1 — New deploy reaches the screen automatically

**Unit (Vitest, 100% coverage on `apps/web`)**

```bash
cd apps/web
npm run test:coverage        # includes tests/selfHeal.test.ts
npm run typecheck            # tsc --noEmit — __BUILD_ID__ must resolve
```

Expected: the `decideReload` decision table passes all four rows
(see [contracts/version-json.md](./contracts/version-json.md) §3); the effectful
runner reloads exactly once on a changed id and never on equal/unknown; coverage
stays at 100%.

**Build marker exists and is deterministic**

```bash
cd apps/web
npm run build
cat dist/version.json                       # -> { "buildId": "<id>" }
grep -o '"buildId"' dist/version.json        # present
# Rebuild and confirm a NEW id (new build) vs identical id for identical build:
BID1=$(node -e "console.log(require('./dist/version.json').buildId)")
npm run build && BID2=$(node -e "console.log(require('./dist/version.json').buildId)")
echo "$BID1 -> $BID2"                        # differs across builds (FR-001)
```

**E2E (Playwright, real `vite preview` build)**

```bash
cd apps/web
npm run test:e2e -- selfheal.spec.ts
```

Expected (adversarial, per acceptance scenarios):

1. Served `version.json` id **differs** from the running `__BUILD_ID__` → the page
   reloads exactly once (stub `window.location.reload` / assert navigation).
2. Served id **equals** the running id → **no** reload.
3. `version.json` fetch **fails** (route → 500 / abort) → **no** reload; retries.

## US2 — Kiosk recovers on its own after a transient outage

**Unit (Vitest, fake timers)**

```bash
cd apps/web
npm run test -- main.test.ts
```

Expected: `startPollLoop` keeps ticking after a rejected `fetchSnapshot` (never
stops); `reconnecting` flips `true` on failure and `false` on the next success; a
failed tick calls neither `render` nor any clear, so last-known values survive
(FR-014).

**Manual live check**

1. Bring the stack up (`docker compose up`), open the dashboard.
2. Stop the `web`/`api` container briefly, then restart it.
3. Confirm the cards recover current values automatically and any subtle
   "reconnecting" affordance clears — no manual refresh.

## US3 — Kiosk waits for the dashboard before showing anything at boot

**Launcher tests (bats)**

```bash
cd deploy/kiosk
bats tests/launcher_selfheal.bats
```

Expected: assertions prove `bin/kiosk-weather` curl-waits on `KIOSK_URL` (loops
until reachable) **before** launching Chrome, launches promptly when already
reachable, and preserves the existing `while true` relaunch + `--password-store=basic`
flags.

**Manual device check**

1. On the Surface with the dashboard server **down**, start the kiosk display
   process → it shows a wait/retry state, **not** a dead browser error page.
2. Bring the server up → the launcher presents the dashboard.
3. Start the process with the server **already up** → presents promptly.

## Deploy sequence

1. **Web image (US1/US2)**: rebuild + deploy the `web` image only. `version.json`
   is served by the existing nginx from `dist`.
2. **One-time onboarding**: after deploying the self-heal-capable web build, perform
   **one final manual kiosk kick** to load it onto the screen. Every subsequent
   deploy is picked up automatically.
3. **Launcher (US3)**: re-run `deploy/kiosk/provision.sh` on the Surface to vendor
   the hardened launcher (independent of the web image).

## Definition of done

- [ ] `apps/web` unit + coverage 100% green (`selfHeal.ts`, poll-loop reconnect).
- [ ] `npm run typecheck` clean (`__BUILD_ID__` declared).
- [ ] Playwright `selfheal.spec.ts`: changed→reload, equal→no-reload, fail→no-reload.
- [ ] `bats tests/launcher_selfheal.bats` green (curl-wait).
- [ ] `dist/version.json` emitted and deterministic per build.
- [ ] No change to `/api/v1/latest`, existing panels, or timestamp/timezone display.
