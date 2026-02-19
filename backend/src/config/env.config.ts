/**
 * Environment configuration for tikka-backend.
 */
export const env = {
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  indexer: {
    url: process.env.INDEXER_URL ?? 'http://localhost:3002',
    timeoutMs: parseInt(process.env.INDEXER_TIMEOUT_MS ?? '5000', 10),
  },
} as const;
