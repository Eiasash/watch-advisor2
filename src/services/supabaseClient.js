import { createClient } from "@supabase/supabase-js";

// watch-advisor2 production project — embedded so the app works out of the
// box without requiring VITE_SUPABASE_* env vars at build. The anon key is
// a public client identifier by Supabase's design; RLS policies enforce
// access (see netlify/functions/_migrations.json's email-restricted policies).
// Same pattern as ward-helper/src/storage/cloud.ts. Forks override via
// .env.production -> Vite's import.meta.env injection at build time.
const FALLBACK_SUPABASE_URL = "https://oaojkanozbfpofbewtfq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hb2prYW5vemJmcG9mYmV3dGZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMzQ0MTAsImV4cCI6MjA4NjcxMDQxMH0.lfgfGWy9CFxwUeJlzQ0kmThDfkhK4Hwne4b6KzBz30s";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
