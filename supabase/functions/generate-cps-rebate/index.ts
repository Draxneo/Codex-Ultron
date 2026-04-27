/**
 * generate-cps-rebate — Server-side CPS Energy rebate form generator.
 *
 * Gathers job, equipment (AHRI + customer_equipment), and company data,
 * builds the same HTML rebate form the frontend renders, and returns it
 * for standalone email/submission outside UltraOffice.
 *
 * Called by the autopilot chain (submit_rebate action) or manually.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// ── CPS tier structure (mirrors frontend) ──
const TIERS = [
  { name: "Tier 1", min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
  { name: "Tier 2", min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
  { name: "Tier 3", min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
  { name: "Tier 4", min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
  { name: "Tier 5", min: 20.0, max: 99, earlyPer: 310, burnoutPer: 275 },
];

function btuhToTons(btuh: number): number {
  if (btuh < 18000) return 1.0;
  if (btuh < 21000) return 1.5;
  if (btuh < 27000) return 2.0;
  if (btuh < 33000) return 2.5;
  if (btuh < 39000) return 3.0;
  if (btuh < 45000) return 3.5;
  if (btuh < 54000) return 4.0;
  return 5.0;
}

function getTier(seer2: number) {
  return TIERS.find((t) => seer2 >= t.min && seer2 <= t.max) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id required");

    const supabase = getSupabaseAdmin();

    // ── Gather all data in parallel ──
    const [jobRes, settingsRes, ahriRes, equipRes] = await Promise.all([
      supabase.from("jobs").select("*").eq("id", job_id).single(),
      supabase.from("company_settings").select("key, value"),
      supabase
        .from("ahri_lookups")
        .select("*")
        .eq(
          "ahri_number",
          // We'll filter after fetching the job
          "___placeholder___"
        )
        .limit(0), // placeholder — real query below
      supabase
        .from("customer_equipment")
        .select("*")
        .eq("customer_id", "___placeholder___")
        .limit(0), // placeholder
    ]);

    const job = jobRes.data;
    if (!job) throw new Error(`Job not found: ${job_id}`);

    // Build settings map
    const settings: Record<string, string> = {};
    (settingsRes.data || []).forEach((r: any) => {
      settings[r.key] = r.value;
    });

    // Now fetch AHRI and equipment with real IDs
    const [ahriResult, equipResult, techFormResult] = await Promise.all([
      job.ahri_number
        ? supabase
            .from("ahri_lookups")
            .select("*")
            .eq("ahri_number", job.ahri_number)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      job.customer_id
        ? supabase
            .from("customer_equipment")
            .select("*")
            .eq("customer_id", job.customer_id)
            .order("created_at", { ascending: false })
            .limit(3)
        : Promise.resolve({ data: [] }),
      supabase
        .from("tech_forms")
        .select("equipment_serial, equipment_model")
        .eq("job_id", job_id)
        .limit(1),
    ]);

    const ahri = ahriResult.data;
    const existingEquip = equipResult.data || [];
    const techForm = (techFormResult.data || [])[0];

    // ── Derive rebate form fields ──
    const customerName = job.customer_name || "";
    const nameParts = customerName.trim().split(/\s+/);
    const firstName =
      nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
    const lastName =
      nameParts.length > 1
        ? nameParts[nameParts.length - 1]
        : nameParts[0] || "";

    const addressStr = job.address || "";
    const addrParts = addressStr.split(",").map((s: string) => s.trim());
    let city = "San Antonio";
    let zip = "";
    if (addrParts.length >= 3) {
      city = addrParts[addrParts.length - 2] || "San Antonio";
      const stateZip = addrParts[addrParts.length - 1];
      const zipMatch = stateZip.match(/(\d{5})/);
      if (zipMatch) zip = zipMatch[1];
    } else if (addrParts.length === 2) {
      const stateZip = addrParts[1];
      const zipMatch = stateZip.match(/(\d{5})/);
      if (zipMatch) zip = zipMatch[1];
    }

    // Equipment data from AHRI lookup or tech form
    const seer2 = ahri?.seer2 || null;
    const eer2 = ahri?.eer2 || null;
    const hspf2 = ahri?.hspf2 || null;
    const coolingCap = ahri?.cooling_cap_btuh || null;
    const systemType = job.system_type || "central_ac";
    const brand =
      job.brand ||
      ahri?.outdoor_brand ||
      ahri?.indoor_brand ||
      "";
    const condenserModel = ahri?.outdoor_model || techForm?.equipment_model || "";
    const ahriNumber = job.ahri_number || "";
    const tonnage =
      job.tonnage || (coolingCap ? btuhToTons(coolingCap) : null);

    // Rebate calculation
    let rebateInfo: any = null;
    if (seer2) {
      const tier = getTier(seer2);
      if (tier && tonnage) {
        // Default to early_replacement for autopilot
        const perTon = tier.earlyPer;
        rebateInfo = {
          qualifies: true,
          tier: tier.name,
          tons: tonnage,
          perTon,
          rebateAmount: perTon * tonnage,
        };
      }
    }

    // Company info from settings (Rule 2: One Source of Truth)
    const companyName = settings.company_name || "";
    const companyPhone = settings.company_phone || "";
    const companyEmail = settings.company_email || "";
    const licenseNumber = settings.tacla_number || "";

    // ── Build HTML (mirrors frontend buildPrintHtml) ──
    const unitLabel =
      systemType === "heat_pump" || systemType === "dual_fuel"
        ? "Heat Pump"
        : "Central A/C";

    const fieldStyle = `style="background:#ffffff;border:1.5px solid #9ca3af;border-radius:4px;padding:7px 10px;font-size:14px;color:#000000;font-weight:500;font-family:'Courier New',Courier,monospace;"`;
    const labelStyle = `style="font-size:11px;color:#374151;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;"`;
    const sectionStyle = `style="border:1px solid #d1d5db;border-radius:8px;padding:20px;margin-bottom:20px;background:#ffffff;"`;
    const headingStyle = `style="font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#1e3a5f;margin:0 0 16px 0;padding-bottom:8px;border-bottom:2px solid #d1d5db;"`;

    const field = (label: string, value: string | number | null) =>
      `<div style="flex:1;min-width:0;"><div ${labelStyle}>${label}</div><div ${fieldStyle}>${value || "&nbsp;"}</div></div>`;

    const row = (...fields: string[]) =>
      `<div style="display:flex;gap:12px;margin-bottom:10px;">${fields.join("")}</div>`;

    const rebateSummary = rebateInfo?.qualifies
      ? `<div style="background:#dcfce7;border:2px solid #16a34a;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
          <div style="font-size:22px;font-weight:900;color:#14532d;">Estimated Rebate: $${rebateInfo.rebateAmount?.toLocaleString()}</div>
          <div style="font-size:14px;font-weight:600;color:#1f2937;margin-top:4px;">${rebateInfo.tier} · ${rebateInfo.tons} tons × $${rebateInfo.perTon}/ton · Early Replacement</div>
        </div>`
      : seer2
        ? `<div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;color:#dc2626;">Equipment data incomplete — verify AHRI lookup</div>
          </div>`
        : `<div style="background:#fefce8;border:2px solid #eab308;border-radius:8px;padding:16px;margin-bottom:24px;">
            <div style="font-size:16px;font-weight:700;color:#854d0e;">No AHRI data found — fill in equipment details manually</div>
          </div>`;

    // Existing equipment section
    const existingSection =
      existingEquip.length > 0
        ? `<div ${sectionStyle}>
        <div ${headingStyle}>Existing System(s) on File</div>
        ${existingEquip
          .map(
            (eq: any, i: number) => `
          <div style="margin-top:${i > 0 ? "12px" : "0"};${i > 0 ? "padding-top:12px;border-top:1px solid #e5e7eb;" : ""}">
            <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">Existing System ${i + 1}</div>
            ${row(field("Brand", eq.brand), field("Model", eq.model_number), field("Serial", eq.serial_number))}
          </div>`
          )
          .join("")}
      </div>`
        : "";

    const tierRows = TIERS.map((t) => {
      const isActive = rebateInfo?.qualifies && rebateInfo.tier === t.name;
      const bg = isActive ? "background:#eff6ff;" : "";
      const fw = isActive ? "font-weight:700;" : "";
      return `<tr style="${bg}${fw}">
        <td style="border:1px solid #d1d5db;padding:6px 10px;">${t.name}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;">${t.min} – ${t.max === 99 ? "20.0+" : t.max}</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;">$${t.earlyPer}/ton</td>
        <td style="border:1px solid #d1d5db;padding:6px 10px;text-align:right;">$${t.burnoutPer}/ton</td>
      </tr>`;
    }).join("");

    const checkItem = (text: string) =>
      `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
        <div style="width:14px;height:14px;border:1.5px solid #9ca3af;border-radius:3px;flex-shrink:0;margin-top:1px;"></div>
        <span style="font-size:12px;color:#4b5563;">${text}</span>
      </div>`;

    const formHtml = `
      <div style="width:100%;max-width:800px;padding:30px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#111827;box-sizing:border-box;">
        <div style="background:#1e3a5f;color:#ffffff;padding:20px 24px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:20px;font-weight:900;letter-spacing:0.5px;color:#ffffff;">CPS Energy HVAC Rebate Application</div>
            <div style="font-size:13px;font-weight:600;color:#cbd5e1;margin-top:4px;">Residential Cooling &amp; Heating Incentive Program</div>
          </div>
          <div style="text-align:right;font-size:12px;font-weight:700;color:#e2e8f0;">
            <div>Job# ${job.hcp_job_number || job.job_number || "N/A"}</div>
            <div>${job.scheduled_date || "—"}</div>
          </div>
        </div>

        ${rebateSummary}

        <div ${sectionStyle}>
          <div ${headingStyle}>CPS Energy Account Holder Information</div>
          ${row(field("First Name", firstName), field("Last Name", lastName))}
          ${row(field("Installation Address", addressStr), field("City", city))}
          ${row(field("State", "TX"), field("ZIP", zip), field("Email", job.customer_email || ""), field("Phone", job.customer_phone || ""))}
        </div>

        <div ${sectionStyle}>
          <div ${headingStyle}>Installing Contractor Information</div>
          ${row(field("Company Name", companyName), field("License Number", licenseNumber))}
          ${row(field("Phone", companyPhone), field("Email", companyEmail), field("Install Date", job.scheduled_date || ""))}
        </div>

        <div ${sectionStyle}>
          <div ${headingStyle}>New System Information</div>
          ${row(field("Unit Type", unitLabel), field("Manufacturer", brand), field("AHRI Certificate #", ahriNumber))}
          ${row(
            field("BTUh (Cooling Cap)", coolingCap ? coolingCap.toLocaleString() : ""),
            field("SEER2", seer2),
            field("EER2", eer2),
            field("HSPF2", systemType === "heat_pump" || systemType === "dual_fuel" ? hspf2 : "N/A")
          )}
          ${tonnage ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">CPS Tonnage: <strong>${tonnage} tons</strong>${coolingCap ? ` (based on ${coolingCap.toLocaleString()} BTUh)` : ""}</div>` : ""}
        </div>

        ${existingSection}

        <div ${sectionStyle}>
          <div ${headingStyle}>CPS Rebate Tier Reference</div>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:700;">Tier</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:700;">SEER2 Range</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-weight:700;">Early Replacement</th>
                <th style="border:1px solid #d1d5db;padding:8px 10px;text-align:right;font-weight:700;">Replace on Burnout</th>
              </tr>
            </thead>
            <tbody>${tierRows}</tbody>
          </table>
        </div>

        <div ${sectionStyle}>
          <div ${headingStyle}>Required Documents Checklist</div>
          ${checkItem("Itemized invoice (model/serial #s, install date, address, total cost)")}
          ${checkItem("AHRI certificate or certificate number")}
          ${checkItem("Photos of existing system (if early replacement)")}
          ${checkItem("Permit information (City of San Antonio)")}
          <div style="font-size:10px;color:#9ca3af;margin-top:12px;">Submit to: CPSEnergyResidential@clearesult.com · Must be received within 30 days of installation</div>
        </div>

        <div style="text-align:center;font-size:10px;color:#9ca3af;margin-top:16px;">
          Generated by ${companyName} · Autopilot · ${new Date().toLocaleDateString()}
        </div>
      </div>
    `;


    // Stamp the job
    await supabase
      .from("jobs")
      .update({ rebate_submitted_at: new Date().toISOString() })
      .eq("id", job_id);

    // Log activity
    await supabase.from("activity_log").insert({
      job_id,
      action: "rebate_generated",
      performed_by: "Autopilot",
      details: `CPS rebate form generated. ${rebateInfo?.qualifies ? `Est. rebate: $${rebateInfo.rebateAmount} (${rebateInfo.tier}, ${rebateInfo.tons}T)` : "AHRI data incomplete — verify manually."}. Brand: ${brand}, AHRI: ${ahriNumber || "N/A"}.`,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        rebate: rebateInfo,
        html: formHtml,

      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("generate-cps-rebate error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
