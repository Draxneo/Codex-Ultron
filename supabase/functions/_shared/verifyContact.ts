import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAddressGoogle } from "./googleGeo.ts";

// San Antonio city center — used for distance calc
const SA_CENTER = { lat: 29.4241, lng: -98.4936 };

/**
 * Haversine distance in miles between two lat/lng points.
 */
export function distanceFromSA(lat: number, lng: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat - SA_CENTER.lat) * Math.PI / 180;
  const dLng = (lng - SA_CENTER.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(SA_CENTER.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Classify distance into service area tier (internal dispatcher metadata).
 */
export function getServiceAreaTier(miles: number): "priority" | "normal" | "extended" | "outside_area" {
  if (miles <= 10) return "priority";
  if (miles <= 30) return "normal";
  if (miles <= 50) return "extended";
  return "outside_area";
}

/**
 * Geocode an address via Google Maps to verify it and get standardized result.
 * Shared across summarize-call and any future intake.
 * 
 * Geocode and verify an address via Google Maps API.
 * Returns standardized address, coordinates, and confidence score.
 */
export const verifyAddress = verifyAddressGoogle;

/** @deprecated Use verifyAddress instead */
export const verifyAddressMapbox = verifyAddressGoogle;

/**
 * A property/address known to a customer (from `customer_addresses` rows or
 * the legacy single billing address on the customer row). When provided, the
 * divergence detector compares spoken addresses against EVERY known property
 * — primary home AND every rental/secondary — so we don't propose creating
 * a new linked customer when the address is already on file as a rental.
 */
export interface KnownAddress {
  id?: string | null;
  address_type?: string | null; // e.g. "billing" | "service" | "rental"
  street?: string | null;       // street line (preferred)
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  is_primary?: boolean | null;
  /** Optional pre-formatted single-line — used when only legacy `address` is available. */
  formatted?: string | null;
}

const _streetSig = (raw: string | null | undefined): { num: string; word: string } => {
  const s = (raw || "").trim();
  const num = (s.match(/\d+/) || [""])[0];
  const word = (s.replace(/^\d+\s*/, "").match(/[A-Za-z]+/) || [""])[0].toLowerCase();
  return { num, word };
};

const _formatKnown = (k: KnownAddress): string =>
  k.formatted?.trim() ||
  [k.street, k.city, k.state, k.zip].filter(Boolean).join(", ");

/**
 * Detect whether a spoken/written address materially differs from a known
 * customer's address book. Used by JARVIS to catch:
 *   • cross-customer edge case (homeowner calling for their CHURCH — not on file at all)
 *   • intra-customer edge case (landlord calling about RENTAL #2 — already on file
 *     under same customer, but NOT the primary billing address)
 *
 * Outcomes:
 *   • `none`              → no address found in text → no action.
 *   • `matched_primary`   → spoken address matches the customer's primary/home.
 *   • `matched_secondary` → spoken address matches an existing rental/secondary
 *                           on this customer's record. Booking should target
 *                           that address — DO NOT create a new linked customer.
 *   • `divergent`         → spoken address matches NO known property → propose
 *                           a new linked-property customer.
 *
 * Heuristic-only — we do NOT call Google here. The agent is instructed to call
 * verify_address before creating any new customer/job from the divergent value.
 */
export function detectAddressDivergence(
  text: string | null | undefined,
  customer: { address?: string | null; city?: string | null; zip?: string | null } | null | undefined,
  knownAddresses?: KnownAddress[] | null
): {
  outcome: "none" | "matched_primary" | "matched_secondary" | "divergent";
  divergent: boolean; // back-compat shortcut: true only when outcome === "divergent"
  spoken_addresses: string[];
  customer_address: string | null;
  matched_address: KnownAddress | null;
  known_addresses: { id: string | null; label: string; formatted: string; is_primary: boolean }[];
  reason: string | null;
} {
  const customer_address = customer?.address
    ? [customer.address, customer.city, customer.zip].filter(Boolean).join(", ")
    : null;

  // Build the full known-property list: customer_addresses rows + legacy billing fallback.
  const known: KnownAddress[] = Array.isArray(knownAddresses) && knownAddresses.length
    ? knownAddresses.slice()
    : [];
  if (known.length === 0 && customer?.address) {
    known.push({
      street: customer.address,
      city: customer.city ?? null,
      zip: customer.zip ?? null,
      is_primary: true,
      address_type: "billing",
      formatted: customer_address,
    });
  }

  const known_addresses = known.map((k) => ({
    id: k.id ?? null,
    label: k.address_type || (k.is_primary ? "primary" : "property"),
    formatted: _formatKnown(k),
    is_primary: !!k.is_primary,
  }));

  if (!text || known.length === 0) {
    return {
      outcome: "none",
      divergent: false,
      spoken_addresses: [],
      customer_address,
      matched_address: null,
      known_addresses,
      reason: null,
    };
  }

  const addrPattern = /\b(\d{2,6})\s+([A-Za-z][A-Za-z0-9.'\- ]{2,40}?)\s+(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Ter|Terrace|Cir|Circle|Pkwy|Parkway|Trl|Trail|Hwy|Highway|Loop)\b/gi;
  const matches = Array.from(text.matchAll(addrPattern));
  if (matches.length === 0) {
    return {
      outcome: "none",
      divergent: false,
      spoken_addresses: [],
      customer_address,
      matched_address: null,
      known_addresses,
      reason: null,
    };
  }

  const spoken_addresses = [...new Set(matches.map((m) => `${m[1]} ${m[2]} ${m[3]}`.replace(/\s+/g, " ").trim()))];

  // Try to match each spoken address against EVERY known address.
  let matched: KnownAddress | null = null;
  let matchedIsPrimary = false;
  for (const m of matches) {
    const num = m[1];
    const word = m[2].split(/\s+/)[0].toLowerCase();
    for (const k of known) {
      const sig = _streetSig(k.street || k.formatted || "");
      if (
        sig.word.length > 0 &&
        num === sig.num &&
        word.startsWith(sig.word.slice(0, 4))
      ) {
        matched = k;
        matchedIsPrimary = !!k.is_primary || (k.address_type || "").toLowerCase() === "billing";
        break;
      }
    }
    if (matched) break;
  }

  if (matched && matchedIsPrimary) {
    return {
      outcome: "matched_primary",
      divergent: false,
      spoken_addresses,
      customer_address,
      matched_address: matched,
      known_addresses,
      reason: null,
    };
  }
  if (matched) {
    return {
      outcome: "matched_secondary",
      divergent: false,
      spoken_addresses,
      customer_address,
      matched_address: matched,
      known_addresses,
      reason: `Caller mentioned ${spoken_addresses[0]} which matches an existing ${matched.address_type || "secondary"} property on this customer's record (${_formatKnown(matched)}). Book the job at THAT property — do not create a new customer.`,
    };
  }

  return {
    outcome: "divergent",
    divergent: true,
    spoken_addresses,
    customer_address,
    matched_address: null,
    known_addresses,
    reason: `Caller mentioned ${spoken_addresses[0]} but no property at that address is on file for this customer (${customer_address || "no home address"}). This may be a new property (church, rental, parent's home, business).`,
  };
}

/**
 * Fuzzy-match a customer name against the existing customers table.
 * Hispanic name awareness: checks common spelling variations.
 *
 * Returns the best match if found, or null.
 */
export async function fuzzyMatchCustomerName(
  supabase: SupabaseClient,
  firstName: string | null,
  lastName: string | null
): Promise<{ id: string; first_name: string; last_name: string; confidence: "high" | "low" } | null> {
  if (!firstName && !lastName) return null;

  // Common Hispanic name variations (bidirectional)
  const VARIATIONS: Record<string, string[]> = {
    rodriguez: ["rodrigues", "rodrigez"],
    gonzalez: ["gonzales", "gonzalез"],
    hernandez: ["hernandes", "hernandéz"],
    martinez: ["martines", "martinéz"],
    gutierrez: ["gutieres", "gutierez"],
    garcia: ["garsia", "garçia"],
    lopez: ["lopes"],
    sanchez: ["sanches", "sanchéz"],
    ramirez: ["ramires", "ramiréz"],
    valles: ["vales", "vallez"],
    flores: ["florez"],
    perez: ["peres", "peréz"],
    diaz: ["dias"],
    torres: ["torrez"],
    vasquez: ["vazquez", "vasques"],
    castillo: ["castilo"],
    morales: ["moralez"],
    reyes: ["reyez"],
  };

  // Build search variants for last name
  const searchLastNames: string[] = [];
  if (lastName) {
    const lower = lastName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    searchLastNames.push(lastName);

    for (const [canonical, variants] of Object.entries(VARIATIONS)) {
      if (lower === canonical || variants.includes(lower)) {
        searchLastNames.push(canonical.charAt(0).toUpperCase() + canonical.slice(1));
        for (const v of variants) {
          searchLastNames.push(v.charAt(0).toUpperCase() + v.slice(1));
        }
      }
    }
  }

  const uniqueNames = [...new Set(searchLastNames.map(n => n.toLowerCase()))];

  if (uniqueNames.length === 0 && firstName) {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .ilike("first_name", firstName)
      .limit(5);

    if (data && data.length === 1) {
      return { id: data[0].id, first_name: data[0].first_name, last_name: data[0].last_name, confidence: "low" };
    }
    return null;
  }

  const orFilters = uniqueNames.map(n => `last_name.ilike.${n}`).join(",");
  const { data } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .or(orFilters)
    .limit(10);

  if (!data || data.length === 0) return null;

  const normalizeStr = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  let bestMatch: typeof data[0] | null = null;
  let bestScore = 0;

  for (const cust of data) {
    let score = 0;
    if (lastName && cust.last_name && normalizeStr(cust.last_name) === normalizeStr(lastName)) {
      score += 2;
    } else {
      score += 1;
    }
    if (firstName && cust.first_name && normalizeStr(cust.first_name) === normalizeStr(firstName)) {
      score += 2;
    } else if (firstName && cust.first_name && normalizeStr(cust.first_name).startsWith(normalizeStr(firstName).slice(0, 3))) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cust;
    }
  }

  if (!bestMatch) return null;

  return {
    id: bestMatch.id,
    first_name: bestMatch.first_name,
    last_name: bestMatch.last_name,
    confidence: bestScore >= 4 ? "high" : "low",
  };
}
