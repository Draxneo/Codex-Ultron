import { scrape, interact, stopInteract, getKey, esc } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const BRAND_PORTALS: Record<string, { url: string; label: string }> = {
  carrier: { url: "https://productregistration.carrier.com/public/RegistrationForm_Carrier?brand=CARRIER", label: "Carrier" },
  "day and night": { url: "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP", label: "Day and Night" },
  goodman: { url: "https://warranty.goodmanmfg.com/newregistration/#/reg-layout", label: "Goodman" },
  trane: { url: "https://www.trane.com/residential/en/resources/warranty-and-registration/register/", label: "Trane" },
};

function getPortal(brand: string) {
  const key = Object.keys(BRAND_PORTALS).find((k) => k === brand.toLowerCase());
  return BRAND_PORTALS[key || "carrier"];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = getKey();
      const supabase = getSupabaseAdmin();

  try {
    const body = await req.json();
    const { job_id, action } = body;

    if (!job_id) {
      return new Response(
        JSON.stringify({ success: false, error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: create_session (legacy compat — just returns a scrapeId) ───
    if (action === "create_session") {
      return new Response(
        JSON.stringify({ success: true, message: "Sessions are now managed automatically via scrape+interact. Just call the default execute action." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Default: execute warranty registration ───
    const { data: job, error: jobErr } = await supabase.from("jobs").select("*").eq("id", job_id).single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ success: false, error: "Job not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch equipment data
    const { data: invoices } = await supabase.from("job_invoices").select("serial_number, model_number").eq("job_id", job_id);
    const { data: techForms } = await supabase.from("tech_forms").select("id, equipment_serial, equipment_model").eq("job_id", job_id);
    let techPhotos: any[] = [];
    if (techForms?.length) {
      const { data: photoData } = await supabase.from("tech_form_photos").select("extracted_serial, extracted_model, photo_type").in("tech_form_id", techForms.map((f: any) => f.id));
      techPhotos = (photoData || []).filter((p: any) => p.photo_type?.toLowerCase().includes("data plate"));
    }

    // Company settings
    const { data: settingsRows } = await supabase.from("company_settings").select("key, value");
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { settings[r.key] = r.value; });

    // Parse data
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
    const phoneFormatted = phoneClean.length === 10 ? `(${phoneClean.slice(0, 3)}) ${phoneClean.slice(3, 6)}-${phoneClean.slice(6)}` : job.customer_phone || "";

    let installDate = "";
    if (job.scheduled_date) {
      const d = new Date(job.scheduled_date + "T00:00:00");
      installDate = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
    }

    // Collect serials/models from all sources
    const serialSet = new Set<string>();
    const modelSet = new Set<string>();
    const addSplit = (set: Set<string>, val: string | null) => { if (!val) return; val.split(",").map(s => s.trim()).filter(Boolean).forEach(s => set.add(s)); };
    (invoices || []).forEach((i: any) => { addSplit(serialSet, i.serial_number); addSplit(modelSet, i.model_number); });
    (techForms || []).forEach((f: any) => { addSplit(serialSet, f.equipment_serial); addSplit(modelSet, f.equipment_model); });
    techPhotos.forEach((p: any) => { addSplit(serialSet, p.extracted_serial); addSplit(modelSet, p.extracted_model); });
    const serials = Array.from(serialSet);
    const models = Array.from(modelSet);

    const customerEmail = job.customer_email || settings.company_email || "";
    const dealerName = settings.company_name || "";
    const dealerPhone = settings.company_phone || "";
    const dealerEmail = settings.company_email || "";
    const dealerAddress = settings.company_address || "";
    const dealerCity = settings.company_city || "";
    const dealerState = settings.company_state || "";
    const dealerZip = settings.company_zip || "";

    const brand = (job.brand || "Carrier").toLowerCase();
    const portal = getPortal(job.brand || "Carrier");
    const profileName = `warranty-${brand.replace(/\s+/g, "-")}`;

    console.log("Auto-registering warranty for job:", job_id, "Brand:", portal.label);
    console.log("Customer:", firstName, lastName, "|", street, city, state, zip);
    console.log("Serials:", serials, "Models:", models);

    // Step 1: Scrape the warranty portal with brand-specific persistent profile
    const res = await scrape(portal.url, {
      formats: ["markdown", "screenshot"],
      waitFor: 5000,
      profile: { name: profileName, saveChanges: true },
    }, apiKey);

    if (!res.success || !res.scrapeId) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to scrape warranty portal", details: res.raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scrapeId = res.scrapeId;
    const liveViewUrl = res.raw?.data?.metadata?.liveViewUrl || null;
    const results: Record<string, any> = {};

    try {
      // Step 2: Handle initial modals/terms (if any)
      const termsResult = await interact(scrapeId, {
        prompt: "If there's a terms/conditions modal or checkbox, accept/agree to the terms and click Next or Continue. If there's no modal, just describe what you see on the page.",
        timeout: 20,
      }, apiKey);
      results.terms = termsResult.output;

      // Step 3: Fill product/serial info
      const serialInfo = serials.length > 0 ? `Serial numbers: ${serials.join(", ")}` : "No serial numbers available";
      const modelInfo = models.length > 0 ? `Model numbers: ${models.join(", ")}` : "No model numbers available";

      const productResult = await interact(scrapeId, {
        prompt: `Fill in the product/equipment information:
${serialInfo}
${modelInfo}
${installDate ? `Install date: ${installDate}` : ""}
- This is a Replacement installation
- Residential Single Family
- I am registering on behalf of the homeowner/customer
Fill in whatever fields are available and click Next to proceed.`,
        timeout: 45,
      }, apiKey);
      results.product = productResult.output;

      // Step 4: Fill customer info
      const customerResult = await interact(scrapeId, {
        prompt: `Fill in the customer/homeowner information:
- First Name: ${firstName}
- Last Name: ${lastName}
- Email: ${customerEmail}
- Phone: ${phoneFormatted}
- Address: ${street}
- City: ${city}
- State: ${state}
- ZIP: ${zip}
Fill in whatever fields are available and click Next to proceed.`,
        timeout: 45,
      }, apiKey);
      results.customer = customerResult.output;

      // Step 5: Fill dealer/contractor info
      const dealerResult = await interact(scrapeId, {
        prompt: `Fill in the dealer/contractor information:
- Company Name: ${dealerName}
- Phone: ${dealerPhone}
- Email: ${dealerEmail}
- Address: ${dealerAddress}
- City: ${dealerCity}
- State: ${dealerState}
- ZIP: ${dealerZip}
If there's a contractor search field, type "${dealerName}" and select from the dropdown results.
Fill in whatever fields are available and click Next to proceed.`,
        timeout: 45,
      }, apiKey);
      results.dealer = dealerResult.output;

      // Step 6: Submit the registration
      const submitResult = await interact(scrapeId, {
        prompt: "Click the Submit or Register button to complete the warranty registration. After submission, look for a confirmation number, certificate number, or success message. Tell me the result.",
        timeout: 30,
      }, apiKey);
      results.submit = submitResult.output;

      // Parse confirmation from submit output
      let submitted = false;
      let confirmationText = "";
      const submitOutput = submitResult.output || "";
      if (/success|thank you|confirmed|registered|certificate/i.test(submitOutput)) {
        submitted = true;
      }
      const confMatch = submitOutput.match(/(?:confirmation|certificate|registration)[#:\s]*([A-Z0-9-]+)/i);
      if (confMatch) confirmationText = confMatch[1];

      results.final = { submitted, confirmationText };

      // Stop session (saves profile cookies for next time)
      await stopInteract(scrapeId, apiKey);

      // Update job with warranty status
      if (submitted) {
        await supabase.from("jobs").update({
          warranty_status: "registered",
          warranty_confirmation: confirmationText || "registered",
          warranty_registered_at: new Date().toISOString(),
        }).eq("id", job_id);

        await supabase.from("activity_log").insert({
          job_id,
          action: "warranty_registered",
          performed_by: "ai-agent",
          details: `${portal.label} warranty registered${confirmationText ? ` — Confirmation: ${confirmationText}` : ""}`,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          submitted,
          confirmationText,
          brand: portal.label,
          liveViewUrl,
          steps: results,
          message: submitted
            ? `Warranty registered with ${portal.label}${confirmationText ? ` — Confirmation: ${confirmationText}` : ""}`
            : `Warranty form filled but submission may need manual review. Check details.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (execError) {
      // Stop session on error
      await stopInteract(scrapeId, apiKey).catch(() => {});

      return new Response(
        JSON.stringify({
          success: false,
          error: execError instanceof Error ? execError.message : "Execution error",
          steps: results,
          liveViewUrl,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Auto-register-warranty error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
