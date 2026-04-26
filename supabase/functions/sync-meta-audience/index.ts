import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { audience_id } = await req.json();
    if (!audience_id) throw new Error("audience_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const sb = createClient(supabaseUrl, serviceKey);

    // Try env secret first, fall back to company_settings
    let metaToken = Deno.env.get("META_ACCESS_TOKEN") || "";
    if (!metaToken) {
      const { data: tokenRow } = await sb
        .from("company_settings")
        .select("value")
        .eq("key", "meta_access_token")
        .maybeSingle();
      metaToken = tokenRow?.value || "";
    }
    if (!metaToken) throw new Error("META_ACCESS_TOKEN not configured. Add it in the Facebook Audiences settings.");


    // Get audience definition
    const { data: audience, error: audErr } = await sb
      .from("meta_audiences")
      .select("*")
      .eq("id", audience_id)
      .single();
    if (audErr || !audience) throw new Error("Audience not found");

    // Get ad account id from company settings
    const { data: settingsRows } = await sb
      .from("company_settings")
      .select("key, value")
      .in("key", ["meta_ad_account_id"]);
    const settings: Record<string, string> = {};
    for (const r of settingsRows || []) settings[r.key] = r.value;
    const adAccountId = settings.meta_ad_account_id;
    if (!adAccountId) throw new Error("Meta Ad Account ID not configured");

    // Create sync log entry
    const { data: syncLog } = await sb
      .from("meta_audience_syncs")
      .insert({ audience_id, status: "running" })
      .select()
      .single();

    const filters = audience.filter_rules || {};

    // Build customer query with filters
    let query = sb
      .from("customers")
      .select("id, first_name, last_name, email, phone, mobile_phone, city, state, zip");

    if (filters.geo && filters.geo.length > 0) {
      query = query.in("zip", filters.geo);
    }

    const { data: customers, error: custErr } = await query.limit(50000);
    if (custErr) throw custErr;

    let filteredCustomers = customers || [];

    // Apply job-based filters if needed
    if (filters.job_type || filters.min_days_since_job || filters.date_range) {
      const custIds = filteredCustomers.map((c) => c.id);
      if (custIds.length > 0) {
        let jobQuery = sb
          .from("jobs")
          .select("customer_id, job_type, scheduled_date")
          .in("customer_id", custIds);

        if (filters.job_type) jobQuery = jobQuery.eq("job_type", filters.job_type);
        if (filters.date_range?.from) jobQuery = jobQuery.gte("scheduled_date", filters.date_range.from);
        if (filters.date_range?.to) jobQuery = jobQuery.lte("scheduled_date", filters.date_range.to);

        const { data: jobs } = await jobQuery;
        const jobCustIds = new Set((jobs || []).map((j) => j.customer_id));

        if (filters.min_days_since_job) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - filters.min_days_since_job);
          const recentCustIds = new Set(
            (jobs || [])
              .filter((j) => j.scheduled_date && new Date(j.scheduled_date) > cutoff)
              .map((j) => j.customer_id)
          );
          // Dormant = has jobs but none recent
          filteredCustomers = filteredCustomers.filter(
            (c) => jobCustIds.has(c.id) && !recentCustIds.has(c.id)
          );
        } else {
          filteredCustomers = filteredCustomers.filter((c) => jobCustIds.has(c.id));
        }
      }
    }

    // Filter by active agreement
    if (filters.has_agreement) {
      const custIds = filteredCustomers.map((c) => c.id);
      if (custIds.length > 0) {
        const { data: agreements } = await sb
          .from("service_agreements")
          .select("customer_id")
          .in("customer_id", custIds)
          .eq("status", "active");
        const agreementCustIds = new Set((agreements || []).map((a) => a.customer_id));
        filteredCustomers = filteredCustomers.filter((c) => agreementCustIds.has(c.id));
      }
    }

    // Filter by unconverted estimates
    if (filters.estimate_not_converted) {
      const custIds = filteredCustomers.map((c) => c.id);
      if (custIds.length > 0) {
        const { data: estimates } = await sb
          .from("estimates")
          .select("customer_id, status")
          .in("customer_id", custIds);
        const { data: jobs } = await sb
          .from("jobs")
          .select("customer_id")
          .in("customer_id", custIds);
        const jobCustIds = new Set((jobs || []).map((j) => j.customer_id));
        const estCustIds = new Set((estimates || []).map((e) => e.customer_id));
        filteredCustomers = filteredCustomers.filter(
          (c) => estCustIds.has(c.id) && !jobCustIds.has(c.id)
        );
      }
    }

    // Only include customers with email or phone
    filteredCustomers = filteredCustomers.filter((c) => c.email || c.phone || c.mobile_phone);

    // Hash PII for Meta
    const hashedData: Record<string, string>[] = [];
    for (const c of filteredCustomers) {
      const entry: Record<string, string> = {};
      if (c.email) entry.EMAIL = await sha256(c.email);
      if (c.phone) entry.PHONE = await sha256(c.phone.replace(/\D/g, ""));
      if (c.mobile_phone) entry.PHONE = await sha256(c.mobile_phone.replace(/\D/g, ""));
      if (c.first_name) entry.FN = await sha256(c.first_name);
      if (c.last_name) entry.LN = await sha256(c.last_name);
      if (c.city) entry.CT = await sha256(c.city);
      if (c.state) entry.ST = await sha256(c.state);
      if (c.zip) entry.ZIP = await sha256(c.zip);
      entry.COUNTRY = await sha256("us");
      hashedData.push(entry);
    }

    let metaAudienceId = audience.meta_audience_id;

    // Create audience if new
    if (!metaAudienceId) {
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/act_${adAccountId}/customaudiences`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: metaToken,
            name: audience.name,
            subtype: "CUSTOM",
            description: `Synced from CRM - ${audience.name}`,
            customer_file_source: "USER_PROVIDED_ONLY",
          }),
        }
      );
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message);
      metaAudienceId = createData.id;

      await sb
        .from("meta_audiences")
        .update({ meta_audience_id: metaAudienceId })
        .eq("id", audience_id);
    }

    // Upload hashed users in batches of 10000
    const batchSize = 10000;
    const schema = ["EMAIL", "PHONE", "FN", "LN", "CT", "ST", "ZIP", "COUNTRY"];

    for (let i = 0; i < hashedData.length; i += batchSize) {
      const batch = hashedData.slice(i, i + batchSize);
      const dataRows = batch.map((entry) =>
        schema.map((field) => entry[field] || "")
      );

      const uploadRes = await fetch(
        `https://graph.facebook.com/v21.0/${metaAudienceId}/users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: metaToken,
            payload: {
              schema,
              data: dataRows,
            },
          }),
        }
      );
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(uploadData.error.message);
    }

    // Update sync log and audience
    const now = new Date().toISOString();
    await sb
      .from("meta_audience_syncs")
      .update({ status: "success", customers_synced: filteredCustomers.length })
      .eq("id", syncLog.id);

    await sb
      .from("meta_audiences")
      .update({
        last_synced_at: now,
        last_sync_count: filteredCustomers.length,
        status: "active",
      })
      .eq("id", audience_id);

    return new Response(
      JSON.stringify({ success: true, customers_synced: filteredCustomers.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-meta-audience error:", err);

    // Try to log error
    try {
      const sb = getSupabaseAdmin();
      const body = await (err as any);
      // Best-effort error logging
    } catch (_) {}

    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
