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
  Brain, Package, Phone, CreditCard,
  MapPin, Settings2, BarChart3,
  Users, Route, ClipboardList, Calculator, Activity,
  Bell, CalendarDays, ClipboardCheck, FileText, Globe2, ListChecks,
  Megaphone, ReceiptText, Shield, Tags, UserPlus, Workflow,
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
  { label: "JARVIS",            icon: Brain,         path: "/copilot",                     color: "text-violet-500",  bg: "bg-violet-500/10" },
  { label: "Catalog & Pricebook", icon: Package,     path: "/catalog",                     color: "text-orange-500",  bg: "bg-orange-500/10" },
  { label: "IVR Builder",       icon: Phone,         path: "/ivr-builder",                 color: "text-cyan-500",    bg: "bg-cyan-500/10" },
  { label: "Call Routing",      icon: Route,         path: "/admin/call-routing",          color: "text-cyan-600",    bg: "bg-cyan-600/10" },
  { label: "LSA Leads",         icon: MapPin,        path: "/leads?source=google_lsa",     color: "text-blue-500",    bg: "bg-blue-500/10" },
  { label: "Payments",          icon: CreditCard,    path: "/payments",                    color: "text-sky-500",     bg: "bg-sky-500/10" },
  { label: "Agreements",        icon: ClipboardList, path: "/agreements",                  color: "text-rose-500",    bg: "bg-rose-500/10" },
  { label: "Quick Quote",       icon: Calculator,    path: "/quick-quote",                 color: "text-amber-600",   bg: "bg-amber-600/10" },
];

/* Settings (each card opens an Admin section) */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "Global Settings",
    icon: Settings2,
    cards: [
      { label: "Company", icon: Settings2, section: "company", color: "text-muted-foreground", bg: "bg-muted" },
      { label: "Billing", icon: CreditCard, section: "billing", color: "text-emerald-500", bg: "bg-emerald-500/10" },
      { label: "Notifications", icon: Bell, section: "notifications", color: "text-amber-500", bg: "bg-amber-500/10" },
      { label: "Team & Permissions", icon: Users, section: "employees", color: "text-[hsl(var(--sky))]", bg: "bg-[hsl(var(--sky))]/10" },
    ],
  },
  {
    title: "Feature Configurations",
    icon: Workflow,
    cards: [
      { label: "Booking", icon: CalendarDays, section: "booking", color: "text-indigo-500", bg: "bg-indigo-500/10" },
      { label: "Leads", icon: MapPin, section: "leads", color: "text-blue-500", bg: "bg-blue-500/10" },
      { label: "Communications", icon: Phone, section: "voice", color: "text-cyan-500", bg: "bg-cyan-500/10" },
      { label: "Customer Intake", icon: UserPlus, section: "customer-intake", color: "text-violet-500", bg: "bg-violet-500/10" },
      { label: "Customer Portal", icon: Globe2, section: "customer-portal", color: "text-sky-500", bg: "bg-sky-500/10" },
      { label: "Estimates", icon: FileText, section: "estimates", color: "text-amber-600", bg: "bg-amber-600/10" },
      { label: "Invoices", icon: ReceiptText, section: "payments", color: "text-emerald-500", bg: "bg-emerald-500/10" },
      { label: "Jobs", icon: ClipboardCheck, section: "jobs", color: "text-rose-500", bg: "bg-rose-500/10" },
      { label: "Marketing Center", icon: Megaphone, section: "marketing", color: "text-pink-500", bg: "bg-pink-500/10" },
      { label: "Pipeline", icon: Workflow, section: "pipeline", color: "text-purple-500", bg: "bg-purple-500/10" },
      { label: "Price Book", icon: Package, section: "pricebook", color: "text-orange-500", bg: "bg-orange-500/10" },
      { label: "Service Plans", icon: Shield, section: "service-plans", color: "text-emerald-600", bg: "bg-emerald-600/10" },
    ],
  },
  {
    title: "Tags & Tools",
    icon: Tags,
    cards: [
      { label: "Checklists", icon: ListChecks, section: "checklists", color: "text-lime-600", bg: "bg-lime-600/10" },
      { label: "Job Fields", icon: ClipboardCheck, section: "job-fields", color: "text-slate-500", bg: "bg-slate-500/10" },
      { label: "Lead Sources", icon: MapPin, section: "lead-sources", color: "text-blue-500", bg: "bg-blue-500/10" },
      { label: "Tags", icon: Tags, section: "tags", color: "text-fuchsia-500", bg: "bg-fuchsia-500/10" },
      { label: "Data Tools", icon: Activity, section: "data", color: "text-orange-500", bg: "bg-orange-500/10" },
      { label: "Apps & Tools", icon: Package, section: "tools", color: "text-primary", bg: "bg-primary/10" },
      { label: "Dashboard & Reports", icon: BarChart3, section: "reports", color: "text-amber-500", bg: "bg-amber-500/10" },
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
