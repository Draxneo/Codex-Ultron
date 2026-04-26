import { scrape as fc2Scrape, search as fc2Search, interact as fc2Interact, stopInteract as fc2Stop, getKey as fc2Key } from "../_shared/firecrawl-v2.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { lookupCadProperty } from "../_shared/cad-scraper.ts";
import { resolveCad } from "../_shared/tx-county-router.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";

/** Daily kill-switch: hard cap on property lookups per day to prevent runaway cost. */
const DAILY_LOOKUP_CAP = 100;
const DAILY_FIRECRAWL_PROPERTY_CAP = 80;
const DAILY_GOOGLE_PROPERTY_CAP = 250;



const CURRENT_YEAR = new Date().getFullYear();
const ZILLOW_PROFILE = "zillow-property-lookup";

/** Cache is valid as long as it has reasonable data — no expiry */
function isCacheValid(row: Record<string, any>): boolean {
  if (row.bedrooms && row.bedrooms > 10) return false;
  if (row.sqft && row.sqft < 100) return false;
  return true;
}

/** Check if markdown content looks like a CAPTCHA page */
function looksLikeCaptcha(markdown: string): boolean {
  if (!markdown || markdown.length < 500) return true;
  const lower = markdown.toLowerCase();
  return (
    lower.includes("confirm you") ||
    lower.includes("press & hold") ||
    lower.includes("press and hold") ||
    lower.includes("verify you're human") ||
    lower.includes("captcha") ||
    lower.includes("unusual traffic") ||
    lower.includes("are you a robot") ||
    lower.includes("access denied")
  );
}

// shouldRefreshCachedImage removed — trust cache once populated

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

