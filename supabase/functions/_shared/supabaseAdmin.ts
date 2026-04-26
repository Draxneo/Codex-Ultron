/**
 * Shared Supabase admin client factory for edge functions.
 * Returns an untyped client (any) to avoid TS friction when the generated
 * Database types drift from edge-function table usage.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const getSupabaseAdmin = (): any =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
