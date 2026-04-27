import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

const HCP_BASE = "https://api.housecallpro.com";

type ProbeResource =
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

const RESOURCE_CONFIG: Record<ProbeResource, { path: string; arrayKey: string; sourceType: string }> = {
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

async function fetchHcp(path: string, apiKey: string, pageSize: number) {
  const url = new URL(`${HCP_BASE}${path}`);
  if (!url.searchParams.has("page")) url.searchParams.set("page", "1");
  if (!url.searchParams.has("page_size")) url.searchParams.set("page_size", String(pageSize));
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
  if (!response.ok) {
    throw new Error(`HCP ${response.status} for ${url.pathname}: ${text.slice(0, 500)}`);
  }

  return { retry: false, retryAfter: 0, url: url.toString(), payload: JSON.parse(text) };
}

async function upsertRawObject(supabase: any, row: Record<string, unknown>) {
  const rawHash = await sha256(row.raw_json);
  const payload = {
    ...row,
    raw_hash: rawHash,
    fetched_at: new Date().toISOString(),
    archive_status: "raw",
  };
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
    const apiKey = Deno.env.get("HCP_API_KEY");
    if (!apiKey) return jsonResponse({ error: "HCP_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const requested = body.resources as ProbeResource[] | undefined;
    const resources = (requested?.length ? requested : ["customers", "jobs", "estimates", "invoices"]) as ProbeResource[];
    const pageSize = Math.min(Math.max(Number(body.page_size || 3), 1), 10);
    const persist = body.persist !== false;

    const { data: run, error: runErr } = await supabase
      .from("hcp_import_runs")
      .insert({
        phase: "probe",
        resource: resources.join(","),
        mode: "probe",
        status: "running",
        page: 1,
        page_size: pageSize,
        params: { resources, page_size: pageSize, persist },
      })
      .select("id")
      .single();
    if (runErr) throw runErr;
    runId = run.id;

    const report: Record<string, unknown> = {};
    let fetchedCount = 0;
    let nestedCount = 0;

    for (const resource of resources) {
      const config = RESOURCE_CONFIG[resource];
      if (!config) {
        report[resource] = { ok: false, error: "Unsupported resource" };
        continue;
      }

      try {
        const result = await fetchHcp(config.path, apiKey, pageSize);
        if (result.retry) {
          report[resource] = { ok: false, retry: true, retry_after: result.retryAfter, url: result.url };
          continue;
        }

        const items = listItems(result.payload, config.arrayKey);
        const nestedSummary: Record<string, number> = {};

        for (const [index, item] of items.entries()) {
          const hcpId = getHcpId(item);
          const key = sourceKey(config.sourceType, item, undefined, undefined, index);
          const children = collectNestedChildren(item, config.sourceType, hcpId, key);
          for (const child of children) nestedSummary[child.source_type] = (nestedSummary[child.source_type] || 0) + 1;

          if (persist) {
            await upsertRawObject(supabase, {
              import_run_id: runId,
              source_type: config.sourceType,
              hcp_id: hcpId,
              source_key: key,
              source_url: result.url,
              raw_json: item,
              metadata: { probe: true, resource, index },
            });

            for (const child of children) {
              await upsertRawObject(supabase, {
                import_run_id: runId,
                source_url: result.url,
                metadata: { probe: true, resource },
                ...child,
              });
            }
          }

          fetchedCount++;
          nestedCount += children.length;
        }

        report[resource] = {
          ok: true,
          url: result.url,
          top_level_count: items.length,
          nested_count: Object.values(nestedSummary).reduce((sum, value) => sum + value, 0),
          nested_summary: nestedSummary,
          sample_keys: items[0] ? Object.keys(items[0]).sort() : [],
        };
      } catch (err: any) {
        report[resource] = { ok: false, error: err.message };
        await supabase.from("hcp_import_errors").insert({
          import_run_id: runId,
          resource,
          phase: "probe",
          message: err.message,
          detail: { resource },
        });
      }
    }

    await supabase
      .from("hcp_import_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        fetched_count: fetchedCount,
        archived_count: persist ? fetchedCount + nestedCount : 0,
        metadata: { report },
      })
      .eq("id", runId);

    return jsonResponse({ ok: true, run_id: runId, persisted: persist, fetched_count: fetchedCount, nested_count: nestedCount, report });
  } catch (err: any) {
    if (runId) {
      await supabase
        .from("hcp_import_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          last_error: err.message,
          error_count: 1,
        })
        .eq("id", runId);
    }
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});
