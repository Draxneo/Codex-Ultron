const BRAND_PORTALS: Record<string, string> = {
  Carrier: "https://productregistration.carrier.com/public/RegistrationForm_Carrier?brand=CARRIER",
  "Day and Night": "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP",
  "Day & Night": "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP",
  Goodman: "https://warranty.goodmanmfg.com/newregistration/#/reg-layout",
  Trane: "https://www.trane.com/residential/en/resources/warranty-and-registration/register/",
};

export function getWarrantyPortalUrl(brand?: string): string {
  if (!brand) return BRAND_PORTALS.Carrier;
  const key = Object.keys(BRAND_PORTALS).find((portalBrand) => portalBrand.toLowerCase() === brand.toLowerCase());
  return BRAND_PORTALS[key || "Carrier"] || BRAND_PORTALS.Carrier;
}
