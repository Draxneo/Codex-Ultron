/**
 * Texas County Appraisal District (CAD) Scraper
 *
 * Uses Firecrawl `/v2/scrape` with the **deterministic `actions` array**
 * (click → write → click → wait → screenshot/html). One HTTP call instead
 * of three chained interact-agent calls. Faster (typically 15–25s vs 60–90s)
 * and far more reliable, because the agent occasionally hallucinates element
 * targets on these JS-heavy BIS pages.
 *
 * All six counties (Guadalupe, Bexar, Comal, Wilson, Kendall, Atascosa)
 * run the same BIS Consultants software, so a single recipe handles them all
 * — only the host changes.
 *
 * COST: ~1 Firecrawl scrape (with actions counts as ~3 page-actions billing).
 * Cached forever in `property_data`.
 */

import { resolveCad, type CadConfig } from "./tx-county-router.ts";

const FIRECRAWL_BASE = "https://api.firecrawl.dev";

export interface CadResult {
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  year_built?: number | null;
  estimated_value?: number | null;
  lot_size?: string | null;
  property_type?: string | null;
  /** "Guadalupe CAD" — used as `source` on property_data row (badge keys on /CAD/i) */
  source: string;
  legal_description?: string | null;
  cad_property_id?: string | null;
}

/**
 * Main entrypoint. Returns null if address is outside our 6-county service area
 * or if the lookup fails. Caller falls back to non-CAD strategies.
 */
export async function lookupCadProperty(
  address: string,
  apiKey: string,
): Promise<CadResult | null> {
  const resolved = resolveCad(address);
  if (!resolved) {
    console.log(`🗺️ CAD: address outside service area, skipping`);
    return null;
  }
  const { cad, parts } = resolved;
  console.log(`🗺️ CAD: routing "${address}" to ${cad.label} (${cad.host})`);

  const streetNumber = extractStreetNumber(parts.street);
  const streetName = extractStreetName(parts.street);
  if (!streetNumber || !streetName) {
    console.log(`🗺️ CAD: could not parse street number/name from "${parts.street}"`);
    return null;
  }

  // Step 1: scrape search results page using deterministic actions.
  // BIS form: click "By Address" tab, fill StreetNumber + StreetName, click Search.
  // Then wait for results table and click first row to land on detail page.
  const resultPage = await scrapeWithActions(
    `https://${cad.host}/`,
    [
      // Open "By Address" tab
      { type: "click", selector: 'a[data-filter="search-address"]' },
      { type: "wait", milliseconds: 500 },
      // Fill the form
      { type: "write", selector: "#StreetNumber", text: streetNumber },
      { type: "write", selector: "#StreetName", text: streetName },
      { type: "wait", milliseconds: 300 },
      // Submit. BIS uses a hidden button — try the explicit search button.
      { type: "click", selector: ".search-box button" },
      // Wait for results table to appear
      { type: "wait", milliseconds: 4000 },
      // Click the first result row link (anchors in result table land on /Property/View/{id})
      { type: "click", selector: 'table a[href*="/Property/View/"]' },
      // Wait for detail page to render
      { type: "wait", milliseconds: 4000 },
    ],
    apiKey,
  );

  if (!resultPage.success) {
    console.error(`🗺️ CAD: scrape with actions failed: ${resultPage.error}`);
    return null;
  }

  const html = resultPage.html;
  const markdown = resultPage.markdown;
  const finalUrl = resultPage.finalUrl;

  // Sanity check: did we actually land on a detail page?
  if (
    /no\s+(records?|results?|matches?)\s+(were\s+)?found/i.test(markdown) ||
    /search\s+session\s+has\s+expired/i.test(markdown) ||
    /error\s+404/i.test(markdown)
  ) {
    console.log(`🗺️ CAD: search returned no matches for ${streetNumber} ${streetName}`);
    return null;
  }

  // Prefer parsing the rich HTML table (BIS detail pages use definition tables);
  // fall back to markdown text if needed.
  const result = parseCadDetailHtml(html, cad);
  if (!result.sqft && !result.bedrooms && !result.estimated_value) {
    // Try markdown as a fallback
    const mdResult = parseCadDetailText(markdown, cad);
    if (mdResult.sqft || mdResult.bedrooms || mdResult.estimated_value) {
      Object.assign(result, mdResult);
    }
  }

  // Pull property ID from the URL: /Property/View/{id}
  const idMatch = (finalUrl || "").match(/\/Property\/View\/(\w+)/);
  if (idMatch) result.cad_property_id = idMatch[1];

  if (!result.sqft && !result.bedrooms && !result.estimated_value) {
    console.log(
      `🗺️ CAD: detail page parsed but no usable fields. URL=${finalUrl} ` +
      `MD-snippet="${markdown.slice(0, 200).replace(/\s+/g, " ")}"`,
    );
    return null;
  }

  console.log(
    `🗺️ CAD: ✅ ${cad.label} → ` +
    `${result.bedrooms ?? "?"}bd / ${result.bathrooms ?? "?"}ba / ` +
    `${result.sqft ?? "?"}sqft / ${result.year_built ?? "?"} / $${result.estimated_value ?? "?"}`,
  );
  return result;
}

