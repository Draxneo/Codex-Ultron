import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// --- Parsing helpers (reused from sync-hcp-jobs) ---

function parseAhriNumber(text: string): string | null {
  if (!text) return null;
  const ahriMatch = text.match(/ahri[:#\s]*(\d{7,10})/i);
  if (ahriMatch) return ahriMatch[1];
  const digitMatch = text.match(/\b(\d{9,10})\b/);
  return digitMatch ? digitMatch[1] : null;
}

function parseTonnage(desc: string): number | null {
  if (!desc) return null;
  const halfMatch = desc.match(/(\d+)\s*[-–]\s*1\s*\/\s*2\s*ton/i);
  if (halfMatch) return parseInt(halfMatch[1]) + 0.5;
  const match = desc.match(/(\d+(?:\.\d+)?)\s*[-–]?\s*ton(?:s|ne)?(?:\b|$)/i);
  if (match) return parseFloat(match[1]);
  return null;
}

function parseSystemType(desc: string): string | null {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes("dual fuel")) return "dual_fuel";
  if (d.includes("heat pump")) return "heat_pump";
  if (d.includes("gas heat") || (d.includes("furnace") && (d.includes("condenser") || d.includes("ac") || d.includes("a/c")))) return "gas_heat";
  if (d.includes("straight cool") || d.includes("straight a/c")) return "straight_cool";
  if (d.includes("furnace") && !d.includes("heat pump")) return "gas_heat";
  return null;
}

function parseBrand(desc: string): string | null {
  if (!desc) return null;
  const brands: [RegExp, string][] = [
    [/\bcarrier\b/i, "Carrier"], [/\bday\s*(?:&|and)\s*night\b/i, "Day and Night"],
    [/\bpayne\b/i, "Payne"], [/\bbryant\b/i, "Bryant"], [/\bgoodman\b/i, "Goodman"],
    [/\btrane\b/i, "Trane"], [/\blennox\b/i, "Lennox"], [/\brheem\b/i, "Rheem"],
    [/\bruud\b/i, "Ruud"], [/\byork\b/i, "York"], [/\bdaikin\b/i, "Daikin"],
    [/\bamana\b/i, "Amana"], [/\bamerican\s*standard\b/i, "American Standard"],
    [/\bcomfortmaker\b/i, "Comfortmaker"], [/\bheil\b/i, "Heil"],
    [/\btempstar\b/i, "Tempstar"], [/\bbosch\b/i, "Bosch"],
    [/\bmitsubishi\b/i, "Mitsubishi"], [/\bfujitsu\b/i, "Fujitsu"],
  ];
  for (const [re, name] of brands) {
    if (re.test(desc)) return name;
  }
  return null;
}

function determineJobType(hcpJob: any): string {
  const tags = (hcpJob.tags || []).map((t: any) => (typeof t === "string" ? t : t.name || "").toLowerCase());
  const desc = (hcpJob.description || "").toLowerCase();
  const note = (hcpJob.note || "").toLowerCase();
  const jtField = (hcpJob.job_type || "").toLowerCase();
  const searchText = `${tags.join(" ")} ${desc} ${note} ${jtField}`;

  const installWords = ["install", "installation", "new system", "new unit", "new ac", "new furnace", "heat pump install", "changeout", "change out", "seer2", "hspf2", "eer2", "ahri"];
  const serviceWords = ["contactor", "capacitor", "fuse", "relay", "thermostat replacement", "valve replacement", "compressor replacement", "motor replacement", "blower motor", "diagnostic", "no cool", "no heat", "not cooling", "not heating", "leak repair", "refrigerant"];
  const maintenanceWords = ["maintenance", "tune-up", "tune up", "tuneup", "pm visit", "seasonal", "clean and check", "clean & check", "preventive", "preventative"];

  if (maintenanceWords.some(w => searchText.includes(w))) return "maintenance";
  if (serviceWords.some(w => searchText.includes(w))) return "service";
  if (installWords.some(w => searchText.includes(w))) return "install";

  const fullText = `${hcpJob.description || ""}\n${hcpJob.note || ""}`;
  if (parseBrand(fullText) && parseTonnage(fullText) && parseSystemType(fullText)) return "install";

  return "service";
}
function mapHcpStatus(workStatus: string | null, scheduledDate: string | null): string {
  const ws = (workStatus || "").toLowerCase();
  if (ws.includes("complete")) return "done";
  if (ws === "in progress" || ws === "dispatched") return "scheduled";
  if (ws === "scheduled" || scheduledDate) return "scheduled";
  return "new";
}

function mapHcpEstimateStatus(workStatus: string | null): string {
  const ws = (workStatus || "").toLowerCase();
  if (ws.includes("cancel")) return "canceled";
  if (ws.includes("created job") || ws === "won") return "won";
  if (ws === "unscheduled" || ws === "needs scheduling") return "new";
  if (ws === "scheduled" || ws === "in progress" || ws.includes("complete")) return "scheduled";
  if (ws === "lost") return "lost";
  if (!ws) return "new";
  return "new";
}

function mapHcpJob(hcpJob: any) {
  const customerName = hcpJob.customer
    ? `${hcpJob.customer.first_name || ""} ${hcpJob.customer.last_name || ""}`.trim()
    : "Unknown";
  const customerPhone = hcpJob.customer?.mobile_number || hcpJob.customer?.phone_number || null;
  const customerEmail = hcpJob.customer?.email || null;
  const hcpCustomerId = hcpJob.customer?.id || null;
  const address = hcpJob.address
    ? `${hcpJob.address.street || ""}, ${hcpJob.address.city || ""}, ${hcpJob.address.state || ""} ${hcpJob.address.zip || ""}`.trim()
    : null;
  const scheduledDate = hcpJob.schedule?.scheduled_start
    ? hcpJob.schedule.scheduled_start.split("T")[0]
    : null;
  const assignedTo = hcpJob.assigned_employees?.[0]?.first_name
    ? `${hcpJob.assigned_employees[0].first_name} ${hcpJob.assigned_employees[0].last_name || ""}`.trim()
    : null;

  const desc = hcpJob.description || "";
  const note = hcpJob.note || "";
  const fullText = `${desc}\n${note}`.trim();

  const result: Record<string, any> = {
    hcp_id: hcpJob.id,
    hcp_job_number: hcpJob.invoice_number || null,
    job_number: hcpJob.invoice_number || null,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    hcp_customer_id: hcpCustomerId,
    address,
    job_type: determineJobType(hcpJob),
    scheduled_date: scheduledDate,
    assigned_to: assignedTo,
    hcp_status: hcpJob.work_status || null,
    status: mapHcpStatus(hcpJob.work_status, scheduledDate),
    synced_at: new Date().toISOString(),
    created_at: hcpJob.created_at || new Date().toISOString(),
    arrival_start: hcpJob.schedule?.scheduled_start || null,
    arrival_end: hcpJob.schedule?.scheduled_end || null,
  };

  if (note) result.hcp_note = note;
  if (desc) {
    result.description = desc;
    result.tonnage = parseTonnage(fullText);
    result.system_type = parseSystemType(fullText);
    result.brand = parseBrand(fullText);
  }
  const ahri = parseAhriNumber(fullText);
  if (ahri) result.ahri_number = ahri;

  return result;
}

function mapHcpEstimate(est: any) {
  const cust = est.customer || {};
  const custName = `${cust.first_name || ""} ${cust.last_name || ""}`.trim() || null;
  const addr = est.address
    ? `${est.address.street || ""}, ${est.address.city || ""}, ${est.address.state || ""} ${est.address.zip || ""}`.trim()
    : null;
  const assignedTo = est.assigned_employees?.[0]
    ? `${est.assigned_employees[0].first_name || ""} ${est.assigned_employees[0].last_name || ""}`.trim()
    : null;
  const scheduledDate = est.schedule?.scheduled_start
    ? est.schedule.scheduled_start.split("T")[0]
    : null;

  return {
    hcp_id: est.id,
    estimate_number: est.estimate_number || null,
    customer_name: custName,
    customer_phone: cust.mobile_number || cust.phone_number || null,
    customer_email: cust.email || null,
    hcp_customer_id: cust.id || null,
    address: addr,
    assigned_to: assignedTo,
    work_status: mapHcpEstimateStatus(est.work_status),
    scheduled_date: scheduledDate,
    description: est.description || null,
    options: est.options || [],
    arrival_start: est.schedule?.arrival_window_start || est.schedule?.scheduled_start || null,
    arrival_end: est.schedule?.arrival_window_end || est.schedule?.scheduled_end || null,
    synced_at: new Date().toISOString(),
    created_at: est.created_at || new Date().toISOString(),
  };
}

function getMoney(value: any): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // HCP money fields usually arrive in cents.
  return Math.abs(n) >= 1000 ? n / 100 : n;
}

