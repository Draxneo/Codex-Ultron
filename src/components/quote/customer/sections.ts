/**
 * Customer-facing /q/:token quote section ids and labels.
 * Centralized so both the renderer and the layout editor share them.
 */
export const CUSTOMER_QUOTE_SECTION_IDS = [
  "hero",
  "investment",
  "specs",
  "included",
  "protection",
  "rebate",
  "whyus",
  "contact",
] as const;

export type CustomerQuoteSectionId = (typeof CUSTOMER_QUOTE_SECTION_IDS)[number];

export const CUSTOMER_QUOTE_SECTION_LABELS: Record<CustomerQuoteSectionId, string> = {
  hero: "Hero",
  investment: "Payment Options",
  specs: "Equipment & Specs",
  included: "What's Included",
  protection: "Your Protection",
  rebate: "CPS Energy Rebate",
  whyus: "Why Carnes & Sons",
  contact: "Contact",
};
