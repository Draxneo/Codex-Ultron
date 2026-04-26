/**
 * seed-repair-catalog — One-shot importer for the San Antonio repair pricing CSV.
 *
 * Matches existing rows by lowercased trimmed `name` (idempotent, re-runnable).
 * Pricing fields always overwrite. Description fields use smart merge logic:
 *   1. If only one side has value → use it.
 *   2. If both effectively equal (case/whitespace) → keep existing (no-op).
 *   3. If both differ → keep the longer one, UNLESS existing is broken
 *      (truncated mid-sentence, ends with "...", short + no terminal punctuation,
 *      contains stray artifacts) → then use CSV.
 *   4. Never blanks an existing populated field.
 *
 * Admin-gated (caller must be authenticated and have role 'admin').
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { REPAIR_SEED_DATA } from "./seedData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SeedRow = (typeof REPAIR_SEED_DATA)[number];

interface ExistingRow {
  id: string;
  name: string;
  customer_description: string | null;
  consequences: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Heuristic: does this string look truncated/broken? */
function looksBroken(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.endsWith("...") || t.endsWith("…")) return true;
  // Short fragment without terminal punctuation
  if (t.length < 40 && !/[.!?]$/.test(t)) return true;
  // Stray artifacts (unbalanced quote, lone backslash-n)
  if (/\\n|^["']\s*$|\s["']\s*$/.test(t)) return true;
  // Ends mid-word (no space, no punctuation, ends with a hyphen)
  if (t.endsWith("-")) return true;
  return false;
}

/**
 * Decide which value to write for a description-style field.
 * Returns { value, action: 'kept'|'merged'|'replaced'|'inserted'|'noop' }
 */
function mergeDescription(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): { value: string; action: "kept" | "merged" | "replaced" | "inserted" | "noop" } {
  const ex = (existing ?? "").trim();
  const inc = (incoming ?? "").trim();

  if (!ex && !inc) return { value: "", action: "noop" };
  if (!ex && inc) return { value: inc, action: "inserted" };
  if (ex && !inc) return { value: ex, action: "kept" }; // never blank populated
  if (norm(ex) === norm(inc)) return { value: ex, action: "noop" };

  // Both differ — pick by quality
  if (looksBroken(ex)) return { value: inc, action: "replaced" };
  if (looksBroken(inc)) return { value: ex, action: "kept" };

  // Both look fine → keep longer
  if (ex.length >= inc.length) return { value: ex, action: "merged" };
  return { value: inc, action: "merged" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Auth check: caller must be authenticated admin ─────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userRes.user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Load existing catalog ──────────────────────────────────────────
    const { data: existing, error: loadErr } = await admin
      .from("repair_catalog")
      .select("id, name, customer_description, consequences");
    if (loadErr) throw loadErr;

    const byName = new Map<string, ExistingRow>();
    for (const r of (existing ?? []) as ExistingRow[]) {
      byName.set(norm(r.name), r);
    }

    let inserted = 0;
    let updated = 0;
    let descriptionsMerged = 0;
    let descriptionsReplaced = 0;
    let descriptionsKept = 0;
    const errors: string[] = [];

    // ── Process each CSV row ───────────────────────────────────────────
    for (const row of REPAIR_SEED_DATA as readonly SeedRow[]) {
      const key = norm(row.name);
      const exist = byName.get(key);

      const descMerge = mergeDescription(
        exist?.customer_description,
        row.customer_description,
      );
      const consMerge = mergeDescription(
        exist?.consequences,
        row.consequences,
      );

      // Tally outcomes (only count meaningful actions on existing rows)
      if (exist) {
        for (const m of [descMerge, consMerge]) {
          if (m.action === "merged") descriptionsMerged++;
          else if (m.action === "replaced") descriptionsReplaced++;
          else if (m.action === "kept") descriptionsKept++;
        }
      }

      const payload = {
        name: row.name,
        category: row.category,
        customer_description: descMerge.value,
        consequences: consMerge.value,
        default_severity: row.default_severity,
        default_labor_hours: row.default_labor_hours,
        base_price: row.base_price,
        parts_cost: row.parts_cost,
        member_price: row.member_price,
        manual_price_override: false,
        is_active: true,
      };

      if (exist) {
        const { error } = await admin
          .from("repair_catalog")
          .update(payload)
          .eq("id", exist.id);
        if (error) {
          errors.push(`UPDATE "${row.name}": ${error.message}`);
        } else {
          updated++;
        }
      } else {
        const { error } = await admin
          .from("repair_catalog")
          .insert(payload);
        if (error) {
          errors.push(`INSERT "${row.name}": ${error.message}`);
        } else {
          inserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: REPAIR_SEED_DATA.length,
        inserted,
        updated,
        descriptions_merged: descriptionsMerged,
        descriptions_replaced: descriptionsReplaced,
        descriptions_kept: descriptionsKept,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("seed-repair-catalog error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
