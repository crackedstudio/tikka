# Implement Replay Security Controls and Resolve Build/Test Failures

## Description
This PR hardens the backend by guarding replay operations with a mandatory dry-run mode and resolving all outstanding TypeScript build errors and failing test cases across the backend suite.

## Key Changes
- **Replay Security Controls**:
  - Implemented `dry-run` preview support in the Replay Service.
  - Added `confirmed` flag enforcement to prevent accidental mutating replay executions.
  - Replay endpoints now return detailed execution plans, summary statistics, and target ranges.
- **Backend Stabilization (Build Fixes)**:
  - Corrected truncated Zod types in `env.schema.ts` (`METADATA_CACHE_TTL_SECONDS` and `RAFFLE_CREATE_RATE_WINDOW_SECONDS`) and removed the duplicate `REDIS_URL` definition.
  - Fixed Zod readonly array assignment issues in `subscribe.dto.ts` and `device-token.dto.ts`.
  - Removed unused `events` property mapping when calling service functions from `notifications.controller.ts`.
  - Added missing NestJS decorators and Swagger imports (`@Res`, `@Throttle`, `@ApiHeader`) to `raffles.controller.ts`.
  - Removed the duplicate `MetadataService` provider from `RafflesModule`.
  - Added missing `cursor` and `offset` properties to the `LeaderboardQueryDto` class.
- **Test Suite Enhancements (Fixes)**:
  - `env.schema.spec.ts`: Updated expectations to reflect the new `METADATA_CACHE_TTL_SECONDS` 3600-second default and the removed duplicate `REDIS_URL` entry.
  - `search.service.spec.ts` / `search.controller.spec.ts`: Fixed mocks to reflect the updated `SearchOptions` object argument signature.
  - `sentry.spec.ts`: Updated Sentry configuration expectations to include `integrations` and `profilesSampleRate` appended by the Node profiling module.
  - `auth.service.spec.ts`: Corrected the Supabase `.update().eq()` query builder mock to emulate chaining correctly, and updated expected error messages to match the implementation.

## Acceptance Criteria
- [x] Tests cover dry-run, confirmed replay, invalid range, and permission failure.
- [x] Monitor UI can show dry-run results before execution.
- [x] Clean build (`npm run build` succeeds without TypeScript errors).
- [x] Test suite passes cleanly (`npm run test`).

Fixes #547
