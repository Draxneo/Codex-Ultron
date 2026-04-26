/**
 * adminNavigation.ts — Single source of truth for the admin/tools navigation.
 *
 * Both the AdminHub (the /admin landing page grid) AND the AdminToolsGrid
 * (the header dropdown popover) import from this file. Edit here and both
 * stay perfectly in sync.
 *
 * Conventions:
 *  - `path` for tools = absolute route to navigate to
 *  - `section` for settings = the ?section= query param Admin.tsx switches on
 */
import {
  Brain, Package, BookOpen, Phone, CreditCard,
  Store, MapPin, Settings2, Webhook, BarChart3,
  Building2, Users, Route, Bot, ClipboardList, Calculator,
  GraduationCap, MessageSquareText,
} from "lucide-react";

export type ToolEntry = {
  label: string;
  icon: React.ElementType;
  path: string;
  color: string;
  bg: string;
};

export type SettingEntry = {
  label: string;
  icon: React.ElementType;
  section: string;
  color: string;
  bg: string;
};

export type SettingsGroup = {
  title: string;
  icon: React.ElementType;
  cards: SettingEntry[];
};

/* Tools & Builders (links to standalone routes) */
export const TOOL_CARDS: ToolEntry[] = [
  { label: "JARVIS",            icon: Brain,         path: "/copilot",                     color: "text-violet-500",  bg: "bg-violet-500/10" },
  { label: "Catalog & Pricebook", icon: Package,     path: "/catalog",                     color: "text-orange-500",  bg: "bg-orange-500/10" },
  { label: "Presentations",     icon: BookOpen,      path: "/sales-presentations",         color: "text-amber-500",   bg: "bg-amber-500/10" },
  { label: "IVR Builder",       icon: Phone,         path: "/ivr-builder",                 color: "text-cyan-500",    bg: "bg-cyan-500/10" },
  { label: "Call Routing",      icon: Route,         path: "/admin/call-routing",          color: "text-cyan-600",    bg: "bg-cyan-600/10" },
  { label: "AI Agents",         icon: Bot,           path: "/agent-network",               color: "text-purple-500",  bg: "bg-purple-500/10" },
  { label: "LSA Leads",         icon: MapPin,        path: "/leads?source=google_lsa",     color: "text-blue-500",    bg: "bg-blue-500/10" },
  { label: "Vendors",           icon: Store,         path: "/vendors",                     color: "text-teal-500",    bg: "bg-teal-500/10" },
  { label: "Payments",          icon: CreditCard,    path: "/payments",                    color: "text-sky-500",     bg: "bg-sky-500/10" },
  { label: "Agreements",        icon: ClipboardList, path: "/agreements",                  color: "text-rose-500",    bg: "bg-rose-500/10" },
  { label: "Quick Quote",       icon: Calculator,    path: "/quick-quote",                 color: "text-amber-600",   bg: "bg-amber-600/10" },
  { label: "JARVIS Training",   icon: GraduationCap, path: "/agent-training",              color: "text-violet-500",  bg: "bg-violet-500/10" },
  { label: "SMS Templates",     icon: MessageSquareText, path: "/agent-training?section=output", color: "text-blue-500",   bg: "bg-blue-500/10" },
];

/* Settings (each card opens an Admin section) */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "People",
    icon: Users,
    cards: [
      { label: "Employees", icon: Users, section: "employees", color: "text-[hsl(var(--sky))]", bg: "bg-[hsl(var(--sky))]/10" },
    ],
  },
  {
    title: "Communications",
    icon: Phone,
    cards: [
      { label: "Voice & Phone", icon: Phone,     section: "voice",     color: "text-cyan-500",   bg: "bg-cyan-500/10" },
      { label: "Webhooks",      icon: Webhook,   section: "webhooks",  color: "text-indigo-500", bg: "bg-indigo-500/10" },
      { label: "Marketing",     icon: BarChart3, section: "marketing", color: "text-pink-500",   bg: "bg-pink-500/10" },
    ],
  },
  {
    title: "Money",
    icon: CreditCard,
    cards: [
      { label: "Invoicing", icon: CreditCard, section: "payments", color: "text-emerald-500", bg: "bg-emerald-500/10" },
      { label: "Reports",   icon: BarChart3,  section: "reports",  color: "text-amber-500",   bg: "bg-amber-500/10" },
    ],
  },
  {
    title: "System",
    icon: Settings2,
    cards: [
      { label: "Company",       icon: Settings2,  section: "company",    color: "text-muted-foreground", bg: "bg-muted" },
      { label: "JARVIS Config", icon: Brain,      section: "jarvis",     color: "text-violet-500",       bg: "bg-violet-500/10" },
      { label: "Operations",    icon: Building2,  section: "operations", color: "text-orange-500",       bg: "bg-orange-500/10" },
    ],
  },
];

/** Flat list of every settings card across all groups (used by the header dropdown). */
export const ALL_SETTINGS: SettingEntry[] = SETTINGS_GROUPS.flatMap((g) => g.cards);
