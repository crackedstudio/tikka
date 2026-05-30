# Stellar Wave Quality Standards

This document defines the **common completion standard** for every Stellar Wave issue in the Tikka ecosystem. Use this checklist to ensure your implementation is production-ready before requesting review.

---

## Overview

Stellar Wave issues require robust implementation across:
- **Documentation** — API specs, architecture, deployment guides
- **Tests** — Unit, integration, e2e coverage
- **Telemetry** — Logging, tracing, error reporting
- **Error Handling** — Graceful degradation, user-facing messages
- **Migrations** — Database schema changes, data migration safety
- **Package-Specific Expectations** — Tailored requirements per component
- **CI/CD Integration** — Automated quality gates

---

## Universal Requirements

All Stellar Wave issues **must** satisfy these baseline requirements:

### 1. Documentation

- [ ] **API Documentation**
  - OpenAPI/Swagger spec generated and validated
  - Clear request/response examples
  - Error codes and status meanings documented
  - Rate limiting, auth requirements, and constraints noted

- [ ] **Code Comments**
  - Complex logic explained inline
  - Non-obvious design decisions justified
  - Public API surfaces fully JSDoc/TypeDoc annotated

- [ ] **Runbook / Troubleshooting Guide**
  - Common failure scenarios and recovery steps
  - Monitoring dashboards and alerts referenced
  - Contact/escalation procedures

- [ ] **README Update**
  - Feature described in package README
  - Setup/configuration instructions (if applicable)
  - Links to full documentation

### 2. Tests

All new code **must** have corresponding test coverage:

- [ ] **Unit Tests**
  - Core logic thoroughly tested
  - Edge cases covered (null, empty, max values, etc.)
  - Error conditions and exceptions tested
  - Minimum 80% code coverage for new modules

- [ ] **Integration Tests**
  - Component interactions verified
  - Database/external service mocking appropriate
  - End-to-end data flows validated

- [ ] **E2E Tests** (where applicable — primarily client/API)
  - User workflows validated in browser or API client
  - Cross-browser compatibility confirmed (client only)
  - Mobile responsiveness verified (client only)

- [ ] **Test Execution**
  - `pnpm run test` (or package-specific test command) passes locally
  - Tests pass in CI pipeline
  - No flaky tests; retry logic is explicit where necessary

### 3. Telemetry & Observability

- [ ] **Logging**
  - Structured logging (JSON format) for programmatic analysis
  - Appropriate log levels used (debug, info, warn, error)
  - PII never logged (wallets, user IDs, API keys masked)
  - Request IDs or trace IDs propagated across service boundaries

- [ ] **Tracing** (backend/indexer/oracle)
  - Critical operations instrumented with start/end spans
  - Errors captured with full stack traces and context
  - Distributed tracing enabled across service calls

- [ ] **Metrics** (backend/indexer/oracle)
  - Operation durations recorded
  - Error rates tracked
  - Custom business metrics exposed (e.g., raffle created, ticket purchased)

- [ ] **Error Reporting** (Sentry/similar)
  - Unhandled exceptions automatically reported
  - Severity levels correctly assigned
  - Sensitive data scrubbed from error context

### 4. Error Handling

- [ ] **User-Facing Errors**
  - HTTP status codes semantically correct (400, 401, 403, 404, 500, etc.)
  - Error messages human-readable and actionable
  - No stack traces exposed to clients
  - Internationalization (i18n) applied for client-facing strings

- [ ] **Graceful Degradation**
  - Partial failures don't cascade to complete outages
  - Fallback mechanisms in place for external service calls
  - Circuit breakers or timeout handlers implemented
  - Data consistency maintained under failure

- [ ] **Validation**
  - Input validation performed before processing
  - Business logic constraints enforced
  - Zod (or similar) schemas used for type safety

### 5. Database Migrations

- [ ] **Migration Scripts** (backend/indexer)
  - TypeORM migrations generated and reviewed
  - Reversible (`migration:revert` works)
  - Data migration logic handles existing records safely
  - Zero-downtime migration strategy (if needed for large tables)

