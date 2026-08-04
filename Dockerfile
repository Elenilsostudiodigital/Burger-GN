# Production image: API + static frontend (same origin)
FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/burger-gn/package.json ./artifacts/burger-gn/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV PORT=5173
ENV BASE_PATH=/
RUN pnpm --filter @workspace/burger-gn run build \
 && pnpm --filter @workspace/api-server run build \
 && mkdir -p artifacts/api-server/public \
 && cp -r artifacts/burger-gn/dist/public/* artifacts/api-server/public/

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/public
COPY --from=build /app/artifacts/api-server/dist ./dist
COPY --from=build /app/artifacts/api-server/public ./public
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
