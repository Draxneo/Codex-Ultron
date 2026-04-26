/**
 * prewarm-route-cache — Nightly pre-warm of tomorrow's route_travel_cache.
 *
 * Runs at 5pm CT daily. Finds every employee who has at least one job OR
 * estimate scheduled for tomorrow, batches them into a single
 * calculate-route-cache invocation. The downstream function dedupes via the
 * `route_travel_cache` (employee_id, scheduled_date, leg_order) key, so this
 * is safe to run multiple times — Google is only re-hit when the route
 * actually changes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

function tomorrowCentralDateStr(): string {
  // "Tomorrow" in America/Chicago, regardless of server tz
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = getSupabaseAdmin();
    const targetDate = tomorrowCentralDateStr();

    // Collect distinct assigned_to names from jobs + estimates for tomorrow
    const [{ data: jobRows }, { data: estRows }] = await Promise.all([
      sb.from("jobs")
        .select("assigned_to")
        .eq("scheduled_date", targetDate)
        .not("status", "in", '("canceled")')
        .not("assigned_to", "is", null),
      sb.from("estimates")
        .select("assigned_to")
        .eq("scheduled_date", targetDate)
        .not("status", "in", '("canceled","lost")')
        .not("assigned_to", "is", null),
    ]);

    const names = new Set<string>();
    for (const r of (jobRows || []) as any[]) if (r.assigned_to) names.add(r.assigned_to);
    for (const r of (estRows || []) as any[]) if (r.assigned_to) names.add(r.assigned_to);

    if (names.size === 0) {
      return new Response(
        JSON.stringify({ status: "ok", target_date: targetDate, employees: 0, note: "no scheduled work" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve employee_id by name
    const { data: emps } = await sb
      .from("employees")
      .select("id, name")
      .in("name", Array.from(names));

    const batch = (emps || [])
      .filter((e: any) => e.id)
      .map((e: any) => ({ employee_id: e.id, date: targetDate }));

    if (batch.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", target_date: targetDate, employees: 0, note: "no matched employees" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invoke calculate-route-cache in batch mode (single call, processes serially server-side)
    const { data, error } = await sb.functions.invoke("calculate-route-cache", {
      body: { batch },
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        status: "ok",
        target_date: targetDate,
        employees: batch.length,
        results: data?.results ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("prewarm-route-cache error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
