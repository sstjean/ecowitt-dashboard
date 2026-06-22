# Web image — build the Vite bundle, then serve it as static files from nginx,
# which also reverse-proxies /api to the api service.
# Build context = repository root (npm workspaces).

# --- build: vite production bundle ---
FROM node:22.12.0-bookworm-slim AS build
WORKDIR /app
# `--ignore-scripts` skips native module compilation (better-sqlite3); the web
# build only needs vite + the shared workspace, neither of which is native.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/poller/package.json apps/poller/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm run build -w @ecowitt/web

# --- runtime: nginx static serve + /api reverse proxy ---
FROM nginx:1.27.3-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
