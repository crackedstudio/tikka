# This digest is a placeholder. Update it with the output of:
#   docker pull node:22-alpine && docker inspect --format='{{.index .RepoDigests 0}}' node:22-alpine
ARG NODE_BASE=node:22-alpine@sha256:3a6d2c5b6e1f0e2d4c5b6e8f2a1b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a

# Stage 1: Build
FROM ${NODE_BASE} AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace root files first (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all package.json files needed for workspace resolution
COPY backend/package.json ./backend/
COPY sdk/package.json ./sdk/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy full source
COPY backend/ ./backend/
COPY sdk/ ./sdk/

# Deploy backend as a standalone directory
RUN pnpm --filter tikka-backend deploy /app/backend-deploy

# Export production dependencies for the runner stage
RUN pnpm deploy --prod /app/prod_deps

# Stage 2: Production
FROM ${NODE_BASE} AS runner

WORKDIR /app

# Install tini for proper signal handling and reaping of child processes
RUN apk add --no-cache tini

# Copy production dependencies and built application
COPY --from=builder --chown=node:node /app/prod_deps/ ./
COPY --from=builder --chown=node:node /app/backend-deploy ./

# Build the application
RUN pnpm run build

# Remove dev dependencies
RUN pnpm prune --prod

# Ensure the application directory is owned by the non-root user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose the application port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
 CMD wget --quiet --tries=1 --no-check-certificate http://localhost:3001/health -O /dev/null || exit 1

# Use tini as the init system
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
