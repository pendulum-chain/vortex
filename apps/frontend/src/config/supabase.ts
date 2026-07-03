import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The app owns token storage and refresh (backend /auth/refresh + a single scheduler).
    // Keep the client passive so it doesn't run a competing background refresh.
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false
  }
});
