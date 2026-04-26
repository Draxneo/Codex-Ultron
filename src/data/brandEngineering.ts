import {
  Award, ShieldCheck, Wrench, Leaf,
} from "lucide-react";
import carrierLogo from "@/assets/carrier-logo.png";
import goodmanLogo from "@/assets/goodman-logo.png";
import dayandnightLogo from "@/assets/dayandnight-logo.webp";
import { useBrandProfiles, type BrandProfile } from "@/hooks/useBrandProfiles";

// ── Types ──
export interface BrandEngineering {
  headline: string;
  subhead: string;
  eyebrow: string;
  title: string;
  body1: string;
  body2: string;
  badges: { icon: React.ElementType; text: string }[];
  refrigerant: { name: string; detail: string };
}

// ── Icon resolver for badge icons stored as strings in DB ──
const BADGE_ICON_MAP: Record<string, React.ElementType> = { Award, ShieldCheck, Wrench, Leaf };

function resolveBadgeIcon(name: string): React.ElementType {
  return BADGE_ICON_MAP[name] || ShieldCheck;
}

// ── Convert DB BrandProfile to the legacy BrandEngineering shape ──
function profileToEngineering(p: BrandProfile): BrandEngineering {
  return {
    headline: p.headline,
    subhead: p.subhead,
    eyebrow: p.eyebrow,
    title: p.title,
    body1: p.body_1,
    body2: p.body_2,
    badges: (p.badges || []).map((b) => ({
      icon: resolveBadgeIcon(b.icon),
      text: b.text,
    })),
    refrigerant: p.refrigerant || { name: "", detail: "" },
  };
}

// ── Static fallback data (used during loading / if DB is empty) ──
const FALLBACK_ENGINEERING: Record<string, BrandEngineering> = {
  carrier: {
    headline: "The Cadillac of Air Conditioning",
    subhead: "Carrier is the original — the brand that invented modern air conditioning in 1902.",
    eyebrow: "Why It Matters Who Built Your System",
    title: "Carrier Invented Modern Air Conditioning",
    body1: "In 1902, Willis Carrier designed the first modern air conditioning system.",
    body2: 'As a <strong>Carrier Factory Authorized Dealer</strong>, we install and service every tier.',
    badges: [
      { icon: Award, text: "Factory-trained installation crews" },
      { icon: ShieldCheck, text: "Full manufacturer warranty protection" },
      { icon: Wrench, text: "Access to genuine Carrier parts & support" },
      { icon: Leaf, text: "R-454B (Puron Advance®) — next-gen refrigerant" },
    ],
    refrigerant: { name: "Built for the Future — R-454B Refrigerant", detail: "" },
  },
};

const FALLBACK_LOGOS: Record<string, string> = {
  carrier: carrierLogo,
  goodman: goodmanLogo,
  dayandnight: dayandnightLogo,
  armstrong: "",
};

const FALLBACK_ACCENT: Record<string, { color: string; bg: string; pillBg: string }> = {
  carrier: { color: "text-accent", bg: "bg-accent/10", pillBg: "bg-accent/20" },
  goodman: { color: "text-green-500", bg: "bg-green-500/10", pillBg: "bg-green-500/20" },
  dayandnight: { color: "text-emerald-600", bg: "bg-emerald-600/10", pillBg: "bg-emerald-600/20" },
  armstrong: { color: "text-red-600", bg: "bg-red-600/10", pillBg: "bg-red-600/20" },
};

const FALLBACK_GRADIENTS: Record<string, string> = {
  carrier: "from-primary via-primary to-primary/80",
  goodman: "from-[#1a3a2a] via-[#224a35] to-[#2d5f44]",
  dayandnight: "from-[#006838] via-[#007a42] to-[#009150]",
  armstrong: "from-[#8B1A1A] via-[#A52222] to-[#C43030]",
};

// ── Exported static defaults for immediate rendering (no DB wait) ──
export const BRAND_ENGINEERING = FALLBACK_ENGINEERING;
export const BRAND_LOGOS = FALLBACK_LOGOS;
export const BRAND_ACCENT = FALLBACK_ACCENT;
export const BRAND_GRADIENTS = FALLBACK_GRADIENTS;

// ── Hook: DB-driven brand data with static fallbacks ──
export function useBrandEngineering() {
  const { profiles, isLoading } = useBrandProfiles();

  const getEngineering = (brandKey: string): BrandEngineering => {
    const profile = profiles.find((p) => p.brand_key === brandKey);
    if (profile) return profileToEngineering(profile);
    return FALLBACK_ENGINEERING[brandKey] || FALLBACK_ENGINEERING.carrier;
  };

  const getLogo = (brandKey: string): string => {
    const profile = profiles.find((p) => p.brand_key === brandKey);
    // If profile has a logo_url set, use it; otherwise fall back to static assets
    if (profile?.logo_url) return profile.logo_url;
    return FALLBACK_LOGOS[brandKey] || FALLBACK_LOGOS.carrier;
  };

  const getAccent = (brandKey: string): { color: string; bg: string; pillBg: string } => {
    const profile = profiles.find((p) => p.brand_key === brandKey);
    if (profile) return { color: profile.accent_color, bg: profile.accent_bg, pillBg: profile.pill_bg };
    return FALLBACK_ACCENT[brandKey] || FALLBACK_ACCENT.carrier;
  };

  const getGradient = (brandKey: string): string => {
    const profile = profiles.find((p) => p.brand_key === brandKey);
    if (profile) return profile.gradient;
    return FALLBACK_GRADIENTS[brandKey] || FALLBACK_GRADIENTS.carrier;
  };

  return { isLoading, profiles, getEngineering, getLogo, getAccent, getGradient };
}
