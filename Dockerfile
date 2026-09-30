# Production image: the Express API and the built front, served on the same port. Vite writes its
# bundle into the API output, so there is only one artifact to publish.
#
# Three stages. The production dependencies are installed separately from the development ones: the
# final image only receives the former, without having to uninstall anything afterwards.

ARG NODE_VERSION=22.12

# --- dependances de production -------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# The manifests are copied before the rest of the code: as long as they do not change, Docker reuses
# the install layer, which is by far the longest.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/items/package.json packages/core/items/
COPY apps/worker/package.json apps/worker/
COPY packages/infra/package.json packages/infra/

RUN npm ci --omit=dev

# --- compilation ----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/items/package.json packages/core/items/
COPY apps/worker/package.json apps/worker/
COPY packages/infra/package.json packages/infra/
RUN npm ci

COPY . .
RUN npm run build

# --- image finale -----------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# The image runs without privileges. node:alpine already provides the `node` user.
USER node

# Only the compiled output and the manifests go through. Copying the whole of `packages` would bring
# the TypeScript sources and the tests into the published image: useless at run time, and that much
# more surface.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/
# The event consumer travels in the same image as the API: a single artifact to publish and version,
# two commands to start it. Without it, the image contains a producer whose queue nobody empties.
COPY --chown=node:node --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --chown=node:node --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --chown=node:node --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=builder /app/packages/contracts/package.json ./packages/contracts/
COPY --chown=node:node --from=builder /app/packages/core/items/dist ./packages/core/items/dist
COPY --chown=node:node --from=builder /app/packages/core/items/package.json ./packages/core/items/
COPY --chown=node:node --from=builder /app/packages/infra/dist ./packages/infra/dist
COPY --chown=node:node --from=builder /app/packages/infra/package.json ./packages/infra/
COPY --chown=node:node package.json ./

# Documents the listening port; the real port is configured through the environment.
EXPOSE 3000

# Node is already in the image. An HTTP 503 means a dependency failed, not a
# healthy process; no additional probe binary or secret is needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# The API by default. The worker starts from the same image by replacing the command: `docker run
# --entrypoint node <image> apps/worker/dist/index.js`. Two separate processes, as ADR-0007 asks,
# without a second image to build and keep in sync.
CMD ["node", "apps/api/dist/index.js"]
