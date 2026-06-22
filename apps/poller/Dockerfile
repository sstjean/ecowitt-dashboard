# Poller image — ingestion service (the only cross-VLAN consumer).
# Runs the TypeScript entrypoint directly via Node's type stripping; no transpile
# step. better-sqlite3 is a native module, so deps are built in a separate stage
# (glibc/bookworm) and copied into a matching slim runtime.
# Build context = repository root (npm workspaces).

# --- deps: install + compile native modules ---
FROM node:22.12.0-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# Copy only manifests first for cacheable installs. All workspace manifests are
# required so `npm ci` can validate the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/poller/package.json apps/poller/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev

# --- runtime: slim image with prebuilt node_modules + source ---
FROM node:22.12.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/poller ./apps/poller
USER node
CMD ["node", "--experimental-strip-types", "apps/poller/src/index.ts"]
