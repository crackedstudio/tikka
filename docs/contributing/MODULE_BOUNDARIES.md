# Module Boundaries & Code Ownership

This guide helps contributors decide where to build features, what packages own which responsibilities, and how to handle cross-package changes.

## Why this matters

- Avoid accidental boundary crossing between `client`, `sdk`, `backend`, `indexer`, and `oracle`.
- Keep feature work in the package that owns the domain.
- Make issue triage and reviewer selection easier.

## Package responsibilities

### `client`
- Consumer web application and user interface.
- Pages, navigation, charts, forms, wallet UX, client-side validation, and browser state.
- Uses `@tikka/sdk` for contract interactions and calls backend APIs for metadata, user state, and notifications.
- Typical touchpoints:
  - `client/src/`
  - `client/public/`
  - `client/package.json`
  - `client/playwright.config.ts`

### `sdk`
- Client-facing contract library and transaction building layer.
- Builds, simulates, signs, and submits Soroban transactions.
- Encapsulates contract bindings, wallet adapter abstractions, network config, and reusable protocol types.
- Used by `client` and other integrators.
- Typical touchpoints:
  - `sdk/src/`
  - `sdk/tests/`
  - `sdk/package.json`

### `backend`
- API layer, authentication, metadata, notifications, and business logic.
- Hosts endpoints that support client flows and enrich data with backend-managed state.
- Responsible for server-side validation, email/push notifications, and auth refresh.
- Typical touchpoints:
  - `backend/src/`
  - `backend/test/`
  - `backend/package.json`
  - `backend/README.md`

### `indexer`
- Blockchain event ingestion and query layer.
- Reads Horizon events, decodes logs, updates PostgreSQL, and maintains Redis caches.
- Owns history tables, event-driven join data, and read-optimized query support.
- Typical touchpoints:
  - `indexer/src/`
  - `indexer/test/`
  - `indexer/redis.conf`
  - `indexer/package.json`

### `oracle`
- Randomness oracle workflow and contract callback orchestration.
- Watches for draw requests, computes/verifies randomness, and submits the result to the contract.
- Owns PRNG/VRF logic and the contract relay path.
- Typical touchpoints:
  - `oracle/src/`
  - `oracle/test/`
  - `oracle/package.json`

### `docs`
- Repository documentation, onboarding guides, architecture references, and contributor guidance.
- Owns public-facing docs and internal guidance that help new contributors understand boundaries.
- Typical touchpoints:
  - `docs/`
  - root `README.md`
  - package-level `CONTRIBUTING.md`

### `ops`
- Deployment, infrastructure, environment configuration, and CI/CD support.
- Owns repository-level automation, environment variables, monitoring, and release workflows.
- Typical touchpoints:
  - `.github/`
  - `docker-compose.yml`
  - root scripts and package install/build orchestration
  - repo-level config files

## Common feature changes and touched directories

### UI / UX updates
- Build in: `client`
- Common touched directories:
  - `client/src/`
  - `client/public/`
  - `client/package.json`
  - `sdk/` only when a new contract interaction or wallet adapter is required

### New contract flow or transaction feature
- Build in: `sdk`
- Common touched directories:
  - `sdk/src/`
  - `sdk/tests/`
  - `client/src/` for UI integration
  - `backend/src/` only when a new backend API is required for metadata or auth

### API / metadata / notification feature
- Build in: `backend`
- Common touched directories:
  - `backend/src/`
  - `backend/test/`
  - `client/src/` for UI display
  - `indexer/` only when new historical data is required

### Historical data, analytics, or event-driven query changes
- Build in: `indexer`
- Common touched directories:
  - `indexer/src/`
  - `indexer/test/`
  - `backend/src/` for API access to the indexed data
  - `client/src/` for showing analytics

### Randomness, draw orchestration, or oracle workflow changes
- Build in: `oracle`
- Common touched directories:
  - `oracle/src/`
  - `oracle/test/`
  - `backend/src/` when backend state or status endpoints must reflect oracle events
  - `indexer/src/` when new events need to be indexed

### Deployment or repository automation updates
- Build in: `ops`
- Common touched directories:
  - `.github/`
  - root-level scripts and config files
  - package-level `Dockerfile` / `docker-compose.yml`

### Documentation-only improvements
- Build in: `docs`
- Common touched directories:
  - `docs/`
  - root `README.md`
  - package-level `CONTRIBUTING.md`

## Cross-package review checklist

When a change touches more than one package, verify the following:

- [ ] Is there a strong domain reason to modify multiple packages in one PR?
- [ ] Does the change preserve package ownership and responsibility boundaries?
- [ ] Were package-level tests and build checks run for each affected package?
- [ ] Is the change surfaced clearly in issue descriptions and PR titles?
- [ ] Have maintainers or reviewers for all touched packages been requested?
- [ ] Are non-functional changes (style, formatting, lint) scoped to the package they belong to?
- [ ] Were shared interfaces, DTOs, and contract bindings updated in only one source-of-truth package?
- [ ] If the change includes docs or onboarding, did you link to `docs/contributing/MODULE_BOUNDARIES.md`?

## Code ownership guidance

- Prefer the owning package for any feature work.
- Keep `client` focused on the UI and user experience.
- Keep `sdk` focused on contract integration and transaction plumbing.
- Keep `backend` focused on API logic, state, metadata, and notification behavior.
- Keep `indexer` focused on blockchain ingestion and query model design.
- Keep `oracle` focused on randomness delivery and contract callback workflow.
- Keep `docs` focused on onboarding, architecture, and written guidance.
- Keep `ops` focused on deployment, CI/CD, and repository automation.

> If you are unsure where a feature belongs, open an issue and tag package maintainers. Cross-package work is allowed, but it should be deliberate and reviewed by all affected teams.
