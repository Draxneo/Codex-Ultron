import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geocodeToCoords, getDirections } from "../_shared/googleGeo.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



function getTrafficCondition(duration: number, typical: number): string {
  if (typical <= 0) return "normal";
  const ratio = duration / typical;
  if (ratio < 1.0) return "light";
  if (ratio <= 1.1) return "normal";
  if (ratio <= 1.3) return "heavy";
  return "severe";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
            const sb = getSupabaseAdmin();

    const body = await req.json();
    const { tech_name, date, proposed_address } = body;

    if (!tech_name) {
      return new Response(JSON.stringify({ error: "tech_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { getCentralToday } = await import("../_shared/formatters.ts");
    const targetDate = date || getCentralToday();

    const { data: employees } = await sb
      .from("employees")
      .select("id, name, home_address, role")
      .ilike("name", `%${tech_name}%`)
      .limit(1);

    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ error: `Employee "${tech_name}" not found` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = employees[0];

    const { data: jobs } = await sb
      .from("jobs")
      .select("id, hcp_job_number, customer_name, address, arrival_start, arrival_end, job_type, status")
      .eq("scheduled_date", targetDate)
      .ilike("assigned_to", `%${employee.name}%`)
      .not("status", "in", '("canceled")')
      .order("arrival_start");

    const sortedJobs = (jobs || []).sort((a: any, b: any) => {
      if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
      if (a.arrival_start) return -1;
      if (b.arrival_start) return 1;
      return 0;
    });

    const legs: any[] = [];
    const geocodeCache = new Map<string, [number, number] | null>();

    async function getCachedGeocode(addr: string) {
      if (geocodeCache.has(addr)) return geocodeCache.get(addr)!;
      const result = await geocodeToCoords(addr);
      geocodeCache.set(addr, result);
      return result;
    }

    let previousAddress = employee.home_address;
    let previousLabel = "Home";

    for (const job of sortedJobs) {
      if (!job.address) continue;

      if (previousAddress) {
        const fromCoords = await getCachedGeocode(previousAddress);
        const toCoords = await getCachedGeocode(job.address);

        if (fromCoords && toCoords) {
          // fromCoords = [lng, lat], toCoords = [lng, lat]
          const directions = await getDirections(fromCoords[1], fromCoords[0], toCoords[1], toCoords[0]);
          if (directions) {
            const durationMin = Math.round(directions.duration / 60);
            const distanceMiles = Math.round((directions.distance / 1609.34) * 10) / 10;
            const condition = getTrafficCondition(directions.durationInTraffic, directions.duration);

            legs.push({
              from: previousLabel,
              from_address: previousAddress,
              to: `Job #${job.hcp_job_number || "?"} - ${job.customer_name}`,
              to_address: job.address,
              to_job_id: job.id,
              duration_minutes: durationMin,
              distance_miles: distanceMiles,
              traffic_condition: condition,
            });
          }
        }
      }

      previousAddress = job.address;
      previousLabel = `Job #${job.hcp_job_number || "?"} - ${job.customer_name}`;
    }

    let fit_check = null;
    if (proposed_address) {
      const proposedCoords = await getCachedGeocode(proposed_address);
      if (proposedCoords) {
        let bestFit = { from_job: "", duration_minutes: Infinity, distance_miles: 0 };
        for (const job of sortedJobs) {
          if (!job.address) continue;
          const jobCoords = await getCachedGeocode(job.address);
          if (!jobCoords) continue;
          const dirs = await getDirections(jobCoords[1], jobCoords[0], proposedCoords[1], proposedCoords[0]);
          if (dirs) {
            const mins = Math.round(dirs.duration / 60);
            if (mins < bestFit.duration_minutes) {
              bestFit = {
                from_job: `Job #${job.hcp_job_number || "?"} - ${job.customer_name}`,
                duration_minutes: mins,
                distance_miles: Math.round((dirs.distance / 1609.34) * 10) / 10,
              };
            }
          }
        }
        if (employee.home_address) {
          const homeCoords = await getCachedGeocode(employee.home_address);
          if (homeCoords) {
            const dirs = await getDirections(homeCoords[1], homeCoords[0], proposedCoords[1], proposedCoords[0]);
            if (dirs) {
              const mins = Math.round(dirs.duration / 60);
              if (mins < bestFit.duration_minutes) {
                bestFit = { from_job: "Home", duration_minutes: mins, distance_miles: Math.round((dirs.distance / 1609.34) * 10) / 10 };
              }
            }
          }
        }

        fit_check = {
          proposed_address,
          nearest_job: bestFit.from_job,
          travel_minutes: bestFit.duration_minutes === Infinity ? null : bestFit.duration_minutes,
          distance_miles: bestFit.distance_miles,
          is_easy_fit: bestFit.duration_minutes <= 10,
          assessment: bestFit.duration_minutes <= 10
            ? `Easy fit! Only ${bestFit.duration_minutes} min from ${bestFit.from_job}`
            : bestFit.duration_minutes <= 20
              ? `Possible but ${bestFit.duration_minutes} min travel from ${bestFit.from_job} — notify dispatcher`
              : `Far — ${bestFit.duration_minutes} min from nearest point (${bestFit.from_job})`,
        };
      }
    }

    const totalDriveMin = legs.reduce((sum: number, l: any) => sum + l.duration_minutes, 0);
    const totalDriveMiles = legs.reduce((sum: number, l: any) => sum + l.distance_miles, 0);
    const trafficAlerts = legs.filter((l: any) => l.traffic_condition === "heavy" || l.traffic_condition === "severe");

    return new Response(
      JSON.stringify({
        tech: employee.name,
        date: targetDate,
        total_jobs: sortedJobs.length,
        total_drive_minutes: totalDriveMin,
        total_drive_miles: Math.round(totalDriveMiles * 10) / 10,
        legs,
        traffic_alerts: trafficAlerts,
        fit_check,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
