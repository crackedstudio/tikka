import { createClient } from "@supabase/supabase-js";

// Supabase configuration
const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database table name for raffle metadata
export const RAFFLE_METADATA_TABLE = "raffle_metadata";
