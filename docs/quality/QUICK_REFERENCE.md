# Stellar Wave Quick Reference

**One-page checklist for contributors implementing Stellar Wave issues.**

---

## Pre-Implementation

- [ ] Read [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md)
- [ ] Identify affected package(s) (backend, client, indexer, oracle, sdk)
- [ ] Plan docs, tests, logging, error handling upfront

---

## Universal Checklist

| Item | Status |
|---|---|
| **Docs** — API spec, code comments, runbook |  |
| **Tests** — Unit (80%+), integration, e2e | ✓ |
| **Logging** — Structured logs, no PII | ✓ |
| **Errors** — Proper status codes, user-friendly messages | ✓ |
| **Migrations** — TypeORM, reversible, data-safe | ✓ |
| **Linting** — `pnpm run lint` passes | ✓ |
| **Security** — No secrets in code, dependencies audited | ✓ |

---

## Package-Specific Commands

### Backend
```bash
cd backend
pnpm run build && pnpm run test -- --ci && pnpm run lint && pnpm run validate:openapi
```

### Client
```bash
cd client
pnpm run build && pnpm run test:unit && pnpm run test:e2e && pnpm run lint
```

### Indexer
```bash
cd indexer
pnpm run build && pnpm run test && pnpm run test:integration --forceExit && pnpm run lint
```

### Oracle
```bash
cd oracle
pnpm run build && pnpm run test && pnpm run lint
```

### SDK
```bash
cd sdk
npm run build && npm run test && npm run lint && npm run docs
```

---

## Cross-Package

```bash
# From root
pnpm run build && pnpm run test
```

---

## Before Opening PR

- [ ] All CI commands pass locally
- [ ] No console.log, TODOs, or debug code left
- [ ] Code follows package conventions
- [ ] `README.md` updated (if user-facing)
- [ ] Changelog entry added (if applicable)
- [ ] Related issues linked

---

## PR Description Template

```markdown
Fixes #<issue-number>

## Implementation
- [ ] Describe approach

## Stellar Wave Checklist
- [x] Tests: <coverage %>
- [x] Docs: <what documented>
- [x] Logging: <what logged>
- [x] Errors: <error handling>
- [x] Migrations: <if applicable>

## Breaking Changes
<none / describe>

## Dependencies
<none / list>
```

---

## Need Help?

- **Full Requirements** → [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md)
- **What is Stellar Wave?** → [CONTRIBUTOR_GUIDE.md](./CONTRIBUTOR_GUIDE.md)
- **Ecosystem Design** → [ARCHITECTURE.md](../ARCHITECTURE.md)

---

**Last Updated:** 2026-05-29
