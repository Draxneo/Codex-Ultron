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
