# Quickstart: LiveMock — run the dashboard on real cloud data, off-LAN

**Feature**: 002-livemock. This guide validates LiveMock end-to-end (US1–US4). It assumes
the design artifacts in this folder are implemented per [plan.md](./plan.md).

References: [data-model.md](./data-model.md) · [contracts/cloud-realtime.md](./contracts/cloud-realtime.md) · [research.md](./research.md).

## Prerequisites

- A valid Ecowitt cloud `application_key`, `api_key`, and the device **MAC**, with the
  GW2000B actively uploading to the Ecowitt cloud.
- Docker + Docker Compose; Node 22 and npm ≥ 11 for the test commands.
- You are **off the IoT LAN** (the scenario LiveMock exists for) — or on it; either works,
  since the cloud is reachable from anywhere.

## 1. Configure secrets (gitignored `.env`)

Copy the example and fill in your credentials. `.env` is gitignored (FR-017/FR-055); never
commit it.

```bash
cp .env.example .env
# Edit .env and set:
#   POLLER_SOURCE=cloud
#   ECOWITT_APP_KEY=<your application key>
#   ECOWITT_API_KEY=<your api key>
#   ECOWITT_MAC=<your device MAC, e.g. AA:BB:CC:DD:EE:FF>
#   # ECOWITT_API_BASE_URL is optional (defaults to https://api.ecowitt.net)
```

## 2. Bring up the LiveMock stack

```bash
docker compose -f docker-compose.yml -f docker-compose.livemock.yml up --build
```

This starts the existing pipeline with the poller pulling from the **cloud** instead of the
LAN gateway. No mock-gateway service is started (unlike `docker-compose.mock.yml`).

## 3. Verify live values on the dashboard (US3 / SC-001)

Open the web UI (default `http://localhost:8080`). Within **two poll cadences** you should
see:

- Real, current household readings — **not em-dashes**, not stale.
- Values that **refresh** on the poll cadence (bounded by the device's cloud upload
  interval, often ~1 min — see [research D12](./research.md)).
- Pressure, temperature, wind, rain, solar/UV populated; `isRaining` reflects whether
  `rain_rate > 0`.

Also confirm the **API** end directly (per the project's end-to-end standard):

```bash
curl -s http://localhost:8080/api/v1/latest | jq '{status, observedAt, reading: .reading | {outdoorTempF, windMph, gustMph, maxDailyGustMph, windAvg10mDirDeg, pressureHpa, rainDailyIn, isRaining}}'
```

Expect `status: "ok"`, a recent `observedAt`, and sane non-null values. Note that
`maxDailyGustMph` initially equals the current gust and `windAvg10mDirDeg` equals the
current wind direction (synthesized; Decision A) and self-correct as history accrues.

> **⚠ Capture a live payload to settle research D7.** While the stack runs, capture one raw
> cloud `real_time` payload and confirm `rainfall_piezo` includes `weekly`, `monthly`,
> `yearly`. If it does not, flag it — the strict schema requires those three rain fields.

## 4. Verify the production default is unchanged (US1 / SC-002)

With `POLLER_SOURCE` unset or `gateway`, the app behaves exactly as before — gateway pull,
**zero** cloud calls:

```bash
docker compose up --build         # default (gateway) — or use docker-compose.mock.yml
```

## 5. Verify honest degradation (US4 / SC-004)

Temporarily set a bad `ECOWITT_APP_KEY` in `.env`, restart the LiveMock stack, and confirm:

- The poller keeps running (does not crash) — the non-zero `code` is logged as a typed
  failure carrying the API message.
- After the staleness window, the UI degrades to **em-dashes** — never fabricated/zero
  values. Restore the key and confirm recovery.

## 6. Verify secrets hygiene (SC-005)

```bash
git status --porcelain        # .env must NOT appear
git check-ignore .env         # must print ".env"
grep -n "ECOWITT_" .env.example   # placeholders only, no real values
```

## 7. Automated tests + 100% coverage (US1/US2/US4 / SC-006)

The constitution requires **100%** coverage; passing tests alone are not enough. Run the
full suite with coverage across the affected workspaces:

```bash
# Shared adapter + new cloud schema
npm run -w @ecowitt/shared test:coverage

# Poller fetcher + config source switch
npm run -w @ecowitt/poller test:coverage

# Type-check parity (catch type errors locally, not in CI)
npm run typecheck
```

Coverage MUST include:

- **Fetcher** (`ecowittCloud.ts`): success, HTTP error, network error, timeout/abort, and
  non-zero `code`.
- **Adapter** (`cloudMapping.ts`): every mapped field, both synthesized fallbacks
  (`maxDailyGustMph`, `windAvg10mDirDeg`), rain-on and rain-off (`isRaining`), pressure
  emitted in inHg, and that the output passes `normalizeToFullMetricMap` +
  `projectLiveReading` with no schema errors.
- **Config** (`config.ts`): `POLLER_SOURCE` default (`gateway`), `cloud` switch, the
  `ECOWITT_*` parsing, and the loud failure when `source=cloud` but credentials are missing.

## Expected outcome

LiveMock streams real, current household data through the **unchanged** pipeline whenever
`POLLER_SOURCE=cloud`; the production gateway path is untouched; failures degrade honestly;
and no secrets are committed.
