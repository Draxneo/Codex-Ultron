import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// Cache is permanent — property data doesn't change

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    // Parse mode: "upcoming" (default cron), "backfill" (all missing), or "date_range" (bounded window)
    let mode = "upcoming";
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    try {
      const body = await req.json();
      if (body?.mode === "backfill") mode = "backfill";
      else if (body?.mode === "date_range") {
        mode = "date_range";
        // Default = April 2026 if not specified
        dateFrom = body?.date_from || "2026-04-01";
        dateTo = body?.date_to || "2026-04-30";
      }
    } catch { /* no body = default */ }

    const addressSet = new Set<string>();

    if (mode === "backfill") {
      console.log("Prefetch: BACKFILL mode — all jobs & estimates missing property_data");

      // Get ALL job addresses
      const { data: jobs } = await supabase
        .from("jobs")
        .select("address")
        .not("address", "is", null);

      for (const j of jobs || []) {
        if (j.address && typeof j.address === "string" && j.address.trim().length > 5) {
          addressSet.add(j.address.trim());
        }
      }

      // Get ALL estimate addresses
      const { data: estimates } = await supabase
        .from("estimates")
        .select("address")
        .not("address", "is", null);

      for (const e of estimates || []) {
        if (e.address && typeof e.address === "string" && e.address.trim().length > 5) {
          addressSet.add(e.address.trim());
        }
      }
    } else if (mode === "date_range") {
      console.log(`Prefetch: DATE RANGE mode — jobs & estimates from ${dateFrom} to ${dateTo}`);

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select("address")
        .gte("scheduled_date", dateFrom!)
        .lte("scheduled_date", dateTo!)
        .not("address", "is", null);

      if (jobsErr) {
        console.error("Jobs query error:", jobsErr);
        return new Response(JSON.stringify({ error: jobsErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const j of jobs || []) {
        if (j.address && typeof j.address === "string" && j.address.trim().length > 5) {
          addressSet.add(j.address.trim());
        }
      }

      const { data: estimates } = await supabase
        .from("estimates")
        .select("address")
        .gte("scheduled_date", dateFrom!)
        .lte("scheduled_date", dateTo!)
        .not("address", "is", null);

      for (const e of estimates || []) {
        if (e.address && typeof e.address === "string" && e.address.trim().length > 5) {
          addressSet.add(e.address.trim());
        }
      }
    } else {
      // Default: upcoming jobs (next 7 days) + estimates
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().split("T")[0];
      const nextWeekStr = nextWeek.toISOString().split("T")[0];

      console.log(`Prefetch: upcoming jobs ${todayStr} to ${nextWeekStr} + recent estimates`);

      const { data: jobs, error: jobsErr } = await supabase
        .from("jobs")
        .select("address")
        .gte("scheduled_date", todayStr)
        .lte("scheduled_date", nextWeekStr)
        .not("status", "in", '("canceled","done")');

      if (jobsErr) {
        console.error("Jobs query error:", jobsErr);
        return new Response(JSON.stringify({ error: jobsErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const j of jobs || []) {
        if (j.address && typeof j.address === "string" && j.address.trim().length > 5) {
          addressSet.add(j.address.trim());
        }
      }

      // Also grab recent estimates (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: estimates } = await supabase
        .from("estimates")
        .select("address")
        .gte("created_at", thirtyDaysAgo)
        .not("address", "is", null);

      for (const e of estimates || []) {
        if (e.address && typeof e.address === "string" && e.address.trim().length > 5) {
          addressSet.add(e.address.trim());
        }
      }
    }

    const allAddresses = Array.from(addressSet);
    console.log(`Found ${allAddresses.length} unique addresses`);

    if (allAddresses.length === 0) {
      return new Response(
        JSON.stringify({ total_addresses: 0, already_cached: 0, fetched: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which addresses already have valid cache
    // Query in batches of 100 to avoid URL length limits
    const validCached = new Set<string>();

    for (let i = 0; i < allAddresses.length; i += 100) {
      const batch = allAddresses.slice(i, i + 100);
      const { data: cached } = await supabase
        .from("property_data")
        .select("address, street_view_url, bedrooms, sqft")
        .in("address", batch);

      for (const row of cached || []) {
        // Already have data — no need to re-fetch (permanent cache)
        if (row.street_view_url || row.bedrooms || row.sqft) {
          validCached.add(row.address);
        }
      }
    }

    const toFetch = allAddresses.filter((a) => !validCached.has(a));
    console.log(`Already cached: ${validCached.size}, to fetch: ${toFetch.length}`);

    let fetched = 0;
    let errors = 0;

    for (const address of toFetch) {
      try {
        console.log(`Fetching: ${address}`);
        const res = await fetch(`${supabaseUrl}/functions/v1/lookup-property`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ address }),
        });

        if (res.ok) {
          fetched++;
          console.log(`✓ ${address}`);
        } else {
          errors++;
          console.error(`✗ ${address}: ${res.status}`);
        }
      } catch (e) {
        errors++;
        console.error(`✗ ${address}: ${e.message}`);
      }

      // Rate limit: 2s between calls
      if (toFetch.indexOf(address) < toFetch.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const summary = {
      mode,
      total_addresses: allAddresses.length,
      already_cached: validCached.size,
      fetched,
      errors,
    };

    console.log("Prefetch complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("prefetch-property-data error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
