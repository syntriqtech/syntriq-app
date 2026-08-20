import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Bypasses RLS entirely — server-only, and only for contexts with no user
// session to work with (the Stripe webhook route, which Stripe calls
// directly rather than an interactive user). Never import this from a
// client component or any route that has a real signed-in user's cookies
// available; use src/lib/supabase/server.ts for those instead.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
