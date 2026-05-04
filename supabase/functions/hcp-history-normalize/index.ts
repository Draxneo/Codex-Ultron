import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { formatAddress, formatEmail, formatName, formatPhone, toCentralDate } from "../_shared/formatters.ts";
import { mapHcpEstimateStatus, mapHcpEstimateToFields, mapHcpJobStatus, mapHcpJobToFields } from "../_shared/hcp-mapper.ts";

type NormalizeResource =
  | "customers"
  | "addresses"
  | "jobs"
  | "estimates"
  | "estimate_items"
  | "invoices"
  | "invoice_items"
  | "invoice_payments"
  | "notes"
  | "attachments";

const RESOURCE_TO_SOURCE_TYPES: Record<NormalizeResource, string[]> = {
  customers: ["customer"],
  addresses: ["customer_address"],
  jobs: ["job"],
  estimates: ["estimate"],
  estimate_items: ["estimate_option"],
  invoices: ["invoice"],
  invoice_items: ["invoice_line_item"],
  invoice_payments: ["invoice_payment"],
  notes: ["job_note", "estimate_option_note"],
  attachments: ["customer_attachment", "job_attachment", "estimate_option_attachment"],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

async function sha256(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(value));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getAmount(value: any): number {
  const amount = asNumber(value);
  if (Math.abs(amount) >= 1000 && Number.isInteger(amount)) return amount / 100;
  return amount;
}

function getFileName(raw: any, fallback: string): string {
  const url = firstText(raw.url, raw.file_url, raw.attachment_url, raw.image_url, raw.original_url);
  const fromRaw = firstText(raw.file_name, raw.filename, raw.name, raw.display_name);
  if (fromRaw) return fromRaw;
  if (url) {
    try {
      const parsed = new URL(url);
      const last = parsed.pathname.split("/").filter(Boolean).pop();
      if (last) return decodeURIComponent(last);
    } catch {
      // fall through to fallback
    }
  }
  return fallback;
}

function inferFileType(fileName: string, raw: any): string | null {
  const contentType = firstText(raw.content_type, raw.mime_type, raw.file_type);
  if (contentType) return contentType;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (["mp4", "mov", "webm"].includes(ext)) return `video/${ext}`;
  if (ext === "pdf") return "application/pdf";
  return ext;
}

function normalizeInvoiceStatus(raw: any): string {
  const status = String(raw.status || "").toLowerCase();
  if (status.includes("paid")) return "paid";
  if (status.includes("void")) return "void";
  if (status.includes("sent")) return "sent";
  if (status.includes("draft")) return "draft";
  return status || (asNumber(raw.due_amount ?? raw.balance) <= 0 ? "paid" : "open");
}

async function fetchRaw(supabase: any, sourceTypes: string[], offset: number, limit: number) {
  const { data, error } = await supabase
    .from("hcp_raw_objects")
    .select("*")
    .in("source_type", sourceTypes)
    .order("source_type", { ascending: true })
    .order("source_key", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Raw fetch failed: ${error.message}`);
  return data || [];
}

async function createRun(supabase: any, resource: string, offset: number, limit: number) {
  const { data, error } = await supabase
    .from("hcp_import_runs")
    .insert({
      phase: "normalize",
      resource,
      mode: "chunk",
      status: "running",
      page: Math.floor(offset / limit) + 1,
      page_size: limit,
      params: { resource, offset, limit },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function getCustomerMap(supabase: any, hcpIds: string[]) {
  const ids = Array.from(new Set(hcpIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const { data, error } = await supabase.from("customers").select("id,hcp_customer_id").in("hcp_customer_id", ids.slice(i, i + 75));
    if (error) throw new Error(`Customer map failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return new Map(rows.map((row: any) => [row.hcp_customer_id, row.id]));
}

async function getJobMap(supabase: any, hcpIds: string[]) {
  const ids = Array.from(new Set(hcpIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const { data, error } = await supabase.from("jobs").select("id,hcp_id,customer_id").in("hcp_id", ids.slice(i, i + 75));
    if (error) throw new Error(`Job map failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return new Map(rows.map((row: any) => [row.hcp_id, row]));
}

async function getEstimateMap(supabase: any, hcpIds: string[]) {
  const ids = Array.from(new Set(hcpIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const { data, error } = await supabase.from("estimates").select("id,hcp_id,customer_id").in("hcp_id", ids.slice(i, i + 75));
    if (error) throw new Error(`Estimate map failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return new Map(rows.map((row: any) => [row.hcp_id, row]));
}

async function getInvoiceMap(supabase: any, hcpIds: string[]) {
  const ids = Array.from(new Set(hcpIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 75) {
    const { data, error } = await supabase.from("customer_invoices").select("id,hcp_invoice_id").in("hcp_invoice_id", ids.slice(i, i + 75));
    if (error) throw new Error(`Invoice map failed: ${error.message}`);
    rows.push(...(data || []));
  }
  return new Map(rows.map((row: any) => [row.hcp_invoice_id, row.id]));
}

async function getEstimateIdByOptionKey(supabase: any, optionKeys: string[]) {
  const keys = Array.from(new Set(optionKeys.filter(Boolean)));
  const optionToEstimateHcp = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 75) {
    const { data, error } = await supabase
      .from("hcp_raw_objects")
      .select("source_key,parent_source_key")
      .eq("source_type", "estimate_option")
      .in("source_key", keys.slice(i, i + 75));
    if (error) throw new Error(`Estimate option map failed: ${error.message}`);
    for (const row of data || []) optionToEstimateHcp.set(row.source_key, row.parent_source_key);
  }
  const estimateMap = await getEstimateMap(supabase, Array.from(optionToEstimateHcp.values()));
  const optionToEstimate = new Map<string, any>();
  for (const [optionKey, estimateHcpId] of optionToEstimateHcp) {
    const estimate = estimateMap.get(estimateHcpId);
    if (estimate) optionToEstimate.set(optionKey, estimate);
  }
  return optionToEstimate;
}

async function normalizeCustomers(supabase: any, raws: any[], runId: string) {
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const primaryAddress = Array.isArray(raw.addresses) ? raw.addresses.find((a: any) => a.is_primary) || raw.addresses[0] : null;
    return {
      hcp_customer_id: raw.id || rawRow.hcp_id || rawRow.source_key,
      first_name: formatName(raw.first_name || null),
      last_name: formatName(raw.last_name || null),
      company: raw.company || raw.company_name || null,
      email: formatEmail(raw.email || null),
      phone: formatPhone(raw.home_number || raw.phone_number || raw.work_number || raw.mobile_number || null),
      mobile_phone: formatPhone(raw.mobile_number || null),
      address: primaryAddress?.street ? formatAddress(primaryAddress.street) : null,
      city: primaryAddress?.city || null,
      state: primaryAddress?.state || null,
      zip: primaryAddress?.zip || null,
      notes: raw.notes || null,
      lead_source: raw.lead_source || null,
      notifications_enabled: raw.notifications_enabled ?? true,
      created_at: raw.created_at || new Date().toISOString(),
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const { error } = await supabase.from("customers").upsert(rows, { onConflict: "hcp_customer_id" });
  if (error) throw new Error(`Customer upsert failed: ${error.message}`);
  return rows.length;
}

async function normalizeAddresses(supabase: any, raws: any[], runId: string) {
  const customerMap = await getCustomerMap(supabase, raws.map((r: any) => r.parent_source_key));
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const customerId = customerMap.get(rawRow.parent_source_key);
    if (!customerId) return null;
    return {
      customer_id: customerId,
      hcp_address_id: raw.id || raw.uuid || rawRow.source_key,
      address_type: raw.type || raw.address_type || null,
      is_primary: raw.is_primary ?? false,
      street: raw.street || null,
      street_line_2: raw.street_line_2 || raw.street2 || null,
      city: raw.city || null,
      state: raw.state || null,
      zip: raw.zip || raw.postal_code || null,
      latitude: raw.latitude ? String(raw.latitude) : null,
      longitude: raw.longitude ? String(raw.longitude) : null,
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const filtered = rows.filter(Boolean);
  if (!filtered.length) return 0;
  const { error } = await supabase.from("customer_addresses").upsert(filtered, { onConflict: "hcp_address_id" });
  if (error) throw new Error(`Address upsert failed: ${error.message}`);
  return filtered.length;
}

async function normalizeJobs(supabase: any, raws: any[], runId: string) {
  const customerMap = await getCustomerMap(supabase, raws.map((r: any) => r.raw_json?.customer?.id).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const mapped = mapHcpJobToFields(raw);
    const scheduledDate = mapped.scheduled_date || null;
    return {
      ...mapped,
      customer_id: customerMap.get(raw.customer?.id) || null,
      status: mapHcpJobStatus(raw.work_status || null, scheduledDate),
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const { error } = await supabase.from("jobs").upsert(rows, { onConflict: "hcp_id" });
  if (error) throw new Error(`Job upsert failed: ${error.message}`);
  return rows.length;
}

async function normalizeEstimates(supabase: any, raws: any[], runId: string) {
  const customerMap = await getCustomerMap(supabase, raws.map((r: any) => r.raw_json?.customer?.id).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const mapped = mapHcpEstimateToFields(raw);
    return {
      ...mapped,
      customer_id: customerMap.get(raw.customer?.id) || null,
      status: mapHcpEstimateStatus(raw.work_status || null),
      work_status: raw.work_status || null,
      hcp_status: raw.work_status || null,
      lead_source: raw.lead_source || null,
      total_amount: getAmount(raw.total_amount ?? raw.amount ?? raw.subtotal),
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const { error } = await supabase.from("estimates").upsert(rows, { onConflict: "hcp_id" });
  if (error) throw new Error(`Estimate upsert failed: ${error.message}`);
  return rows.length;
}

async function normalizeEstimateItems(supabase: any, raws: any[], runId: string) {
  const estimateMap = await getEstimateMap(supabase, raws.map((r: any) => r.parent_source_key).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any, index: number) => {
    const raw = rawRow.raw_json || {};
    const estimate = estimateMap.get(rawRow.parent_source_key);
    if (!estimate) return null;
    const notes = Array.isArray(raw.notes)
      ? raw.notes
          .map((note: any) => firstText(note.content, note.body, note.text, note.note))
          .filter(Boolean)
          .join("\n\n")
      : null;
    const total = getAmount(raw.total_amount ?? raw.amount ?? raw.total ?? raw.total_price);
    const optionName = firstText(raw.name, raw.option_number ? `Option ${raw.option_number}` : null) || "Imported HCP estimate option";
    return {
      estimate_id: estimate.id,
      hcp_estimate_id: rawRow.parent_source_key,
      hcp_option_id: raw.id || raw.uuid || rawRow.source_key,
      hcp_line_item_id: raw.id || raw.uuid || rawRow.source_key,
      option_name: optionName,
      name: optionName,
      description: notes || firstText(raw.description, raw.message_from_pro, raw.status) || optionName,
      quantity: 1,
      unit_price: total,
      unit_cost: getAmount(raw.unit_cost),
      total_price: total,
      tax_amount: getAmount(raw.tax_amount),
      discount_amount: getAmount(raw.discount_amount),
      kind: firstText(raw.kind, raw.type) || "estimate_option",
      item_type: firstText(raw.item_type, raw.type) || "estimate_option",
      sort_order: asNumber(raw.option_number || index),
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const filtered = rows.filter(Boolean);
  if (!filtered.length) return 0;
  const { error } = await supabase
    .from("estimate_line_items")
    .upsert(filtered, { onConflict: "hcp_estimate_id,hcp_option_id,hcp_line_item_id" });
  if (error) throw new Error(`Estimate item upsert failed: ${error.message}`);
  return filtered.length;
}

async function normalizeInvoices(supabase: any, raws: any[], runId: string) {
  const jobMap = await getJobMap(supabase, raws.map((r: any) => r.raw_json?.job_id).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const job = raw.job_id ? jobMap.get(raw.job_id) : null;
    return {
      job_id: job?.id || null,
      hcp_invoice_id: raw.id || rawRow.hcp_id || rawRow.source_key,
      hcp_job_id: raw.job_id || null,
      hcp_customer_id: raw.customer_id || null,
      invoice_number: raw.invoice_number || null,
      status: normalizeInvoiceStatus(raw),
      subtotal: getAmount(raw.subtotal),
      tax_rate: 0,
      tax_amount: getAmount(raw.taxes?.total || raw.tax_amount),
      discount_amount: getAmount(raw.discounts?.total || raw.discount_amount),
      total: getAmount(raw.amount ?? raw.total ?? raw.total_amount),
      balance: getAmount(raw.due_amount ?? raw.balance),
      amount_paid: getAmount(raw.amount_paid ?? raw.paid_amount),
      sent_at: raw.sent_at || null,
      paid_at: raw.paid_at || null,
      due_at: raw.due_at || null,
      due_date: raw.due_at || null,
      invoice_date: raw.invoice_date || null,
      service_date: raw.service_date || null,
      hcp_invoice_url: raw.url || raw.invoice_url || null,
      hcp_pdf_url: raw.pdf_url || null,
      created_at: raw.created_at || raw.invoice_date || new Date().toISOString(),
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const { error } = await supabase.from("customer_invoices").upsert(rows, { onConflict: "hcp_invoice_id" });
  if (error) throw new Error(`Invoice upsert failed: ${error.message}`);
  return rows.length;
}

async function normalizeInvoiceItems(supabase: any, raws: any[], runId: string) {
  const invoiceMap = await getInvoiceMap(supabase, raws.map((r: any) => r.parent_source_key).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any, index: number) => {
      const raw = rawRow.raw_json || {};
      const invoiceId = invoiceMap.get(rawRow.parent_source_key);
      if (!invoiceId) return null;
      const quantity = asNumber(raw.quantity || 1) || 1;
      const total = getAmount(raw.amount ?? raw.total ?? raw.total_price ?? raw.unit_price);
      const unitPrice = getAmount(raw.unit_price ?? (quantity ? total / quantity : total));
      const kind = firstText(raw.kind, raw.type, raw.item_type);
      const isDiscount = String(kind || "").toLowerCase().includes("discount");
      return {
        invoice_id: invoiceId,
        hcp_invoice_id: rawRow.parent_source_key,
        hcp_line_item_id: raw.id || raw.uuid || rawRow.source_key,
        name: raw.name || null,
        description: raw.description || raw.name || "Imported HCP line item",
        quantity,
        unit_price: isDiscount && unitPrice > 0 ? -unitPrice : unitPrice,
        total: isDiscount && total > 0 ? -total : total,
        sort_order: index,
        kind,
        item_type: raw.item_type || raw.type || null,
        unit_cost: getAmount(raw.unit_cost),
        tax_amount: getAmount(raw.tax_amount),
        discount_amount: getAmount(raw.discount_amount),
        raw_hcp_json: raw,
        source_hash: await sha256(raw),
        import_run_id: runId,
      };
    }));
  const filtered = rows.filter(Boolean);
  if (!filtered.length) return 0;
  const { error } = await supabase
    .from("customer_invoice_items")
    .upsert(filtered, { onConflict: "hcp_invoice_id,hcp_line_item_id" });
  if (error) throw new Error(`Invoice item upsert failed: ${error.message}`);
  return filtered.length;
}

async function normalizeInvoicePayments(supabase: any, raws: any[], runId: string) {
  const invoiceMap = await getInvoiceMap(supabase, raws.map((r: any) => r.parent_source_key).filter(Boolean));
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const invoiceId = invoiceMap.get(rawRow.parent_source_key);
    if (!invoiceId) return null;
    return {
      customer_invoice_id: invoiceId,
      hcp_invoice_id: rawRow.parent_source_key,
      hcp_payment_id: raw.id || raw.uuid || raw.payment_id || rawRow.source_key,
      amount: getAmount(raw.amount ?? raw.total),
      method: raw.method || raw.payment_method || raw.type || null,
      status: raw.status || null,
      transaction_id: raw.transaction_id || raw.gateway_transaction_id || null,
      reference_number: raw.reference_number || raw.ref_number || null,
      paid_at: raw.paid_at || raw.created_at || null,
      refunded_at: raw.refunded_at || null,
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const filtered = rows.filter(Boolean);
  if (!filtered.length) return 0;
  const { error } = await supabase.from("invoice_payments").upsert(filtered, { onConflict: "hcp_payment_id" });
  if (error) throw new Error(`Payment upsert failed: ${error.message}`);
  return filtered.length;
}

async function normalizeNotes(supabase: any, raws: any[], runId: string) {
  const jobMap = await getJobMap(supabase, raws.filter((r: any) => r.source_type.startsWith("job")).map((r: any) => r.parent_source_key));
  const estimateOptionMap = await getEstimateIdByOptionKey(
    supabase,
    raws.filter((r: any) => r.source_type.startsWith("estimate")).map((r: any) => r.parent_source_key),
  );
  const rows = await Promise.all(raws.map(async (rawRow: any) => {
    const raw = rawRow.raw_json || {};
    const job = rawRow.source_type.startsWith("job") ? jobMap.get(rawRow.parent_source_key) : null;
    const estimate = rawRow.source_type.startsWith("estimate") ? estimateOptionMap.get(rawRow.parent_source_key) : null;
    if (!job && !estimate) return null;
    return {
      source_type: job ? "job" : "estimate",
      source_id: job?.id || estimate?.id || null,
      hcp_source_id: rawRow.parent_source_key,
      hcp_note_id: raw.id || raw.uuid || rawRow.source_key,
      customer_id: job?.customer_id || estimate?.customer_id || null,
      job_id: job?.id || null,
      estimate_id: estimate?.id || null,
      visibility: raw.visibility || "internal",
      author_name: raw.author || raw.author_name || raw.employee?.name || null,
      body: raw.body || raw.note || raw.text || raw.content || raw.description || "",
      note_created_at: raw.created_at || null,
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
  }));

  const filtered = rows.filter((row: any) => row && row.body);
  if (!filtered.length) return 0;
  const { error } = await supabase.from("hcp_notes").upsert(filtered, { onConflict: "source_type,hcp_source_id,hcp_note_id" });
  if (error) throw new Error(`Note upsert failed: ${error.message}`);
  return filtered.length;
}

async function normalizeAttachments(supabase: any, raws: any[], runId: string) {
  const jobMap = await getJobMap(supabase, raws.filter((r: any) => r.source_type === "job_attachment").map((r: any) => r.parent_source_key));
  const estimateOptionMap = await getEstimateIdByOptionKey(
    supabase,
    raws.filter((r: any) => r.source_type === "estimate_option_attachment").map((r: any) => r.parent_source_key),
  );
  const customerMap = await getCustomerMap(supabase, raws.filter((r: any) => r.source_type === "customer_attachment").map((r: any) => r.parent_source_key));
  const hcpRows: any[] = [];
  const jobAttachmentRows: any[] = [];

  for (const rawRow of raws) {
    const raw = rawRow.raw_json || {};
    const job = rawRow.source_type === "job_attachment" ? jobMap.get(rawRow.parent_source_key) : null;
    const estimate = rawRow.source_type === "estimate_option_attachment" ? estimateOptionMap.get(rawRow.parent_source_key) : null;
    const customerId = rawRow.source_type === "customer_attachment" ? customerMap.get(rawRow.parent_source_key) : null;
    if (!job && !estimate && !customerId) continue;

    const fileName = getFileName(raw, `${rawRow.source_key}.attachment`);
    const sourceUrl = firstText(raw.url, raw.file_url, raw.attachment_url, raw.image_url, raw.original_url);
    const hcpAttachmentId = raw.id || raw.uuid || raw.attachment_id || rawRow.source_key;
    const sourceType = job ? "job" : estimate ? "estimate" : "customer";
    const sourceId = job?.id || estimate?.id || customerId;
    const base = {
      source_type: sourceType,
      source_id: sourceId,
      hcp_source_id: rawRow.parent_source_key,
      hcp_attachment_id: hcpAttachmentId,
      customer_id: customerId || job?.customer_id || estimate?.customer_id || null,
      job_id: job?.id || null,
      estimate_id: estimate?.id || null,
      file_name: fileName,
      file_type: inferFileType(fileName, raw),
      original_url: sourceUrl,
      archive_status: "metadata",
      raw_hcp_json: raw,
      source_hash: await sha256(raw),
      import_run_id: runId,
    };
    hcpRows.push(base);

    if (job) {
      jobAttachmentRows.push({
        job_id: job.id,
        hcp_attachment_id: hcpAttachmentId,
        file_name: fileName,
        file_path: sourceUrl || "",
        file_type: base.file_type,
        original_url: sourceUrl,
        archive_status: "metadata",
        raw_hcp_json: raw,
        source_hash: base.source_hash,
        import_run_id: runId,
      });
    }
  }

  if (hcpRows.length) {
    const { error } = await supabase.from("hcp_attachments").upsert(hcpRows, { onConflict: "source_type,hcp_source_id,hcp_attachment_id" });
    if (error) throw new Error(`Attachment metadata upsert failed: ${error.message}`);
  }
  if (jobAttachmentRows.length) {
    const { error } = await supabase.from("job_attachments").upsert(jobAttachmentRows, { onConflict: "hcp_attachment_id" });
    if (error) throw new Error(`Job attachment metadata upsert failed: ${error.message}`);
  }
  return hcpRows.length;
}

async function normalizeResource(supabase: any, resource: NormalizeResource, raws: any[], runId: string) {
  switch (resource) {
    case "customers":
      return await normalizeCustomers(supabase, raws, runId);
    case "addresses":
      return await normalizeAddresses(supabase, raws, runId);
    case "jobs":
      return await normalizeJobs(supabase, raws, runId);
    case "estimates":
      return await normalizeEstimates(supabase, raws, runId);
    case "estimate_items":
      return await normalizeEstimateItems(supabase, raws, runId);
    case "invoices":
      return await normalizeInvoices(supabase, raws, runId);
    case "invoice_items":
      return await normalizeInvoiceItems(supabase, raws, runId);
    case "invoice_payments":
      return await normalizeInvoicePayments(supabase, raws, runId);
    case "notes":
      return await normalizeNotes(supabase, raws, runId);
    case "attachments":
      return await normalizeAttachments(supabase, raws, runId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseAdmin();
  let runId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const resource = String(body.resource || "") as NormalizeResource;
    const sourceTypes = RESOURCE_TO_SOURCE_TYPES[resource];
    if (!sourceTypes) return jsonResponse({ error: "Unsupported resource", supported: Object.keys(RESOURCE_TO_SOURCE_TYPES) }, 400);

    const offset = Math.max(Number(body.offset || 0), 0);
    const limit = Math.min(Math.max(Number(body.limit || 100), 1), 500);
    runId = await createRun(supabase, resource, offset, limit);

    const raws = await fetchRaw(supabase, sourceTypes, offset, limit);
    const normalizedCount = await normalizeResource(supabase, resource, raws, runId);

    await supabase
      .from("hcp_import_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        fetched_count: raws.length,
        normalized_count: normalizedCount,
        page: Math.floor(offset / limit) + 1,
        metadata: { source_types: sourceTypes, offset, limit, has_more: raws.length === limit },
      })
      .eq("id", runId);

    return jsonResponse({
      ok: true,
      run_id: runId,
      resource,
      offset,
      limit,
      fetched_count: raws.length,
      normalized_count: normalizedCount,
      has_more: raws.length === limit,
    });
  } catch (err: any) {
    if (runId) {
      await supabase
        .from("hcp_import_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), last_error: err.message, error_count: 1 })
        .eq("id", runId);
      await supabase.from("hcp_import_errors").insert({
        import_run_id: runId,
        phase: "normalize",
        message: err.message,
        detail: { stack: err.stack },
      });
    }
    return jsonResponse({ ok: false, run_id: runId, error: err.message }, 500);
  }
});
