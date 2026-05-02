/// <reference types="google.maps" />
/**
 * ONE SOURCE OF TRUTH for Google Maps configuration.
 * Every file that needs Google Maps must import from here.
 * Geocoding results are cached in the DB geocode_cache table.
 */

import { supabase } from "@/integrations/supabase/client";

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";


let _loadPromise: Promise<void> | null = null;

/** Load Google Maps API via script tag (cached after first load) */
export async function loadGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key is not configured");
  }

  if (typeof google !== "undefined" && google.maps) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof google !== "undefined" && google.maps) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry,marker&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return _loadPromise;
}

// ── In-memory + DB geocode cache ──

const _memCache = new Map<string, { lat: number; lng: number }>();

/** Simple hash for cache lookup */
function normalizeAddr(addr: string): string {
  return addr.trim().toLowerCase();
}

/** Check DB geocode_cache, then Google API, then store result */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!address) return null;
  const key = normalizeAddr(address);

  // 1. Memory cache
  if (_memCache.has(key)) return _memCache.get(key)!;

  // 2. DB cache
  try {
    const { data } = await supabase
      .from("geocode_cache")
      .select("lat, lng")
      .eq("address_input", address.trim())
      .limit(1)
      .maybeSingle();

    if (data) {
      const result = { lat: data.lat, lng: data.lng };
      _memCache.set(key, result);
      return result;
    }
  } catch {
    // DB read failed, fall through to Google
  }

  // 3. Google API
  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();
  try {
    const result = await geocoder.geocode({ address });
    const loc = result.results?.[0]?.geometry?.location;
    if (!loc) return null;
    const coords = { lat: loc.lat(), lng: loc.lng() };
    _memCache.set(key, coords);

    // Store in DB cache (fire-and-forget)
    supabase
      .from("geocode_cache")
      .upsert(
        {
          address_input: address.trim(),
          lat: coords.lat,
          lng: coords.lng,
          formatted_address: result.results?.[0]?.formatted_address || address,
          source: "google",
        },
        { onConflict: "address_hash" }
      )
      .then(({ error }) => { if (error) console.warn("geocode_cache write error:", error); });

    return coords;
  } catch {
    return null;
  }
}

export type GoogleAddressVerification = {
  input: string;
  standardized: string;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  lat: number;
  lng: number;
  locationType: string;
};

export async function verifyAddressWithGoogle(address: string): Promise<GoogleAddressVerification | null> {
  if (!address || address.trim().length < 5) return null;

  await loadGoogleMaps();
  const geocoder = new google.maps.Geocoder();

  try {
    const result = await geocoder.geocode({
      address,
      bounds: {
        north: 29.7,
        south: 29.2,
        east: -98.2,
        west: -98.8,
      },
    });
    const first = result.results?.[0];
    const loc = first?.geometry?.location;
    if (!first || !loc) return null;

    const locationType = String(first.geometry?.location_type || "");
    const confidence = locationType === "ROOFTOP"
      ? 0.99
      : locationType === "RANGE_INTERPOLATED"
        ? 0.85
        : locationType === "GEOMETRIC_CENTER"
          ? 0.7
          : 0.5;

    return {
      input: address,
      standardized: first.formatted_address || address,
      confidence,
      confidenceLabel: confidence >= 0.8 ? "high" : confidence >= 0.65 ? "medium" : "low",
      lat: loc.lat(),
      lng: loc.lng(),
      locationType,
    };
  } catch {
    return null;
  }
}