function firstText(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getEstimateLineItemOptionId(item: any): string {
  return (
    item.option_id ||
    item.estimate_option_id ||
    item.estimate_option?.id ||
    item.option?.id ||
    item.option_number ||
    "default"
  );
}

function mapHcpEstimateLineItem(item: any, estimate: any, idx: number) {
  const quantity = Number(item.quantity ?? 1) || 1;
  const amount = getMoney(item.amount ?? item.total_amount ?? item.total ?? item.price);
  const unitPrice = getMoney(item.unit_price ?? item.price ?? (amount ? amount / quantity : 0));
  const totalPrice = amount || unitPrice * quantity;
  const optionId = getEstimateLineItemOptionId(item);

  return {
    estimate_id: estimate.id,
    hcp_estimate_id: estimate.hcp_id,
    hcp_option_id: optionId,
    hcp_line_item_id: item.id || item.uuid || `${optionId}:${idx}`,
    option_name: firstText(item.option_name, item.estimate_option?.name, item.option?.name, item.option_number),
    name: firstText(item.name, item.description, item.service_item?.name, item.material?.name) || "Line item",
    description: firstText(item.description, item.details, item.service_item?.description, item.material?.description),
    quantity,
    unit_price: unitPrice,
    unit_cost: getMoney(item.unit_cost),
    total_price: totalPrice,
    tax_amount: getMoney(item.tax_amount),
    discount_amount: getMoney(item.discount_amount),
    kind: firstText(item.kind, item.type),
    item_type: "estimate_line_item",
    sort_order: Number(item.sort_order ?? item.position ?? idx) || idx,
    raw_hcp_json: item,
  };
}

function estimateLineItemsFromDetail(detail: any): any[] {
  const direct = Array.isArray(detail?.line_items) ? detail.line_items : [];
  const optionItems = Array.isArray(detail?.options)
    ? detail.options.flatMap((option: any) => {
        const items = Array.isArray(option?.line_items) ? option.line_items : [];
        return items.map((item: any) => ({
          ...item,
          option_id: item.option_id || option.id,
          option_name: item.option_name || option.name,
          option_number: item.option_number || option.option_number,
        }));
      })
    : [];
  return [...direct, ...optionItems];
}

function extractCustomer(record: any) {
  const cust = record.customer;
  if (!cust || !cust.id) return null;
  const addr = record.address || cust.address || {};
  return {
    hcp_customer_id: cust.id,
    first_name: cust.first_name || null,
    last_name: cust.last_name || null,
    email: cust.email || null,
    phone: cust.phone_number || null,
    mobile_phone: cust.mobile_number || null,
    company: cust.company || null,
    address: addr.street || null,
    city: addr.city || null,
    state: addr.state || null,
    zip: addr.zip || null,
    // tags intentionally NOT imported from HCP to avoid polluting local tags
  };
}

// --- Fetch with timeout and rate-limit handling ---

async function fetchHcp(url: string, hcpApiKey: string): Promise<{ data: any; retry?: boolean; retry_after?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const res = await fetch(url, {
      headers: { "Authorization": `Token ${hcpApiKey}`, "Accept": "application/json" },
      signal: controller.signal,
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "10", 10);
      await res.text(); // consume body
      return { data: null, retry: true, retry_after: retryAfter };
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HCP API error: ${res.status} — ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    return { data };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("HCP API request timed out after 25 seconds. Try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// --- Batch customer linking helper ---

async function upsertCustomersAndGetMap(
  supabase: any,
  records: any[],
): Promise<Map<string, string>> {
  const customers = records.map(extractCustomer).filter(Boolean);
  const uniqueCustomers = new Map<string, any>();
  for (const c of customers) {
    if (c && !uniqueCustomers.has(c.hcp_customer_id)) {
      uniqueCustomers.set(c.hcp_customer_id, c);
    }
  }

  if (uniqueCustomers.size === 0) return new Map();

  const custArray = Array.from(uniqueCustomers.values());
  const { error } = await supabase.from("customers").upsert(custArray, { onConflict: "hcp_customer_id" });
  if (error) throw new Error(`Customer upsert failed: ${error.message}`);

  // Fetch the customer ID map in one query
  const hcpCustIds = Array.from(uniqueCustomers.keys());
  const { data: custRows, error: fetchErr } = await supabase
    .from("customers")
    .select("id, hcp_customer_id")
    .in("hcp_customer_id", hcpCustIds);

  if (fetchErr) throw new Error(`Customer lookup failed: ${fetchErr.message}`);

  const custMap = new Map<string, string>();
  for (const row of (custRows || [])) {
    custMap.set(row.hcp_customer_id, row.id);
  }
  return custMap;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const hcpApiKey = Deno.env.get("HCP_API_KEY");

    if (!hcpApiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const resource: string = body.resource || "jobs";
    const page: number = body.page || 1;
    const pageSize = 200;
    const testMode: boolean = body.test === true;

    if (resource === "jobs") {
      const expandParam = testMode ? "&expand[]=attachments" : "";
      const url = `https://api.housecallpro.com/jobs?sort_direction=desc&page=${page}&page_size=${pageSize}${expandParam}`;
      console.log(`Fetching jobs page ${page}${testMode ? " (TEST MODE)" : ""}: ${url}`);

      const fetchResult = await fetchHcp(url, hcpApiKey);
      if (fetchResult.retry) {
        return new Response(JSON.stringify({
          resource: "jobs", page, retry: true,
          retry_after: fetchResult.retry_after || 10,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const hcpJobs = fetchResult.data.jobs || [];
      const totalPages = fetchResult.data.total_pages || 1;

      // Count attachments if present (test mode explores this)
      let attachmentsFound = 0;
      let sampleAttachment: any = null;
      if (testMode) {
        for (const job of hcpJobs) {
          const atts = job.attachments || [];
          attachmentsFound += atts.length;
          if (atts.length > 0 && !sampleAttachment) {
            sampleAttachment = atts[0];
            console.log("Sample attachment object:", JSON.stringify(sampleAttachment));
          }
        }
        console.log(`Test mode: ${hcpJobs.length} jobs, ${attachmentsFound} attachments found`);
      }

      // Map jobs
      const mapped = hcpJobs.map(mapHcpJob);

      // Upsert customers first and get the ID map
      const custMap = await upsertCustomersAndGetMap(supabase, hcpJobs);

      // Set customer_id on mapped jobs BEFORE upserting
      for (const job of mapped) {
        if (job.hcp_customer_id && custMap.has(job.hcp_customer_id)) {
          job.customer_id = custMap.get(job.hcp_customer_id);
        }
      }

      // Upsert jobs with customer_id already set
      if (mapped.length > 0) {
        const { error } = await supabase.from("jobs").upsert(mapped, { onConflict: "hcp_id" });
        if (error) throw new Error(`Jobs upsert failed: ${error.message}`);
      }

      // In test mode, force done after page 1
      const done = testMode ? true : (page >= totalPages || hcpJobs.length < pageSize);
      return new Response(JSON.stringify({
        resource: "jobs", page, total_pages: totalPages,
        imported: mapped.length, customers_found: custMap.size, done,
        ...(testMode ? { test: true, attachments_found: attachmentsFound, sample_attachment: sampleAttachment } : {}),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (resource === "estimates") {
      const url = `https://api.housecallpro.com/estimates?sort_direction=desc&page=${page}&page_size=${pageSize}`;
      console.log(`Fetching estimates page ${page}: ${url}`);

      const fetchResult = await fetchHcp(url, hcpApiKey);
      if (fetchResult.retry) {
        return new Response(JSON.stringify({
          resource: "estimates", page, retry: true,
          retry_after: fetchResult.retry_after || 10,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const hcpEstimates = fetchResult.data.estimates || [];
      const totalPages = fetchResult.data.total_pages || 1;

      const mapped = hcpEstimates.map(mapHcpEstimate);

      // Upsert customers first and get the ID map
      const custMap = await upsertCustomersAndGetMap(supabase, hcpEstimates);

      // Set customer_id on mapped estimates BEFORE upserting
      for (const est of mapped) {
        if (est.hcp_customer_id && custMap.has(est.hcp_customer_id)) {
          (est as any).customer_id = custMap.get(est.hcp_customer_id);
        }
      }

      if (mapped.length > 0) {
        const { error } = await supabase.from("estimates").upsert(mapped, { onConflict: "hcp_id" });
        if (error) throw new Error(`Estimates upsert failed: ${error.message}`);
      }

      const done = page >= totalPages || hcpEstimates.length < pageSize;
      return new Response(JSON.stringify({
        resource: "estimates", page, total_pages: totalPages,
        imported: mapped.length, customers_found: custMap.size, done,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (resource === "estimate_line_items") {
      // Fetch actual line items inside HCP estimate options. Older imports only
      // captured the option shell, which loses Option 1 / Option 2 detail.
      const batchSize = body.batch_size || 15;
      const offset = body.offset || 0;

      const { data: estimateRows, error: estimateErr } = await supabase
        .from("estimates")
        .select("id, hcp_id, estimate_number, created_at")
        .not("hcp_id", "is", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (estimateErr) throw new Error(`Estimates query failed: ${estimateErr.message}`);

      const totalEstimatesRes = await supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .not("hcp_id", "is", null);
      const totalEstimates = totalEstimatesRes.count || 0;

      let lineItemsImported = 0;
      let estimatesProcessed = 0;
      const samples: any[] = [];

      for (const estimate of (estimateRows || [])) {
        if (!estimate.hcp_id) continue;

        const url = `https://api.housecallpro.com/estimates/${estimate.hcp_id}/line_items`;
        try {
          let fetchResult;
          try {
            fetchResult = await fetchHcp(url, hcpApiKey);
          } catch (lineItemErr: any) {
            // Some HCP accounts/older estimates still do not expose this endpoint.
            // Fall back to the estimate detail payload and extract options[].line_items
            // if HCP includes them there.
            const detailResult = await fetchHcp(`https://api.housecallpro.com/estimates/${estimate.hcp_id}`, hcpApiKey);
            fetchResult = {
              ...detailResult,
              data: { line_items: estimateLineItemsFromDetail(detailResult.data) },
            };
          }
          if (fetchResult.retry) {
            return new Response(JSON.stringify({
              resource: "estimate_line_items",
              offset: offset + estimatesProcessed,
              total_estimates: totalEstimates,
              imported: lineItemsImported,
              estimates_processed: estimatesProcessed,
              retry: true,
              retry_after: fetchResult.retry_after || 10,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const raw = fetchResult.data;
          const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (raw?.line_items || raw?.items || []));
          if (samples.length < 3 && items.length > 0) samples.push({ estimate_number: estimate.estimate_number, keys: Object.keys(items[0] || {}) });

          if (items.length > 0) {
            const mapped = items.map((item: any, idx: number) => mapHcpEstimateLineItem(item, estimate, idx));
            const { error: upsertErr } = await supabase
              .from("estimate_line_items")
              .upsert(mapped, { onConflict: "hcp_estimate_id,hcp_option_id,hcp_line_item_id" });
            if (upsertErr) {
              console.error(`Estimate line item upsert failed for ${estimate.hcp_id}: ${upsertErr.message}`);
            } else {
              lineItemsImported += mapped.length;
            }
          }
        } catch (err: any) {
          console.error(`Failed to fetch estimate line items for ${estimate.hcp_id}: ${err.message}`);
        }

        estimatesProcessed++;
        if (estimatesProcessed < (estimateRows || []).length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const newOffset = offset + estimatesProcessed;
      const done = newOffset >= totalEstimates || (estimateRows || []).length < batchSize;

      return new Response(JSON.stringify({
        resource: "estimate_line_items",
        offset: newOffset,
        total_estimates: totalEstimates,
        imported: lineItemsImported,
        estimates_processed: estimatesProcessed,
        done,
        samples,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (resource === "line_items") {
      // Fetch line items per-job. We batch through jobs that have hcp_id.
      const batchSize = body.batch_size || 15;
      const offset = body.offset || 0;

      // Get jobs with hcp_id, ordered consistently
      const { data: jobRows, error: jobErr } = await supabase
        .from("jobs")
        .select("id, hcp_id, scheduled_date, completed_at, payment_collected_at, created_at, hcp_job_number")
        .not("hcp_id", "is", null)
        .order("created_at", { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (jobErr) throw new Error(`Jobs query failed: ${jobErr.message}`);

      const totalJobsRes = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .not("hcp_id", "is", null);
      const totalJobs = totalJobsRes.count || 0;

      let lineItemsImported = 0;
      let jobsProcessed = 0;

      for (const job of (jobRows || [])) {
        if (!job.hcp_id) continue;

        const url = `https://api.housecallpro.com/jobs/${job.hcp_id}/line_items`;
        try {
          const fetchResult = await fetchHcp(url, hcpApiKey);
          if (fetchResult.retry) {
            // Return progress so frontend can retry after delay
            // Save progress so it can resume
            return new Response(JSON.stringify({
              resource: "line_items", offset: offset + jobsProcessed,
              total_jobs: totalJobs, imported: lineItemsImported,
              jobs_processed: jobsProcessed,
              retry: true, retry_after: fetchResult.retry_after || 10,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // HCP returns { data: [...items] } or plain array
          const raw = fetchResult.data;
          const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : (raw?.line_items || []));

          // Log first sample for debugging
          if (items.length > 0 && jobsProcessed === 0) {
            console.log("Sample HCP line item:", JSON.stringify(items[0]).substring(0, 500));
          }

          if (items.length > 0) {
            // Map line items with sell-price logic
            const mapped = items.map((item: any, idx: number) => {
              // HCP returns amounts in cents — convert to dollars
              let totalPrice = (item.amount ?? 0) / 100;
              let unitPrice = totalPrice === 0 ? 0 : (item.unit_price ? item.unit_price / 100 : (totalPrice / (item.quantity ?? 1)));

              // HCP sends discounts as positive amounts with kind = "fixed discount" or "percent discount"
              // We need to negate them so they subtract from the invoice total
              const kind = (item.kind || "").toLowerCase();
              const isDiscount = kind.includes("discount");
              if (isDiscount && totalPrice > 0) {
                totalPrice = -totalPrice;
                unitPrice = -unitPrice;
              }

              return {
                description: item.name || item.description || "Unnamed",
                quantity: item.quantity ?? 1,
                unit_price: unitPrice,
                total: totalPrice,
                sort_order: idx,
              };
            });

            const subtotal = Math.max(0, mapped.reduce((s: number, i: any) => s + i.total, 0));
            const hcpInvoiceId = `hcp-${job.hcp_id}`;

            // Use scheduled_date as paid_at; real paid_at comes from backfill-paid-dates function
            const jobDate = new Date((job as any).payment_collected_at || (job as any).completed_at || (job as any).scheduled_date || (job as any).created_at || new Date()).toISOString();
            const { data: invoice, error: invErr } = await supabase
              .from("customer_invoices")
              .upsert({
                job_id: job.id,
                hcp_invoice_id: hcpInvoiceId,
                invoice_number: (job as any).hcp_job_number || null,
                status: "paid",
                created_at: jobDate,
                paid_at: jobDate,
                subtotal,
                tax_rate: 0,
                tax_amount: 0,
                total: subtotal,
                notes: "Imported from HCP",
              }, { onConflict: "hcp_invoice_id" })
              .select("id")
              .single();

            if (invErr) {
              console.error(`Invoice upsert failed for job ${job.hcp_id}: ${invErr.message}`);
            } else if (invoice) {
              // Delete old items for this invoice then re-insert
              await supabase.from("customer_invoice_items").delete().eq("invoice_id", invoice.id);
              const { error: itemsErr } = await supabase
                .from("customer_invoice_items")
                .insert(mapped.map((m: any) => ({ ...m, invoice_id: invoice.id })));
              if (itemsErr) {
                console.error(`Invoice items insert failed: ${itemsErr.message}`);
              } else {
                lineItemsImported += mapped.length;
              }
            }
          }
        } catch (err: any) {
          console.error(`Failed to fetch line items for job ${job.hcp_id}: ${err.message}`);
          // Continue to next job rather than failing entire batch
        }

        jobsProcessed++;
        // Small delay between per-job calls to avoid rate limits
        if (jobsProcessed < (jobRows || []).length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const newOffset = offset + jobsProcessed;
      const done = newOffset >= totalJobs || (jobRows || []).length < batchSize;

      return new Response(JSON.stringify({
        resource: "line_items", offset: newOffset, total_jobs: totalJobs,
        imported: lineItemsImported, jobs_processed: jobsProcessed, done,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      return new Response(JSON.stringify({ error: `Unknown resource: ${resource}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("import-hcp-history error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
