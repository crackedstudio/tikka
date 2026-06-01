import type { AdminScope } from './admin-scopes';

export const ADMIN_AUTH_REQUEST_KEY = 'adminAuth';

export interface AdminAuthContext {
  adminId: string;
  scopes: readonly AdminScope[];
  isFullAdmin: boolean;
}

export type AdminRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  [ADMIN_AUTH_REQUEST_KEY]?: AdminAuthContext;
};
