# Multi-stage build for the Fastify API from the pnpm monorepo. Build context is
# the REPO ROOT (so the workspace packages are available):
#   docker build -f apps/api/Dockerfile -t kivan-api .
#
# Strategy (bot-platform pattern): install the backend subtree (devDeps included
# — Prisma CLI + tsc live there), generate the Prisma client, build the packages
# then the api, prune to production deps, copy a lean tree into the runtime stage.

# ---- base: pin Node to the engines range ----
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm to match the lockfile (pnpm 11 dropped reading package.json#pnpm.overrides).
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

# ---- build ----
FROM base AS build
# Manifests first so the install layer caches across source-only changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
# Install only the api subtree (api + the @hold/* packages it depends on).
RUN pnpm install --frozen-lockfile --filter "api..."

# Sources for the backend packages.
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api

# Generate the Prisma client, then build packages (deps first) and the api.
RUN pnpm --filter @hold/db generate \
 && pnpm --filter @hold/shared --filter @hold/config --filter @hold/db build \
 && pnpm --filter api build

# NOTE: we deliberately KEEP devDependencies (Prisma CLI) so the SAME image can
# run `prisma migrate deploy` during the deploy step. Pruning would drop prisma
# and the migrate step would silently no-op. (If a leaner image is wanted later,
# split into a dedicated migrate stage rather than pruning here.)

# ---- runtime: non-root ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
EXPOSE 3000
# Migrations run as a separate deploy step from THIS image (the owner role):
#   docker run --rm <image> pnpm --filter @hold/db exec prisma migrate deploy
# The app itself runs as the non-superuser DATABASE_URL role.
CMD ["node", "apps/api/dist/server.js"]
