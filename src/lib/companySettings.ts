import { supabase } from "@/integrations/supabase/client";

export async function getCompanySetting(key: string, fallback = ""): Promise<string> {
  const { data, error } = await supabase
    .from("company_settings" as any)
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  return (data as any)?.value ?? fallback;
}

export async function getCompanySettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const { data, error } = await supabase
    .from("company_settings" as any)
    .select("key, value")
    .in("key", keys);

  if (error) throw error;

  return Object.fromEntries(((data as any[]) || []).map((row) => [row.key, row.value ?? ""]));
}

export async function getPublicCompanySettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("get_public_company_settings" as any);
  if (error) throw error;
  return (data || {}) as Record<string, string>;
}

/**
 * Upsert a company setting. Used by admin settings cards that let the user
 * edit a single key/value pair. The table has a UNIQUE constraint on `key`,
 * so a plain upsert with onConflict='key' replaces the existing row.
 *
 * Empty-string values are preserved (not converted to null) so a setting
 * can be intentionally cleared from the UI.
 */
export async function setCompanySetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from("company_settings" as any)
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw error;
}
