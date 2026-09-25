# `scripts/`

Repo-root utility scripts. One entry per file below: what it does, how to run
it, and who invokes it. Keep this index up to date when you add, change, or
remove a script so these don't become write-only.

> **Note:** This directory covers **monorepo-root** tooling only. Package-level
> scripts live with their package — e.g. the WCAG colour-contrast checker is
> `client/scripts/check-contrast.js` (run from `client/` by the CI `client`
> job), not here.

## Contents

| File | Purpose | Invoked by |
| ---- | ------- | ---------- |
| [`check-dependencies.js`](#check-dependenciesjs) | Report shared-framework versions across packages and flag un-approved major-version drift | `npm run check:dependencies` (manual / local) |
| [`dependency-config.js`](#dependency-configjs) | Declares approved version-mismatch exceptions consumed by `check-dependencies.js` | `require()`d by `check-dependencies.js` |
| [`DEPENDENCY_EXCEPTIONS.md`](./DEPENDENCY_EXCEPTIONS.md) | Human-facing policy for how version drift is managed and approved | Reference doc (read by maintainers) |

---

### `check-dependencies.js`

**Purpose:** Reads the root `package.json` plus each workspace
(`backend`, `client`, `indexer`, `oracle`, `sdk`) and reports the versions of
shared frameworks (NestJS, Jest, ts-jest, ESLint, TypeScript,
`@stellar/stellar-sdk`, fast-check, rxjs, reflect-metadata, …). It flags any
**major/minor** version mismatch for a framework used in more than one package,
unless that mismatch is listed as an approved exception in
`dependency-config.js`.

**Inputs:**
- `package.json` files across the repo (read from disk; no arguments).
- Approved exceptions from `dependency-config.js`.

**Output / exit code:**
- Prints a formatted dependency report to stdout.
- Exits `0` when there are no unflagged mismatches.
- Exits `1` when one or more un-approved mismatches are found (so it can gate CI
  or a pre-commit check).

**Usage:**
```bash
npm run check:dependencies
# or directly:
node scripts/check-dependencies.js
```

**Invoked by:** the `check:dependencies` npm script in the root `package.json`.
Run manually / locally today; safe to wire into CI because of its exit code.

---

### `dependency-config.js`

**Purpose:** Configuration module (not an executable) that declares the set of
**approved** cross-package version mismatches. Each entry documents the
framework, the reason the drift is acceptable, and which packages it applies to.

**Inputs / outputs:** none at runtime — it `module.exports` an object of the
shape `{ allowed: { '<framework>': { reason, packages } } }`.

**Usage:** not run directly. `check-dependencies.js` `require()`s it to decide
which mismatches are allowed vs. flagged. Edit this file (and note the rationale)
when introducing intentional version drift.

**Invoked by:** `check-dependencies.js`.

---

### `DEPENDENCY_EXCEPTIONS.md`

**Purpose:** The written policy behind the two scripts above — why the monorepo
tolerates intentional version drift, the acceptance criteria for a new
exception, and how to run the checker. Start here to understand the process.

**Invoked by:** nobody (documentation). Read it before adding an entry to
`dependency-config.js`.

---

## Adding a new script

1. Add the file here (or in the relevant package if it's package-specific).
2. Wire it into an npm script and/or CI workflow so it's discoverable.
3. Add a row to the table above and a short section describing purpose, inputs,
   and who invokes it.
