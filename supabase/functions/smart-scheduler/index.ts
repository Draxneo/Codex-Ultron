import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCentralToday, formatDateFriendly } from "../_shared/formatters.ts";
import { geocodeToCoords, getDirections } from "../_shared/googleGeo.ts";import { corsHeaders } from "../_shared/cors.ts";



/* ───── helpers ───── */

// getCentralToday imported from _shared/formatters.ts

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T12:00:00Z").getUTCDay(); // 0=Sun
}

function buildCandidateDates(
  startDate: string,
  lookahead: number,
): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (dates.length < lookahead) {
    if (dayOfWeek(cursor) !== 0) dates.push(cursor); // skip Sunday
    cursor = addDays(cursor, 1);
  }
  return dates;
}

async function geocode(
  address: string,
): Promise<[number, number] | null> {
  return geocodeToCoords(address);
}

async function drivingMinutes(
  from: [number, number],
  to: [number, number],
): Promise<{ minutes: number; miles: number } | null> {
  // from/to are [lng, lat] tuples
  const result = await getDirections(from[1], from[0], to[1], to[0]);
  if (!result) return null;
  return {
    minutes: Math.round(result.duration / 60),
    miles: Math.round((result.distance / 1609.34) * 10) / 10,
  };
}

/* ───── proximity scoring ───── */

interface ProximityResult {
  nearest_address: string;
  travel_minutes: number;
  is_clustered: boolean;
}

async function scoreProximity(
  jobCoords: [number, number],
  existingAddresses: string[],
  geocodeCache: Map<string, [number, number] | null>,
): Promise<ProximityResult> {
  let best: ProximityResult = {
    nearest_address: "",
    travel_minutes: 9999,
    is_clustered: false,
  };

  for (const addr of existingAddresses) {
    if (!geocodeCache.has(addr)) geocodeCache.set(addr, await geocode(addr));
    const c = geocodeCache.get(addr);
    if (!c) continue;
    const d = await drivingMinutes(c, jobCoords);
    if (d && d.minutes < best.travel_minutes) {
      best = {
        nearest_address: addr,
        travel_minutes: d.minutes,
        is_clustered: d.minutes <= 10,
      };
    }
  }

  return best;
}

/* ───── window helper ───── */

function determineWindow(
  jobs: { arrival_start: string | null }[],
  requestedWindow?: string,
): string {
  if (requestedWindow) {
    const rw = requestedWindow.toLowerCase();
    if (rw.includes("morning") || rw.startsWith("8") || rw.startsWith("9"))
      return "morning";
    if (rw.includes("afternoon") || rw.startsWith("1") || rw.startsWith("2"))
      return "afternoon";
  }
  // Count existing jobs in each window to suggest the less-busy one
  let am = 0,
    pm = 0;
  for (const j of jobs) {
    if (!j.arrival_start) continue;
    const h = parseInt(j.arrival_start.split(":")[0], 10);
    if (h < 12) am++;
    else pm++;
  }
  return am <= pm ? "morning" : "afternoon";
}