/* ──────────────────────────────────────────────────────────
   Firecrawl helper — single /v2/scrape call with actions
   ────────────────────────────────────────────────────────── */

interface ScrapeWithActionsResult {
  success: boolean;
  error?: string;
  html: string;
  markdown: string;
  finalUrl: string;
}

async function scrapeWithActions(
  url: string,
  actions: any[],
  apiKey: string,
): Promise<ScrapeWithActionsResult> {
  try {
    const resp = await fetch(`${FIRECRAWL_BASE}/v2/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: false, // need full page tables
        waitFor: 2000,
        actions,
        // 90s server-side budget — the whole flow should finish well under this
        timeout: 90_000,
      }),
    });

    const raw = await resp.json().catch(() => ({}));
    if (!resp.ok || !raw.success) {
      return {
        success: false,
        error: `${resp.status} ${JSON.stringify(raw).slice(0, 200)}`,
        html: "",
        markdown: "",
        finalUrl: "",
      };
    }

    const data = raw.data || raw;
    return {
      success: true,
      html: data.html || "",
      markdown: data.markdown || "",
      finalUrl: data.metadata?.sourceURL || data.metadata?.url || "",
    };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || String(e),
      html: "",
      markdown: "",
      finalUrl: "",
    };
  }
}

/* ──────────────────────────────────────────────────────────
   Parsers
   ────────────────────────────────────────────────────────── */

function extractStreetNumber(street: string): string | null {
  const m = street.trim().match(/^(\d+[A-Z]?)\b/i);
  return m ? m[1] : null;
}

function extractStreetName(street: string): string | null {
  let s = street.trim().replace(/^\d+[A-Z]?\s+/i, "");
  s = s.replace(/\b(?:apt|unit|#|suite|ste)\.?\s*\S+$/i, "").trim();
  s = s.replace(
    /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|circle|cir|boulevard|blvd|place|pl|trail|trl|parkway|pkwy|highway|hwy|way)\.?$/i,
    "",
  ).trim();
  return s.length > 0 ? s : null;
}

/**
 * Parse BIS property detail page from full HTML.
 * Detail pages render values in `<table>` rows like:
 *   <tr><th>Living Area:</th><td>2,314 sqft</td></tr>
 * Stripping tags + collapsing whitespace turns this into "Living Area: 2,314 sqft"
 * which then matches the same patterns as the markdown parser.
 */
export function parseCadDetailHtml(html: string, cad: CadConfig): CadResult {
  if (!html) return { source: cad.label };
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(td|th|tr|div|p|li)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return parseCadDetailText(text, cad);
}

/**
 * Parse BIS property detail page from text (markdown or stripped HTML).
 */
export function parseCadDetailText(text: string, cad: CadConfig): CadResult {
  const result: CadResult = { source: cad.label };

  // Living area / sqft (try multiple labels)
  const sqftPatterns = [
    /Living\s*Area[:\s|]+([0-9,]+)/i,
    /Building\s*Sq\.?\s*Ft\.?[:\s|]+([0-9,]+)/i,
    /Total\s*(?:Living\s*)?Area[:\s|]+([0-9,]+)/i,
    /Sq\.?\s*Ft\.?[:\s|]+([0-9,]+)/i,
    /Square\s*Feet[:\s|]+([0-9,]+)/i,
  ];
  for (const re of sqftPatterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (n >= 300 && n <= 50000) {
        result.sqft = n;
        break;
      }
    }
  }

  // Bedrooms
  const bedMatch = text.match(/Bedrooms?[:\s|]+(\d{1,2})/i);
  if (bedMatch) {
    const n = parseInt(bedMatch[1], 10);
    if (n > 0 && n < 20) result.bedrooms = n;
  }

  // Bathrooms — try total-baths first, then full+half
  const bathTotal = text.match(/(?:Total\s*)?Bath(?:room)?s?[:\s|]+([\d.]+)/i);
  if (bathTotal) {
    const n = parseFloat(bathTotal[1]);
    if (n > 0 && n < 20) result.bathrooms = n;
  }
  if (result.bathrooms == null) {
    const fullMatch = text.match(/Full\s*Bath(?:room)?s?[:\s|]+(\d+)/i);
    const halfMatch = text.match(/Half\s*Bath(?:room)?s?[:\s|]+(\d+)/i);
    if (fullMatch) {
      let total = parseInt(fullMatch[1], 10);
      if (halfMatch) total += parseInt(halfMatch[1], 10) * 0.5;
      if (total > 0 && total < 20) result.bathrooms = total;
    }
  }

  // Year Built / Effective Year
  const yearMatch = text.match(/(?:Year\s*Built|Effective\s*Year)[:\s|]+(\d{4})/i);
  if (yearMatch) {
    const n = parseInt(yearMatch[1], 10);
    const cy = new Date().getFullYear();
    if (n >= 1800 && n <= cy) result.year_built = n;
  }

  // Market value (prefer Market over Appraised over Assessed)
  const marketPatterns = [
    /Total\s*Market\s*Value[:\s|]+\$?([0-9,]+)/i,
    /Market\s*Value[:\s|]+\$?([0-9,]+)/i,
    /Appraised\s*Value[:\s|]+\$?([0-9,]+)/i,
    /Assessed\s*Value[:\s|]+\$?([0-9,]+)/i,
  ];
  for (const re of marketPatterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (n >= 10000) {
        result.estimated_value = n;
        break;
      }
    }
  }

  // Lot size
  const lotAcres = text.match(/Lot\s*Size[:\s|]+([\d.]+)\s*ac/i);
  if (lotAcres) {
    result.lot_size = `${lotAcres[1]} ac`;
  } else {
    const lotSqft = text.match(/Lot\s*Size[:\s|]+([0-9,]+)\s*(?:sq\.?\s*ft|sqft)/i);
    if (lotSqft) result.lot_size = `${lotSqft[1]} sqft`;
  }

  // Property Type / State Code
  const typeMatch = text.match(/(?:Property\s*Type|State\s*Code)[:\s|]+([A-Za-z][A-Za-z0-9 \-/]{2,40})/i);
  if (typeMatch) result.property_type = typeMatch[1].trim();

  // Legal description
  const legalMatch = text.match(/Legal\s*Description[:\s|]+(.+?)(?:\||$)/i);
  if (legalMatch) result.legal_description = legalMatch[1].trim().slice(0, 200);

  return result;
}
