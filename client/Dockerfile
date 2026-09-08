# Multi-stage Dockerfile for Tikka client
# Supports both dev (Vite dev server) and production (static build with nginx) stages

# ========================================
# Base stage - dependencies
# ========================================
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# ========================================
# Development stage
# ========================================
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]

# ========================================
# Build stage
# ========================================
FROM base AS builder

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build arguments for environment variables (baked at build time)
ARG VITE_API_URL
ARG VITE_NETWORK
ARG VITE_CONTRACT_ID
ARG VITE_HORIZON_URL
ARG VITE_RPC_URL
ARG VITE_SENTRY_DSN
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_NETWORK=$VITE_NETWORK
ENV VITE_CONTRACT_ID=$VITE_CONTRACT_ID
ENV VITE_HORIZON_URL=$VITE_HORIZON_URL
ENV VITE_RPC_URL=$VITE_RPC_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Build the application
RUN pnpm run build

# ========================================
# Production stage - nginx
# ========================================
FROM nginx:alpine AS production

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (if exists)
# Uncomment if you have a custom nginx.conf
# COPY nginx.conf /etc/nginx/nginx.conf

# Add a basic nginx config for SPA routing
RUN echo 'server { \
    listen 5173; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    # Security headers \
    add_header X-Frame-Options "SAMEORIGIN" always; \
    add_header X-Content-Type-Options "nosniff" always; \
    add_header X-XSS-Protection "1; mode=block" always; \
    # Cache static assets \
    location ~* \\.(?:css|js|jpg|jpeg|gif|png|svg|ico|woff|woff2|ttf|eot)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
