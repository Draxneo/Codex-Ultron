/**
 * Texas County Router
 * Maps a service-area address (ZIP-first, then city fallback) to its County Appraisal District (CAD).
 * 100% offline — no Google geocoding required, costs $0.
 *
 * Service area: Guadalupe, Bexar, Comal, Wilson, Kendall, Atascosa.
 * If a ZIP isn't in the table, returns null and the caller should fall back to non-CAD lookup
 * (NOT to geocoding — we never want to bulk-geocode).
 */

export interface CadConfig {
  /** Display name shown in UI badges, e.g. "Guadalupe CAD" */
  label: string;
  /** Hostname of the BIS esearch site, e.g. "esearch.guadalupead.org" */
  host: string;
  /** County name as Google Geocoding returns it ("Guadalupe County") — for reverse mapping */
  countyName: string;
}

export const CAD_BY_COUNTY: Record<string, CadConfig> = {
  guadalupe: { label: "Guadalupe CAD", host: "esearch.guadalupead.org", countyName: "Guadalupe County" },
  bexar:     { label: "Bexar CAD",     host: "esearch.bcad.org",        countyName: "Bexar County" },
  comal:     { label: "Comal CAD",     host: "esearch.comalad.org",     countyName: "Comal County" },
  wilson:    { label: "Wilson CAD",    host: "esearch.wilson-cad.org",  countyName: "Wilson County" },
  kendall:   { label: "Kendall CAD",   host: "esearch.kendallad.org",   countyName: "Kendall County" },
  atascosa:  { label: "Atascosa CAD",  host: "esearch.atascosacad.com", countyName: "Atascosa County" },
};

/**
 * ZIP → county slug. Covers the six service-area counties.
 * Sources: USPS ZIP boundaries + county appraisal district jurisdiction maps.
 * A few border ZIPs straddle county lines; we map to the *primary* CAD for that ZIP.
 */
const ZIP_TO_COUNTY: Record<string, keyof typeof CAD_BY_COUNTY> = {
  // ── Guadalupe County ──
  "78101": "guadalupe", // Adkins (split w/ Bexar — primary Guadalupe)
  "78108": "guadalupe", // Cibolo
  "78115": "guadalupe", // Seguin
  "78123": "guadalupe", // McQueeney
  "78124": "guadalupe", // Marion
  "78154": "guadalupe", // Schertz
  "78155": "guadalupe", // Seguin
  "78156": "guadalupe", // Seguin
  "78638": "guadalupe", // Geronimo / Kingsbury
  "78670": "guadalupe", // Staples (mostly Guadalupe)

  // ── Bexar County ──
  "78002": "bexar", "78023": "bexar", "78073": "bexar", "78109": "bexar",
  "78112": "bexar", "78148": "bexar", "78150": "bexar", "78152": "bexar",
  "78201": "bexar", "78202": "bexar", "78203": "bexar", "78204": "bexar",
  "78205": "bexar", "78207": "bexar", "78208": "bexar", "78209": "bexar",
  "78210": "bexar", "78211": "bexar", "78212": "bexar", "78213": "bexar",
  "78214": "bexar", "78215": "bexar", "78216": "bexar", "78217": "bexar",
  "78218": "bexar", "78219": "bexar", "78220": "bexar", "78221": "bexar",
  "78222": "bexar", "78223": "bexar", "78224": "bexar", "78225": "bexar",
  "78226": "bexar", "78227": "bexar", "78228": "bexar", "78229": "bexar",
  "78230": "bexar", "78231": "bexar", "78232": "bexar", "78233": "bexar",
  "78234": "bexar", "78235": "bexar", "78236": "bexar", "78237": "bexar",
  "78238": "bexar", "78239": "bexar", "78240": "bexar", "78242": "bexar",
  "78243": "bexar", "78244": "bexar", "78245": "bexar", "78247": "bexar",
  "78248": "bexar", "78249": "bexar", "78250": "bexar", "78251": "bexar",
  "78252": "bexar", "78253": "bexar", "78254": "bexar", "78255": "bexar",
  "78256": "bexar", "78257": "bexar", "78258": "bexar", "78259": "bexar",
  "78260": "bexar", "78261": "bexar", "78263": "bexar", "78264": "bexar",
  "78266": "bexar", "78268": "bexar", "78269": "bexar", "78278": "bexar",
  "78279": "bexar", "78283": "bexar", "78284": "bexar", "78285": "bexar",
  "78288": "bexar", "78289": "bexar", "78291": "bexar", "78292": "bexar",
  "78293": "bexar", "78294": "bexar", "78295": "bexar", "78296": "bexar",
  "78297": "bexar", "78298": "bexar", "78299": "bexar",

  // ── Comal County ──
  "78070": "comal", // Spring Branch (mostly Comal)
  "78130": "comal", // New Braunfels
  "78131": "comal",
  "78132": "comal", // New Braunfels (north)
  "78133": "comal", // Canyon Lake
  "78135": "comal",
  "78163": "comal", // Bulverde (Comal portion — also crosses into Bexar)
  // "78266": Bexar wins (city is in Bexar) — see line 65

  // ── Wilson County ──
  "78114": "wilson", // Floresville
  "78121": "wilson", // La Vernia
  "78140": "wilson", // Nixon (Wilson portion)
  "78143": "wilson", // Pandora
  "78147": "wilson", // Poth
  "78160": "wilson", // Stockdale
  "78161": "wilson", // Sutherland Springs

  // ── Kendall County ──
  "78006": "kendall", // Boerne
  "78013": "kendall", // Comfort (Kendall portion — also Kerr)
  "78015": "kendall", // Boerne south
  "78027": "kendall", // Kendalia
  "78074": "kendall", // Sisterdale
  "78606": "kendall", // Blanco (Kendall portion — also Blanco County)

  // ── Atascosa County ──
  "78005": "atascosa", // Campbellton
  "78008": "atascosa", // Christine
  "78011": "atascosa", // Charlotte
  "78012": "atascosa", // Christine (alt)
  "78050": "atascosa", // Leming
  "78052": "atascosa", // Lytle (Atascosa portion)
  "78057": "atascosa", // McCoy
  "78062": "atascosa", // Peggy
  "78064": "atascosa", // Pleasanton
  "78065": "atascosa", // Poteet
  "78069": "atascosa", // Somerset (Atascosa portion)
  "78072": "atascosa", // Tilden (mostly McMullen but parts Atascosa)
  // "78263": Bexar wins (Adkins/Elmendorf area is Bexar) — see line 64
};

