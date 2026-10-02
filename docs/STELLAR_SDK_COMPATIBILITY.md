# Stellar SDK Compatibility

This document describes which versions of `@stellar/stellar-sdk` are supported
by `@tikka/sdk`, explains the differences between major versions, and guides
consumers who want to pin a specific version.

---

## Supported range

```
@stellar/stellar-sdk >=14.0.0 <17.0.0
```

This range is declared as a `peerDependency` in `sdk/package.json`.  Within the
monorepo, `pnpm.overrides` pins the *development* version to `^16.1.0`, which is
the version the CI standard path (`ci.yml`) always uses.  A separate weekly
matrix (`.github/workflows/sdk-compat.yml`) installs each supported major in
isolation and runs the full unit-test suite against it.

---

## Compatibility matrix

| `@stellar/stellar-sdk` | Supported | Tested in CI | Notes |
|---|:---:|:---:|---|
| 14.x (≥ 14.3.0) | ✅ | ✅ (weekly matrix) | `rpc` namespace available as alias; ESM deps absent → `transformIgnorePatterns` narrower (see below) |
| 15.x | ⚠️ | ❌ | Not explicitly tested; in-range but not in the matrix. File an issue if you hit breakage. |
| 16.x (≥ 16.1.0) | ✅ | ✅ (standard CI + weekly matrix) | Development baseline; `rpc` is the primary namespace |
| < 14.0.0 | ❌ | ❌ | `rpc` namespace absent; not supported |
| ≥ 17.0.0 | ❌ | ❌ | Untested; add to matrix after evaluating breaking changes |

---

## Key differences between v14 and v16

### RPC namespace

Both v14 and v16 export `rpc` as a namespace containing `rpc.Server`,
`rpc.Api.*`, etc.  The `@tikka/sdk` codebase imports exclusively from the `rpc`
namespace (never from the legacy `SorobanRpc` alias), so no source changes are
needed when moving between v14 and v16.

### ESM-only transitive dependencies (v16 only)

`stellar-sdk@16` introduces ESM-only transitive dependencies:
`uint8array-extras`, `@noble/curves`, `@noble/hashes`, and `@scure/*`.  Because
Jest runs in CommonJS mode by default, these packages must be **transformed** by
`ts-jest` rather than loaded natively.

The workaround is already present in the Jest configs:

```js
// sdk/jest.config.cjs  (standard CI path — v16 baseline)
transformIgnorePatterns: [
  '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
],
```

```js
// sdk/jest.config.compat.cjs  (used by sdk-compat.yml for all matrix versions)
// Same pattern — harmless on v14 where those packages are absent.
transformIgnorePatterns: [
  '/node_modules/(?!.*(uint8array-extras|@noble|@stellar|@scure|base32\\.js)/)',
],
```

The `oracle/jest.config.js` carries an equivalent pattern for the same reason.

**Can the workarounds be removed?**  Not while the supported range includes
v16 and Jest runs in CJS mode.  If the monorepo ever migrates to native ESM Jest
(using `--experimental-vm-modules`), these patterns become unnecessary.  Until
then, widening the pattern to cover v16's deps — even when v14 is installed — is
the safest approach because the extra entries are simply ignored when the
packages are absent.

### `@stellar/freighter-api` peer

`sdk/package.json` also declares `@stellar/freighter-api ^3.1.0` as a direct
dependency.  Freighter's own peer range tracks `stellar-sdk >=10`, so no
version conflict arises across v14–v16.

---

## Upgrading to a new stellar-sdk major

1. Read the stellar-sdk release notes and changelog for breaking changes in the
   `rpc` namespace, XDR generation, or key APIs (`TransactionBuilder`,
   `Contract`, `Address`, `xdr.*`).
2. Add the new major version to the `matrix.stellar-sdk-version` list in
   `.github/workflows/sdk-compat.yml`.
3. Run the matrix locally if you want immediate feedback:
   ```bash
   pnpm add "@stellar/stellar-sdk@<new-version>"
   pnpm exec jest --config jest.config.compat.cjs
   ```
4. Fix any failures (type errors or runtime breakage) in `sdk/src/`.
5. Widen the `peerDependencies` range in `sdk/package.json` to include the new
   major, e.g. `>=14.0.0 <18.0.0`.
6. Update the compatibility matrix table in this document.
7. Open a PR; the `sdk-compat.yml` workflow will validate all legs.
8. After merge, bump `pnpm.overrides["@stellar/stellar-sdk"]` in the root
   `package.json` to `^<new-major>.0.0` to keep the development baseline
   current.

---

## Dropping support for an old major

1. Remove the version from the `sdk-compat.yml` matrix.
2. Narrow the `peerDependencies` range in `sdk/package.json`.
3. Update the table in this document.
4. Add an entry to `CHANGELOG.md` under the next SDK major bump.

---

## Running the matrix locally

```bash
# Install the version you want to test
cd sdk
pnpm add "@stellar/stellar-sdk@14.3.0" --no-lockfile

# Run the compat suite (excludes testnet/integration specs)
pnpm exec jest --config jest.config.compat.cjs

# Restore the workspace baseline
cd ..
pnpm install --frozen-lockfile
```

---

## References

- [`sdk/package.json`](../sdk/package.json) — `peerDependencies` declaration
- [`sdk/jest.config.cjs`](../sdk/jest.config.cjs) — standard Jest config (v16 baseline)
- [`sdk/jest.config.compat.cjs`](../sdk/jest.config.compat.cjs) — compat matrix Jest config
- [`.github/workflows/sdk-compat.yml`](../.github/workflows/sdk-compat.yml) — CI matrix workflow
- [`docs/RELEASE.md`](./RELEASE.md) — SDK versioning and release policy
