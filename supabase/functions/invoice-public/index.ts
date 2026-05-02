import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

function formatUsPhone(phone?: string | null): string {
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return phone || "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

async function applyBusinessUnitHeading(supabase: any, settingsMap: Record<string, string>, invoice: any, job: any) {
  const customer = job?.customers || {};
  const explicitBusinessUnitId =
    invoice?.business_unit_id ||
    job?.business_unit_id ||
    customer?.primary_business_unit_id ||
    null;

  let query = supabase
    .from("business_units")
    .select("id, slug, display_name, legal_name, primary_phone_number, customer_tag, is_default")
    .eq("is_active", true);

  if (explicitBusinessUnitId) {
    query = query.eq("id", explicitBusinessUnitId).maybeSingle();
  } else {
    query = query.eq("is_default", true).maybeSingle();
  }

  const { data: unit } = await query;
  if (!unit) return settingsMap;

  const companyName = unit.legal_name || unit.display_name || settingsMap.company_name;
  return {
    ...settingsMap,
    company_name: companyName,
    company_display_name: unit.display_name || companyName,
    company_phone: formatUsPhone(unit.primary_phone_number) || settingsMap.company_phone,
    business_unit_id: unit.id,
    business_unit_slug: unit.slug,
    business_unit_tag: unit.customer_tag || unit.display_name || companyName,
  };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Fetch invoice by public_token
    const { data: invoice, error: invErr } = await supabase
      .from("customer_invoices")
      .select("*, customer_invoice_items(*)")
      .eq("public_token", token)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job info for customer details
    const { data: job } = await supabase
      .from("jobs")
      .select("*, customers(first_name, last_name, address, city, state, zip, email, phone, primary_business_unit_id)")
      .eq("id", invoice.job_id)
      .single();

    // Fetch company settings for branding
    const { data: settings } = await supabase
      .from("company_settings")
      .select("key, value");

    const companySettings: Record<string, string> = {};
    for (const row of settings || []) {
      companySettings[row.key] = row.value;
    }
    const brandedCompanySettings = await applyBusinessUnitHeading(supabase, companySettings, invoice, job);

    // Fetch approved estimate data linked to this job
    let approvedEstimate = null;
    if (job?.id) {
      const { data: presentation } = await supabase
        .from("estimate_presentations")
        .select("id, token")
        .eq("estimate_id", job.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (presentation) {
        const { data: response } = await supabase
          .from("estimate_responses")
          .select("selected_tier, selected_addons, payment_preference, responded_at, action")
          .eq("presentation_id", presentation.id)
          .eq("action", "approve")
          .order("responded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (response) {
          let priceBlock = null;
          if (response.selected_tier) {
            const { data: presData } = await supabase
              .from("estimate_presentations")
              .select("pricing_snapshot")
              .eq("id", presentation.id)
              .single();
            const snapshot = presData?.pricing_snapshot as any;
            if (snapshot?.priceBlocks) {
              priceBlock = snapshot.priceBlocks[response.selected_tier.toLowerCase()] || null;
            }
          }

          approvedEstimate = {
            selectedTier: response.selected_tier,
            selectedAddons: response.selected_addons,
            paymentPreference: response.payment_preference,
            presentationToken: presentation.token,
            respondedAt: response.responded_at,
            priceBlock,
          };
        }
      }
    }

    // --- Equipment Documentation ---
    let equipmentDocs = null;
    const customerId = job?.customer_id;
    const jobId = invoice.job_id;

    if (jobId) {
      // Old equipment (customer_equipment)
      const { data: oldEquipment } = await supabase
        .from("customer_equipment")
        .select("id, brand, model_number, serial_number, equipment_type, install_date")
        .eq("customer_id", customerId || "")
        .order("created_at");

      // New equipment (job_equipment)
      const { data: newEquipment } = await supabase
        .from("job_equipment")
        .select("id, brand, model_number, serial_number, source")
        .eq("job_id", jobId);

      // AHRI lookups linked to this job's equipment
      const { data: ahriData } = await supabase
        .from("ahri_lookups")
        .select("ahri_number, seer2, hspf2, eer2, certificate_path, outdoor_model, indoor_model, furnace_model, energy_star")
        .in(
          "outdoor_model",
          (newEquipment || []).map((e: any) => e.model_number).filter(Boolean)
        );

      // Generate public URLs for AHRI certificates
      const ahriWithUrls = (ahriData || []).map((a: any) => {
        let certificateUrl = null;
        if (a.certificate_path) {
          const { data: urlData } = supabase.storage
            .from("ahri-certificates")
            .getPublicUrl(a.certificate_path);
          certificateUrl = urlData?.publicUrl || null;
        }
        return { ...a, certificateUrl };
      });

      // Tech form photos (before, after, data_plate)
      const { data: techForms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);

      const techFormIds = (techForms || []).map((tf: any) => tf.id);
      let photos: any[] = [];
      if (techFormIds.length > 0) {
        const { data: photoData } = await supabase
          .from("tech_form_photos")
          .select("id, file_path, photo_type")
          .in("tech_form_id", techFormIds)
          .in("photo_type", ["before", "after", "data_plate"]);

        photos = (photoData || []).map((p: any) => {
          const { data: urlData } = supabase.storage
            .from("tech-form-photos")
            .getPublicUrl(p.file_path);
          return {
            id: p.id,
            photoType: p.photo_type,
            url: urlData?.publicUrl || null,
          };
        });
      }

      // Warranty certificates for this customer + job
      const { data: certificates } = customerId
        ? await supabase
            .from("customer_certificates")
            .select("id, certificate_type, token")
            .eq("customer_id", customerId)
            .eq("job_id", jobId)
        : { data: [] };

      equipmentDocs = {
        oldEquipment: oldEquipment || [],
        newEquipment: newEquipment || [],
        ahri: ahriWithUrls,
        photos,
        certificates: certificates || [],
      };
    }

    // --- CPS Energy Rebate Eligibility ---
    let cpsRebate = null;
    const TIERS = [
      { name: "Tier 1", min: 13.8, max: 15.1, earlyPer: 115, burnoutPer: 90 },
      { name: "Tier 2", min: 15.2, max: 16.1, earlyPer: 130, burnoutPer: 120 },
      { name: "Tier 3", min: 16.2, max: 17.0, earlyPer: 175, burnoutPer: 150 },
      { name: "Tier 4", min: 17.1, max: 19.9, earlyPer: 250, burnoutPer: 225 },
      { name: "Tier 5", min: 20.0, max: 99, earlyPer: 310, burnoutPer: 275 },
    ];

    if (equipmentDocs && equipmentDocs.ahri.length > 0) {
      const ahri = equipmentDocs.ahri[0];
      const seer2 = ahri.seer2 ?? 0;
      const eer2 = ahri.eer2 ?? 0;
      const hspf2 = ahri.hspf2 ?? null;
      const tonnage = approvedEstimate?.priceBlock?.tonnage ?? null;
      const tier = TIERS.find((t: any) => seer2 >= t.min && seer2 <= t.max) || null;
      const qualifies = seer2 >= 13.8 && eer2 >= 9.8;

      if (tier) {
        const tons = tonnage ?? 3;
        cpsRebate = {
          qualifies,
          tierName: tier.name,
          earlyRebate: tier.earlyPer * tons,
          burnoutRebate: tier.burnoutPer * tons,
          seer2,
          eer2,
          hspf2,
          ahriNumber: ahri.ahri_number,
          tonnage,
          condenserModel: ahri.outdoor_model,
          coilModel: ahri.indoor_model,
          furnaceModel: ahri.furnace_model,
          rebateUrl: "https://www.cpsenergy.com/en/my-home/savenow/rebates-incentives/cooling-heating.html",
        };
      }
    }

    return new Response(
      JSON.stringify({ invoice, job, companySettings: brandedCompanySettings, approvedEstimate, equipmentDocs, cpsRebate }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
