# ADR 0002: Commit generated client API types

## Context

The client imports `client/src/types/api.generated.ts` as part of its source
tree. The file is generated from `backend/openapi.json`, so a backend API
change can make the committed client contract stale unless generation is
checked in CI.

## Decision

Keep `client/src/types/api.generated.ts` committed and run its generator in CI
after regenerating and validating the backend OpenAPI document. CI fails when
generation changes the committed file.

## Alternatives rejected

Generating the file only into `node_modules/.cache` would remove a large
generated file from the repository, but would make the client source depend on
an implicit build step and hide contract changes from normal reviews. The
freshness check provides the desired protection while preserving a directly
available, reviewable type contract.

## Consequences

Client API types must be regenerated and committed when the OpenAPI document
changes. Formatting and linting ignore the generated file, while CI continues
to verify that it matches the committed backend specification.