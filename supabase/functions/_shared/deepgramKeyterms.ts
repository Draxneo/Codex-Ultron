/**
 * Deepgram Keyterm Boosting — shared source of truth.
 *
 * Returns a URL query string fragment of `&keyterm=...` params that biases
 * Deepgram's nova-3 model toward our company name + HVAC vocabulary.
 *
 * Usage:
 *   const kt = await buildKeytermParams(supabase);
 *   const url = `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en${kt}`;
 *
 * Sourced from company_settings.company_name (dynamic) + a static HVAC list
 * so white-labeling for another company swaps the brand terms automatically.
 *
 * Note: keyterm is a nova-3-only parameter. Older models (nova-2) use the
 * deprecated `keywords` syntax — bump to nova-3 before adding these.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Static HVAC + staff vocabulary — applies to every tenant
const STATIC_KEYTERMS = [
  // Core staff first names that appear constantly in calls
  "Clint",
  "Matt",
  "Jonathan",
  // Industry
  "HVAC",
  "AHRI",
  "SEER",
  "tonnage",
  // Major brands
  "Goodman",
  "Trane",
  "Carrier",
  "Lennox",
  "Daikin",
  "Amana",
  "Rheem",
  // Common parts/jargon Deepgram fumbles
  "condenser",
  "evaporator",
  "plenum",
  "capacitor",
  "compressor",
  "thermostat",
];

function encodeKeyterms(terms: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of terms) {
    const t = (raw || "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`keyterm=${encodeURIComponent(t)}`);
  }
  return parts.length ? `&${parts.join("&")}` : "";
}

/**
 * Build the keyterm query string. Reads company_name from company_settings
 * and adds it (plus a "<name> and Sons"-style variant if it contains a space)
 * alongside the static HVAC vocabulary.
 */
export async function buildKeytermParams(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const dynamic: string[] = [];
  try {
    const { data } = await supabase
      .from("company_settings")
      .select("key, value")
      .eq("key", "company_name")
      .maybeSingle();
    const name = ((data as any)?.value || "").trim();
    if (name) {
      dynamic.push(name);
      // Also boost the first significant word of the company name
      // (e.g. "Carnes and Sons" → also boost "Carnes")
      const firstWord = name.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 3 && firstWord.toLowerCase() !== name.toLowerCase()) {
        dynamic.push(firstWord);
      }
    }
  } catch (err) {
    console.error("[deepgramKeyterms] Failed to load company_name:", err);
  }
  return encodeKeyterms([...dynamic, ...STATIC_KEYTERMS]);
}

/**
 * Synchronous variant for hot paths (live WS) where we want to avoid an async
 * DB read on every connection. Caller passes the already-loaded company name.
 */
export function buildKeytermParamsSync(companyName?: string | null): string {
  const dynamic: string[] = [];
  const name = (companyName || "").trim();
  if (name) {
    dynamic.push(name);
    const firstWord = name.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3 && firstWord.toLowerCase() !== name.toLowerCase()) {
      dynamic.push(firstWord);
    }
  }
  return encodeKeyterms([...dynamic, ...STATIC_KEYTERMS]);
}