/* ───── main ───── */

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const {
      job_address,
      requested_date,
      requested_window,
      is_emergency,
      job_type,
      lookahead_days,
    } = body;

    if (!job_address) {
      return new Response(
        JSON.stringify({ error: "job_address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Geocode proposed address
    const jobCoords = await geocode(job_address);
    if (!jobCoords) {
      return new Response(
        JSON.stringify({ error: "Could not geocode job_address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Capacity limit from settings
    const { data: settingsRows } = await sb
      .from("company_settings")
      .select("value")
      .eq("key", "max_jobs_tech")
      .limit(1);
    let maxJobs = parseInt(settingsRows?.[0]?.value || "4", 10) || 4;
    const isLongerJob =
      job_type === "estimate" || job_type === "install";
    if (isLongerJob) maxJobs = Math.max(maxJobs - 1, 1);

    const today = getCentralToday();
    const lookahead = lookahead_days || 7;
    const candidates = buildCandidateDates(today, lookahead);
    const geocodeCache = new Map<string, [number, number] | null>();

    // Helper: get jobs for a date
    async function jobsForDate(date: string) {
      const { data } = await sb
        .from("jobs")
        .select("id, address, arrival_start, customer_name, hcp_job_number")
        .eq("scheduled_date", date)
        .not("status", "in", '("canceled","done")');
      return data || [];
    }

    // Helper: build result object
    function buildResult(
      recommendation: string,
      date: string,
      jobs: any[],
      prox: ProximityResult,
      fifthSlot: boolean,
      reqDateStatus?: string,
    ) {
      const window = determineWindow(jobs, requested_window);
      const jobCount = jobs.length;
      const humanMsg = buildHumanMessage(
        recommendation,
        date,
        window,
        prox,
        fifthSlot,
      );
      const dispNote = buildDispatcherNote(
        recommendation,
        date,
        window,
        jobCount,
        prox,
        fifthSlot,
        requested_date,
      );

      return {
        recommendation,
        suggested_date: date,
        suggested_window: window,
        jobs_on_that_day: jobCount,
        nearest_job_address: prox.nearest_address,
        nearest_job_travel_minutes:
          prox.travel_minutes === 9999 ? null : prox.travel_minutes,
        is_clustered: prox.is_clustered,
        fifth_slot_exception: fifthSlot,
        human_message: humanMsg,
        dispatcher_note: dispNote,
        ...(reqDateStatus ? { requested_date_status: reqDateStatus } : {}),
      };
    }

    // friendlyDate → use formatDateFriendly from _shared/formatters.ts
    const friendlyDate = formatDateFriendly;

    function buildHumanMessage(
      rec: string,
      date: string,
      window: string,
      prox: ProximityResult,
      _fifthSlot: boolean,
    ): string {
      const day = friendlyDate(date);
      const w = window === "morning" ? "morning" : "afternoon";
      if (rec === "emergency_override")
        return `We're treating this as urgent — our next open slot is ${day} ${w}. Matt's being notified right now.`;
      if (rec === "available") {
        if (prox.is_clustered)
          return `${day} ${w} works great — we'll already be in your area around that time. Want me to get that over to Matt to lock it in?`;
        return `${day} ${w} is open. Want me to get that over to Matt to lock it in?`;
      }
      if (rec === "alternative")
        return `Your requested day is full, but ${day} ${w} we're actually right near you. Does that work for you instead?`;
      return `This week is booked up, but we have ${day} ${w} available. Want me to grab that spot for you?`;
    }

    function buildDispatcherNote(
      rec: string,
      date: string,
      window: string,
      count: number,
      prox: ProximityResult,
      fifthSlot: boolean,
      _reqDate?: string,
    ): string {
      const w = window === "morning" ? "AM" : "PM";
      if (rec === "emergency_override")
        return `EMERGENCY — booked next open slot: ${date} ${w}. Dispatcher confirm immediately.`;
      const proxTxt =
        prox.travel_minutes < 9999
          ? ` ${prox.travel_minutes} min from nearest job.`
          : "";
      if (fifthSlot)
        return `5th slot exception on ${date} ${w} (${count} jobs, clustered ${prox.travel_minutes} min).${proxTxt}`;
      if (rec === "alternative")
        return `Requested date full. Suggested ${date} ${w} (${count} jobs).${proxTxt} Awaiting customer response.`;
      return `Slot ${date} ${w} available (${count} jobs).${proxTxt}`;
    }

    /* ── Rule 1: Emergency ── */
    if (is_emergency) {
      for (const date of candidates) {
        const jobs = await jobsForDate(date);
        if (jobs.length < maxJobs) {
          const addresses = jobs.map((j: any) => j.address).filter(Boolean);
          const prox = addresses.length
            ? await scoreProximity(jobCoords, addresses, geocodeCache)
            : { nearest_address: "", travel_minutes: 9999, is_clustered: false };
          const result = buildResult("emergency_override", date, jobs, prox, false);
          return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // All days full even for emergency — return the least-busy day
      let bestDate = candidates[0];
      let bestCount = Infinity;
      const jobCounts = new Map<string, any[]>();
      for (const date of candidates) {
        const jobs = await jobsForDate(date);
        jobCounts.set(date, jobs);
        if (jobs.length < bestCount) {
          bestCount = jobs.length;
          bestDate = date;
        }
      }
      const bestJobs = jobCounts.get(bestDate) || [];
      const addresses = bestJobs.map((j: any) => j.address).filter(Boolean);
      const prox = addresses.length
        ? await scoreProximity(jobCoords, addresses, geocodeCache)
        : { nearest_address: "", travel_minutes: 9999, is_clustered: false };
      const result = buildResult("emergency_override", bestDate, bestJobs, prox, false);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── Rule 2: Requested date ── */
    if (requested_date) {
      const jobs = await jobsForDate(requested_date);
      const addresses = jobs.map((j: any) => j.address).filter(Boolean);
      const prox = addresses.length
        ? await scoreProximity(jobCoords, addresses, geocodeCache)
        : { nearest_address: "", travel_minutes: 9999, is_clustered: false };

      if (jobs.length < maxJobs) {
        const result = buildResult(
          "available", requested_date, jobs, prox, false, "available",
        );
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // At capacity — check 5th slot exception
      if (jobs.length === maxJobs && prox.is_clustered) {
        const result = buildResult(
          "available", requested_date, jobs, prox, true, "fifth_slot",
        );
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Requested date is full — fall through to Rule 3
    }

    /* ── Rule 3: Open search ── */
    interface Candidate {
      date: string;
      jobs: any[];
      prox: ProximityResult;
    }

    const eligible: Candidate[] = [];
    for (const date of candidates) {
      // Skip the requested date we already checked
      if (date === requested_date) continue;
      const jobs = await jobsForDate(date);
      if (jobs.length < maxJobs) {
        const addresses = jobs.map((j: any) => j.address).filter(Boolean);
        const prox = addresses.length
          ? await scoreProximity(jobCoords, addresses, geocodeCache)
          : { nearest_address: "", travel_minutes: 9999, is_clustered: false };
        eligible.push({ date, jobs, prox });
      }
    }

    if (eligible.length === 0) {
      return new Response(
        JSON.stringify({
          recommendation: "full",
          suggested_date: null,
          suggested_window: null,
          jobs_on_that_day: null,
          nearest_job_address: null,
          nearest_job_travel_minutes: null,
          is_clustered: false,
          fifth_slot_exception: false,
          human_message:
            "We're fully booked for the next week. Let me check further out — can I call you back with options?",
          dispatcher_note: `All ${lookahead} days at capacity. Expand search window.`,
          ...(requested_date ? { requested_date_status: "full" } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sort: prefer clustered, then lowest travel time, then soonest date
    eligible.sort((a, b) => {
      // Clustered days first
      if (a.prox.is_clustered && !b.prox.is_clustered) return -1;
      if (!a.prox.is_clustered && b.prox.is_clustered) return 1;
      // Then by travel time (lower = better). Days with no jobs get 9999.
      if (a.prox.travel_minutes !== b.prox.travel_minutes)
        return a.prox.travel_minutes - b.prox.travel_minutes;
      // Then soonest
      return a.date.localeCompare(b.date);
    });

    const best = eligible[0];
    const rec = requested_date ? "alternative" : "available";
    const result = buildResult(
      rec,
      best.date,
      best.jobs,
      best.prox,
      false,
      requested_date ? "full" : undefined,
    );
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-scheduler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
