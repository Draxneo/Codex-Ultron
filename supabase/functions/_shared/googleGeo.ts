import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared Google Maps geocoding & directions helpers for edge functions.
 * Uses GOOGLE_MAPS_API_KEY secret from Supabase.
 * Both geocoding and directions results are cached in DB tables.
 */

import { logApiUsage } from "./apiUsageLog.ts";

function getApiKey(): string {
  return Deno.env.get("GOOGLE_MAPS_API_KEY") || "";
}

let _sb: any = null;
function getSupabase(): any {
  if (!_sb) {
    _sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _sb;
}

/** Generate a 32-char hex hash for cache keys (truncated SHA-256 to match legacy MD5 length) */
async function hashKey(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Truncate to 16 bytes (32 hex chars) to match existing MD5-length hashes in DB
  return hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Geocoding (cached in geocode_cache table) ──

/** Check geocode_cache table first, only call Google if miss */
async function getCachedGeocode(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  const sb = getSupabase();

  // Check cache
  const { data } = await sb
    .from("geocode_cache")
    .select("lat, lng, formatted_address")
    .eq("address_input", address.trim())
    .limit(1)
    .maybeSingle() as { data: any };

  if (data) {
    return {
      lat: data.lat,
      lng: data.lng,
      formattedAddress: data.formatted_address || address,
    };
  }

  // Cache miss — call Google
  const key = getApiKey();
  if (!key) { console.error("GOOGLE_MAPS_API_KEY not set"); return null; }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const json = await resp.json();
  const result = json.results?.[0];
  if (!result) return null;

  // Log geocode API usage (0.5 cents per call). Await this so short edge
  // function invocations do not finish before the cost row is written.
  await logApiUsage(sb, { service: "google_maps", function_name: "googleGeo", endpoint: "geocode", estimated_cost_cents: 0.5 });

  const lat = result.geometry.location.lat;
  const lng = result.geometry.location.lng;
  const formattedAddress = result.formatted_address;

  // Store in cache (fire-and-forget)
  sb.from("geocode_cache")
    .upsert(
      { address_input: address.trim(), lat, lng, formatted_address: formattedAddress, source: "google" },
      { onConflict: "address_hash" }
    )
    .then(({ error }: { error: any }) => { if (error) console.error("geocode_cache insert error:", error); });

  return { lat, lng, formattedAddress };
}

/** Geocode an address via Google Geocoding API (with DB cache) */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  return getCachedGeocode(address);
}

/** Geocode with lat/lng tuple return for backward compat */
export async function geocodeToCoords(
  address: string
): Promise<[number, number] | null> {
  const result = await getCachedGeocode(address);
  if (!result) return null;
  return [result.lng, result.lat];
}

// ── Directions (cached in directions_cache table, 7-day TTL) ──

const DIRECTIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Get driving directions between two coordinate pairs (with DB cache) */
export async function getDirections(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  departureTime?: string
): Promise<{ duration: number; durationInTraffic: number; distance: number } | null> {
  const sb = getSupabase();

  // route_hash is a DB-GENERATED column (md5 of rounded coords) — we cannot insert it
  // and our SHA-256 hash never matched it, causing 100% cache misses (264 calls/hr from cron).
  // Fix: look up by rounded coords directly, let DB generate the hash on insert.
  const oLat = Number(fromLat).toFixed(3);
  const oLng = Number(fromLng).toFixed(3);
  const dLat = Number(toLat).toFixed(3);
  const dLng = Number(toLng).toFixed(3);

  // Check cache (only use if < 7 days old)
  try {
    const { data } = await sb
      .from("directions_cache")
      .select("duration_seconds, distance_meters, duration_in_traffic_seconds, created_at")
      .eq("origin_lat", oLat)
      .eq("origin_lng", oLng)
      .eq("dest_lat", dLat)
      .eq("dest_lng", dLng)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const age = Date.now() - new Date(data.created_at).getTime();
      if (age < DIRECTIONS_TTL_MS) {
        return {
          duration: data.duration_seconds,
          durationInTraffic: data.duration_in_traffic_seconds || data.duration_seconds,
          distance: data.distance_meters,
        };
      }
    }
  } catch {
    // Cache read failed, fall through to Google
  }

  // Cache miss or expired — call Google
  const key = getApiKey();
  if (!key) return null;

  // NOTE: We intentionally OMIT &departure_time=now to (a) halve cost from $10/1k → $5/1k
  // and (b) make responses cacheable. Only include departure_time when caller explicitly passes one.
  let url = `https://maps.googleapis.com/maps/api/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&key=${key}`;
  if (departureTime) {
    url += `&departure_time=${Math.floor(new Date(departureTime).getTime() / 1000)}`;
  }

  const resp = await fetch(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const leg = data.routes?.[0]?.legs?.[0];
  if (!leg) return null;

  const duration = leg.duration?.value || 0;
  const durationInTraffic = leg.duration_in_traffic?.value || duration;
  const distance = leg.distance?.value || 0;

  // Log directions API usage (0.5 cent per call now that departure_time=now is removed).
  await logApiUsage(sb, { service: "google_maps", function_name: "googleGeo", endpoint: "directions", estimated_cost_cents: 0.5 });

  // Store in cache (fire-and-forget). DO NOT include route_hash — it's a generated column.
  // DB will compute it from md5(round coords) on insert. Use upsert on route_hash to dedupe.
  sb.from("directions_cache")
    .upsert(
      {
        origin_lat: Number(oLat),
        origin_lng: Number(oLng),
        dest_lat: Number(dLat),
        dest_lng: Number(dLng),
        duration_seconds: duration,
        distance_meters: distance,
        duration_in_traffic_seconds: durationInTraffic,
      },
      { onConflict: "route_hash" }
    )
    .then(({ error }: { error: any }) => { if (error) console.error("directions_cache insert error:", error); });

  return { duration, durationInTraffic, distance };
}

// ── Address verification ──

/** Verify an address with proximity bias to San Antonio */
export async function verifyAddressGoogle(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<{
  standardized: string;
  confidence: number;
  lat: number;
  lng: number;
  street: string;
  city: string;
  state: string;
  zip: string;
} | null> {
  const query = [address, city, state, zip].filter(Boolean).join(", ");
  if (!query || query.length < 5) return null;

  // Try cache first — and SHORT-CIRCUIT if we have it. Previously we always fell through
  // to a fresh Google call, defeating the cache entirely on every verifyAddressGoogle call.
  const cached = await getCachedGeocode(query);
  if (cached) {
    return {
      standardized: cached.formattedAddress || query,
      confidence: 0.95,
      lat: cached.lat,
      lng: cached.lng,
      street: address,
      city: city || "",
      state: state || "",
      zip: zip || "",
    };
  }

  const key = getApiKey();
  if (!key) return null;

  try {
    // Bias toward San Antonio area
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}&bounds=29.2,-98.8|29.7,-98.2`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result) return null;

    const components = result.address_components || [];
    const getComponent = (type: string) =>
      components.find((c: any) => c.types?.includes(type))?.long_name || "";
    const getShort = (type: string) =>
      components.find((c: any) => c.types?.includes(type))?.short_name || "";

    const streetNumber = getComponent("street_number");
    const route = getComponent("route");
    const parsedStreet = [streetNumber, route].filter(Boolean).join(" ") || address;
    const parsedCity = getComponent("locality") || getComponent("sublocality") || city || "";
    const parsedState = getShort("administrative_area_level_1") || state || "";
    const parsedZip = getComponent("postal_code") || zip || "";

    const locType = result.geometry?.location_type || "";
    const confidence = locType === "ROOFTOP" ? 0.99
      : locType === "RANGE_INTERPOLATED" ? 0.85
      : locType === "GEOMETRIC_CENTER" ? 0.7
      : 0.5;

    const lat = result.geometry.location.lat;
    const lng = result.geometry.location.lng;

    // Cache the result
    const sb = getSupabase();
    sb.from("geocode_cache")
      .upsert(
        { address_input: query, lat, lng, formatted_address: result.formatted_address, source: "google" },
        { onConflict: "address_hash" }
      )
      .then(({ error }: { error: any }) => { if (error) console.error("geocode_cache insert error:", error); });

    return {
      standardized: result.formatted_address || query,
      confidence,
      lat,
      lng,
      street: parsedStreet,
      city: parsedCity,
      state: parsedState,
      zip: parsedZip,
    };
  } catch (e) {
    console.error("Google geocoding error:", e);
    return null;
  }
}
