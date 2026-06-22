# Web image — build the Vite bundle, then serve it as static files from nginx,
# which also reverse-proxies /api to the api service.
# Build context = repository root (npm workspaces).

# --- build: vite production bundle ---
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /app
# Build toolchain so any native optional deps (rolldown binding, better-sqlite3)
# resolve cleanly; this stage is discarded, only the nginx stage ships.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/poller/package.json apps/poller/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Resolve deps without the committed lockfile so the platform-specific
# rolldown/vite optional binding installs on the build arch. `npm ci` (and even
# `npm install` against the macOS-generated lockfile) skips it cross-platform
# (npm bug npm/cli#4828); this is the fix that bug's own error message advises.
# Reproducibility of the *runtime* still rests on the lockfile-driven api/poller
# images — this is a throwaway build stage that only emits the static bundle.
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w @ecowitt/web

# --- runtime: nginx static serve + /api reverse proxy ---
FROM nginx:1.27.3-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
