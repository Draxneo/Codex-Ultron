import { scrape, interact, stopInteract, getKey, esc } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



function extractAttr(attrString: string, attrName: string): string {
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = attrString.match(regex);
  return match ? match[1] : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = getKey();
      const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { job_id, action, authority_id } = body;

    if (!job_id) {
      return new Response(
        JSON.stringify({ success: false, error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: scout — scrape a permit portal to map form fields ───
    if (action === "scout") {
      const targetUrl = body.url;
      if (!targetUrl) {
        return new Response(
          JSON.stringify({ success: false, error: "url is required for scout action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await scrape(targetUrl, {
        formats: ["screenshot", "html", "markdown"],
        waitFor: 8000,
      }, apiKey);

      if (!res.success) {
        return new Response(
          JSON.stringify({ success: false, error: "Scrape failed", details: res.raw }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use interact to extract form fields dynamically
      let fields: any[] = [];
      if (res.scrapeId) {
        try {
          const extraction = await interact(res.scrapeId, {
            prompt: "List all visible form fields on this page. For each, give: field type, name/id, label text, whether required. Return as JSON array.",
            timeout: 20,
          }, apiKey);

          if (extraction.success && extraction.output) {
            const jsonMatch = extraction.output.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try { fields = JSON.parse(jsonMatch[0]); } catch {}
            }
          }
          await stopInteract(res.scrapeId, apiKey);
        } catch (e) {
          console.error("Interact extraction error:", e);
        }
      }

      // Fallback: HTML parsing
      if (fields.length === 0 && res.html) {
        const inputRegex = /<input\s([^>]*)>/gi;
        let match;
        while ((match = inputRegex.exec(res.html)) !== null) {
          fields.push({ tag: "input", type: extractAttr(match[1], "type") || "text", name: extractAttr(match[1], "name"), id: extractAttr(match[1], "id"), placeholder: extractAttr(match[1], "placeholder") });
        }
        const selectRegex = /<select\s([^>]*)>/gi;
        while ((match = selectRegex.exec(res.html)) !== null) {
          fields.push({ tag: "select", name: extractAttr(match[1], "name"), id: extractAttr(match[1], "id") });
        }
      }

      return new Response(
        JSON.stringify({ success: true, screenshot: res.screenshot, fields, htmlLength: res.html.length, url: targetUrl }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Default action: execute permit application ───
    const { data: job, error: jobErr } = await supabase.from("jobs").select("*").eq("id", job_id).single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ success: false, error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let authorityData: any = null;
    if (authority_id) {
      const { data } = await supabase.from("permit_authorities").select("*").eq("id", authority_id).single();
      authorityData = data;
    } else {
      const jobZip = (job.address || "").match(/\b(\d{5})\b/)?.[1];
      if (jobZip) {
        const { data: authorities } = await supabase.from("permit_authorities").select("*").eq("is_active", true);
        authorityData = (authorities || []).find((a: any) => (a.zip_codes || []).includes(jobZip));
      }
    }

    if (!authorityData?.permit_portal_url) {
      return new Response(
        JSON.stringify({ success: false, error: "No permit portal URL configured for this jurisdiction", authority: authorityData?.name || "unknown" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const portalUrl = authorityData.permit_portal_url;
    const authorityName = authorityData.name || "Unknown Authority";
    const profileName = `permit-${authorityName.toLowerCase().replace(/\s+/g, "-")}`;

    // Parse customer data
    const nameParts = (job.customer_name || "").trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const addressRaw = job.address || "";
    const addrParts = addressRaw.split(",").map((s: string) => s.trim());
    const street = addrParts[0] || "";
    const city = addrParts[1] || "";
    const stateZipMatch = (addrParts[2] || "").match(/^([A-Z]{2})\s*(\d{5})?/i);
    const state = stateZipMatch ? stateZipMatch[1].toUpperCase() : "";
    const zip = stateZipMatch?.[2] || "";
    const phoneClean = (job.customer_phone || "").replace(/\D/g, "");

    console.log("Auto-applying permit for job:", job_id, "Authority:", authorityName, "URL:", portalUrl);

    // Scrape the permit portal with a jurisdiction-specific profile
    const res = await scrape(portalUrl, {
      formats: ["markdown", "screenshot"],
      waitFor: 5000,
      profile: { name: profileName, saveChanges: true },
    }, apiKey);

    if (!res.success || !res.scrapeId) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to scrape permit portal" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect login requirement
    const loginRequired = /log\s*in|sign\s*in|username|password|authenticat/i.test(res.markdown);

    // Use interact to discover and describe the form
    const scoutResult = await interact(res.scrapeId, {
      prompt: `Analyze this page. Does it require login? List all visible form fields. What type of form is this (permit application, registration, etc.)? What are the required steps?`,
      timeout: 20,
    }, apiKey);

    // If no login required, try to fill the form
    let fillResult: any = null;
    if (!loginRequired) {
      fillResult = await interact(res.scrapeId, {
        prompt: `Fill out the permit application form with this information:
- Name: ${firstName} ${lastName}
- Address: ${street}, ${city}, ${state} ${zip}
- Phone: ${phoneClean}
- Project Type: HVAC Replacement
- Description: Residential HVAC system replacement
Do NOT submit the form yet. Just fill in the fields and tell me what you filled.`,
        timeout: 45,
      }, apiKey);
    }

    // Stop the session (saves profile state)
    await stopInteract(res.scrapeId, apiKey);

    // Log the automation attempt
    const resultData = {
      loginRequired,
      scoutOutput: scoutResult.output,
      fillOutput: fillResult?.output || null,
      pageTitle: res.metadata?.title || "",
    };

    if (authority_id || authorityData?.id) {
      await supabase.from("permit_applications" as any).upsert({
        job_id,
        authority_id: authority_id || authorityData.id,
        status: loginRequired ? "login_required" : "scouted",
        automation_log: [{ timestamp: new Date().toISOString(), action: "scout", result: resultData }],
        updated_at: new Date().toISOString(),
      } as any, { onConflict: "job_id,authority_id" }).select();
    }

    return new Response(
      JSON.stringify({
        success: true,
        authority: authorityName,
        loginRequired,
        message: loginRequired
          ? `${authorityName} portal requires login. Use the Smart Clipboard to fill the form manually.`
          : `Portal scouted and form pre-filled. ${fillResult?.output?.slice(0, 200) || ""}`,
        details: resultData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto-apply-permit error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
