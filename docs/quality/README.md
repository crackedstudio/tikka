# Tikka Quality Standards

Welcome to the quality standards directory for the Tikka ecosystem. Here you'll find the guidelines and checklists that define what it means to ship high-quality, production-ready code.

---

## Documents

### 📋 [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md)
**The definitive standard for Stellar Wave issues.**

Comprehensive requirements across:
- Documentation (API specs, code comments, runbooks)
- Tests (unit, integration, e2e)
- Telemetry (logging, tracing, metrics)
- Error handling (user-facing messages, graceful degradation)
- Database migrations (TypeORM, reversibility, data safety)
- Package-specific expectations (backend, client, indexer, oracle, sdk)
- CI/CD integration and commands

**When to use:** Before implementing a Stellar Wave issue, or reviewing one. Reference this to ensure nothing is missed.

---

### 🎯 [CONTRIBUTOR_GUIDE.md](./CONTRIBUTOR_GUIDE.md)
**Guidance for implementing Stellar Wave issues.**

Explains:
- What qualifies as a Stellar Wave issue
- Step-by-step implementation workflow
- Common pitfalls and how to avoid them
- PR submission best practices

**When to use:** You're about to start a Stellar Wave issue, or onboarding a new contributor.

---

### ⚡ [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
**One-page checklist for fast reference.**

Contains:
- Pre-implementation checklist
- Package-specific CI commands
- PR description template
- Quick links to full docs

**When to use:** Before opening a PR, or as a refresher during implementation.

---

## Quick Start

1. **Implementing your first Stellar Wave issue?**
   - Read [CONTRIBUTOR_GUIDE.md](./CONTRIBUTOR_GUIDE.md) first
   - Then reference [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md) as you build

2. **Need to verify implementation?**
   - Use [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for CI commands and checklist
   - Reference package-specific section in [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md)

3. **Reviewing someone else's Stellar Wave PR?**
   - Check against [STELLAR_WAVE_CHECKLIST.md](./STELLAR_WAVE_CHECKLIST.md) requirements
   - Use [CONTRIBUTOR_GUIDE.md](./CONTRIBUTOR_GUIDE.md) to understand implementation approach

---

## Philosophy

Stellar Wave issues are the ecosystem's commitment to quality. By maintaining high standards:

✅ **Reliability** — Issues are thoroughly tested and documented  
✅ **Maintainability** — Clear logging and comments make debugging easier  
✅ **Scalability** — Error handling and migrations prepare for growth  
✅ **Consistency** — Package-specific expectations align with ecosystem patterns  

Every Stellar Wave issue raises the bar for the entire project.

---

## Feedback

These standards are living documentation. If you find:
- **Missing guidance** — Open an issue with `quality` label
- **Outdated information** — Submit a PR with corrections
- **Unclear requirements** — Ask in PR discussions or issues

Together, we maintain excellence. 🌊

---

**Related Resources:**
- [Tikka Architecture](../ARCHITECTURE.md) — Ecosystem design and data flows
- [Tikka README](../../README.md) — Project overview and setup
- [GitHub Workflows](.github/workflows/) — CI/CD configuration