- [ ] **Schema Versioning**
  - Migration numbering follows convention (timestamp-based)
  - Migration names clearly describe intent
  - No raw SQL without documentation

- [ ] **Rollback Plan**
  - Rollback procedure documented
  - Data backups verified before production deployment
  - Previous schema supported until rollout complete

### 6. Code Quality

- [ ] **Linting & Formatting**
  - `pnpm run lint` passes without errors
  - ESLint rules enforced consistently
  - Prettier formatting applied
  - No console.log left in production code

- [ ] **Type Safety**
  - TypeScript strict mode enabled
  - No `any` types except where explicitly justified
  - Return types explicitly annotated for public functions

- [ ] **Security**
  - OWASP top 10 risks assessed
  - Input sanitization applied
  - Secrets not hardcoded (use environment variables)
  - Dependency vulnerabilities checked (`npm audit` / `pnpm audit`)

---

## Package-Specific Expectations

### Backend (`backend/`)

| Requirement | Details |
|---|---|
| **API Spec** | OpenAPI generated via `pnpm run generate:openapi` and validated via `pnpm run validate:openapi` |
| **Tests** | `pnpm run test` covers unit and integration. E2E tests in `test/jest-e2e.json` |
| **Build** | `pnpm run build` produces dist/ without errors; NestJS CLI used |
| **Linting** | `pnpm run lint` checks `src/` and `test/` |
| **Logging** | Pino (via nestjs-pino) for structured logs; context injected with request IDs |
| **Error Handling** | Filters and exception handlers catch and transform errors; Swagger HttpException decorators applied |
| **Database** | TypeORM migrations in `src/migrations/`; Supabase PostgreSQL as primary store |
| **Auth** | SIWS (Sign-In With Stellar) via Passport; JWT tokens validated on protected routes |
| **Telemetry** | Sentry integration for error reporting; optional Grafana dashboards |

**CI Command:**
```bash
cd backend && pnpm run build && pnpm run test -- --ci && pnpm run lint && pnpm run validate:openapi
```

---

### Client (`client/`)

| Requirement | Details |
|---|---|
| **Build** | `pnpm run build` produces dist/ via Vite; source maps included for debugging |
| **Tests** | Unit tests via `pnpm run test:unit` (Vitest); E2E via `pnpm run test:e2e` (Playwright) |
| **Linting** | `pnpm run lint` checks all .ts/.tsx/.js/.jsx files |
| **Types** | TypeScript strict mode; all React components typed |
| **Accessibility** | WCAG 2.1 AA compliance; keyboard navigation tested; screen reader tested |
| **Responsive Design** | Mobile, tablet, desktop viewports verified; Tailwind CSS for styling |
| **i18n** | User-facing strings translated via i18next; language switcher functional |
| **Error UI** | User-friendly error messages displayed; retry mechanisms provided |
| **Performance** | Bundle size tracked; lazy loading for routes; Web Vitals optimized |

**CI Command:**
```bash
cd client && pnpm run build && pnpm run test:unit && pnpm run test:e2e && pnpm run lint
```

---

### Indexer (`indexer/`)

| Requirement | Details |
|---|---|
| **Event Processing** | Blockchain events parsed correctly; extensions follow extensible pattern |
| **Tests** | Unit: `pnpm run test`; Integration: `pnpm run test:integration --forceExit` (with Redis + DB) |
| **Build** | `pnpm run build` produces dist/; NestJS CLI validates structure |
| **Linting** | `pnpm run lint` checks `src/` and `test/` |
| **Logging** | Structured logs for every event processed; backoff/retry logic traced |
| **Database** | TypeORM migrations in `src/migrations/`; PostgreSQL schema changes documented |
| **Message Queue** | BullMQ jobs for async processing; failed jobs dead-letter queued and tracked |
| **Caching** | Redis used for hot data; TTLs set appropriately; cache invalidation explicit |
| **Health Checks** | Database, Redis, Horizon connection status monitored |
| **Data Consistency** | Idempotent processing; duplicate detection prevents re-processing |

**CI Command:**
```bash
cd indexer && pnpm run build && pnpm run test && pnpm run test:integration --forceExit && pnpm run lint
```

