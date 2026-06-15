import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser-safe Supabase client (anon key only — safe to expose).
// Used to store saved stories in the cloud.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;
