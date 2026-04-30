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
  Brain,
  GitBranch,
  Package,
  Phone,
  CreditCard,
  Settings2,
  BarChart3,
  Users,
  Activity,
  Database,
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

export type AdminSettingSection = {
  key: string;
  label: string;
  group: string;
  icon: React.ElementType;
};

/* Tools & Builders (links to standalone routes) */
export const TOOL_CARDS: ToolEntry[] = [
  { label: "JARVIS", icon: Brain, path: "/copilot", color: "text-violet-500", bg: "bg-violet-500/10" },
  { label: "Workflow Maps", icon: GitBranch, path: "/workflows", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { label: "Catalog & Pricebook", icon: Package, path: "/catalog", color: "text-orange-500", bg: "bg-orange-500/10" },
  { label: "IVR Builder", icon: Phone, path: "/ivr-builder", color: "text-cyan-500", bg: "bg-cyan-500/10" },
];

/* Settings (each card opens an Admin section) */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Core Settings",
    icon: Settings2,
    cards: [
      { label: "Company", icon: Settings2, section: "company", color: "text-muted-foreground", bg: "bg-muted" },
      { label: "Team & Permissions", icon: Users, section: "employees", color: "text-[hsl(var(--sky))]", bg: "bg-[hsl(var(--sky))]/10" },
      { label: "Voice & Phone", icon: Phone, section: "voice", color: "text-cyan-500", bg: "bg-cyan-500/10" },
      { label: "Payments & Invoices", icon: CreditCard, section: "payments", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    ],
  },
  {
    title: "Data & Operations",
    icon: Activity,
    cards: [
      { label: "Data Tools", icon: Database, section: "data", color: "text-orange-500", bg: "bg-orange-500/10" },
      { label: "API Costs", icon: BarChart3, section: "reports", color: "text-amber-500", bg: "bg-amber-500/10" },
      { label: "Dev / Ops", icon: Activity, section: "dev", color: "text-orange-500", bg: "bg-orange-500/10" },
    ],
  },
];

/** Flat list of every settings card across all groups (used by the header dropdown). */
export const ALL_SETTINGS: SettingEntry[] = SETTINGS_GROUPS.flatMap((g) => g.cards);

/** Flat, grouped settings rail used by the main Admin settings workbench. */
export const ADMIN_SETTING_SECTIONS: AdminSettingSection[] = SETTINGS_GROUPS.flatMap((group) =>
  group.cards.map((card) => ({
    key: card.section,
    label: card.label,
    group: group.title,
    icon: card.icon,
  }))
);
