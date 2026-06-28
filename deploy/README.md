# Deploying the ecowitt-dashboard server stack

This is the build-and-ship runbook for the **server stack** (`poller` + `api` +
`web` + `backup`). For the wall-display kiosk device, see
[kiosk/README.md](kiosk/README.md) — that is separate host provisioning, not a
server image.

## Where production runs

- **Host**: `homeautomation` = **192.168.10.5** (main VLAN), **x86_64**.
  SSH with key auth: `ssh steve@192.168.10.5`.
- The host also runs many unrelated containers (Home Assistant, Zwave, Zigbee,
  …). Our Compose project is scoped to the `ecowitt-dashboard-*` containers, so
  `docker compose up -d` in the deploy dir never touches the others.
- **Deploy dir**: `~/ecowitt-dashboard` on the host contains only
  `docker-compose.yml`, `.env`, `scripts/`, and `backups/`. It is **not a git
  repo and has no source** — images are built on a workstation and `docker
  load`ed onto the host. **Do not edit the host `.env`** (it holds the real
  gateway URL, lat/lon, NWS user agent).
- **Image tags** are pinned at `1.0.0` (no branch or version suffix). "Production
  is on branch X" simply means the loaded `1.0.0` images were built from X.
- **Web port**: published on host port **8090** (`WEB_PORT` in the host `.env`).

## ⚠️ Architecture: always cross-build for amd64

The dev workstation (Apple Silicon Mac) is **arm64**; the server is
**amd64**. A plain `docker compose build` on the Mac produces arm64 images that
crash on the host with `exec format error`. Always build with the platform
pinned to `linux/amd64`.

## Procedure

Run from a checkout of this repo on the workstation, on the branch you want to
ship (normally `main`):

```bash
# 1. Build amd64 images from the current checkout.
DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build web api poller

# 2. Verify the architecture (must print linux/amd64 for each).
for s in web api poller; do
  docker image inspect ecowitt/$s:1.0.0 --format "$s {{.Os}}/{{.Architecture}}"
done

# 3. Transfer the images to the host (save | ssh load).
docker save ecowitt/web:1.0.0 ecowitt/api:1.0.0 ecowitt/poller:1.0.0 \
  | ssh steve@192.168.10.5 docker load

# 4. Recreate the containers on the host. The sqlite-data named volume
#    persists across this — no data loss.
ssh steve@192.168.10.5 'cd ~/ecowitt-dashboard && docker compose up -d'

# 5. Verify.
ssh steve@192.168.10.5 'docker ps --filter name=ecowitt-dashboard'
curl -s -o /dev/null -w '%{http_code}\n' http://192.168.10.5:8090/
curl -s http://192.168.10.5:8090/api/v1/latest | head -c 400   # observedAt should be fresh
```

## Notes

- Only `web`, `api`, and `poller` are server images. The `backup` sidecar uses
  stock `alpine` and needs no rebuild.
- A change that only touches `apps/web` only changes the `web` image; rebuilding
  all three anyway is harmless and keeps the step list simple.
- The `sqlite-data` volume is the single source of truth for readings. Never
  `docker compose down -v` on the host — `-v` would delete it. Plain
  `up -d` / `restart` are safe.
