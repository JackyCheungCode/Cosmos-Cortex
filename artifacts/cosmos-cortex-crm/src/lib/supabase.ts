import { createClient } from "@supabase/supabase-js";

// Public client settings fallback for static Pages builds where Vite env injection
// may be missing. Never put a Supabase service-role key in the browser bundle.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://texdpbvtqbnfjdstqinh.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_f7pxYLPujC_QfbGW_tPp-w_7nggFVmV";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;
