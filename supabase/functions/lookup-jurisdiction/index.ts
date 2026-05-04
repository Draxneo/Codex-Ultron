/**
 * lookup-jurisdiction — Uses Firecrawl v2 to identify
 * which city/county jurisdiction an address falls in.
 */
import { scrape, search, interact, stopInteract, getKey } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id required");

            const supabase = getSupabaseAdmin();
    const apiKey = getKey();

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, address, lat, lng, zip")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) throw new Error(`Job not found: ${job_id}`);

    if (!job.lat || !job.lng) {
      return new Response(
        JSON.stringify({ ok: false, reason: "No coordinates on job — geocode first" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Scrape randymajors.org with v2 + interact for dynamic content ──
    const url = `https://www.randymajors.org/city-limits-on-google-maps?x=${job.lng}&y=${job.lat}&cx=${job.lng}&cy=${job.lat}&zoom=14&cities=show`;
    console.log(`Scraping jurisdiction for job ${job_id}: ${url}`);

    const res = await scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
    }, apiKey);

    let markdown = res.markdown;

    // If markdown is too short, the map may not have loaded — use interact
    if (res.scrapeId && markdown.length < 200) {
      console.log("Short markdown, using interact to wait for map...");
      const interactRes = await interact(res.scrapeId, {
        prompt: "Wait for the map to fully load. Then extract the city/jurisdiction name shown for the marker location. What city or unincorporated area is this location in?",
        timeout: 15,
      }, apiKey);

      if (interactRes.success && interactRes.output) {
        markdown = markdown + "\n" + interactRes.output;
      }
      await stopInteract(res.scrapeId, apiKey);
    }

    // Parse jurisdiction
    const jurisdiction = parseJurisdiction(markdown);

    // Update job
    const updatePayload: any = { jurisdiction_looked_up_at: new Date().toISOString() };
    if (jurisdiction) updatePayload.jurisdiction = jurisdiction;
    await supabase.from("jobs").update(updatePayload).eq("id", job_id);

    // Auto-match to permit_authorities
    let matchedAuthority: any = null;
    if (jurisdiction) {
      const { data: authority } = await supabase
        .from("permit_authorities" as any)
        .select("id, name, permit_portal_url")
        .ilike("name", `%${jurisdiction}%`)
        .limit(1)
        .maybeSingle();
      matchedAuthority = authority;

      if (authority) {
        const { data: existing } = await supabase
          .from("permit_applications" as any)
          .select("id")
          .eq("job_id", job_id)
          .maybeSingle();
        if (!existing) {
          await supabase.from("permit_applications" as any).insert({
            job_id,
            authority_id: authority.id,
            status: "not_started",
          });
        }
      }
    }

    // ── Permit portal lookup via search ──
    let permitPortalUrl: string | null = matchedAuthority?.permit_portal_url || null;
    if (jurisdiction && !permitPortalUrl) {
      permitPortalUrl = await findPermitPortal(jurisdiction, apiKey);
      if (permitPortalUrl) {
        if (matchedAuthority) {
          await supabase
            .from("permit_authorities" as any)
            .update({ permit_portal_url: permitPortalUrl, updated_at: new Date().toISOString() } as any)
            .eq("id", matchedAuthority.id);
        }
        await supabase.from("jobs").update({ permit_portal_url: permitPortalUrl }).eq("id", job_id);
      }
    } else if (permitPortalUrl) {
      await supabase.from("jobs").update({ permit_portal_url: permitPortalUrl }).eq("id", job_id);
    }

    // Log activity
    const portalNote = permitPortalUrl ? ` | Portal: ${permitPortalUrl}` : "";
    await supabase.from("activity_log").insert({
      job_id,
      action: "jurisdiction_lookup",
      performed_by: "Autopilot",
      details: jurisdiction
        ? `Jurisdiction identified: ${jurisdiction}${portalNote}`
        : `Jurisdiction lookup completed — no clear match found`,
    });

    return new Response(
      JSON.stringify({ ok: true, jurisdiction, permit_portal_url: permitPortalUrl, scraped_length: markdown.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("lookup-jurisdiction error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseJurisdiction(markdown: string): string | null {
  const cityMatch = markdown.match(/(?:City of|city limits.*?)\s+([A-Z][a-zA-Z\s]+?)(?:\s*[,\n|])/i);
  const incorporatedMatch = markdown.match(/(?:within|inside|in)\s+(?:the\s+)?(?:city\s+(?:limits?\s+)?(?:of\s+)?)?([A-Z][a-zA-Z\s]+?)(?:\s+city|\s*[,\n|])/i);
  const unincorporatedMatch = markdown.match(/unincorporated\s+([A-Z][a-zA-Z\s]+?)(?:\s+county|\s*[,\n|])/i);
  const countyMatch = markdown.match(/([A-Z][a-zA-Z\s]+?)\s+County/i);

  if (cityMatch) return cityMatch[1].trim();
  if (incorporatedMatch) return incorporatedMatch[1].trim();
  if (unincorporatedMatch) return `Unincorporated ${unincorporatedMatch[1].trim()} County`;
  if (countyMatch) return `${countyMatch[1].trim()} County`;

  // SA area fallback
  const saMatch = markdown.match(/(San Antonio|Helotes|Leon Valley|Shavano Park|Castle Hills|Balcones Heights|Alamo Heights|Terrell Hills|Windcrest|Live Oak|Converse|Universal City|Schertz|Cibolo|New Braunfels|Seguin|Boerne|Fair Oaks Ranch|Hollywood Park|Hill Country Village|Olmos Park|Selma|Garden Ridge)/i);
  if (saMatch) return saMatch[1];

  return null;
}

async function findPermitPortal(jurisdiction: string, apiKey: string): Promise<string | null> {
  try {
    // MGOConnect-specific search
    let res = await search(`"${jurisdiction}" mgoconnect permit portal Texas`, { limit: 5 }, apiKey);
    for (const r of res.results) {
      if (r.url.includes("mgoconnect.org")) return r.url;
    }

    // Broader search
    res = await search(`"${jurisdiction}" Texas online permit portal building`, { limit: 5 }, apiKey);
    for (const r of res.results) {
      if (r.url.match(/\.(gov|org|com)\/.*(permit|building|development)/i)) return r.url;
    }
  } catch (e: any) {
    console.error("Permit portal search error:", e.message);
  }
  return null;
}
