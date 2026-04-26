import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// Brand detection from model number prefixes
const BRAND_PATTERNS: [RegExp, string][] = [
  [/^24[A-Z]{2,3}/i, "Carrier"],
  [/^25[A-Z]{2,3}/i, "Carrier"],
  [/^38[A-Z]{2,3}/i, "Carrier"],
  [/^40[A-Z]{2,3}/i, "Carrier"],
  [/^50[A-Z]{2,3}/i, "Carrier"],
  [/^58[A-Z]{2,3}/i, "Carrier"],
  [/^PA\d/i, "Payne"],
  [/^PG\d/i, "Payne"],
  [/^PH\d/i, "Payne"],
  [/^N[A-Z]\d/i, "Day and Night"],
  [/^NK\d/i, "Day and Night"],
  [/^DLC/i, "Daikin"],
  [/^DM\d/i, "Daikin"],
  [/^GSX/i, "Goodman"],
  [/^GSZ/i, "Goodman"],
  [/^GM\d/i, "Goodman"],
  [/^AVXC/i, "Amana"],
  [/^ASX/i, "Amana"],
  [/^ASZ/i, "Amana"],
  [/^XR\d/i, "Trane"],
  [/^XL\d/i, "Trane"],
  [/^4TT/i, "Trane"],
  [/^TW[A-Z]/i, "American Standard"],
  [/^4A7/i, "American Standard"],
  [/^RL\d/i, "Ruud"],
  [/^RA\d/i, "Ruud"],
  [/^RP\d/i, "Rheem"],
  [/^RH\d/i, "Rheem"],
];

// Tonnage detection from model number patterns (common HVAC: 018=1.5T, 024=2T, 030=2.5T, 036=3T, 042=3.5T, 048=4T, 060=5T)
const TONNAGE_MAP: Record<string, number> = {
  "018": 1.5, "024": 2, "030": 2.5, "036": 3, "042": 3.5, "048": 4, "060": 5,
};

function detectBrand(model: string): string | null {
  for (const [pattern, brand] of BRAND_PATTERNS) {
    if (pattern.test(model)) return brand;
  }
  return null;
}

function detectTonnage(model: string): number | null {
  // Look for 3-digit capacity codes in model number
  const matches = model.match(/(\d{3})/g);
  if (matches) {
    for (const m of matches) {
      if (TONNAGE_MAP[m]) return TONNAGE_MAP[m];
    }
  }
  return null;
}

// Simple fuzzy match: normalize and compare
function normalize(s: string): string {
  return (s || "").replace(/[\s\-_.]/g, "").toUpperCase();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Check if one contains the other (handles partial matches)
  if (na.length > 4 && nb.length > 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  // Levenshtein-ish: allow 1 char difference for strings > 6 chars
  if (na.length > 6 && nb.length > 6 && Math.abs(na.length - nb.length) <= 1) {
    let diffs = 0;
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length > nb.length ? na : nb;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] !== longer[i]) diffs++;
      if (diffs > 1) return false;
    }
    return diffs <= 1;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const supabase = getSupabaseAdmin();

    const { job_id, source, source_id, serial_number, model_number } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If a new equipment record was provided, upsert it first
    if (source && (serial_number || model_number)) {
      const detected_brand = model_number ? detectBrand(model_number) : null;
      const confidence = source === "tech_form" ? "high" : source === "hcp_sync" ? "low" : "medium";

      // Check for existing record from same source + source_id
      const { data: existing } = await supabase
        .from("job_equipment")
        .select("id")
        .eq("job_id", job_id)
        .eq("source", source)
        .eq("source_id", source_id || "")
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from("job_equipment").update({
          serial_number: serial_number || null,
          model_number: model_number || null,
          brand: detected_brand,
          confidence,
          updated_at: new Date().toISOString(),
        }).eq("id", existing[0].id);
      } else {
        await supabase.from("job_equipment").insert({
          job_id,
          serial_number: serial_number || null,
          model_number: model_number || null,
          brand: detected_brand,
          source,
          source_id: source_id || null,
          confidence,
        });
      }
    }

    // Now reconcile: pull all equipment records for this job
    const { data: allEquipment } = await supabase
      .from("job_equipment")
      .select("*")
      .eq("job_id", job_id);

    const equipment = allEquipment || [];
    
    // Group by likely-same-unit using fuzzy matching on serial/model
    const groups: number[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < equipment.length; i++) {
      if (assigned.has(i)) continue;
      const group = [i];
      assigned.add(i);
      for (let j = i + 1; j < equipment.length; j++) {
        if (assigned.has(j)) continue;
        const a = equipment[i];
        const b = equipment[j];
        const serialMatch = a.serial_number && b.serial_number && fuzzyMatch(a.serial_number, b.serial_number);
        const modelMatch = a.model_number && b.model_number && fuzzyMatch(a.model_number, b.model_number);
        if (serialMatch || modelMatch) {
          group.push(j);
          assigned.add(j);
        }
      }
      groups.push(group);
    }

    // For each group, detect conflicts and update records
    const conflicts: any[] = [];
    for (const group of groups) {
      if (group.length <= 1) continue;

      const items = group.map(i => equipment[i]);
      const serialValues = [...new Set(items.filter(e => e.serial_number).map(e => normalize(e.serial_number)))];
      const modelValues = [...new Set(items.filter(e => e.model_number).map(e => normalize(e.model_number)))];

      // If normalized values differ, flag conflict
      const hasSerialConflict = serialValues.length > 1;
      const hasModelConflict = modelValues.length > 1;

      if (hasSerialConflict || hasModelConflict) {
        const conflictDetail = {
          type: hasSerialConflict ? "serial_mismatch" : "model_mismatch",
          values: items.map(e => ({
            source: e.source,
            serial: e.serial_number,
            model: e.model_number,
          })),
        };
        conflicts.push(conflictDetail);

        // Update each record with conflict info
        for (const idx of group) {
          await supabase.from("job_equipment").update({
            conflicts: [conflictDetail],
            updated_at: new Date().toISOString(),
          }).eq("id", equipment[idx].id);
        }
      } else {
        // Sources agree — clear conflicts
        for (const idx of group) {
          await supabase.from("job_equipment").update({
            conflicts: [],
            updated_at: new Date().toISOString(),
          }).eq("id", equipment[idx].id);
        }
      }
    }

    // Auto-populate job fields from equipment data if currently null
    const { data: job } = await supabase
      .from("jobs")
      .select("brand, tonnage, system_type")
      .eq("id", job_id)
      .single();

    if (job) {
      const updates: Record<string, any> = {};

      // Find best brand from confirmed or high-confidence records
      if (!job.brand) {
        const confirmedWithBrand = equipment.find((e: any) => e.is_confirmed && e.brand);
        const highConfWithBrand = equipment.find((e: any) => e.confidence === "high" && e.brand);
        const anyWithBrand = equipment.find((e: any) => e.brand);
        const bestBrand = confirmedWithBrand?.brand || highConfWithBrand?.brand || anyWithBrand?.brand;
        if (bestBrand) updates.brand = bestBrand;
      }

      // Find tonnage from model numbers
      if (!job.tonnage) {
        for (const e of equipment) {
          if (e.model_number) {
            const tonnage = detectTonnage(e.model_number);
            if (tonnage) { updates.tonnage = tonnage; break; }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("jobs").update(updates).eq("id", job_id);
        console.log(`Backfilled job ${job_id}:`, updates);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_records: equipment.length,
      groups: groups.length,
      conflicts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("reconcile-equipment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
