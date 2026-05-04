/**
 * Firecrawl v2 Shared Helper
 * Centralized API client for scrape, search, interact, map.
 * All edge functions import from here instead of making raw fetch calls.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

export function getKey(): string {
  const key = Deno.env.get("FIRECRAWL_API_KEY");
  if (!key) throw new Error("FIRECRAWL_API_KEY not configured");
  return key;
}

function headers(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ══════════════════════════════════════════════════
// SCRAPE — POST /v2/scrape
// ══════════════════════════════════════════════════

export interface ScrapeOptions {
  formats?: string[];
  onlyMainContent?: boolean;
  waitFor?: number;
  location?: { country?: string; languages?: string[] };
  profile?: { name: string; saveChanges?: boolean };
  [key: string]: unknown;
}

export interface ScrapeResult {
  success: boolean;
  scrapeId: string | null;
  markdown: string;
  html: string;
  screenshot: string | null;
  metadata: Record<string, any>;
  branding: Record<string, any> | null;
  raw: Record<string, any>;
}

export async function scrape(
  url: string,
  options: ScrapeOptions = {},
  apiKey?: string
): Promise<ScrapeResult> {
  const key = apiKey || getKey();
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log(`[firecrawl-v2] Scraping: ${formattedUrl}`);

  const body: Record<string, any> = {
    url: formattedUrl,
    formats: options.formats || ["markdown"],
    ...options,
  };
  // Move formats back to top level (not nested in options)
  delete body.formats;
  body.formats = options.formats || ["markdown"];

  const resp = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(body),
  });

  const raw = await resp.json();

  if (!resp.ok || !raw.success) {
    console.error("[firecrawl-v2] Scrape failed:", resp.status, JSON.stringify(raw).substring(0, 300));
    return {
      success: false,
      scrapeId: null,
      markdown: "",
      html: "",
      screenshot: null,
      metadata: {},
      branding: null,
      raw,
    };
  }

  const data = raw.data || raw;
  return {
    success: true,
    scrapeId: data.metadata?.scrapeId || null,
    markdown: data.markdown || "",
    html: data.html || "",
    screenshot: data.screenshot || null,
    metadata: data.metadata || {},
    branding: data.branding || null,
    raw,
  };
}

// ══════════════════════════════════════════════════
// SEARCH — POST /v1/search (stays v1 per docs)
// ══════════════════════════════════════════════════

export interface SearchOptions {
  limit?: number;
  lang?: string;
  country?: string;
  tbs?: string;
  scrapeOptions?: { formats?: string[] };
  [key: string]: unknown;
}

export interface SearchResultItem {
  url: string;
  title: string;
  description: string;
  markdown: string;
}

export async function search(
  query: string,
  options: SearchOptions = {},
  apiKey?: string
): Promise<{ success: boolean; results: SearchResultItem[]; raw: any }> {
  const key = apiKey || getKey();
  console.log(`[firecrawl-v2] Searching: ${query}`);

  const resp = await fetch(`${FIRECRAWL_BASE}/v1/search`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      query,
      limit: options.limit || 5,
      lang: options.lang,
      country: options.country,
      tbs: options.tbs,
      scrapeOptions: options.scrapeOptions,
    }),
  });

  const raw = await resp.json();

  if (!resp.ok) {
    console.error("[firecrawl-v2] Search failed:", resp.status);
    return { success: false, results: [], raw };
  }

  const items = (raw.data || []).map((r: any) => ({
    url: r.url || "",
    title: r.title || "",
    description: r.description || "",
    markdown: r.markdown || "",
  }));

  return { success: true, results: items, raw };
}

// ══════════════════════════════════════════════════
// INTERACT — POST /v2/scrape/{scrapeId}/interact
// ══════════════════════════════════════════════════

export interface InteractOptions {
  prompt?: string;
  code?: string;
  language?: "node" | "python" | "bash";
  timeout?: number;
}

export interface InteractResult {
  success: boolean;
  output: string;
  stdout: string;
  result: string;
  stderr: string;
  liveViewUrl: string | null;
  interactiveLiveViewUrl: string | null;
  exitCode: number;
  raw: any;
}

export async function interact(
  scrapeId: string,
  options: InteractOptions,
  apiKey?: string
): Promise<InteractResult> {
  const key = apiKey || getKey();
  const mode = options.prompt ? "prompt" : "code";
  console.log(`[firecrawl-v2] Interact (${mode}) on ${scrapeId}`);

  const body: Record<string, any> = {
    timeout: options.timeout || 30,
  };
  if (options.prompt) body.prompt = options.prompt;
  if (options.code) {
    body.code = options.code;
    body.language = options.language || "node";
  }

  const resp = await fetch(`${FIRECRAWL_BASE}/v2/scrape/${scrapeId}/interact`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(body),
  });

  const raw = await resp.json();

  return {
    success: resp.ok && raw.success !== false,
    output: raw.output || "",
    stdout: raw.stdout || "",
    result: raw.result || "",
    stderr: raw.stderr || "",
    liveViewUrl: raw.liveViewUrl || null,
    interactiveLiveViewUrl: raw.interactiveLiveViewUrl || null,
    exitCode: raw.exitCode ?? (resp.ok ? 0 : 1),
    raw,
  };
}

// ══════════════════════════════════════════════════
// STOP INTERACT — DELETE /v2/scrape/{scrapeId}/interact
// ══════════════════════════════════════════════════

export async function stopInteract(
  scrapeId: string,
  apiKey?: string
): Promise<void> {
  const key = apiKey || getKey();
  try {
    await fetch(`${FIRECRAWL_BASE}/v2/scrape/${scrapeId}/interact`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    console.log(`[firecrawl-v2] Session stopped: ${scrapeId}`);
  } catch (e) {
    console.error("[firecrawl-v2] Stop session error:", e);
  }
}

// ══════════════════════════════════════════════════
// MAP — POST /v1/map (stays v1)
// ══════════════════════════════════════════════════

export interface MapOptions {
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
}

export async function map(
  url: string,
  options: MapOptions = {},
  apiKey?: string
): Promise<{ success: boolean; links: string[]; raw: any }> {
  const key = apiKey || getKey();
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log(`[firecrawl-v2] Mapping: ${formattedUrl}`);

  const resp = await fetch(`${FIRECRAWL_BASE}/v1/map`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({
      url: formattedUrl,
      search: options.search,
      limit: options.limit || 5000,
      includeSubdomains: options.includeSubdomains ?? false,
    }),
  });

  const raw = await resp.json();

  if (!resp.ok) {
    console.error("[firecrawl-v2] Map failed:", resp.status);
    return { success: false, links: [], raw };
  }

  return { success: true, links: raw.links || [], raw };
}

// ══════════════════════════════════════════════════
// Utility: escape string for template literals
// ══════════════════════════════════════════════════

export const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/`/g, "\\`");
