import { search as firecrawlSearch, getKey } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



interface SearchResult {
  supply_house_id: string;
  supply_house_name: string;
  branch_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  hours: string | null;
  website_url: string | null;
  source_url: string | null;
}

async function searchSupplyHouseLocations(
  firecrawlKey: string,
  supplyHouseName: string,
  supplyHouseId: string
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Search for locations in the SA / San Marcos / Austin corridor
  const query = `"${supplyHouseName}" HVAC supply house locations branches San Antonio New Braunfels San Marcos Texas address phone hours`;

  console.log(`Searching Firecrawl for: ${query}`);

  const searchRes = await firecrawlSearch(query, {
    limit: 10,
    lang: "en",
    country: "us",
    scrapeOptions: { formats: ["markdown"] },
  }, firecrawlKey);

  if (!searchRes.success) {
    console.error(`Firecrawl search error for ${supplyHouseName}`);
    return results;
  }

  const searchResults = searchRes.results;
  console.log(`Got ${searchResults.length} search results for ${supplyHouseName}`);

  for (const result of searchResults) {
    const md: string = result.markdown || result.description;
    const sourceUrl: string = result.url;

    // Try to extract location data from the markdown
    const locations = parseLocationsFromMarkdown(md, supplyHouseName, supplyHouseId, sourceUrl);
    results.push(...locations);
  }

  return results;
}

function parseLocationsFromMarkdown(
  markdown: string,
  supplyHouseName: string,
  supplyHouseId: string,
  sourceUrl: string
): SearchResult[] {
  const results: SearchResult[] = [];
  if (!markdown || markdown.length < 20) return results;

  // Try to find address patterns: street number + street name + city, state zip
  const addressPattern = /(\d{2,5}\s+[A-Za-z0-9\s.,'#-]+?)(?:,?\s*(?:Suite|Ste|#)\s*\w+)?\s*[,\n]\s*([A-Za-z\s]+),\s*(TX|Texas)\s+(\d{5})/gi;

  const matches = [...markdown.matchAll(addressPattern)];

  for (const match of matches) {
    const fullAddress = match[1].trim();
    const city = match[2].trim();
    const state = "TX";
    const zip = match[4];

    // Skip if this looks like a non-location match (too short, generic)
    if (fullAddress.length < 5 || city.length < 3) continue;

    // Try to find a phone number near this address
    const addrIndex = match.index || 0;
    const nearbyText = markdown.substring(Math.max(0, addrIndex - 200), addrIndex + 500);
    const phoneMatch = nearbyText.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    // Try to find hours
    const hoursMatch = nearbyText.match(/(?:M(?:on)?[-–]F(?:ri)?|Monday[-–]Friday)\s*:?\s*(\d{1,2}(?::\d{2})?\s*(?:am|AM|a\.m\.)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:pm|PM|p\.m\.)?)/i);
    let hours = null;
    if (hoursMatch) {
      hours = `M-F ${hoursMatch[1]}-${hoursMatch[2]}`;
    }

    // Build branch name
    let branchName = `${supplyHouseName} - ${city}`;
    // If multiple in same city, add street info
    const existingInCity = results.filter((r) => r.city === city);
    if (existingInCity.length > 0) {
      const streetWord = fullAddress.match(/\d+\s+(.+)/)?.[1]?.split(/\s+/).slice(0, 2).join(" ") || "";
      branchName = `${supplyHouseName} - ${city} (${streetWord})`;
      // Also rename the first one if needed
      if (existingInCity.length === 1 && !existingInCity[0].branch_name.includes("(")) {
        const firstStreet = existingInCity[0].address?.match(/\d+\s+(.+)/)?.[1]?.split(/\s+/).slice(0, 2).join(" ") || "";
        existingInCity[0].branch_name = `${supplyHouseName} - ${city} (${firstStreet})`;
      }
    }

    // Deduplicate by address
    const isDuplicate = results.some(
      (r) => r.address === fullAddress && r.zip === zip
    );
    if (isDuplicate) continue;

    results.push({
      supply_house_id: supplyHouseId,
      supply_house_name: supplyHouseName,
      branch_name: branchName,
      address: fullAddress,
      city,
      state,
      zip,
      phone: phoneMatch?.[0] || null,
      hours,
      website_url: sourceUrl || null,
      source_url: sourceUrl,
    });
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: "FIRECRAWL_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

            const supabase = getSupabaseAdmin();

    // Get active supply houses
    const { data: supplyHouses } = await supabase
      .from("supply_houses")
      .select("id, name")
      .eq("is_active", true);

    if (!supplyHouses?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "No supply houses found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Search for each supply house
    const allResults: SearchResult[] = [];
    for (const sh of supplyHouses) {
      const locations = await searchSupplyHouseLocations(firecrawlKey, sh.name, sh.id);
      allResults.push(...locations);
    }

    console.log(`Total search results: ${allResults.length}`);

    // Return raw results for client review — do NOT auto-save
    return new Response(
      JSON.stringify({ success: true, results: allResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
