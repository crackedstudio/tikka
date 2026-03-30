import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.config';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const supabaseProvider = {
  provide: SUPABASE_CLIENT,
  useFactory: (): SupabaseClient => {
    const { url, serviceRoleKey } = env.supabase;
    console.log(`Supabase client creating with URL: ${url}`);
    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment',
      );
    }
    const client = createClient(url, serviceRoleKey);
    console.log("Supabase client created.");
    return client;
  },
};
