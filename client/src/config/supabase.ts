import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Supabase configuration using validated environment variables
const supabaseUrl = env.supabase.url;
const supabaseAnonKey = env.supabase.anonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database table name for raffle metadata
export const RAFFLE_METADATA_TABLE = env.supabase.table;
