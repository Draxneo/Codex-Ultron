import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
            const sb = getSupabaseAdmin();

    const { address, job_type } = await req.json();

    // Get active employees
    const { data: employees } = await sb
      .from("employees")
      .select("id, name, role, is_active")
      .eq("is_active", true);

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ slots: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capacity limits
    const isInstallOrEstimate = job_type === "install" || job_type === "estimate";
    const maxJobs = isInstallOrEstimate ? 3 : 4;

    // Get Central Time "today"
    const now = new Date();
    const centralOffset = -6; // CST (simplified; DST would be -5)
    const centralNow = new Date(now.getTime() + centralOffset * 3600000);
    const todayStr = `${centralNow.getUTCFullYear()}-${String(centralNow.getUTCMonth() + 1).padStart(2, "0")}-${String(centralNow.getUTCDate()).padStart(2, "0")}`;

    // Generate next 7 days
    const dates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(centralNow.getTime() + d * 86400000);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dt.getUTCDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${day}`);
    }

    // Fetch jobs for the next 7 days
    const { data: jobs } = await sb
      .from("jobs")
      .select("id, assigned_to, scheduled_date, address, arrival_start, status")
      .in("scheduled_date", dates)
      .not("status", "in", '("canceled","done","invoiced")');

    // Build per-tech per-day counts and addresses
    type TechDay = { count: number; addresses: string[]; lastArrival: string | null };
    const techDayMap: Record<string, Record<string, TechDay>> = {};

    for (const j of (jobs || [])) {
      if (!j.assigned_to || !j.scheduled_date) continue;
      if (!techDayMap[j.assigned_to]) techDayMap[j.assigned_to] = {};
      if (!techDayMap[j.assigned_to][j.scheduled_date]) {
        techDayMap[j.assigned_to][j.scheduled_date] = { count: 0, addresses: [], lastArrival: null };
      }
      const td = techDayMap[j.assigned_to][j.scheduled_date];
      td.count++;
      if (j.address) td.addresses.push(j.address);
      if (j.arrival_start && (!td.lastArrival || j.arrival_start > td.lastArrival)) {
        td.lastArrival = j.arrival_start;
      }
    }

    // Score and rank slots
    const slots: Array<{
      date: string;
      display_date?: string;
      time: string;
      tech: string;
      travel_min: number;
      fit_score: number;
    }> = [];

    for (const emp of employees) {
      // Only include techs (not office staff)
      if (emp.role === "office" || emp.role === "admin") continue;

      for (const date of dates) {
        const td = techDayMap[emp.name]?.[date] || { count: 0, addresses: [], lastArrival: null };

        // Check capacity
        if (td.count >= maxJobs) continue;

        // Calculate a basic fit score (higher = better)
        // Factors: fewer jobs = more capacity, proximity is estimated
        const capacityScore = ((maxJobs - td.count) / maxJobs) * 50;

        // Simple proximity heuristic: if they have jobs in the same area
        // Real proximity scoring would use Google Directions API, but we estimate here
        let proximityScore = 25; // default mid-range
        if (address && td.addresses.length > 0) {
          // Check if any existing job shares zip code or city
          const proposedZip = address.match(/\b\d{5}\b/)?.[0] || "";
          const proposedCity = address.split(",")[1]?.trim().toLowerCase() || "";
          for (const existingAddr of td.addresses) {
            const existingZip = existingAddr.match(/\b\d{5}\b/)?.[0] || "";
            const existingCity = existingAddr.split(",")[1]?.trim().toLowerCase() || "";
            if (proposedZip && existingZip && proposedZip === existingZip) {
              proximityScore = 45;
              break;
            }
            if (proposedCity && existingCity && proposedCity === existingCity) {
              proximityScore = 40;
              break;
            }
          }
        } else if (td.count === 0) {
          proximityScore = 30; // Empty day, decent option
        }

        const fitScore = Math.round(capacityScore + proximityScore);

        // Suggest a time based on last job
        let suggestedTime = "09:00";
        if (td.lastArrival) {
          try {
            const lastTime = new Date(td.lastArrival);
            // Suggest 2 hours after last arrival
            const nextTime = new Date(lastTime.getTime() + 2 * 3600000);
            const h = String(nextTime.getUTCHours()).padStart(2, "0");
            const m = String(nextTime.getUTCMinutes()).padStart(2, "0");
            suggestedTime = `${h}:${m}`;
          } catch { /* use default */ }
        } else if (td.count > 0) {
          suggestedTime = "14:00"; // Afternoon if jobs exist but no arrival data
        }

        // Estimated travel (rough heuristic based on proximity score)
        const travelMin = proximityScore >= 40 ? 10 : proximityScore >= 30 ? 20 : 30;

        slots.push({
          date,
          time: suggestedTime,
          tech: emp.name,
          travel_min: travelMin,
          fit_score: fitScore,
        });
      }
    }

    // Sort by fit score descending, take top 6
    slots.sort((a, b) => b.fit_score - a.fit_score);
    const topSlots = slots.slice(0, 6);

    // Format dates for display
    const formatDate = (dateStr: string) => {
      const [y, m, d] = dateStr.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const isToday = dateStr === todayStr;
      return isToday ? `Today (${monthNames[m - 1]} ${d})` : `${dayNames[dt.getDay()]}, ${monthNames[m - 1]} ${d}`;
    };

    const formattedSlots = topSlots.map(s => ({
      ...s,
      display_date: formatDate(s.date),
    }));

    return new Response(JSON.stringify({ slots: formattedSlots }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-schedule-slots error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", slots: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
