/**
 * send-tech-day-digest — Sends each active tech ONE SMS with tomorrow's
 * schedule, stops in arrival order, with travel times from route_travel_cache.
 *
 * Designed to run at 5pm CT daily, AFTER prewarm-route-cache has populated
 * the cache. Pulls everything from local DB — no Google calls.
 *
 * Modes:
 *   - default cron: digest for "tomorrow" in America/Chicago
 *   - { tech_name, date } : send/resend digest for one tech on a specific date
 *     (used by after-hours add/reschedule triggers)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { formatTimeWindow, formatDateFriendly } from "../_shared/formatters.ts";

function tomorrowCentralDateStr(): string {
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

function fmtTimeShort(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

interface Stop {
  type: "job" | "estimate";
  id: string;
  customer_name: string | null;
  address: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  job_type: string | null;
  number: string | null;
  description: string | null;
}

async function buildDigestForTech(sb: any, employee: { id: string; name: string; phone: string | null }, date: string) {
  if (!employee.phone) return { sent: false, reason: "no phone" };
  const digits = employee.phone.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return { sent: false, reason: "invalid phone" };

  const [{ data: jobs }, { data: estimates }, { data: legs }] = await Promise.all([
    sb.from("jobs")
      .select("id, customer_name, address, arrival_start, arrival_end, job_type, hcp_job_number, description")
      .eq("scheduled_date", date)
      .eq("assigned_to", employee.name)
      .not("status", "in", '("canceled","done","invoiced")')
      .order("arrival_start", { ascending: true, nullsFirst: false }),
    sb.from("estimates")
      .select("id, customer_name, address, arrival_start, arrival_end, estimate_number, description")
      .eq("scheduled_date", date)
      .eq("assigned_to", employee.name)
      .not("status", "in", '("canceled","lost")')
      .order("arrival_start", { ascending: true, nullsFirst: false }),
    sb.from("route_travel_cache")
      .select("to_job_id, travel_minutes, distance_miles, leg_order")
      .eq("employee_id", employee.id)
      .eq("scheduled_date", date),
  ]);

  const stops: Stop[] = [
    ...(jobs || []).map((j: any) => ({
      type: "job" as const, id: j.id, customer_name: j.customer_name, address: j.address,
      arrival_start: j.arrival_start, arrival_end: j.arrival_end, job_type: j.job_type, number: j.hcp_job_number,
      description: j.description || null,
    })),
    ...(estimates || []).map((e: any) => ({
      type: "estimate" as const, id: e.id, customer_name: e.customer_name, address: e.address,
      arrival_start: e.arrival_start, arrival_end: e.arrival_end, job_type: "estimate", number: e.estimate_number,
      description: e.description || null,
    })),
  ].sort((a, b) => {
    if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
    if (a.arrival_start) return -1;
    if (b.arrival_start) return 1;
    return 0;
  });

  if (stops.length === 0) return { sent: false, reason: "no stops" };

  // Map travel by to_job_id (works for both jobs & estimates — column stores the destination uuid)
  const travelByDest = new Map<string, { mins: number | null; miles: number | null }>();
  for (const l of (legs || []) as any[]) {
    if (l.to_job_id) travelByDest.set(l.to_job_id, { mins: l.travel_minutes, miles: l.distance_miles });
  }

  const friendlyDate = formatDateFriendly(date) || date;
  const lines: string[] = [];
  lines.push(`📋 Tomorrow (${friendlyDate}) — ${stops.length} stop${stops.length === 1 ? "" : "s"}:`);

  stops.forEach((s, i) => {
    const time = s.arrival_start && s.arrival_end
      ? formatTimeWindow(s.arrival_start, s.arrival_end)
      : (s.arrival_start ? fmtTimeShort(s.arrival_start) : "TBD");
    const cust = s.customer_name || "Unknown";
    const typeTag = s.type === "estimate" ? " (Est)" : (s.job_type ? ` (${s.job_type})` : "");
    const travel = travelByDest.get(s.id);
    const travelLabel = travel?.mins ? ` 🚗 ${travel.mins}m` : "";
    lines.push(`${i + 1}. ${time} — ${cust}${typeTag}${travelLabel}`);
    if (s.description) lines.push(`   Work: ${String(s.description).replace(/\s+/g, " ").slice(0, 180)}`);
    if (s.address) lines.push(`   ${s.address}`);
  });

  const body = lines.join("\n");

  const smsResult = await sb.functions.invoke("send-sms", {
    body: { to: digits, body, source: "tech-day-digest" },
    headers: { "x-source-function": "send-tech-day-digest", "x-hitl-approved": "true" },
  });
  if (smsResult.error) {
    console.error(`Digest send failed for ${employee.name}:`, smsResult.error);
    return { sent: false, reason: "sms error" };
  }
  return { sent: true, stops: stops.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = getSupabaseAdmin();
    let body: any = {};
    try { body = await req.json(); } catch { /* cron: empty */ }

    // Per-tech mode (after-hours re-send)
    if (body?.tech_name && body?.date) {
      const { data: emp } = await sb
        .from("employees")
        .select("id, name, phone, is_active")
        .eq("name", body.tech_name)
        .eq("is_active", true)
        .maybeSingle();
      if (!emp) {
        return new Response(JSON.stringify({ skipped: true, reason: "tech not found / inactive" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await buildDigestForTech(sb, emp, body.date);
      return new Response(JSON.stringify({ tech: emp.name, date: body.date, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cron mode: every active tech with stops tomorrow
    const date = body?.date || tomorrowCentralDateStr();

    const [{ data: jobRows }, { data: estRows }] = await Promise.all([
      sb.from("jobs").select("assigned_to").eq("scheduled_date", date)
        .not("status", "in", '("canceled","done","invoiced")')
        .not("assigned_to", "is", null),
      sb.from("estimates").select("assigned_to").eq("scheduled_date", date)
        .not("status", "in", '("canceled","lost")')
        .not("assigned_to", "is", null),
    ]);

    const names = new Set<string>();
    for (const r of (jobRows || []) as any[]) if (r.assigned_to) names.add(r.assigned_to);
    for (const r of (estRows || []) as any[]) if (r.assigned_to) names.add(r.assigned_to);

    if (names.size === 0) {
      return new Response(JSON.stringify({ status: "ok", date, sent: 0, note: "no scheduled work" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: emps } = await sb
      .from("employees")
      .select("id, name, phone, is_active")
      .in("name", Array.from(names))
      .eq("is_active", true);

    const results: any[] = [];
    let sentCount = 0;
    for (const emp of (emps || []) as any[]) {
      const r = await buildDigestForTech(sb, emp, date);
      if (r.sent) sentCount++;
      results.push({ tech: emp.name, ...r });
    }

    return new Response(JSON.stringify({ status: "ok", date, sent: sentCount, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-tech-day-digest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
