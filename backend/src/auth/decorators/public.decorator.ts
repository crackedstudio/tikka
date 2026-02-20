import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark route as public — JwtAuthGuard will skip authentication. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
