import { SetMetadata } from '@nestjs/common';
import type { AdminScope } from './admin-scopes';

export const REQUIRE_ADMIN_SCOPES_KEY = 'requireAdminScopes';

export const RequireAdminScopes = (...scopes: AdminScope[]) =>
  SetMetadata(REQUIRE_ADMIN_SCOPES_KEY, scopes);
