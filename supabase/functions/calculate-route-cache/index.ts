import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { geocodeToCoords, getDirections } from "../_shared/googleGeo.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getCentralToday } from "../_shared/formatters.ts";


interface CustomerFallback {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

function buildCustomerName(customer?: CustomerFallback | null) {
  if (!customer) return null;
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || null;
}

function buildCustomerAddress(customer?: CustomerFallback | null) {
  if (!customer) return null;
  return [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ") || null;
}

async function fetchCustomersByIds(sb: any, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, CustomerFallback>();

  const { data, error } = await sb
    .from("customers")
    .select("id, first_name, last_name, company, address, city, state, zip")
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map((data || []).map((customer: CustomerFallback) => [customer.id, customer]));
}

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function buildExpectedLegs({
  employeeId,
  date,
  allItems,
  startAddress,
  startLabel,
}: {
  employeeId: string;
  date: string;
  allItems: any[];
  startAddress: string | null | undefined;
  startLabel: string;
}) {
  let previousAddress = startAddress || null;
  let previousLabel = startLabel;

  return allItems.map((item: any, i: number) => {
    const leg = {
      employee_id: employeeId,
      scheduled_date: date,
      leg_order: i,
      from_address: previousAddress,
      to_address: item.address || null,
      from_job_id: i > 0 ? allItems[i - 1].id : null,
      to_job_id: item.id,
      from_label: previousLabel,
    };

    if (item.address) previousAddress = item.address;
    previousLabel = item.customer_name || "Previous stop";
    return leg;
  });
}

function routeCacheStillMatches(existingRows: any[], expectedLegs: any[]) {
  if (existingRows.length !== expectedLegs.length) return false;

  for (const expected of expectedLegs) {
    const actual = existingRows.find((row: any) => row.leg_order === expected.leg_order);
    if (!actual) return false;
    if (actual.to_job_id !== expected.to_job_id) return false;
    if ((actual.from_job_id || null) !== (expected.from_job_id || null)) return false;
    if (normalizeAddress(actual.from_address) !== normalizeAddress(expected.from_address)) return false;
    if (normalizeAddress(actual.to_address) !== normalizeAddress(expected.to_address)) return false;
    if (expected.to_address && actual.travel_minutes == null) return false;
  }

  return true;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = getSupabaseAdmin();

    const body = await req.json();
    const { employee_id, date, batch, force } = body;

    // Support batch mode: array of { employee_id, date }
    const tasks: { employee_id: string; date: string }[] = batch
      ? batch
      : [{ employee_id, date }];

    if (!tasks.length || !tasks[0].employee_id || !tasks[0].date) {
      return new Response(JSON.stringify({ error: "employee_id and date required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard: only allow today + tomorrow. Never calculate historical routes,
    // and never pre-fill future weeks. Google Maps usage should stay tied to
    // the active dispatch board plus the next-day preview.
    const today = getCentralToday();
    const tomorrowDate = new Date(`${today}T12:00:00Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const filteredTasks = tasks.filter(t => {
      return t.date === today || t.date === tomorrow;
    });

    if (filteredTasks.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "travel cache is limited to today and tomorrow" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const task of filteredTasks) {
      try {
        const processResult = await processRoute(sb, task.employee_id, task.date, force === true);
        results.push({
          employee_id: task.employee_id,
          date: task.date,
          status: "ok",
          ...(processResult?.skipped ? { skipped: true, reason: processResult.reason } : {}),
        });
      } catch (e) {
        console.error(`Error processing ${task.employee_id} / ${task.date}:`, e);
        results.push({ employee_id: task.employee_id, date: task.date, status: "error", error: String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processRoute(sb: any, employeeId: string, date: string, force = false) {
  // Get employee info
  const { data: emp } = await sb
    .from("employees")
    .select("id, name, home_address")
    .eq("id", employeeId)
    .single();

  if (!emp) throw new Error(`Employee ${employeeId} not found`);

  // Get jobs for this tech on this date
  const { data: jobs } = await sb
    .from("jobs")
    .select("id, customer_id, hcp_job_number, customer_name, address, arrival_start, arrival_end, job_type, status")
    .eq("scheduled_date", date)
    .ilike("assigned_to", `%${emp.name}%`)
    .not("status", "in", '("canceled")')
    .order("arrival_start");

  const sortedJobs = (jobs || []).sort((a: any, b: any) => {
    if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
    if (a.arrival_start) return -1;
    if (b.arrival_start) return 1;
    return 0;
  });

  // Also get estimates
  const { data: estimates } = await sb
    .from("estimates")
    .select("id, customer_id, estimate_number, customer_name, address, arrival_start, arrival_end, status")
    .eq("scheduled_date", date)
    .ilike("assigned_to", `%${emp.name}%`)
    .not("status", "in", '("canceled")')
    .order("arrival_start");

  const sortedEstimates = (estimates || []).sort((a: any, b: any) => {
    if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
    if (a.arrival_start) return -1;
    if (b.arrival_start) return 1;
    return 0;
  });

  const customerMap = await fetchCustomersByIds(sb, [
    ...sortedJobs.map((job: any) => job.customer_id),
    ...sortedEstimates.map((estimate: any) => estimate.customer_id),
  ]);

  const hydrateRouteItem = (item: any) => {
    const customer: any = item.customer_id ? customerMap.get(item.customer_id) : null;
    return {
      ...item,
      customer_name: item.customer_name || buildCustomerName(customer),
      address: item.address || buildCustomerAddress(customer),
    };
  };

  // Merge all items sorted by arrival_start
  const allItems = [
    ...sortedJobs.map((j: any) => ({ ...hydrateRouteItem(j), _type: "job" })),
    ...sortedEstimates.map((e: any) => ({ ...hydrateRouteItem(e), _type: "estimate" })),
  ].sort((a: any, b: any) => {
    if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
    if (a.arrival_start) return -1;
    if (b.arrival_start) return 1;
    return 0;
  });

  // Determine starting address: home_address → company office fallback → first job address
  let startAddress = emp.home_address;
  let startLabel = `${emp.name.split(" ")[0]}'s home`;

  if (!startAddress) {
    // Try company office address from company_settings
    const { data: settingsRows } = await sb
      .from("company_settings")
      .select("key, value")
      .in("key", ["company_address", "company_city", "company_state", "company_zip"]);

    const settingsMap: Record<string, string> = {};
    for (const row of (settingsRows || []) as any[]) {
      settingsMap[row.key] = row.value;
    }

    if (settingsMap.company_address) {
      startAddress = [
        settingsMap.company_address,
        settingsMap.company_city,
        settingsMap.company_state,
        settingsMap.company_zip,
      ].filter(Boolean).join(", ");
      startLabel = "Office";
    }
  }

  // If still no starting address, use the first job's address
  if (!startAddress) {
    const firstWithAddress = allItems.find((item: any) => item.address);
    if (firstWithAddress) {
      startAddress = firstWithAddress.address;
      startLabel = "First stop";
    }
  }

  if (allItems.length === 0) {
    await sb
      .from("route_travel_cache")
      .delete()
      .eq("employee_id", employeeId)
      .eq("scheduled_date", date);
    return { skipped: false };
  }

  const expectedLegs = buildExpectedLegs({
    employeeId,
    date,
    allItems,
    startAddress,
    startLabel,
  });

  if (!force) {
    const { data: existingRows, error: existingError } = await sb
      .from("route_travel_cache")
      .select("leg_order, from_address, to_address, from_job_id, to_job_id, travel_minutes")
      .eq("employee_id", employeeId)
      .eq("scheduled_date", date)
      .order("leg_order");

    if (existingError) {
      console.warn("route_travel_cache read failed; recalculating:", existingError.message);
    } else if (routeCacheStillMatches(existingRows || [], expectedLegs)) {
      return { skipped: true, reason: "route cache already current" };
    }
  }

  // Delete existing cache for this employee+date only after proving it is stale.
  await sb
    .from("route_travel_cache")
    .delete()
    .eq("employee_id", employeeId)
    .eq("scheduled_date", date);

  // Calculate travel times sequentially
  const geocodeCache = new Map<string, [number, number] | null>();
  async function getCachedGeocode(addr: string) {
    if (geocodeCache.has(addr)) return geocodeCache.get(addr)!;
    const result = await geocodeToCoords(addr);
    geocodeCache.set(addr, result);
    return result;
  }

  let previousAddress = startAddress;
  let previousLabel = startLabel;
  const legs: any[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    if (!item.address) {
      legs.push({
        employee_id: employeeId,
        scheduled_date: date,
        leg_order: i,
        from_address: previousAddress,
        to_address: null,
        from_job_id: i > 0 ? allItems[i - 1].id : null,
        to_job_id: item.id,
        from_label: previousLabel,
        travel_minutes: null,
        distance_miles: null,
      });
      previousLabel = item.customer_name || "Previous stop";
      continue;
    }

    let travelMin: number | null = null;
    let distanceMiles: number | null = null;

    if (previousAddress) {
      const fromCoords = await getCachedGeocode(previousAddress);
      const toCoords = await getCachedGeocode(item.address);

      if (fromCoords && toCoords) {
        const dirs = await getDirections(fromCoords[1], fromCoords[0], toCoords[1], toCoords[0]);
        if (dirs) {
          travelMin = Math.round(dirs.duration / 60);
          distanceMiles = Math.round((dirs.distance / 1609.34) * 10) / 10;
        }
      }
    }

    legs.push({
      employee_id: employeeId,
      scheduled_date: date,
      leg_order: i,
      from_address: previousAddress,
      to_address: item.address,
      from_job_id: i > 0 ? allItems[i - 1].id : null,
      to_job_id: item.id,
      from_label: previousLabel,
      travel_minutes: travelMin,
      distance_miles: distanceMiles,
    });

    previousAddress = item.address;
    previousLabel = item.customer_name || "Previous stop";
  }

  // Upsert all legs (ON CONFLICT to prevent duplicate key errors)
  if (legs.length > 0) {
    const { error } = await sb.from("route_travel_cache").upsert(legs, {
      onConflict: "employee_id,scheduled_date,leg_order",
    });
    if (error) console.error("Upsert error:", error);
  }

  return { skipped: false };
}