async function countDailyUsage(supabase: any, service: string, functionName: string): Promise<number> {
  const { count, error } = await supabase
    .from("api_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("service", service)
    .eq("function_name", functionName)
    .gte("created_at", startOfTodayIso());

  if (error) {
    console.warn("api usage cap check failed:", error);
    return 0;
  }

  return count ?? 0;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cacheGooglePropertyImage(supabase: any, imageUrl: string | null | undefined, address: string): Promise<string | null> {
  if (!imageUrl || !imageUrl.includes("maps.googleapis.com")) return imageUrl || null;

  try {
    await supabase.storage.createBucket("property-images", { public: true }).catch(() => null);

    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      console.warn("Google property image fetch failed:", resp.status);
      return imageUrl;
    }

    const bytes = await resp.arrayBuffer();
    const path = `street-view/${await sha256Hex(address)}.jpg`;
    const { error } = await supabase.storage
      .from("property-images")
      .upload(path, bytes, {
        contentType: resp.headers.get("content-type") || "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.warn("property image cache upload failed:", error);
      return imageUrl;
    }

    const { data } = supabase.storage.from("property-images").getPublicUrl(path);
    return data?.publicUrl || imageUrl;
  } catch (e) {
    console.warn("property image cache failed:", e);
    return imageUrl;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const address = body?.address;
    const force = body?.force === true;

    if (!address || typeof address !== "string") {
      return new Response(JSON.stringify({ error: "address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabaseAdmin();

    // Check cache first
    const { data: cached } = await supabase
      .from("property_data")
      .select("*")
      .eq("address", address)
      .maybeSingle();

    // Return cache immediately if valid and has meaningful data (permanent cache)
    if (!force && cached && isCacheValid(cached) && (cached.bedrooms || cached.sqft) && cached.street_view_url) {
      console.log("Cache hit (permanent) for:", address);
      if (cached.street_view_url.includes("maps.googleapis.com")) {
        const cachedImageUrl = await cacheGooglePropertyImage(supabase, cached.street_view_url, address);
        if (cachedImageUrl && cachedImageUrl !== cached.street_view_url) {
          cached.street_view_url = cachedImageUrl;
          await supabase
            .from("property_data")
            .update({ street_view_url: cachedImageUrl })
            .eq("address", address);
        }
      }
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: Record<string, any> = { address, source: "firecrawl" };
    if (cached) {
      result = { ...cached, source: cached.source || "firecrawl" };
    }

    // ══════════════════════════════════════════════════════════════════
    // COST GUARDRAIL: hard daily cap on external lookups.
    // Without this, a runaway loop could spend hundreds in Firecrawl/Google.
    // Counts only NEW lookups (not cache hits) within the last 24h.
    // ══════════════════════════════════════════════════════════════════
    const { count: lookupsToday } = await supabase
      .from("property_data")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

    if ((lookupsToday ?? 0) >= DAILY_LOOKUP_CAP) {
      console.warn(`🛑 Daily lookup cap (${DAILY_LOOKUP_CAP}) reached — returning cache only`);
      return new Response(JSON.stringify({ ...result, _capped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    const firecrawlCallsToday = await countDailyUsage(supabase, "firecrawl", "lookup-property");
    const googlePropertyCallsToday = await countDailyUsage(supabase, "google_maps", "lookup-property");
    const canUseFirecrawl = !!firecrawlKey && firecrawlCallsToday < DAILY_FIRECRAWL_PROPERTY_CAP;
    const canUseGooglePropertyImages = googlePropertyCallsToday < DAILY_GOOGLE_PROPERTY_CAP;
    const inCadArea = !!resolveCad(address);

    // When user explicitly forces a refresh AND the address is in CAD area,
    // wipe previously-cached Zillow facts so a CAD failure doesn't silently
    // return stale "estimate" data. Photo + coords are kept (cheap to reuse).
    if (force && inCadArea) {
      result.bedrooms = null;
      result.bathrooms = null;
      result.sqft = null;
      result.year_built = null;
      result.estimated_value = null;
      result.lot_size = null;
      result.property_type = null;
      result.source = "none";
    }

    // ══════════════════════════════════════════════════════════════════
    // STRATEGY 1 (PRIMARY): Texas County Appraisal District
    // Free, authoritative, same source HCP uses. Covers our 6 service-area counties.
    // Returns null for out-of-area addresses → falls through to Zillow.
    //
    // Hard 60s timeout so the CAD scrape can never push the edge function past
    // Supabase's 150s idle limit (we still need budget for Zillow + Street View).
    // ══════════════════════════════════════════════════════════════════
    let cadHit = false;
    if (canUseFirecrawl) {
      logApiUsage(supabase, {
        service: "firecrawl",
        function_name: "lookup-property",
        endpoint: "property_lookup",
        estimated_cost_cents: 1.5,
        metadata: { address },
      });
    }

    if (canUseFirecrawl && inCadArea) {
      try {
        const cadData = await Promise.race([
          lookupCadProperty(address, firecrawlKey!),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              console.warn("🗺️ CAD: hard timeout (60s) — abandoning");
              resolve(null);
            }, 60_000),
          ),
        ]);
        if (cadData && (cadData.sqft || cadData.bedrooms || cadData.estimated_value)) {
          // CAD wins for facts — overwrite anything Zillow may have cached previously
          if (cadData.bedrooms != null) result.bedrooms = cadData.bedrooms;
          if (cadData.bathrooms != null) result.bathrooms = cadData.bathrooms;
          if (cadData.sqft != null) result.sqft = cadData.sqft;
          if (cadData.year_built != null) result.year_built = cadData.year_built;
          if (cadData.estimated_value != null) result.estimated_value = cadData.estimated_value;
          if (cadData.lot_size) result.lot_size = cadData.lot_size;
          if (cadData.property_type) result.property_type = cadData.property_type;
          result.source = cadData.source; // e.g. "Guadalupe CAD"
          cadHit = true;
        }
      } catch (e) {
        console.error("CAD strategy error:", e);
      }
    }

    if (canUseFirecrawl) {
      // ══════════════════════════════════════════════════════════════════
      // STRATEGY 2: Zillow — primarily for the photo + listing link.
      // If CAD missed (out-of-area or new construction), Zillow also fills facts.
      // ══════════════════════════════════════════════════════════════════
      const needsFacts = !cadHit && !result.bedrooms && !result.sqft;
      const needsPhoto = !result.screenshot_url;
      if (needsFacts || needsPhoto) {
        const zillowData = await scrapeZillowV2(firecrawlKey!, address, supabase);
        if (zillowData) {
          for (const [k, v] of Object.entries(zillowData)) {
            if (v == null) continue;
            // Always accept Zillow's photo and link
            if (k === "screenshot_url" || k === "zillow_url") {
              result[k] = v;
              continue;
            }
            // For facts: only accept if CAD didn't already provide them
            if (!cadHit && result[k] == null) result[k] = v;
          }
        }
      }

      // ── Strategy 3: Redfin fallback (only if still missing facts) ──
      if (!cadHit && (!result.bedrooms && !result.sqft)) {
        const redfinData = await scrapeViaSearch(firecrawlKey!, address, "redfin.com", supabase);
        if (redfinData) {
          for (const [k, v] of Object.entries(redfinData)) {
            if (v != null && (result[k] == null || k === "screenshot_url")) result[k] = v;
          }
          if (!result.source || result.source === "firecrawl") result.source = "redfin";
        }
      }

      // ── Strategy 4: Realtor.com fallback ──
      if (!cadHit && (!result.bedrooms && !result.sqft)) {
        const realtorData = await scrapeViaSearch(firecrawlKey!, address, "realtor.com", supabase);
        if (realtorData) {
          for (const [k, v] of Object.entries(realtorData)) {
            if (v != null && (result[k] == null || k === "screenshot_url")) result[k] = v;
          }
          if (!result.source || result.source === "firecrawl") result.source = "realtor";
        }
      }
    } else if (firecrawlKey) {
      console.warn(`Firecrawl property daily cap (${DAILY_FIRECRAWL_PROPERTY_CAP}) reached; returning cached/Google-only data for ${address}`);
    }

    // ── Fallback: RealtyMole API ──
    if (!result.bedrooms && !result.sqft) {
      const realtyMoleKey = Deno.env.get("REALTYMOLE_API_KEY");
      if (realtyMoleKey) {
        try {
          const encoded = encodeURIComponent(address);
          const res = await fetch(
            `https://realty-mole-property-api.p.rapidapi.com/properties?address=${encoded}`,
            {
              headers: {
                "X-RapidAPI-Key": realtyMoleKey,
                "X-RapidAPI-Host": "realty-mole-property-api.p.rapidapi.com",
              },
            }
          );
          if (res.ok) {
            const data = await res.json();
            const prop = Array.isArray(data) ? data[0] : data;
            if (prop) {
              result.bedrooms = prop.bedrooms ?? result.bedrooms;
              result.bathrooms = prop.bathrooms ?? result.bathrooms;
              result.sqft = prop.squareFootage ?? result.sqft;
              result.year_built = prop.yearBuilt ?? result.year_built;
              result.estimated_value = prop.price ?? prop.assessorMarketValue ?? result.estimated_value;
              result.lot_size = prop.lotSize ? `${prop.lotSize} sqft` : result.lot_size;
              result.property_type = prop.propertyType ?? result.property_type;
              result.lat = prop.latitude ?? result.lat;
              result.lng = prop.longitude ?? result.lng;
              result.source = "realtymole";
            }
          }
        } catch (e) {
          console.error("RealtyMole error:", e);
        }
      }
    }

    // ── Always fetch Google Street View (primary navigation image) ──
    {
      const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (googleKey && canUseGooglePropertyImages) {
        try {
          const getStreetViewMeta = async (location: string, radius?: number) => {
            const params = new URLSearchParams({
              location,
              key: googleKey,
              source: "outdoor",
            });
            if (radius) params.set("radius", String(radius));
            const metaRes = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`);
            logApiUsage(supabase, {
              service: "google_maps",
              function_name: "lookup-property",
              endpoint: "streetview_metadata",
              estimated_cost_cents: 0.7,
              metadata: { address, radius: radius ?? null },
            });
            return await metaRes.json();
          };

          // Always geocode FIRST so we have property lat/lng for heading calc.
          // Without this, heading defaults to 0° (north) and the camera points
          // down the street instead of at the house.
          if (!result.lat || !result.lng) {
            try {
              const geoRes = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`
              );
              logApiUsage(supabase, {
                service: "google_maps",
                function_name: "lookup-property",
                endpoint: "geocode",
                estimated_cost_cents: 0.5,
                metadata: { address },
              });
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                const loc = geoData?.results?.[0]?.geometry?.location;
                if (loc) {
                  result.lat = loc.lat;
                  result.lng = loc.lng;
                  console.log(`📍 Geocoded property: ${loc.lat},${loc.lng}`);
                }
              }
            } catch (e) {
              console.error("Geocode error:", e);
            }
          }

          // Look up Street View pano BY lat/lng (more accurate than address string)
          let meta: any = { status: "ZERO_RESULTS" };
          if (result.lat && result.lng) {
            const latLng = `${result.lat},${result.lng}`;
            for (const radius of [50, 100, 200, 500]) {
              meta = await getStreetViewMeta(latLng, radius);
              console.log(`🛣️ Street View metadata (latLng radius=${radius}): status=${meta.status}${meta.status === "OK" ? ` pano=${meta.pano_id?.slice(0,12)}` : ""}`);
              if (meta.status === "OK") break;
            }
          } else {
            // No coords — fall back to address string lookup
            meta = await getStreetViewMeta(address);
            console.log(`🛣️ Street View metadata (address fallback): status=${meta.status}`);
          }

          if (meta.status === "OK") {
            const streetParams = new URLSearchParams({
              size: "800x400",
              key: googleKey,
              source: "outdoor",
            });

            if (meta.pano_id) {
              streetParams.set("pano", meta.pano_id);
            } else if (meta.location?.lat && meta.location?.lng) {
              streetParams.set("location", `${meta.location.lat},${meta.location.lng}`);
            } else {
              streetParams.set("location", address);
            }

            // Calculate heading from panorama toward the property
            if (meta.location?.lat && meta.location?.lng && result.lat && result.lng) {
              const panoLat = meta.location.lat * Math.PI / 180;
              const panoLng = meta.location.lng * Math.PI / 180;
              const propLat = result.lat * Math.PI / 180;
              const propLng = result.lng * Math.PI / 180;
              const dLng = propLng - panoLng;
              const y = Math.sin(dLng) * Math.cos(propLat);
              const x = Math.cos(panoLat) * Math.sin(propLat) - Math.sin(panoLat) * Math.cos(propLat) * Math.cos(dLng);
              const heading = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
              streetParams.set("heading", String(Math.round(heading)));
              console.log(`📐 Heading from pano toward property: ${Math.round(heading)}°`);
            }
            streetParams.set("pitch", "10");
            streetParams.set("fov", "80");

            result.street_view_url = `https://maps.googleapis.com/maps/api/streetview?${streetParams.toString()}`;
          } else if (result.lat && result.lng) {
            // No Street View coverage — use satellite fallback
            console.log("🛰️ No Street View coverage, using satellite fallback");
            const satParams = new URLSearchParams({
              center: `${result.lat},${result.lng}`,
              zoom: "19",
              size: "800x400",
              maptype: "satellite",
              key: googleKey,
            });
            result.street_view_url = `https://maps.googleapis.com/maps/api/staticmap?${satParams.toString()}`;
          }
        } catch (e) {
          console.error("Street View error:", e);
        }

        if (!result.street_view_url) {
          const fallbackParams = new URLSearchParams({
            size: "800x400",
            key: googleKey,
          });

          if (result.lat && result.lng) {
            fallbackParams.set("location", `${result.lat},${result.lng}`);
          } else {
            fallbackParams.set("location", address);
          }

          fallbackParams.set("source", "outdoor");
          fallbackParams.set("pitch", "10");
          fallbackParams.set("fov", "80");
          result.street_view_url = `https://maps.googleapis.com/maps/api/streetview?${fallbackParams.toString()}`;
        }
      } else if (googleKey) {
        console.warn(`Google property image daily cap (${DAILY_GOOGLE_PROPERTY_CAP}) reached; skipping fresh property image for ${address}`);
      }
    }

    // ── Geocode fallback ──
    if (!result.lat || !result.lng) {
      const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (googleKey && canUseGooglePropertyImages) {
        try {
          const geoRes = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`
          );
          logApiUsage(supabase, {
            service: "google_maps",
            function_name: "lookup-property",
            endpoint: "geocode",
            estimated_cost_cents: 0.5,
            metadata: { address },
          });
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const loc = geoData?.results?.[0]?.geometry?.location;
            if (loc) {
              result.lat = loc.lat;
              result.lng = loc.lng;
            }
          }
        } catch (e) {
          console.error("Geocode error:", e);
        }
      }
    }

    // ── Cache — never overwrite good data with nulls ──
    result.street_view_url = await cacheGooglePropertyImage(supabase, result.street_view_url, address);

    const upsertPayload: Record<string, any> = {
      address: result.address,
      bedrooms: result.bedrooms ?? cached?.bedrooms ?? null,
      bathrooms: result.bathrooms ?? cached?.bathrooms ?? null,
      sqft: result.sqft ?? cached?.sqft ?? null,
      year_built: result.year_built ?? cached?.year_built ?? null,
      estimated_value: result.estimated_value ?? cached?.estimated_value ?? null,
      lot_size: result.lot_size ?? cached?.lot_size ?? null,
      property_type: result.property_type ?? cached?.property_type ?? null,
      lat: result.lat ?? cached?.lat ?? null,
      lng: result.lng ?? cached?.lng ?? null,
      source: result.source ?? cached?.source ?? "none",
      screenshot_url: result.screenshot_url ?? cached?.screenshot_url ?? null,
      street_view_url: result.street_view_url ?? cached?.street_view_url ?? null,
      zillow_url: result.zillow_url ?? cached?.zillow_url ?? null,
      fetched_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from("property_data")
      .upsert(upsertPayload, { onConflict: "address" })
      .select()
      .single();

    if (upsertErr) console.error("Cache error:", upsertErr);

    return new Response(
      JSON.stringify({ ...(upserted || result), street_view_url: result.street_view_url ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("lookup-property error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ══════════════════════════════════════════════════════════
   Zillow v2 Scrape — uses shared helpers
   ══════════════════════════════════════════════════════════ */

async function scrapeZillowV2(
  apiKey: string,
  address: string,
  supabase: any
): Promise<Record<string, any> | null> {
  try {
    // Step 1: Search for Zillow URL using shared helper
    console.log("🔍 Searching Zillow for:", address);
    const searchResult = await fc2Search(
      `${address} site:zillow.com`,
      { limit: 3 },
      apiKey
    );

    if (!searchResult.success || searchResult.results.length === 0) {
      console.log("Zillow search failed or no results");
      return null;
    }

    const results = searchResult.results;
    console.log("Search returned", results.length, "results");

    // Find the best Zillow URL
    let zillowUrl: string | null = null;
    for (const r of results) {
      if (r.url?.includes("zillow.com/homedetails")) {
        zillowUrl = r.url;
        break;
      }
    }
    if (!zillowUrl) {
      for (const r of results) {
        if (r.url?.includes("zillow.com")) {
          zillowUrl = r.url;
          break;
        }
      }
    }

    if (!zillowUrl) {
      console.log("No Zillow URL found in search results");
      // Try parsing search snippet data
      const parsed: Record<string, any> = {};
      const r0 = results[0];
      if (r0?.title) Object.assign(parsed, pickDefined(parsePropertyFromText(r0.title)));
      if (r0?.description) {
        for (const [k, v] of Object.entries(parsePropertyFromText(r0.description))) {
          if (v != null && parsed[k] == null) parsed[k] = v;
        }
      }
      return Object.keys(parsed).length > 0 ? parsed : null;
    }

    console.log("🏠 Zillow URL:", zillowUrl);
    const result: Record<string, any> = { zillow_url: zillowUrl };

    // Step 2: Scrape Zillow with shared helper + profile
    console.log("📸 Scraping Zillow with v2 shared helper...");
    const scrapeResult = await fc2Scrape(zillowUrl, {
      formats: ["markdown", "screenshot"],
      waitFor: 3000,
      profile: { name: ZILLOW_PROFILE, saveChanges: true },
    }, apiKey);

    if (!scrapeResult.success) {
      console.error("Zillow scrape failed");
      return result;
    }

    const markdown = scrapeResult.markdown;
    const scrapeId = scrapeResult.scrapeId;
    console.log("Scrape OK, markdown:", markdown.length, "chars, scrapeId:", scrapeId);

    // Check for CAPTCHA
    if (looksLikeCaptcha(markdown)) {
      console.log("🤖 CAPTCHA detected! Attempting bypass via /interact...");
      if (scrapeId) {
        const interactResult = await bypassCaptchaAndExtract(apiKey, scrapeId, address, supabase);
        if (interactResult) {
          Object.assign(result, interactResult);
          result.source = "zillow";
          return result;
        }
      }
      // CAPTCHA couldn't be bypassed — DON'T save the CAPTCHA screenshot
      console.log("⚠️ CAPTCHA bypass failed, skipping Zillow screenshot");
      return result;
    }

    // No CAPTCHA — parse the content
    if (markdown) {
      const parsed = parsePropertyFromText(markdown);
      Object.assign(result, pickDefined(parsed));
    }

    // Extract images — ONLY from non-CAPTCHA pages
    await extractImages(scrapeResult.raw?.data || scrapeResult.raw || {}, result, supabase);

    result.source = "zillow";
    return result;
  } catch (e) {
    console.error("scrapeZillowV2 error:", e);
    return null;
  }
}

/* ── CAPTCHA bypass via Firecrawl Interact ── */

async function bypassCaptchaAndExtract(
  apiKey: string,
  scrapeId: string,
  address: string,
  supabase: any
): Promise<Record<string, any> | null> {
  try {
    // Step 1: Solve CAPTCHA
    console.log("🔓 Attempting CAPTCHA solve via interact prompt...");
    const solveResult = await fc2Interact(scrapeId, {
      prompt: "There is a CAPTCHA or verification challenge on this page. Press and hold the button to verify you're human. Wait for the page to load after verification.",
      timeout: 30,
    }, apiKey);

    if (!solveResult.success) {
      console.error("CAPTCHA solve failed");
      await fc2Stop(scrapeId, apiKey);
      return null;
    }
    console.log("CAPTCHA solve response:", solveResult.output?.slice(0, 100));

    // Step 2: Extract property data via interact
    console.log("📊 Extracting property data after CAPTCHA...");
    const extractResult = await fc2Interact(scrapeId, {
      prompt: `Extract property details from this Zillow page for the address "${address}". Return JSON with: bedrooms (number), bathrooms (number), sqft (number), year_built (number), estimated_value (number in dollars), lot_size (string), property_type (string). Also return the main property photo URL if visible.`,
      timeout: 30,
    }, apiKey);

    const result: Record<string, any> = {};
    if (extractResult.success && extractResult.output) {
      console.log("Extract output:", extractResult.output.slice(0, 300));
      const parsed = parseAIPropertyOutput(extractResult.output);
      Object.assign(result, pickDefined(parsed));
    }

    // Step 3: Extract property image via code (more reliable than screenshot)
    console.log("📷 Extracting property image...");
    const imgResult = await fc2Interact(scrapeId, {
      code: `
        const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
        const heroImg = document.querySelector('picture img, [data-testid="hero-image"] img, .media-stream-tile img');
        const imgUrl = ogImage || heroImg?.src || null;
        const pageTitle = document.title;
        JSON.stringify({ imgUrl, pageTitle });
      `,
      language: "node",
      timeout: 15,
    }, apiKey);

    if (imgResult.success && imgResult.result) {
      try {
        const parsed = JSON.parse(imgResult.result);
        const titleLower = (parsed.pageTitle || "").toLowerCase();
        const addressNumber = address.trim().split(/\s+/)[0]; // e.g. "2810"
        const isBadPage = titleLower.includes("captcha") || titleLower.includes("access denied") || titleLower.includes("map") || (addressNumber && !titleLower.includes(addressNumber));
        const imgLower = (parsed.imgUrl || "").toLowerCase();
        const isMapImg = imgLower.includes("staticmap") || imgLower.includes("maps.") || imgLower.includes("satellite") || imgLower.includes("aerial") || imgLower.includes("/map");
        // Verify this isn't a CAPTCHA/map page
        if (!isBadPage && !isMapImg) {
          if (parsed.imgUrl && parsed.imgUrl.startsWith("http")) {
            console.log("Found property image:", parsed.imgUrl.slice(0, 80));
            const saved = await saveImageToStorage(supabase, parsed.imgUrl);
            if (saved) result.screenshot_url = saved;
          }
        } else {
          console.log("⚠️ Page still looks like CAPTCHA, skipping image save");
        }
      } catch {
        console.log("Could not parse image extraction result");
      }
    }

    // Cleanup
    await fc2Stop(scrapeId, apiKey);

    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    console.error("bypassCaptchaAndExtract error:", e);
    await fc2Stop(scrapeId, apiKey).catch(() => {});
    return null;
  }
}

/* ── Parse AI natural language output for property data ── */
function parseAIPropertyOutput(output: string): Record<string, any> {
  const result: Record<string, any> = {};

  const jsonMatch = output.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const j = JSON.parse(jsonMatch[0]);
      if (j.bedrooms && j.bedrooms > 0 && j.bedrooms < 20) result.bedrooms = j.bedrooms;
      if (j.bathrooms && j.bathrooms > 0 && j.bathrooms < 20) result.bathrooms = j.bathrooms;
      if (j.sqft && j.sqft >= 500 && j.sqft <= 50000) result.sqft = j.sqft;
      if (j.year_built && j.year_built >= 1800 && j.year_built <= CURRENT_YEAR) result.year_built = j.year_built;
      if (j.estimated_value && j.estimated_value >= 25000) result.estimated_value = j.estimated_value;
      if (j.lot_size) result.lot_size = j.lot_size;
      if (j.property_type) result.property_type = j.property_type;
      return result;
    } catch {
      // Fall through to text parsing
    }
  }

  return parsePropertyFromText(output);
}

/* ══════════════════════════════════════════════════════════
   Generic site scraper via search (Redfin, Realtor, etc.)
   — uses shared helpers
   ══════════════════════════════════════════════════════════ */

async function scrapeViaSearch(
  apiKey: string,
  address: string,
  siteDomain: string,
  supabase: any
): Promise<Record<string, any> | null> {
  try {
    console.log(`🔍 Searching ${siteDomain} for:`, address);
    const searchResult = await fc2Search(
      `${address} site:${siteDomain}`,
      { limit: 3 },
      apiKey
    );

    if (!searchResult.success || searchResult.results.length === 0) return null;

    const results = searchResult.results;
    const result: Record<string, any> = {};

    // Parse search snippets
    const r0 = results[0];
    if (r0?.title) Object.assign(result, pickDefined(parsePropertyFromText(r0.title)));
    if (r0?.description) {
      for (const [k, v] of Object.entries(parsePropertyFromText(r0.description))) {
        if (v != null && result[k] == null) result[k] = v;
      }
    }

    // Find a listing URL
    let listingUrl: string | null = null;
    for (const r of results) {
      const url = r.url || "";
      if (url.includes(siteDomain) && !url.includes("/blog/") && !url.includes("/news/")) {
        listingUrl = url;
        break;
      }
    }

    if (listingUrl) {
      console.log(`📸 Scraping ${siteDomain}:`, listingUrl);
      const scrapeResult = await fc2Scrape(listingUrl, {
        formats: ["markdown", "screenshot"],
        waitFor: 3000,
      }, apiKey);

      if (scrapeResult.success) {
        const markdown = scrapeResult.markdown;

        // Only parse if it's NOT a captcha page
        if (markdown && !looksLikeCaptcha(markdown)) {
          const parsed = parsePropertyFromText(markdown);
          for (const [k, v] of Object.entries(parsed)) {
            if (v != null && result[k] == null) result[k] = v;
          }
          // Only save images from non-CAPTCHA pages
          await extractImages(scrapeResult.raw?.data || scrapeResult.raw || {}, result, supabase);
        } else {
          console.log(`⚠️ ${siteDomain} returned CAPTCHA-like content, skipping`);
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (e) {
    console.error(`scrapeViaSearch(${siteDomain}) error:`, e);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   Image extraction waterfall — CAPTCHA-safe
   ══════════════════════════════════════════════════════════ */

async function extractImages(
  data: Record<string, any>,
  result: Record<string, any>,
  supabase: any
) {
  const metadata = data.metadata || {};
  const screenshot = data.screenshot || null;
  const markdown = data.markdown || "";

  // Priority 1: og:image
  const ogImage = metadata?.ogImage || metadata?.["og:image"] || metadata?.image;
  if (ogImage && typeof ogImage === "string" && ogImage.startsWith("http")) {
    const ogLower = ogImage.toLowerCase();
    const isMapImage = ogLower.includes("staticmap") || ogLower.includes("maps.") || ogLower.includes("satellite") || ogLower.includes("aerial") || ogLower.includes("/map");
    if (isMapImage) {
      console.log("⚠️ Skipping map/satellite og:image:", ogImage.slice(0, 80));
    } else if (!ogImage.includes("/logo") && !ogImage.includes("/favicon") && !ogImage.includes("captcha")) {
      console.log("Found og:image:", ogImage.slice(0, 80));
      const saved = await saveImageToStorage(supabase, ogImage);
      if (saved) result.screenshot_url = saved;
    }
  }

  // Priority 2: Firecrawl screenshot (URL or base64) — only if page wasn't CAPTCHA
  if (!result.screenshot_url && screenshot) {
    // Double-check: don't save if the page markdown was CAPTCHA-like
    if (markdown && looksLikeCaptcha(markdown)) {
      console.log("⚠️ Skipping screenshot save — page content looks like CAPTCHA");
      return;
    }
    try {
      if (typeof screenshot === "string" && screenshot.startsWith("http")) {
        const saved = await saveImageToStorage(supabase, screenshot);
        if (saved) result.screenshot_url = saved;
      } else if (typeof screenshot === "string") {
        const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, "");
        if (/^[A-Za-z0-9+/=]+$/.test(base64Data.slice(0, 100))) {
          const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
          const fileName = `${crypto.randomUUID()}.png`;
          const { error: uploadErr } = await supabase.storage
            .from("property-screenshots")
            .upload(fileName, imgBytes, { contentType: "image/png" });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from("property-screenshots")
              .getPublicUrl(fileName);
            result.screenshot_url = urlData.publicUrl;
          }
        }
      }
    } catch (ssErr) {
      console.error("Screenshot save failed:", ssErr);
    }
  }

  // Priority 3: First image from markdown
  if (!result.screenshot_url && markdown && !looksLikeCaptcha(markdown)) {
    const imgMatch = markdown.match(/!\[.*?\]\((https:\/\/[^\s)]+(?:\.jpg|\.jpeg|\.png|\.webp)[^\s)]*)\)/i);
    if (imgMatch) {
      const saved = await saveImageToStorage(supabase, imgMatch[1]);
      if (saved) result.screenshot_url = saved;
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

async function saveImageToStorage(supabase: any, imageUrl: string): Promise<string | null> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const contentType = (imgRes.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("text/html") || (contentType && !contentType.startsWith("image/"))) {
      console.log("Skipping non-image response while saving property image:", contentType || "unknown");
      await imgRes.arrayBuffer();
      return null;
    }
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
    if (imgBytes.length < 1000) return null;
    const ext = imageUrl.includes(".png") ? "png" : "jpg";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("property-screenshots")
      .upload(fileName, imgBytes, { contentType: `image/${ext === "png" ? "png" : "jpeg"}` });
    if (uploadErr) return null;
    const { data: urlData } = supabase.storage
      .from("property-screenshots")
      .getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch {
    return null;
  }
}

function pickDefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null) out[k] = v;
  }
  return out;
}

function parsePropertyFromText(text: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Fact strip: "4 bd | 2 ba | 1,800 sqft"
  const factStrip = text.match(/\b(\d{1,2})\s*(?:bd|beds?)\s*[|/·,]\s*([\d.]+)\s*(?:ba|baths?)\s*[|/·,]\s*([\d,]+)\s*(?:sqft|sq\.?\s*ft)/i);
  if (factStrip) {
    const beds = parseInt(factStrip[1]);
    const baths = parseFloat(factStrip[2]);
    const sqft = parseInt(factStrip[3].replace(/,/g, ""));
    if (beds > 0 && beds < 20) result.bedrooms = beds;
    if (baths > 0 && baths < 20) result.bathrooms = baths;
    if (sqft >= 500 && sqft <= 50000) result.sqft = sqft;
  }

  // Zestimate or Redfin Estimate
  const valueMatch = text.match(/(?:Zestimate[®]?\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(K|M)?|\$\s*([\d,]+(?:\.\d+)?)\s*(K|M)?\s*(?:Zestimate|estimate|Redfin\s*Estimate))/i);
  if (valueMatch) {
    const raw = valueMatch[1] || valueMatch[3];
    const suffix = valueMatch[2] || valueMatch[4];
    if (raw) {
      let val = parseFloat(raw.replace(/,/g, ""));
      if (suffix?.toUpperCase() === "K") val *= 1000;
      if (suffix?.toUpperCase() === "M") val *= 1000000;
      if (val >= 25000) result.estimated_value = val;
    }
  }

  if (!result.estimated_value) {
    const homeValMatch = text.match(/(?:home\s*value|estimated\s*value|est\.?\s*value|price|list\s*price)\s*:?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(K|M)?/i);
    if (homeValMatch) {
      let val = parseFloat(homeValMatch[1].replace(/,/g, ""));
      if (homeValMatch[2]?.toUpperCase() === "K") val *= 1000;
      if (homeValMatch[2]?.toUpperCase() === "M") val *= 1000000;
      if (val >= 25000) result.estimated_value = val;
    }
  }

  if (!result.bedrooms) {
    const bedMatch = text.match(/\b(\d{1,2})\s*(?:bd|beds?|bedrooms?|BR)\b/i);
    if (bedMatch) {
      const val = parseInt(bedMatch[1]);
      if (val > 0 && val < 20) result.bedrooms = val;
    }
  }

  if (!result.bathrooms) {
    const bathMatch = text.match(/\b([\d.]+)\s*(?:ba|baths?|bathrooms?)\b/i);
    if (bathMatch) {
      const val = parseFloat(bathMatch[1]);
      if (val > 0 && val < 20) result.bathrooms = val;
    }
  }

  if (!result.sqft) {
    const sqftMatch = text.match(/\b([\d,]+)\s*(?:sqft|sq\.?\s*ft|square\s*feet)\b/i);
    if (sqftMatch) {
      const val = parseInt(sqftMatch[1].replace(/,/g, ""));
      if (val >= 500 && val <= 50000) result.sqft = val;
    }
  }

  const yearMatch = text.match(/(?:built\s*(?:in\s*)?|year\s*built\s*:?\s*)(\d{4})/i);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1]);
    if (yr >= 1800 && yr <= CURRENT_YEAR) result.year_built = yr;
  }

  if (!result.estimated_value) {
    const allDollar = [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(K|k|M|m)?/g)];
    for (const m of allDollar) {
      let val = parseFloat(m[1].replace(/,/g, ""));
      if (m[2]?.toUpperCase() === "K") val *= 1000;
      if (m[2]?.toUpperCase() === "M") val *= 1000000;
      if (val >= 25000) {
        result.estimated_value = val;
        break;
      }
    }
  }

  const lotMatch = text.match(/\b([\d,.]+)\s*(?:acres?|sqft\s*lot)\b/i);
  if (lotMatch) result.lot_size = lotMatch[0].trim();

  const typeMatch = text.match(/(?:property\s*type|home\s*type|style)\s*:?\s*([\w\s]+?)(?:\n|$|,)/i);
  if (typeMatch) result.property_type = typeMatch[1].trim();

  return result;
}
