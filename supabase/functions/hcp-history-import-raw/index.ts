import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const HCP_BASE = "https://api.housecallpro.com";

type HcpResource =
  | "customers"
  | "jobs"
  | "estimates"
  | "invoices"
  | "employees"
  | "pricebook_services"
  | "pricebook_materials";

type RawChild = {
  source_type: string;
  hcp_id: string | null;
  source_key: string;
  parent_source_type: string;
  parent_hcp_id: string | null;
  parent_source_key: string;
  nested_path: string;
  raw_json: unknown;
};

const RESOURCE_CONFIG: Record<HcpResource, { path: string; arrayKey: string; sourceType: string }> = {
  customers: { path: "/customers", arrayKey: "customers", sourceType: "customer" },
  jobs: { path: "/jobs", arrayKey: "jobs", sourceType: "job" },
  estimates: { path: "/estimates", arrayKey: "estimates", sourceType: "estimate" },
  invoices: { path: "/invoices", arrayKey: "invoices", sourceType: "invoice" },
  employees: { path: "/employees", arrayKey: "employees", sourceType: "employee" },
  pricebook_services: { path: "/pricebook/services", arrayKey: "services", sourceType: "pricebook_service" },
  pricebook_materials: { path: "/pricebook/materials", arrayKey: "materials", sourceType: "pricebook_material" },
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

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function getHcpId(value: any): string | null {
  if (!value || typeof value !== "object") return null;
  return value.id || value.uuid || value.invoice_id || value.payment_id || value.attachment_id || null;
}

function sourceKey(sourceType: string, item: unknown, parentKey?: string, nestedPath?: string, index?: number): string {
  const id = getHcpId(item);
  if (id) return id;
  const base = `${sourceType}:${parentKey || "root"}:${nestedPath || "self"}:${index ?? 0}:${shortHash(stableStringify(item))}`;
  return base.slice(0, 500);
}

function listItems(payload: any, arrayKey: string): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[arrayKey])) return payload[arrayKey];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function childSourceType(parentSourceType: string, key: string): string {
  const normalized = key.toLowerCase();
  if (normalized.includes("attachment")) return `${parentSourceType}_attachment`;
  if (normalized.includes("line_item") || normalized === "items") return `${parentSourceType}_line_item`;
  if (normalized.includes("payment")) return `${parentSourceType}_payment`;
  if (normalized.includes("refund")) return `${parentSourceType}_refund`;
  if (normalized.includes("discount")) return `${parentSourceType}_discount`;
  if (normalized.includes("tax")) return `${parentSourceType}_tax`;
  if (normalized.includes("option")) return `${parentSourceType}_option`;
  if (normalized.includes("note")) return `${parentSourceType}_note`;
  if (normalized.includes("address")) return `${parentSourceType}_address`;
  if (normalized.includes("appointment")) return `${parentSourceType}_appointment`;
  if (normalized.includes("employee")) return `${parentSourceType}_employee_ref`;
  return `${parentSourceType}_${normalized}`;
}

function collectNestedChildren(
  item: any,
  parentSourceType: string,
  parentHcpId: string | null,
  parentSourceKey: string,
  path = "",
): RawChild[] {
  if (!item || typeof item !== "object") return [];

  const children: RawChild[] = [];
  for (const [key, value] of Object.entries(item)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        if (!child || typeof child !== "object") return;
        const source_type = childSourceType(parentSourceType, key);
        const childKey = sourceKey(source_type, child, parentSourceKey, nextPath, index);
        children.push({
          source_type,
          hcp_id: getHcpId(child),
          source_key: childKey,
          parent_source_type: parentSourceType,
          parent_hcp_id: parentHcpId,
          parent_source_key: parentSourceKey,
          nested_path: `${nextPath}[${index}]`,
          raw_json: child,
        });
        children.push(...collectNestedChildren(child, source_type, getHcpId(child), childKey, `${nextPath}[${index}]`));
      });
    } else if (value && typeof value === "object") {
      children.push(...collectNestedChildren(value, parentSourceType, parentHcpId, parentSourceKey, nextPath));
    }
  }
  return children;
}

