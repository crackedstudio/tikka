import { SetMetadata } from '@nestjs/common';

export const SKIP_IDEMPOTENCY_KEY = 'SKIP_IDEMPOTENCY';

/**
 * Opt out a route or controller from mandatory idempotency checks on mutating HTTP requests.
 */
export const SkipIdempotency = () => SetMetadata(SKIP_IDEMPOTENCY_KEY, true);
