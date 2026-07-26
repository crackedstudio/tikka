# Stellar Wave Contributor Guide

## What is a Stellar Wave Issue?

A **Stellar Wave** issue represents a significant, well-scoped feature or infrastructure improvement that deserves careful, production-ready implementation. Stellar Wave issues are the gold standard for quality in the Tikka ecosystem.

The name reflects our commitment to making a "wave" of quality across all packages — raising the bar for robustness, documentation, testing, and observability.

---

## When to Use Stellar Wave

Label an issue **Stellar Wave** if it:

✅ **Is a major feature or improvement**
- New auction mechanism, payment flow, or notification system
- Infrastructure overhaul (new cache layer, observability platform, CI/CD enhancement)
- API redesign or significant contract interaction change

✅ **Will impact multiple components or users**
- Changes to backend API used by client and SDK
- Database schema changes affecting indexer or oracle
- Public API additions to published packages

✅ **Requires careful rollout**
- Data migrations needed
- Backward compatibility concerns
- Deployment sequencing required

❌ **Is NOT appropriate for Stellar Wave**
- Bug fixes (use `bug` label instead)
- Minor refactorings (use `refactor` label)
- Documentation-only PRs (use `docs` label)
- Dependency updates (use `dependencies` label)

---

## How to Implement a Stellar Wave Issue

### 1. Plan Before Coding

Read this entire quality standards document: [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md)

Identify which sections apply to your issue:
- Is it backend-only? Focus on [Backend section](./STELLAR_WAVE_CHECKLIST.md#backend-backend)
- Does it touch client? Include [Client requirements](./STELLAR_WAVE_CHECKLIST.md#client-client)
- Are there database changes? Review [Migration section](./STELLAR_WAVE_CHECKLIST.md#5-database-migrations)

### 2. Implement with Quality in Mind

Build the feature while addressing each requirement category:

| Category | Action |
|---|---|
| **Docs** | Write API spec, code comments, runbook as you code |
| **Tests** | Write tests alongside implementation (TDD or alongside approach) |
| **Logging** | Add structured logs for debugging and monitoring |
| **Errors** | Implement proper error handling and user messaging |
| **Migration** | Create database migrations; test rollback |
| **Types** | Use TypeScript strict mode; validate inputs with Zod |

### 3. Verify Before Review

Run the package-specific CI command from [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md#package-specific-expectations):

```bash
# Example for backend
cd backend
pnpm run build
pnpm run test -- --ci
pnpm run lint
pnpm run validate:openapi
```

Use the [Review Checklist](./STELLAR_WAVE_CHECKLIST.md#review-checklist) before opening your PR.

### 4. Open PR with Context

In your PR description:
- Link the original issue
- Briefly describe implementation approach
- Highlight any design decisions or trade-offs
- Note any new dependencies added
- Confirm you've completed the Stellar Wave checklist

Example:
```markdown
Fixes #42 (Implement auction mechanism)

## Implementation
- Implemented blind auction with commit-reveal phases
- Added auction state machine to validate transitions
- Integrated with existing raffle contract interface

## Quality Checklist
- [x] Tests: 84% coverage, integration tests for state machine
- [x] Docs: OpenAPI spec, runbook for operators
- [x] Logging: Structured logs for each auction phase
- [x] Errors: User-friendly messages, proper HTTP status codes
- [x] Migrations: TypeORM migration for auction_events table, rollback tested

## New Dependencies
None

## Breaking Changes
None; auction mechanism is additive feature
```

### 5. Address Review Feedback

Reviewers will check:
- Does implementation satisfy the Stellar Wave standard?
- Are there gaps in tests, docs, or error handling?
- Does code follow package conventions?
- Are there security or performance concerns?

Iterate until all feedback addressed.

---

## Common Pitfalls

| Pitfall | How to Avoid |
|---|---|
| **Missing Tests** | Write tests first or alongside code; aim for 80%+ coverage |
| **Vague Error Messages** | Put yourself in user's shoes; error should explain what went wrong and suggest fix |
| **No Logging** | Add structured logs with context; should be debuggable from logs alone |
| **Incomplete Migrations** | Test `migration:revert` works; include data migration logic, not just schema |
| **Undocumented Design Decisions** | Comment non-obvious logic; document why, not just what |
| **Ignored Package Conventions** | Read existing code in the package; follow established patterns |
| **Cross-Package Integration Issues** | Test with real dependencies; don't mock away integration problems |

---

## Questions?

Refer to:
- [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md) — comprehensive requirements
- [ARCHITECTURE.md](../ARCHITECTURE.md) — ecosystem design and data flows
- Package README — language, tools, and conventions

If guidance is missing or unclear, open an issue labeled `question` or `documentation`.

---

**Remember:** Stellar Wave issues are about raising the bar collectively. High standards make the codebase more maintainable, debuggable, and reliable for everyone.

Happy building! 🌊
