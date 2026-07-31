# Release Policy Verification — Issue #627

## Status: ✅ COMPLETE

All acceptance criteria for the release policy have been implemented and verified.

---

## Acceptance Criteria

### 1. ✅ README or release docs explain how to cut a release

**Location:** `docs/RELEASE.md`

**Coverage:**
- SDK Release (5 steps): version bump → changelog → tag → npm publish → TypeDoc
- App Release (5 steps): version bump → changelog → tag → staging → production
- Database Migration (5 steps): create migration → include rollback → test locally → deploy → document

**Verification:**
```bash
grep -n "### SDK Release\|### App Release\|### Database Migration" docs/RELEASE.md
```

---

### 2. ✅ SDK TypeDoc/package versions tie back to changelog entries

**SDK Version:** `sdk/package.json` → `"version": "0.1.0"`

**Changelog Entry:** `CHANGELOG.md` → `## [Unreleased]` section with template

**TypeDoc Integration:** `sdk/package.json` includes `"docs": "typedoc"` script

**Verification:**
- SDK version is semantic (MAJOR.MINOR.PATCH)
- Changelog uses Keep a Changelog format
- TypeDoc script configured to auto-generate docs

---

### 3. ✅ Define release types and version bump rules

**Location:** `docs/RELEASE.md` → "Versioning" section

**Rules Defined:**

| Package | Versioning | Rules |
|---------|-----------|-------|
| SDK | Semantic | MAJOR: breaking changes, MINOR: features, PATCH: fixes |
| Apps | Calendar | YYYY.MM.PATCH format (release date + hotfix counter) |
| Database | Timestamp | YYYYMMDD_HHMMSS_description.sql |

**Verification:**
```bash
grep -A 3 "### SDK\|### Apps\|### Database" docs/RELEASE.md
```

---

### 4. ✅ Add changelog template or process

**Location:** `CHANGELOG.md` → "Unreleased" section

**Template Sections:**
- Added
- Changed
- Fixed
- Deprecated
- Removed
- Migration
- Dependencies

**Format:** Keep a Changelog (https://keepachangelog.com/)

**Verification:**
```bash
head -30 CHANGELOG.md
```

---

### 5. ✅ Include migration and rollback requirements

**Migration Template:** `backend/database/MIGRATION_TEMPLATE.sql`

**Rollback Procedures:**
- Template includes UP and DOWN sections
- Comments document rollback testing
- `docs/RELEASE.md` → "Database Migration" section specifies:
  - Migrations must be reversible
  - Rollback tested locally before deploy
  - Rollback procedure documented in comments

**Verification:**
```bash
cat backend/database/MIGRATION_TEMPLATE.sql
grep -A 5 "### Database" docs/RELEASE.md
```

---

## Documentation Structure

```
/workspaces/tikka/
├── README.md                          # Links to RELEASE.md
├── CHANGELOG.md                       # Keep a Changelog format
├── docs/
│   └── RELEASE.md                     # Complete release policy
└── backend/
    └── database/
        ├── MIGRATION_TEMPLATE.sql     # Migration template with rollback
        └── migrations/                # Timestamped migration files
```

---

## How to Cut a Release

### SDK Release
```bash
cd sdk
# 1. Update version in package.json
# 2. Add entry to ../../CHANGELOG.md
# 3. Commit and tag
git tag sdk-v0.1.0
# 4. Publish
npm publish
# 5. Generate TypeDoc
npm run docs
```

### App Release
```bash
# 1. Update version in package.json (if applicable)
# 2. Add entry to CHANGELOG.md
# 3. Commit and tag
git tag app-2026.05.0
# 4. Deploy to staging
# 5. Deploy to production
```

### Database Migration
```bash
# 1. Create migration file
touch backend/database/migrations/20260528_120000_description.sql
# 2. Include UP and DOWN procedures
# 3. Test locally
npm run migrate:up
npm run migrate:down
# 4. Deploy before app release
# 5. Document in CHANGELOG.md
```

---

## Rollback Procedures

### SDK Rollback
```bash
npm unpublish @tikka/sdk@0.1.0
git revert <commit-hash>
git push
```

### App Rollback
```bash
git revert <tag>
# Redeploy previous version
```

### Database Rollback
```bash
npm run migrate:down
# Verify data integrity
```

---

## Cross-Package Releases

When multiple packages release together:
1. Coordinate versions and changelog entries
2. Tag all commits: `release-2026.05.28`
3. Deploy in order: Database → Backend → Indexer/Oracle → Client
4. Verify each step
5. Document in main `CHANGELOG.md`

---

## Verification Checklist

### SDK
- [ ] Tests pass (`npm test`)
- [ ] TypeDoc builds (`npm run docs`)
- [ ] No breaking changes, or MAJOR version bumped
- [ ] Changelog entry added
- [ ] npm publish succeeds

### Apps
- [ ] All package tests pass
- [ ] Root build passes
- [ ] Database migrations tested (if applicable)
- [ ] Staging deployment successful
- [ ] Integration tests pass
- [ ] Changelog entry added
- [ ] Production deployment scheduled

### Database
- [ ] Migration is reversible
- [ ] Rollback tested locally
- [ ] No data loss in rollback
- [ ] Deployed before app release

---

## References

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Calendar Versioning](https://calver.org/)
- Full policy: `docs/RELEASE.md`
- Changelog: `CHANGELOG.md`