---

### Oracle (`oracle/`)

| Requirement | Details |
|---|---|
| **Draw Request Handling** | Listens for events; validates request format; submits randomness |
| **Tests** | Unit tests cover VRF/PRNG logic; integration tests verify contract interaction |
| **Build** | `pnpm run build` produces dist/ |
| **Linting** | `pnpm run lint` enforces code quality |
| **Logging** | Every draw request logged; randomness generation tracked; contract submission confirmed |
| **Error Recovery** | Transient failures retried with exponential backoff; permanent failures escalated |
| **Security** | Oracle key management secure (HSM or similar); signature verification before submission |
| **Monitoring** | Draw request latency tracked; success/failure rates monitored; alerts for anomalies |

**CI Command:**
```bash
cd oracle && pnpm run build && pnpm run test && pnpm run lint
```

---

### SDK (`sdk/`)

| Requirement | Details |
|---|---|
| **API Documentation** | TypeDoc generated docs; examples for every public function |
| **Build** | `npm run build` produces dist/; ESM and CommonJS outputs (if applicable) |
| **Tests** | Unit tests via Jest; edge cases for Soroban contract interaction |
| **Linting** | ESLint checks all TypeScript files |
| **Types** | Zod schemas for data validation; TypeScript strict mode |
| **Publishing** | Versioning follows semver; CHANGELOG updated; npm registry publication tested |
| **Backward Compatibility** | Breaking changes documented; deprecation warnings provided; migration guide offered |

**CI Command:**
```bash
cd sdk && npm run build && npm run test && npm run lint && npm run docs
```

---

## Cross-Package Requirements

When a change spans multiple packages (e.g., backend + client):

- [ ] **Coordinated Testing**
  - Integration tests verify the packages work together
  - Deployment order documented (if backend must deploy first)
  - Feature flags or versioning used if async deployment needed

- [ ] **Documentation**
  - Root-level README updated with cross-package changes
  - Architecture diagram updated (if flow changes)
  - API contracts clearly defined (request/response formats)

- [ ] **CI Pipeline**
  - Root-level `pnpm run test` runs all affected packages
  - Workflow orchestration ensures correct build order
  - Dependent packages re-tested after changes

**Root CI Command:**
```bash
pnpm install && pnpm run build && pnpm run test && pnpm run lint
```

---

## Review Checklist

Before marking a Stellar Wave issue as ready for review, verify:

- [ ] All universal requirements above satisfied
- [ ] Package-specific expectations met
- [ ] CI pipeline green (all workflows pass)
- [ ] Code review checklist completed (see [CODE_REVIEW.md](./CODE_REVIEW.md) if exists)
- [ ] No TODOs or FIXMEs left in code
- [ ] Related GitHub issues or PRs linked
- [ ] Changelog entry added (if applicable)
- [ ] Release notes drafted (for major features)

---

## Suggested Verification Steps

1. **Local Pre-Flight**
   ```bash
   cd <affected-package>
   pnpm install
   pnpm run build
   pnpm run test
   pnpm run lint
   ```

2. **Cross-Package (if applicable)**
   ```bash
   # From root
   pnpm run build
   pnpm run test
   ```

3. **CI Validation**
   - Push branch to trigger GitHub Actions workflows
   - Verify all workflow jobs pass
   - Check artifact uploads (docs, build outputs) succeeded

4. **Manual Testing**
   - Smoke test the feature in staging environment
   - Verify monitoring/logging appears in observability platform
   - Confirm error scenarios gracefully handled

---

## Continuous Improvement

This checklist is living documentation. If you find:
- **Missing item** — Add to this document and open a PR
- **Outdated tool** — Update references and explain migration path
- **Unclear expectation** — Clarify or add examples

Stellar Wave issues drive quality elevation across the ecosystem. Let's maintain the bar together.

---

**Last Updated:** 2026-05-29  
**Maintained By:** Tikka Quality Team  
**Related:** [ARCHITECTURE.md](../ARCHITECTURE.md) | [CI Workflows](.github/workflows/)
