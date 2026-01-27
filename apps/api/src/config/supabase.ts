import { createClient } from "@supabase/supabase-js";
import { config } from "./vars";

export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const supabase = createClient(config.supabase.url, config.supabase.anonKey);
