# Docker Setup

The Tikka client now includes Docker support for both development and production deployments.

## Quick Start

### Development (Vite Dev Server)

```bash
# Start client with backend services
docker compose --profile client up

# Or start client only (if backend is running locally)
docker compose up client
```

The dev server will be available at http://localhost:5173

### Production Build

```bash
# Build production image
docker build --target production -t tikka-client:prod ./client

# Run production container
docker run -p 5173:5173 tikka-client:prod
```

## Dockerfile Stages

The multi-stage Dockerfile supports three build targets:

### 1. Development Stage
- Runs Vite dev server with hot module replacement
- Includes all dev dependencies
- Mounts source code for live updates
- **Default for `docker compose --profile client up`**

```dockerfile
FROM node:20-alpine AS development
# Installs all dependencies
# Runs: pnpm run dev --host 0.0.0.0
```

### 2. Builder Stage
- Compiles TypeScript and bundles assets
- Bakes VITE_* environment variables at build time
- Produces optimized static files in `/app/dist`

```dockerfile
FROM base AS builder
# Build-time environment variables
ARG VITE_API_URL
ARG VITE_NETWORK
# ...
RUN pnpm run build
```

### 3. Production Stage
- Serves static build with nginx
- Minimal image size (~25 MB vs ~500 MB for dev)
- Includes SPA routing configuration
- Security headers configured

```dockerfile
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
```

## Environment Variables

### Development (docker-compose)

The `docker-compose.yml` client service reads from `client/.env.local`:

```yaml
client:
  env_file: ./client/.env.local
  ports:
    - "5173:5173"
```

**Setup:**
```bash
cp client/.env.example client/.env.local
# Edit client/.env.local with your values
docker compose --profile client up
```

### Production Build

Pass build arguments to bake environment variables:

```bash
docker build \
  --target production \
  --build-arg VITE_API_URL=https://api.tikka.io \
  --build-arg VITE_NETWORK=mainnet \
  --build-arg VITE_CONTRACT_ID=CABC... \
  --build-arg VITE_HORIZON_URL=https://horizon.stellar.org \
  --build-arg VITE_RPC_URL=https://soroban-mainnet.stellar.org \
  --build-arg VITE_SENTRY_DSN=https://... \
  --build-arg VITE_SUPABASE_URL=https://... \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  -t tikka-client:prod \
  ./client
```

> **Important:** Vite bakes environment variables at **build time**. To change them after building, you must rebuild the image.

## Docker Compose Profiles

The root `docker-compose.yml` defines several profiles:

| Profile | Services | Use Case |
|---------|----------|----------|
| `deps` | postgres, redis | Local development without Docker services |
| `backend` | deps + backend | Backend API only |
| `indexer` | deps + indexer | Indexer only |
| `oracle` | deps + oracle | Oracle only |
| `full` | backend + indexer + oracle + deps | All backend services (no client) |
| `client` | full + client | **Everything including client dev server** |

### Common Workflows

```bash
# Start everything (backend + client)
docker compose --profile client up

# Start backend services only, run client locally
docker compose --profile full up
cd client && pnpm run dev

# Rebuild after code changes
docker compose --profile client up --build

# Stop and remove volumes
docker compose --profile client down -v
```

## .dockerignore

The `client/.dockerignore` file excludes:
- `node_modules` (rebuilt inside container)
- `dist` (build output)
- `playwright-report`, `test-results` (test artifacts)
- `.env`, `.env.local` (use docker-compose `env_file` instead)
- IDE and OS files

This reduces build context size and speeds up Docker builds.

## Nginx Configuration (Production)

The production stage includes a basic nginx config with:

```nginx
server {
  listen 5173;
  root /usr/share/nginx/html;
  
  # SPA routing - serve index.html for all routes
  location / {
    try_files $uri $uri/ /index.html;
  }
  
  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  
  # Cache static assets (1 year)
  location ~* \.(css|js|jpg|jpeg|gif|png|svg|ico|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

For custom nginx configuration, create `client/nginx.conf` and uncomment the COPY line in the Dockerfile.

## Troubleshooting

### Port 5173 already in use
```bash
# Stop local Vite dev server first
# Or change the port mapping in docker-compose.yml
ports:
  - "5174:5173"  # Map to different host port
```

### Environment variables not working
- **Development:** Check `client/.env.local` exists and is correct
- **Production:** Verify build args are passed during `docker build`
- Remember: Vite bakes variables at build time, not runtime

### Build fails with pnpm lock mismatch
```bash
# Ensure pnpm version matches packageManager in package.json
pnpm --version  # Should be 9.15.9 or compatible
```

### Client can't reach backend
```bash
# In docker-compose.yml, ensure client depends_on backend:
depends_on:
  backend:
    condition: service_healthy

# Check backend health:
curl http://localhost:3001/health
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build production image
  run: |
    docker build \
      --target production \
      --build-arg VITE_API_URL=${{ secrets.API_URL }} \
      --build-arg VITE_NETWORK=mainnet \
      --build-arg VITE_CONTRACT_ID=${{ secrets.CONTRACT_ID }} \
      --build-arg VITE_RPC_URL=https://soroban-mainnet.stellar.org \
      -t tikka-client:${{ github.sha }} \
      ./client

- name: Push to registry
  run: |
    docker tag tikka-client:${{ github.sha }} registry.example.com/tikka-client:latest
    docker push registry.example.com/tikka-client:latest
```

## Performance

### Image Sizes
- **Development:** ~500 MB (includes Node.js, pnpm, source, node_modules)
- **Production:** ~25 MB (nginx + static files only)

### Build Times (approximate)
- **Cold build:** 3-5 minutes (install dependencies)
- **Warm build:** 30-60 seconds (cached layers)
- **Rebuild after code change:** 10-20 seconds (dev) or 30-60 seconds (prod)

## Security Considerations

- ✅ Multi-stage build reduces attack surface (production image has no build tools)
- ✅ nginx runs as non-root user (Alpine default)
- ✅ Security headers configured (X-Frame-Options, CSP-ready)
- ⚠️ VITE_SUPABASE_ANON_KEY is public (by design), but ensure RLS policies are configured
- ⚠️ Never bake secrets into the image (use runtime env or secrets management)

## Related Documentation

- [Environment Setup](./ENVIRONMENT_SETUP.md) - Environment variable reference
- [Development Guide](./DEVELOPMENT.md) - Local development without Docker
- [Deployment](../OPERATIONAL.md) - Production deployment guide
