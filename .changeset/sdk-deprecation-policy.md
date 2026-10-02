---
'@tikka/sdk': patch
---

Enforce the deprecation and API-compatibility policy in CI.

`scripts/check-api-compat.mjs` fails a PR that removes or renames a public
export without a major bump, and `sdk/src/deprecation.spec.ts` fails when a
`@deprecated` export stops being public or resolvable at runtime. `docs/RELEASE.md`
documents the enforced announce/survive/remove lifecycle and records the decision
to adopt 1.0-grade removal rules while the package is still pre-1.0.
