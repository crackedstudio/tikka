/**
 * Environment configuration for tikka-backend.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for server-side metadata CRUD.
 */
export const env = {
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
} as const;
