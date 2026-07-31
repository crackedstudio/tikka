# @tikka/sdk Deprecation Policy

External integrators build on `@tikka/sdk`. This policy defines how we version the public API, how long deprecated surfaces remain available, and how deprecations are announced.

Related: [Release Policy](../docs/RELEASE.md) · [Changelog](../CHANGELOG.md)

## SemVer commitment

`@tikka/sdk` follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

| Bump | When |
|------|------|
| **MAJOR** | Breaking changes to the public API (removed exports, incompatible signature/behavior changes) |
| **MINOR** | Backward-compatible features **or** marking public API as deprecated |
| **PATCH** | Bug fixes and internal changes that do not alter the public contract |

**Public API** means exported symbols from `@tikka/sdk`, `@tikka/sdk/read`, and `@tikka/sdk/write` (and their published TypeDoc surface), plus documented CLI flags.

During `0.x.y` pre-1.0 development, breaking changes may ship in a MINOR bump when unavoidable. Even then we prefer deprecation first and document every break under `### Removed` / migration notes in the changelog.

## Deprecation window

We deprecate before we remove.

1. **Announce** in a **MINOR** release (semver requires a minor bump when marking public API deprecated).
2. **Keep working** for at least **one full MINOR release cycle** after announcement (example: deprecated in `0.2.0` → still present through `0.3.x`).
3. **Remove** only in a subsequent **MAJOR** release (or, while still on `0.x`, the next MINOR that is explicitly documented as breaking).

Widely used APIs may get a longer window; security-driven changes may shorten it when keeping the old path would prolong exposure — always called out in the changelog.

## How deprecations are announced

Every public deprecation must include **both**:

1. **JSDoc `@deprecated`** on the symbol (and TypeScript declaration), naming the replacement and target removal version when known:

   ```ts
   /**
    * @deprecated Since 0.2.0 — use {@link SubmitResult} instead. Removal planned in 1.0.0.
    */
   export type LegacySubmitResult = SubmitResult;
   ```

2. **CHANGELOG** entry under `### Deprecated` for that SDK release (see template below). Prefer a one-line migration hint in the same entry.

Optional but encouraged: a one-time runtime warning (`util.deprecate` / equivalent) for call sites that still execute.

## SDK changelog section template

Add a dated SDK release block to the root [`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog style). Use this skeleton for every `@tikka/sdk` release:

```markdown
## [sdk-vMAJOR.MINOR.PATCH] - YYYY-MM-DD

### Added
- …

### Changed
- …

### Fixed
- …

### Deprecated
- `SymbolName` — use `Replacement` instead. Removal planned in MAJOR.0.0.
  Migration: …

### Removed
- `SymbolName` — was deprecated in sdk-vX.Y.0. Migration: …

### Security
- …
```

Rules for release hygiene:

- Every `### Deprecated` item must have a matching `@deprecated` JSDoc on the symbol.
- Every `### Removed` item must have been listed under `### Deprecated` in an earlier release (except documented security exceptions).
- Breaking removals bump **MAJOR** (or an explicitly breaking `0.x` MINOR) and include migration notes.

## Checklist (before merging an SDK PR that touches public API)

- [ ] SemVer bump intent is clear (PATCH / MINOR / MAJOR)
- [ ] New deprecations use `@deprecated` + changelog `### Deprecated`
- [ ] Removals only after the deprecation window and under `### Removed`
- [ ] TypeDoc / README examples no longer recommend the deprecated path

## References

- [Semantic Versioning](https://semver.org/) — deprecating functionality
- [Keep a Changelog](https://keepachangelog.com/)
- [JSDoc `@deprecated`](https://jsdoc.app/tags-deprecated)