async function fetchHcp(path: string, apiKey: string, page: number, pageSize: number) {
  const url = new URL(`${HCP_BASE}${path}`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  if (path === "/jobs" || path === "/estimates" || path === "/customers") {
    url.searchParams.append("expand[]", "attachments");
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") || "10");
    return { retry: true, retryAfter, url: url.toString(), payload: null };
  }

  const text = await response.text();
  if (!response.ok) throw new Error(`HCP ${response.status} for ${url.pathname}: ${text.slice(0, 500)}`);
  return { retry: false, retryAfter: 0, url: url.toString(), payload: JSON.parse(text) };
}

async function upsertRawObjects(supabase: any, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const uniqueRows = Array.from(
    new Map(rows.map((row) => [`${row.source_type}:${row.source_key}`, row])).values(),
  );
  const payload = await Promise.all(uniqueRows.map(async (row) => ({
    ...row,
    raw_hash: await sha256(row.raw_json),
    fetched_at: new Date().toISOString(),
    archive_status: "raw",
  })));
  const { error } = await supabase
    .from("hcp_raw_objects")
    .upsert(payload, { onConflict: "source_type,source_key" });
  if (error) throw new Error(`raw upsert failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = getSupabaseAdmin();
  let runId: string | null = null;

  try {
    const apiKey = Deno.env.get("HCP_API_KEY") || Deno.env.get("HOUSECALL_PRO_API_KEY");
    if (!apiKey) return jsonResponse({ error: "HCP_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const resource = String(body.resource || "") as HcpResource;
    const config = RESOURCE_CONFIG[resource];
    if (!config) return jsonResponse({ error: "Unsupported resource", supported: Object.keys(RESOURCE_CONFIG) }, 400);

    const startPage = Math.max(Number(body.start_page || 1), 1);
    const maxPages = Math.min(Math.max(Number(body.max_pages || 1), 1), 20);
    const pageSize = Math.min(Math.max(Number(body.page_size || 50), 1), 200);
    const dryRun = body.dry_run === true;

    const { data: run, error: runErr } = await supabase
      .from("hcp_import_runs")
      .insert({
        phase: "raw_archive",
        resource,
        mode: dryRun ? "dry_run" : "chunk",
        status: "running",
        page: startPage,
        page_size: pageSize,
        params: { resource, start_page: startPage, max_pages: maxPages, page_size: pageSize, dry_run: dryRun },
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = run.id;

    const report: Array<Record<string, unknown>> = [];
    let fetchedCount = 0;
    let nestedCount = 0;
    let lastPage = startPage - 1;
    let stoppedBecause = "max_pages";

    for (let page = startPage; page < startPage + maxPages; page++) {
      lastPage = page;
      const result = await fetchHcp(config.path, apiKey, page, pageSize);
      if (result.retry) {
        stoppedBecause = "rate_limited";
        report.push({ page, ok: false, retry: true, retry_after: result.retryAfter, url: result.url });
        break;
      }

      const items = listItems(result.payload, config.arrayKey);
      const nestedSummary: Record<string, number> = {};
      const rows: Record<string, unknown>[] = [];

      for (const [index, item] of items.entries()) {
        const hcpId = getHcpId(item);
        const key = sourceKey(config.sourceType, item, undefined, undefined, index);
        const children = collectNestedChildren(item, config.sourceType, hcpId, key);
        for (const child of children) nestedSummary[child.source_type] = (nestedSummary[child.source_type] || 0) + 1;

        rows.push({
          import_run_id: runId,
          source_type: config.sourceType,
          hcp_id: hcpId,
          source_key: key,
          source_url: result.url,
          raw_json: item,
          metadata: { resource, page, index, raw_archive: true },
        });

        for (const child of children) {
          rows.push({
            import_run_id: runId,
            source_url: result.url,
            metadata: { resource, page, raw_archive: true },
            ...child,
          });
        }

        fetchedCount++;
        nestedCount += children.length;
      }

      if (!dryRun) await upsertRawObjects(supabase, rows);

      report.push({
        page,
        ok: true,
        url: result.url,
        top_level_count: items.length,
        nested_count: Object.values(nestedSummary).reduce((sum, value) => sum + value, 0),
        nested_summary: nestedSummary,
      });

      if (items.length < pageSize) {
        stoppedBecause = "empty_or_last_page";
        break;
      }
    }

    await supabase
      .from("hcp_import_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        fetched_count: fetchedCount,
        archived_count: dryRun ? 0 : fetchedCount + nestedCount,
        page: lastPage,
        metadata: { report, stopped_because: stoppedBecause },
      })
      .eq("id", runId);

    return jsonResponse({
      ok: true,
      run_id: runId,
      dry_run: dryRun,
      resource,
      start_page: startPage,
      last_page: lastPage,
      stopped_because: stoppedBecause,
      fetched_count: fetchedCount,
      nested_count: nestedCount,
      report,
    });
  } catch (err: any) {
    if (runId) {
      await supabase
        .from("hcp_import_runs")
        .update({ status: "failed", completed_at: new Date().toISOString(), last_error: err.message, error_count: 1 })
        .eq("id", runId);
      await supabase.from("hcp_import_errors").insert({
        import_run_id: runId,
        phase: "raw_archive",
        message: err.message,
        detail: { stack: err.stack },
      });
    }
    return jsonResponse({ ok: false, run_id: runId, error: err.message }, 500);
  }
});
