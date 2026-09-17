# syntax=docker/dockerfile:1
#
# Production image for IT Manager Curriculum.
# Multi-stage: build everything with dev dependencies, ship only the runtime artefacts.
# The API serves both /api and the built web client, so this is a single-container deployment.
#
# Build:  docker build -t itmc:latest .
# Run:    docker run -d --name itmc -p 4000:4000 \
#           -e AUTH_TOKEN=<your token> \
#           -v itmc-data:/app/data itmc:latest
#
# NOTE: this Dockerfile was written and reviewed but NOT executed during the build session
# (no Docker daemon on the authoring machine). Validate it once before relying on it.

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Manifests first for a cached dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/api-client/package.json ./packages/api-client/
COPY tools/content-build/package.json ./tools/content-build/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm -r --filter './packages/*' build \
 && pnpm content:build \
 && pnpm --filter @itmc/api build \
 && pnpm --filter @itmc/web build

# Prune to production dependencies only.
# --legacy: from pnpm 10, `deploy` refuses to run unless the workspace sets
# inject-workspace-packages=true. We want the classic behaviour (workspace deps copied into the
# deploy directory), which is what --legacy does. Without it the build fails with
# ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE.
RUN pnpm --filter @itmc/api --prod --legacy deploy /app/deploy

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/app/data/itmc.db \
    CONTENT_DIST=/app/content/dist \
    WEB_DIST=/app/web

COPY --from=build /app/deploy/node_modules ./node_modules
COPY --from=build /app/deploy/dist ./dist
COPY --from=build /app/packages/db/drizzle ./drizzle
COPY --from=build /app/content/dist ./content/dist
COPY --from=build /app/apps/web/dist ./web
COPY --from=build /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
