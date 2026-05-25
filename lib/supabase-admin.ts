import { createClient } from '@supabase/supabase-js';

// Service role client — bypasses RLS.
// Used ONLY for: anonymous slug lookups, try-it quota, invite activation.
// NEVER used in cookie-bound request flows.
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