/**
 * City fallback (lowercase) → county slug. Used only when ZIP is missing/unknown.
 * Smaller dictionary — we don't want to over-match generic names like "San Antonio"
 * to the wrong county.
 */
const CITY_TO_COUNTY: Record<string, keyof typeof CAD_BY_COUNTY> = {
  "schertz": "guadalupe",
  "cibolo": "guadalupe",
  "seguin": "guadalupe",
  "marion": "guadalupe",
  "mcqueeney": "guadalupe",

  "san antonio": "bexar",
  "converse": "bexar",
  "live oak": "bexar",
  "universal city": "bexar",
  "windcrest": "bexar",
  "leon valley": "bexar",
  "balcones heights": "bexar",
  "alamo heights": "bexar",
  "olmos park": "bexar",
  "terrell hills": "bexar",
  "shavano park": "bexar",
  "hill country village": "bexar",
  "hollywood park": "bexar",
  "castle hills": "bexar",
  "kirby": "bexar",
  "china grove": "bexar",
  "elmendorf": "bexar",
  "von ormy": "bexar",
  "helotes": "bexar",
  "fair oaks ranch": "bexar", // straddles Bexar/Kendall; default Bexar

  "new braunfels": "comal",
  "canyon lake": "comal",
  "spring branch": "comal",
  "garden ridge": "comal",
  "bulverde": "comal",

  "floresville": "wilson",
  "la vernia": "wilson",
  "stockdale": "wilson",
  "poth": "wilson",
  "sutherland springs": "wilson",

  "boerne": "kendall",
  "comfort": "kendall",
  "kendalia": "kendall",
  "sisterdale": "kendall",

  "pleasanton": "atascosa",
  "poteet": "atascosa",
  "jourdanton": "atascosa",
  "lytle": "atascosa",
  "charlotte": "atascosa",
  "campbellton": "atascosa",
};

export interface AddressParts {
  street: string;     // "917 Dimrock"
  city: string | null;
  state: string | null;
  zip: string | null;
}

/**
 * Parse a free-form US address into pieces. Tolerates extra commas/spaces.
 * Examples:
 *   "917 Dimrock, Schertz, TX, 78154"   → { street, city, state, zip }
 *   "917 Dimrock Schertz TX 78154"      → same
 *   "5821 Roan Creek San Antonio TX 78259" → same
 */
export function parseAddress(input: string): AddressParts {
  const cleaned = input.trim().replace(/\s+/g, " ");
  // Pull ZIP off the end first (5 or 9 digit)
  const zipMatch = cleaned.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip = zipMatch ? zipMatch[1] : null;
  let rest = zipMatch ? cleaned.slice(0, zipMatch.index).replace(/[,\s]+$/, "") : cleaned;

  // Pull state off the end (2-letter, optional comma)
  const stateMatch = rest.match(/[,\s]+([A-Z]{2})\s*$/);
  const state = stateMatch ? stateMatch[1] : null;
  if (stateMatch) rest = rest.slice(0, stateMatch.index).replace(/[,\s]+$/, "");

  // Split on commas — last segment is city, rest is street
  const parts = rest.split(",").map((p) => p.trim()).filter(Boolean);
  let city: string | null = null;
  let street = rest;
  if (parts.length >= 2) {
    city = parts[parts.length - 1];
    street = parts.slice(0, -1).join(", ");
  }

  return { street, city, state, zip };
}

/**
 * Resolve address → CAD config. Returns null if outside service area.
 * Order: ZIP (most reliable) → city name (fallback). Never calls Google.
 */
export function resolveCad(address: string): { cad: CadConfig; parts: AddressParts; countySlug: string } | null {
  const parts = parseAddress(address);

  // 1) ZIP lookup
  if (parts.zip) {
    const slug = ZIP_TO_COUNTY[parts.zip];
    if (slug) {
      return { cad: CAD_BY_COUNTY[slug], parts, countySlug: slug };
    }
  }

  // 2) City lookup
  if (parts.city) {
    const slug = CITY_TO_COUNTY[parts.city.toLowerCase()];
    if (slug) {
      return { cad: CAD_BY_COUNTY[slug], parts, countySlug: slug };
    }
  }

  return null;
}

/**
 * Resolve a county name from Google Geocoding (e.g. "Guadalupe County") to CAD config.
 * Used only when caller already has lat/lng & component data — never triggers a new geocode.
 */
export function resolveCadByCountyName(countyName: string): CadConfig | null {
  const normalized = countyName.toLowerCase().replace(/\s+county\s*$/, "").trim();
  const slug = normalized as keyof typeof CAD_BY_COUNTY;
  return CAD_BY_COUNTY[slug] ?? null;
}
