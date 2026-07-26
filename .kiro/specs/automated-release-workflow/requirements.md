# Requirements Document

## Introduction

The automated release workflow system addresses the current manual and error-prone SDK versioning process. The system will implement automated semantic versioning for the SDK package based on conventional commits, while implementing CalVer (Calendar Versioning) for application packages. The workflow will automatically bump versions, generate changelogs, create GitHub releases, and publish the SDK to npm registry.

## Glossary

- **Release_Workflow**: The GitHub Actions workflow that automates version bumping, changelog generation, and publishing
- **SDK_Package**: The `@tikka/sdk` package located in the `sdk/` directory
- **App_Package**: Any of the application packages (backend, indexer, oracle, client)
- **Conventional_Commit**: A commit message following the pattern `type(scope): description` where type includes feat, fix, chore, docs, etc.
- **Breaking_Change**: A commit containing `BREAKING CHANGE:` in the body or footer, requiring a MAJOR version bump
- **Semantic_Version**: A version number following the MAJOR.MINOR.PATCH format (e.g., 1.2.3)
- **CalVer**: Calendar Versioning using YYYY.MM.PATCH format (e.g., 2026.05.0)
- **Changelog**: A file tracking version history and changes in a human-readable format
- **Release_Tag**: A git tag marking a specific version (e.g., sdk-v1.2.0, app-2026.05.0)
- **npm_Registry**: The public npm package repository where @tikka/sdk is published
- **NPM_TOKEN**: A GitHub Actions secret containing npm authentication credentials

## Requirements

### Requirement 1: Parse Conventional Commits for SDK Versioning

**User Story:** As a developer, I want commit messages to determine the next SDK version, so that versioning follows semantic conventions automatically

#### Acceptance Criteria

1. WHEN a commit with prefix `feat:` is merged to master, THE Release_Workflow SHALL bump the SDK_Package MINOR version
2. WHEN a commit with prefix `fix:` is merged to master, THE Release_Workflow SHALL bump the SDK_Package PATCH version
3. WHEN a commit contains `BREAKING CHANGE:` in the message body, THE Release_Workflow SHALL bump the SDK_Package MAJOR version
4. WHEN multiple version-bumping commits are merged together, THE Release_Workflow SHALL apply the highest precedence bump (MAJOR > MINOR > PATCH)
5. WHEN no version-bumping commits are detected, THE Release_Workflow SHALL skip SDK release steps

### Requirement 2: Update SDK Package Version

**User Story:** As a developer, I want the SDK package.json version to update automatically, so that version numbers stay synchronized

#### Acceptance Criteria

1. WHEN a version bump is determined, THE Release_Workflow SHALL update the version field in `sdk/package.json`
2. THE Release_Workflow SHALL commit the version change to the repository with message `chore(release): sdk v{version}`
3. THE Release_Workflow SHALL create a Release_Tag in format `sdk-v{MAJOR}.{MINOR}.{PATCH}`
4. THE Release_Workflow SHALL push both the commit and tag to the master branch
5. WHEN version update fails, THE Release_Workflow SHALL log an error and halt the release process

### Requirement 3: Generate SDK Changelog Entries

**User Story:** As a developer, I want release notes generated from commit messages, so that changes are documented automatically

#### Acceptance Criteria

1. THE Release_Workflow SHALL generate a changelog entry in `CHANGELOG.md` at the repository root
2. THE Release_Workflow SHALL group commits by type: Added (feat), Changed (BREAKING CHANGE), Fixed (fix)
3. THE Release_Workflow SHALL include the release date in ISO format (YYYY-MM-DD)
4. THE Release_Workflow SHALL include links to commits and pull requests
5. THE Release_Workflow SHALL preserve existing changelog entries without modification

### Requirement 4: Create GitHub Release for SDK

**User Story:** As a developer, I want GitHub releases created automatically, so that users can track SDK versions and changes

#### Acceptance Criteria

1. WHEN an SDK version is published, THE Release_Workflow SHALL create a GitHub release with tag `sdk-v{version}`
2. THE Release_Workflow SHALL populate the release body with the changelog entry for that version
3. THE Release_Workflow SHALL mark the release as non-prerelease for versions >= 1.0.0
4. THE Release_Workflow SHALL mark the release as prerelease for versions < 1.0.0
5. WHEN release creation fails, THE Release_Workflow SHALL log an error but continue with npm publishing

### Requirement 5: Publish SDK to npm Registry

**User Story:** As a developer, I want the SDK published to npm automatically, so that it's available for installation immediately

#### Acceptance Criteria

1. WHEN an SDK version tag is created, THE Release_Workflow SHALL authenticate to npm_Registry using NPM_TOKEN
2. THE Release_Workflow SHALL run `pnpm run build` in the sdk directory before publishing
3. THE Release_Workflow SHALL run `pnpm publish --access public --no-git-checks` from the sdk directory
4. THE Release_Workflow SHALL verify the SDK_Package is not marked as private in package.json before publishing
5. WHEN npm publishing fails, THE Release_Workflow SHALL fail the workflow and report the error

### Requirement 6: Generate CalVer Versions for Applications

**User Story:** As a developer, I want app versions generated using calendar versioning, so that deployment dates are clear

#### Acceptance Criteria

1. WHEN Release_Workflow runs on Monday morning (UTC), THE Release_Workflow SHALL generate a CalVer version using format YYYY.MM.PATCH
2. THE Release_Workflow SHALL set PATCH to 0 for the first release of a month
3. WHEN multiple releases occur in the same month, THE Release_Workflow SHALL increment PATCH
4. THE Release_Workflow SHALL create a Release_Tag in format `app-YYYY.MM.PATCH`
5. THE Release_Workflow SHALL skip app versioning when triggered outside of scheduled Monday runs

