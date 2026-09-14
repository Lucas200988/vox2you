# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/providers/package.json packages/providers/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY tests/integration/package.json tests/integration/
RUN pnpm install --frozen-lockfile --filter @vox/worker... --filter @vox/db...

FROM deps AS build
COPY tsconfig.base.json tsconfig.build.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @vox/db generate && pnpm exec tsc -b packages/shared packages/db packages/core packages/providers apps/worker

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
CMD ["node", "apps/worker/dist/main.js"]
