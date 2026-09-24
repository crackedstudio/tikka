# Dependency Vulnerability Audit

`scripts/check-dependency-audit.js` runs `pnpm audit` and fails the CI security job when a
high-severity advisory is **not** on the accepted list in
`scripts/dependency-audit-config.js`. It exists because nothing else in CI looked at the
dependency graph: Dependabot opens version bumps on its own schedule, but it does not fail a
build that introduces a vulnerable transitive dependency, and with 2400+ transitive packages
across five services that is not something review can catch by eye.

```bash
pnpm check:audit                        # runs pnpm audit and evaluates it
pnpm check:audit /tmp/audit.json        # evaluate an already saved report
AUDIT_SEVERITY=critical pnpm check:audit  # only critical findings fail the run
```

Exit codes:

- `0` — every finding at or above the threshold is accepted
- `1` — at least one finding is new, or an accepted one got worse
- `2` — the report could not be parsed, or it contains no dependencies at all. That second case
  is reported as a failure on purpose: an empty report means the audit did not run (no lockfile,
  no network), and a gate that passes when its scanner is broken is worse than no gate

## Why there is an accepted list

The tree already carries a backlog of advisories it inherited, and a gate that red-lights every
pull request on that backlog gets disabled within a week. So the gate is comparative: it stops
**new** advisories and **escalations**, and prints the backlog it is standing on.

Today that backlog is 42 advisories at `high` or above — 40 `high`, 2 `critical` — out of 2442
scanned dependencies (the full report also has 47 `moderate` and 12 `low`, which are below the
threshold and do not fail anything):

| Package                              | Advisories |
| ------------------------------------ | ---------- |
| `axios`                              | 10         |
| `multer`                             | 6          |
| `@fastify/middie`                    | 4          |
| `@nestjs/platform-fastify`           | 3          |
| `js-yaml`                            | 3          |
| `undici`                             | 3          |
| `extract-zip`, `vitest`, and 10 more | 1–2 each   |

40 of the 42 have a published fix; `extract-zip` does not. The list is in the config file with
the patched version each one would need. **These are real problems, not exemptions** — they are
listed so that the gate can be introduced without fixing 18 packages in one pull request. The
fix itself is a dependency upgrade pass of its own.

## Accepting a finding

Adding an entry is a deliberate decision. It is reasonable when:

1. **The fix is blocked outside this repository** — no patched release exists, or the only fix is
   a major version the framework does not support yet.
2. **The vulnerable path is not reachable here** — the advisory is in a dev-only tool (formatting,
   test UI, build helpers) that never runs in production, and the entry says so.

It is not reasonable to accept a finding because the upgrade looks large, or because tests fail
after bumping the package. Those are the cases the gate exists for.

Every entry carries the advisory id, package, severity and the patched version, so the list can
be audited by anyone reading it. When an entry no longer shows up in `pnpm audit`, the gate
prints it under "no longer reported" — delete it then, so the list keeps meaning something.

## SBOM

The `sbom` job in `.github/workflows/ci.yml` publishes a CycloneDX BOM (~2400 components) as a
build artifact for pushes to `main`. It runs there and not on pull requests because a PR deploys
nothing and the file is 2.5 MB. `cdxgen` reads `pnpm-lock.yaml` directly, so the job needs no
`pnpm install` and finishes in about a minute. The job fails when the generated BOM has no
components, so a broken scanner cannot publish an empty artifact that looks fine.

## What this does not cover

- **Dependabot security updates** are a repository setting, not a file: settings → Code security
  → "Dependabot security updates" has to be enabled there (version updates are already on).
- **`pnpm.overrides` drift** is not checked. The override on `@stellar/stellar-sdk` currently
  resolves to `16.2.0` in `pnpm-lock.yaml` while its own range allows `16.3.0`, and `17.1.0` is
  out. A check for that is worth adding, but it fails on day one unless the lockfile is refreshed
  in the same pull request — the override itself is not what is holding the patch back.
