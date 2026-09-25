FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.9

# Copy workspace root files first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json files needed for workspace resolution
COPY oracle/package.json ./oracle/
COPY sdk/package.json ./sdk/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy full source
COPY oracle/ ./oracle/
COPY sdk/ ./sdk/

# Deploy oracle as a standalone directory
RUN pnpm --filter tikka-oracle deploy /app/oracle-deploy

# Stage 2: Production
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner

WORKDIR /app

RUN npm install -g pnpm@9.15.9

# Copy the deployed oracle (self-contained with node_modules)
COPY --from=builder /app/oracle-deploy ./

# Build the application
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod

ENV NODE_ENV=production
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 http://localhost:3003/health -O /dev/null || exit 1

CMD ["node", "dist/main.js"]