### Requirement 7: Update Application Package Versions

**User Story:** As a developer, I want app package.json files updated with CalVer, so that versions are consistent

#### Acceptance Criteria

1. WHEN an app CalVer version is generated, THE Release_Workflow SHALL update version fields in backend/package.json, indexer/package.json, oracle/package.json, and client/package.json
2. THE Release_Workflow SHALL commit all version changes with message `chore(release): apps v{YYYY.MM.PATCH}`
3. THE Release_Workflow SHALL create a single Release_Tag for all App_Package versions
4. THE Release_Workflow SHALL push the commit and tag to master branch
5. WHEN version update fails for any App_Package, THE Release_Workflow SHALL fail the workflow and report which package failed

### Requirement 8: Generate Application Changelog Entries

**User Story:** As a developer, I want app releases documented in the changelog, so that deployment history is tracked

#### Acceptance Criteria

1. WHEN an app CalVer version is created, THE Release_Workflow SHALL add an entry to `CHANGELOG.md`
2. THE Release_Workflow SHALL list all commits since the last app release
3. THE Release_Workflow SHALL group commits by package: backend, indexer, oracle, client
4. THE Release_Workflow SHALL include the release date in the changelog entry
5. THE Release_Workflow SHALL append the new entry above previous entries

### Requirement 9: Create GitHub Release for Applications

**User Story:** As a developer, I want app releases tracked on GitHub, so that deployment milestones are visible

#### Acceptance Criteria

1. WHEN an app CalVer version is tagged, THE Release_Workflow SHALL create a GitHub release with tag `app-YYYY.MM.PATCH`
2. THE Release_Workflow SHALL populate the release body with the app changelog entry
3. THE Release_Workflow SHALL mark all app releases as non-prerelease
4. THE Release_Workflow SHALL include deployment instructions in the release notes
5. WHEN GitHub release creation fails, THE Release_Workflow SHALL log the error and continue

### Requirement 10: Enforce Release Workflow Prerequisites

**User Story:** As a developer, I want releases to fail fast if prerequisites are missing, so that broken releases are prevented

#### Acceptance Criteria

1. THE Release_Workflow SHALL verify all CI jobs pass before starting release steps
2. THE Release_Workflow SHALL verify NPM_TOKEN secret exists before attempting npm publish
3. THE Release_Workflow SHALL verify git working directory is clean before committing version changes
4. WHEN any prerequisite check fails, THE Release_Workflow SHALL fail immediately with a descriptive error message
5. THE Release_Workflow SHALL run only on the master branch

### Requirement 11: Configure Scheduled Application Releases

**User Story:** As a developer, I want app releases automated on a schedule, so that weekly deployments are consistent

#### Acceptance Criteria

1. THE Release_Workflow SHALL trigger automatically every Monday at 09:00 UTC
2. THE Release_Workflow SHALL support manual triggering via workflow_dispatch for emergency releases
3. WHEN manually triggered, THE Release_Workflow SHALL accept an optional input to force PATCH increment
4. THE Release_Workflow SHALL log whether the run was triggered by schedule or manual dispatch
5. THE Release_Workflow SHALL skip scheduled runs if no commits exist since last app release

### Requirement 12: Prevent Duplicate SDK Releases

**User Story:** As a developer, I want duplicate releases prevented, so that the same version isn't published twice

#### Acceptance Criteria

1. WHEN the Release_Workflow runs, THE Release_Workflow SHALL check if the current commit already has an sdk-v* tag
2. WHEN an SDK tag already exists for the commit, THE Release_Workflow SHALL skip SDK release steps
3. THE Release_Workflow SHALL log a message indicating the release was skipped due to existing tag
4. WHEN no conventional commits exist since last SDK tag, THE Release_Workflow SHALL skip SDK release steps
5. THE Release_Workflow SHALL allow app releases even when SDK release is skipped

### Requirement 13: Rollback Failed Releases

**User Story:** As a developer, I want failed releases to rollback cleanly, so that the repository stays in a consistent state

#### Acceptance Criteria

1. WHEN npm publishing fails after version commit, THE Release_Workflow SHALL log the error but NOT revert the commit
2. WHEN tag creation fails, THE Release_Workflow SHALL log the error and halt the workflow
3. THE Release_Workflow SHALL provide clear error messages indicating which step failed
4. THE Release_Workflow SHALL include instructions for manual cleanup in error messages
5. WHEN GitHub release creation fails, THE Release_Workflow SHALL continue workflow execution

### Requirement 14: Validate Semantic Version Compliance

**User Story:** As a developer, I want version numbers validated, so that invalid versions are rejected

#### Acceptance Criteria

1. THE Release_Workflow SHALL verify the computed Semantic_Version matches the pattern `\d+\.\d+\.\d+`
2. THE Release_Workflow SHALL verify the computed CalVer matches the pattern `\d{4}\.\d{2}\.\d+`
3. WHEN a computed version is invalid, THE Release_Workflow SHALL fail with a descriptive error
4. THE Release_Workflow SHALL verify the new version is greater than the previous version
5. WHEN version validation fails, THE Release_Workflow SHALL log the current version and computed version

### Requirement 15: Document Release Workflow Configuration

**User Story:** As a developer, I want release configuration documented, so that the workflow can be maintained

#### Acceptance Criteria

1. THE Release_Workflow SHALL include inline comments explaining each major step
2. THE Release_Workflow SHALL document required GitHub secrets in workflow comments
3. THE Release_Workflow SHALL document required permissions (contents: write, packages: write) in workflow file
4. THE Release_Workflow SHALL link to docs/RELEASE.md for versioning policy reference
5. THE Release_Workflow SHALL include example commit messages in workflow documentation
