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
RUN pnpm install --frozen-lockfile --filter @vox/api... --filter @vox/db...

FROM deps AS build
COPY tsconfig.base.json tsconfig.build.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @vox/db generate && pnpm exec tsc -b packages/shared packages/db packages/core packages/providers apps/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["sh", "-c", "pnpm --filter @vox/db migrate:deploy && node apps/api/dist/server.js"]
