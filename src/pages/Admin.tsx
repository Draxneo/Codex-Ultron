import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import {
  CreditCard, ChevronLeft, Phone,
  Settings2, Webhook, MessageSquare, Users,
  Plus, Trash2, Pencil, Copy, Building2, RefreshCw, ScanSearch, Activity,
} from "lucide-react";
import { AdminHub } from "@/components/AdminHub";
import { EmployeeHub } from "@/components/admin/EmployeeHub";
import { AppHeader } from "@/components/AppHeader";
import { ModuleWorkbench } from "@/components/workbench/ModuleWorkbench";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Config components (absorbed from SettingsPage)
import { CompanySettingsCard } from "@/components/CompanySettingsCard";
import { NavOrderEditor } from "@/components/NavOrderEditor";
import { HumanInTheLoopCard } from "@/components/HumanInTheLoopCard";
import { IntakeSimulator } from "@/components/IntakeSimulator";
import { CopilotPermissionsCard } from "@/components/CopilotPermissionsCard";

import { CompanyDocumentsCard } from "@/components/CompanyDocumentsCard";
import { RingtoneSettingsCard } from "@/components/RingtoneSettingsCard";
import { AnnouncerSettingsCard } from "@/components/voice/AnnouncerSettingsCard";
import { RegisteredDevicesCard } from "@/components/admin/RegisteredDevicesCard";

import { LineItemTemplatesCard } from "@/components/LineItemTemplatesCard";
import { MetaAudiencesCard } from "@/components/MetaAudiencesCard";
import { PaymentPlanRulesCard } from "@/components/PaymentPlanRulesCard";
import { useEmployees } from "@/hooks/useEmployees";
import { usePermitAuthorities } from "@/hooks/usePermitAuthorities";
import { PermitScoutPanel } from "@/components/PermitScoutPanel";
import { DuplicateManager } from "@/components/DuplicateManager";
import { HcpHistoryImport } from "@/components/HcpHistoryImport";
import { HcpPhotoArchive } from "@/components/HcpPhotoArchive";
import { ApiCostTrackerCard } from "@/components/ApiCostTrackerCard";
import { ApiCostsOverviewCard } from "@/components/ApiCostsOverviewCard";
import { ApiUsageHourlyChart } from "@/components/ApiUsageHourlyChart";
import HcpCustomerSyncButton from "@/components/HcpCustomerSyncButton";
import { PaysheetPanel } from "@/components/PaysheetPanel";
import { CustomerDataTools } from "@/components/admin/CustomerDataTools";
import { ADMIN_SETTING_SECTIONS } from "@/config/adminNavigation";

// Webhook URLs
const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/hcp-webhook`;
const SMS_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/sms-webhook`;
const STRIPE_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/stripe-webhook`;
const VOICE_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/voice-webhook`;
const FB_LEAD_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/facebook-lead-webhook`;

// Dispatch Utility Buttons
function DispatchRecalcButton() {
  const [loading, setLoading] = useState(false);
  const { data: employees } = useEmployees();
  const queryClient = useQueryClient();
  const handleClick = async () => {
    if (loading || !employees?.length) return;
    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");
      const { data: jobRows } = await supabase.from("jobs").select("assigned_to, scheduled_date").gte("scheduled_date", today).lte("scheduled_date", tomorrow).not("status", "in", '("canceled")');
      const empMap = new Map(employees.map((e: any) => [e.name, e.id]));
      const seen = new Set<string>();
      const batch: { employee_id: string; date: string }[] = [];
      for (const row of jobRows || []) {
        if (!row.assigned_to || !row.scheduled_date) continue;
        const empId = empMap.get(row.assigned_to);
        if (!empId) continue;
        const key = `${empId}|${row.scheduled_date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        batch.push({ employee_id: empId, date: row.scheduled_date });
      }
      if (!batch.length) { toast({ title: "No routes to calculate" }); return; }
      const { error } = await supabase.functions.invoke("calculate-route-cache", { body: { batch } });
      if (error) throw error;
      toast({ title: "Travel times recalculated", description: `${batch.length} routes updated.` });
      queryClient.invalidateQueries({ queryKey: ["route_travel_cache_date"] });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleClick} disabled={loading}>
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Recalculate Travel Times
    </Button>
  );
}

function ComfortClubRescanButton() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("backfill-install-agreements");
      if (error) throw error;
      const result = data as any;
      toast({ title: "Scan complete", description: result.message || `Created ${result.agreements_created} agreements` });
      queryClient.invalidateQueries({ queryKey: ["service_agreements"] });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleClick} disabled={loading}>
      <ScanSearch className={cn("h-3.5 w-3.5", loading && "animate-pulse")} /> Re-scan Comfort Club
    </Button>
  );
}

function WebhooksIntegrationsSection() {
  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const webhooks = [
    { label: "Job Webhook (HCP)", url: WEBHOOK_URL, icon: Webhook, desc: "Receives new jobs and estimates automatically.", setup: (
      <div className="text-xs text-muted-foreground space-y-1.5 bg-muted/50 rounded-lg p-3">
        <p className="font-semibold">Setup:</p>
        <p>1. Go to your scheduling platform's <strong>Settings - Webhooks</strong></p>
        <p>2. Paste the URL above</p>
        <p>3. Copy the signing secret and save it as <code className="bg-muted px-1 rounded">HCP_WEBHOOK_SECRET</code></p>
        <p>4. Enable events: <code className="bg-muted px-1 rounded">job.created</code>, <code className="bg-muted px-1 rounded">job.scheduled</code>, <code className="bg-muted px-1 rounded">job.completed</code>, <code className="bg-muted px-1 rounded">job.canceled</code></p>
      </div>
    )},
    { label: "SMS Webhook", url: SMS_WEBHOOK_URL, icon: MessageSquare, desc: "Receives inbound text messages from Twilio." },
    { label: "Voice Webhook", url: VOICE_WEBHOOK_URL, icon: Phone, desc: "Handles inbound calls with IVR, routing, and voicemail." },
    { label: "Stripe Webhook", url: STRIPE_WEBHOOK_URL, icon: CreditCard, desc: "Payment confirmations and subscription events." },
    { label: "Facebook Lead Ads", url: FB_LEAD_WEBHOOK_URL, icon: Users, desc: "Receives leads from Facebook forms. JARVIS auto-texts new leads.", setup: (
      <div className="text-xs text-muted-foreground space-y-1.5 bg-muted/50 rounded-lg p-3">
        <p className="font-semibold">Setup:</p>
        <p>1. Go to <strong>Facebook Business - Integrations - Leads Access</strong></p>
        <p>2. Add the webhook URL above</p>
        <p>3. Verify token: <code className="bg-muted px-1 rounded">cs-ultra-leads</code></p>
        <p>4. Subscribe to <code className="bg-muted px-1 rounded">leadgen</code> events</p>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      {webhooks.map((wh) => {
        const Icon = wh.icon;
        return (
          <Card key={wh.label}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Icon className="h-4 w-4" /> {wh.label}</CardTitle>
              <CardDescription className="text-xs">{wh.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={wh.url} className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(wh.url, wh.label)}><Copy className="h-4 w-4" /></Button>
              </div>
              {wh.setup}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">API Secrets</CardTitle>
          <CardDescription className="text-xs">Required credentials from third-party services.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-3 bg-muted/50 rounded-lg p-3">
            <div>
              <p className="font-semibold mb-1">Twilio</p>
              <p>- <code className="bg-muted px-1 rounded">TWILIO_ACCOUNT_SID</code></p>
              <p>- <code className="bg-muted px-1 rounded">TWILIO_AUTH_TOKEN</code></p>
              <p>- <code className="bg-muted px-1 rounded">TWILIO_PHONE_NUMBER</code></p>
            </div>
            <div>
              <p className="font-semibold mb-1">Stripe</p>
              <p>- <code className="bg-muted px-1 rounded">STRIPE_SECRET_KEY</code></p>
              <p>- <code className="bg-muted px-1 rounded">STRIPE_WEBHOOK_SECRET</code></p>
            </div>
            <p className="text-green-600 font-medium mt-2">All configured.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function PermitAuthoritiesSection() {
  const { authorities, upsert, remove } = usePermitAuthorities();
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", jurisdiction_type: "city", permit_portal_url: "", inspection_url: "", inspection_phone: "", contact_email: "", zip_codes: "", notes: "" });

  const openEdit = (a?: any) => {
    if (a) {
      setForm({ name: a.name, jurisdiction_type: a.jurisdiction_type, permit_portal_url: a.permit_portal_url || "", inspection_url: a.inspection_url || "", inspection_phone: a.inspection_phone || "", contact_email: a.contact_email || "", zip_codes: (a.zip_codes || []).join(", "), notes: a.notes || "" });
      setEditing(a);
    } else {
      setForm({ name: "", jurisdiction_type: "city", permit_portal_url: "", inspection_url: "", inspection_phone: "", contact_email: "", zip_codes: "", notes: "" });
      setEditing({});
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    const zips = form.zip_codes.split(",").map(z => z.trim()).filter(Boolean);
    upsert.mutate({
      ...(editing?.id ? { id: editing.id } : {}),
      name: form.name, jurisdiction_type: form.jurisdiction_type,
      permit_portal_url: form.permit_portal_url || null, inspection_url: form.inspection_url || null,
      inspection_phone: form.inspection_phone || null, contact_email: form.contact_email || null,
      zip_codes: zips, notes: form.notes || null,
    } as any);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Jurisdictions auto-matched to jobs by zip code.</p>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit()}>
          <Plus className="h-3 w-3" /> Add Authority
        </Button>
      </div>
      <div className="space-y-2">
        {authorities.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3 text-xs">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-semibold text-foreground">{a.name} <Badge variant="outline" className="ml-1 text-[10px]">{a.jurisdiction_type}</Badge></p>
              {a.permit_portal_url && <p className="text-muted-foreground truncate">Permit: <a href={a.permit_portal_url} target="_blank" rel="noopener" className="text-primary hover:underline">{new URL(a.permit_portal_url).hostname}</a></p>}
              {a.inspection_phone && <p className="text-muted-foreground">Phone: {a.inspection_phone}</p>}
              {a.zip_codes.length > 0 && <p className="text-muted-foreground">Zips: {a.zip_codes.slice(0, 8).join(", ")}{a.zip_codes.length > 8 ? ` +${a.zip_codes.length - 8} more` : ""}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => remove.mutate(a.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {authorities.length === 0 && <p className="text-xs text-muted-foreground italic">No authorities configured yet.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} Permit Authority</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="City of San Antonio" /></div>
            <div className="space-y-1"><Label className="text-xs">Type</Label>
              <Select value={form.jurisdiction_type} onValueChange={(v) => setForm(f => ({ ...f, jurisdiction_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="city">City</SelectItem>
                  <SelectItem value="county">County</SelectItem>
                  <SelectItem value="utility">Utility</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Permit Portal URL</Label><Input type="url" value={form.permit_portal_url} onChange={(e) => setForm(f => ({ ...f, permit_portal_url: e.target.value }))} placeholder="https://..." /></div>
            <div className="space-y-1"><Label className="text-xs">Inspection URL</Label><Input type="url" value={form.inspection_url} onChange={(e) => setForm(f => ({ ...f, inspection_url: e.target.value }))} placeholder="https://..." /></div>
            <div className="space-y-1"><Label className="text-xs">Inspection Phone</Label><Input value={form.inspection_phone} onChange={(e) => setForm(f => ({ ...f, inspection_phone: e.target.value }))} placeholder="(210) 555-1234" /></div>
            <div className="space-y-1"><Label className="text-xs">Contact Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="permits@sanantonio.gov" /></div>
            <div className="space-y-1"><Label className="text-xs">Zip Codes (comma-separated)</Label><Input value={form.zip_codes} onChange={(e) => setForm(f => ({ ...f, zip_codes: e.target.value }))} placeholder="78201, 78202, 78203" /></div>
            <div className="space-y-1"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// Sidebar sections for admin
type DevFunction = {
  name: string;
  plainEnglish: string;
  trigger: string;
  owner: string;
  status: "Keep" | "Watch" | "Retire";
};

const DEV_FUNCTIONS: DevFunction[] = [
  { name: "voice-webhook / voice-ivr-handler", plainEnglish: "Answers incoming calls, reads the IVR canvas, routes callers, and falls back to voicemail or answering service.", trigger: "Twilio incoming voice webhook", owner: "Phone", status: "Keep" },
  { name: "twilio-token / twilio-voice-twiml", plainEnglish: "Gives the browser and Android app safe temporary phone access without exposing Twilio secrets.", trigger: "Softphone startup and outbound calls", owner: "Phone", status: "Keep" },
  { name: "voice-status-callback / reconcile-stuck-calls", plainEnglish: "Records call progress, cleans up stuck calls, and keeps the phone dashboard honest.", trigger: "Twilio call events and scheduled cleanup", owner: "Phone", status: "Keep" },
  { name: "sms-webhook / sms-status-callback / send-sms / archive-sms-media", plainEnglish: "Receives inbound texts, saves MMS files permanently, sends approved messages, and tracks delivery status.", trigger: "Twilio SMS webhooks and app actions", owner: "SMS", status: "Keep" },
  { name: "ai-task-agent / jarvis-suggest-actions", plainEnglish: "Finds what needs attention and suggests actions, but should keep a person in the loop before acting.", trigger: "JARVIS dashboard and background checks", owner: "JARVIS", status: "Keep" },
  { name: "draft-sms-reply / summarize-call / transcribe-audio", plainEnglish: "Turns calls and messages into useful notes and SMS drafts for review.", trigger: "Inbound SMS, recordings, and Deepgram/OpenAI processing", owner: "JARVIS", status: "Keep" },
  { name: "cart-checkout / cart-send-receipt / estimate-checkout", plainEnglish: "Runs customer proposal carts, repair approvals, checkout, receipts, and estimate payment links.", trigger: "Customer cart and Stripe checkout", owner: "Payments", status: "Keep" },
  { name: "stripe-webhook / stripe-checkout", plainEnglish: "Confirms payments and updates invoices after Stripe finishes the money movement.", trigger: "Stripe checkout and webhook events", owner: "Payments", status: "Keep" },
  { name: "lookup-property / fetch-weather-forecast / calculate-travel-times", plainEnglish: "Adds property, weather, and travel context with API guardrails and caching.", trigger: "Job screens, scheduling, and prefetch jobs", owner: "Field Ops", status: "Keep" },
  { name: "reconcile-equipment / seed-repair-catalog / repair-quote-agent", plainEnglish: "Keeps equipment, repairs, and repair quote options usable for technicians and customer carts.", trigger: "Catalog repair flow and admin maintenance", owner: "Catalog", status: "Keep" },
  { name: "phone-debug-log / twilio-call-inspect / twilio-sms-inspect", plainEnglish: "Shows what Twilio saw so phone and SMS bugs are diagnosable instead of guesswork.", trigger: "Phone/SMS debugging and admin checks", owner: "Dev / Ops", status: "Keep" },
  { name: "apiUsageLog / systemTrace / retry-queue-processor", plainEnglish: "Tracks API cost, errors, retries, heartbeats, and cleanup in one operations view.", trigger: "Every important function and scheduled cleanup", owner: "Dev / Ops", status: "Keep" },
  { name: "hcp-* migration functions", plainEnglish: "Temporary import and archive helpers while we finish leaving Housecall Pro behind.", trigger: "Manual migration tools only", owner: "Migration", status: "Watch" },
  { name: "auto-advance-workflow / run-lead-drip", plainEnglish: "Old workflow and drip ideas that should stay out of the main flow unless we deliberately rebuild them.", trigger: "Legacy background jobs", owner: "Legacy", status: "Retire" },
];

const DEV_APIS = [
  { name: "Twilio", use: "Calls, SMS, MMS, IVR, voicemail, call status, and softphone tokens.", guardrail: "All phone events should land in System Log and call history." },
  { name: "Stripe", use: "Checkout, invoices, carts, customer payment links, and receipts.", guardrail: "Webhook confirms payment before app marks it paid." },
  { name: "OpenAI", use: "JARVIS intent, summaries, SMS drafts, customer notes, and quote assistance.", guardrail: "Human approval before customer-facing actions." },
  { name: "Deepgram", use: "Call transcription and voice notes from technicians.", guardrail: "Store transcript and source recording link together." },
  { name: "Google Maps", use: "Address validation, travel ETA, route cache, and street-view/property context.", guardrail: "Cache aggressively and monitor call counts." },
  { name: "Firecrawl", use: "Property and web research where structured APIs do not cover the job.", guardrail: "Use only when cached data is missing or stale." },
  { name: "Supabase", use: "Database, auth, storage, edge functions, logs, and main company records.", guardrail: "No legacy hosted-app URLs or old project references." },
];

const JARVIS_SKILLS = [
  "Understands inbound SMS and call transcripts without assuming the customer wants a brand-new job.",
  "Checks whether a customer has multiple properties before picking an address.",
  "Suggests the next action on jobs, estimates, carts, invoices, and missed calls.",
  "Drafts customer SMS, notes, quotes, and follow-ups for human approval.",
  "Helps technicians build repair or replacement options that become customer cart choices.",
  "Uses the IVR canvas as the source for IVR-triggered SMS wording.",
];

const HCP_ARCHIVE_SOURCES = ["customer", "estimate", "job"] as const;
const HCP_ARCHIVE_STATUSES = ["archived", "metadata", "failed", "missing", "too_large"] as const;

function HcpArchiveHealthCard() {
  const { data: counts = [], isLoading, refetch } = useQuery({
    queryKey: ["hcp-attachment-archive-health"],
    queryFn: async () => {
      const requests = HCP_ARCHIVE_SOURCES.flatMap((source) =>
        HCP_ARCHIVE_STATUSES.map(async (status) => {
          const { count, error } = await supabase
            .from("hcp_attachments" as any)
            .select("id", { count: "exact", head: true })
            .eq("source_type", source)
            .eq("archive_status", status);
          if (error) throw error;
          return { source, status, count: count ?? 0 };
        })
      );
      return Promise.all(requests);
    },
    refetchInterval: 60_000,
  });

  const countFor = (source: string, status: string) =>
    counts.find((row) => row.source === source && row.status === status)?.count ?? 0;
  const totalArchived = counts.filter((row) => row.status === "archived").reduce((sum, row) => sum + row.count, 0);
  const needsAttention = counts
    .filter((row) => ["metadata", "failed"].includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
  const tooLarge = counts.filter((row) => row.status === "too_large").reduce((sum, row) => sum + row.count, 0);
  const missing = counts.filter((row) => row.status === "missing").reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">HCP Attachment Archive</CardTitle>
            <CardDescription>
              Shows whether old Housecall Pro photos and files are copied into UltraOffice storage.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border bg-emerald-500/5 p-3">
            <p className="text-2xl font-bold text-emerald-700">{totalArchived.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">archived files</p>
          </div>
          <div className="rounded-lg border bg-amber-500/5 p-3">
            <p className="text-2xl font-bold text-amber-700">{needsAttention.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">left to process</p>
          </div>
          <div className="rounded-lg border bg-orange-500/5 p-3">
            <p className="text-2xl font-bold text-orange-700">{tooLarge.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">too large for normal upload</p>
          </div>
          <div className="rounded-lg border bg-muted/60 p-3">
            <p className="text-2xl font-bold">{missing.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">missing from HCP</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-6 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <span>Source</span>
            <span className="text-right">Archived</span>
            <span className="text-right">Waiting</span>
            <span className="text-right">Failed</span>
            <span className="text-right">Too large</span>
            <span className="text-right">Missing</span>
          </div>
          {HCP_ARCHIVE_SOURCES.map((source) => (
            <div key={source} className="grid grid-cols-6 border-t px-3 py-2 text-sm">
              <span className="capitalize font-medium">{source}</span>
              <span className="text-right">{countFor(source, "archived").toLocaleString()}</span>
              <span className="text-right">{countFor(source, "metadata").toLocaleString()}</span>
              <span className="text-right">{countFor(source, "failed").toLocaleString()}</span>
              <span className="text-right">{countFor(source, "too_large").toLocaleString()}</span>
              <span className="text-right">{countFor(source, "missing").toLocaleString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DevFunctionInventory() {
  const statusClass = (status: DevFunction["status"]) => {
    if (status === "Keep") return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
    if (status === "Watch") return "bg-amber-500/10 text-amber-700 border-amber-200";
    return "bg-rose-500/10 text-rose-700 border-rose-200";
  };

  return (
    <div className="space-y-3">
      {DEV_FUNCTIONS.map((fn) => (
        <Card key={fn.name} className="border-l-4 border-l-primary/50">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-sm">{fn.name}</h3>
                  <Badge variant="outline" className={cn("text-[10px]", statusClass(fn.status))}>{fn.status}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{fn.owner}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{fn.plainEnglish}</p>
              </div>
              <p className="text-xs text-muted-foreground md:max-w-[260px]">
                <span className="font-semibold text-foreground">Runs when: </span>{fn.trigger}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DevOpsCenter() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="bg-primary text-primary-foreground">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" /> Dev / Ops Control Room
              </CardTitle>
              <CardDescription className="text-primary-foreground/80">
                One place for active functions, webhooks, JARVIS skills, and the heartbeat/debug trail.
              </CardDescription>
            </div>
            <Button asChild variant="secondary" className="gap-2">
              <Link to="/system-log"><Activity className="h-4 w-4" /> Open System Log</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-3"><p className="text-2xl font-bold">{DEV_FUNCTIONS.filter(f => f.status === "Keep").length}</p><p className="text-xs text-muted-foreground">kept function groups</p></div>
          <div className="rounded-lg border bg-card p-3"><p className="text-2xl font-bold">{DEV_APIS.length}</p><p className="text-xs text-muted-foreground">active outside services</p></div>
          <div className="rounded-lg border bg-card p-3"><p className="text-2xl font-bold">{JARVIS_SKILLS.length}</p><p className="text-xs text-muted-foreground">JARVIS responsibilities</p></div>
          <div className="rounded-lg border bg-card p-3"><p className="text-2xl font-bold">1</p><p className="text-xs text-muted-foreground">debug heartbeat home</p></div>
        </CardContent>
      </Card>

      <Tabs defaultValue="functions" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="functions">Functions</TabsTrigger>
          <TabsTrigger value="apis">APIs & Webhooks</TabsTrigger>
          <TabsTrigger value="jarvis">JARVIS</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>
        <TabsContent value="functions">
          <Card>
            <CardHeader><CardTitle className="text-base">Function Inventory</CardTitle><CardDescription>Plain-English map of what we are keeping, watching, and retiring.</CardDescription></CardHeader>
            <CardContent><DevFunctionInventory /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="apis" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Active APIs</CardTitle><CardDescription>Services this app is allowed to use, with the safety rule for each one.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {DEV_APIS.map((api) => (
                <div key={api.name} className="rounded-lg border p-3">
                  <h3 className="font-semibold text-sm">{api.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{api.use}</p>
                  <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Guardrail: </span>{api.guardrail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <WebhooksIntegrationsSection />
        </TabsContent>
        <TabsContent value="jarvis" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">JARVIS Responsibilities</CardTitle><CardDescription>What the assistant is supposed to help with, without drifting into hidden automation.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {JARVIS_SKILLS.map((skill) => <div key={skill} className="rounded-lg border bg-muted/30 p-3 text-sm">{skill}</div>)}
            </CardContent>
          </Card>
          <HumanInTheLoopCard />
          <IntakeSimulator />
          <CopilotPermissionsCard />
        </TabsContent>
        <TabsContent value="operations">
          <Card>
            <CardHeader><CardTitle className="text-base">Operations Tools</CardTitle><CardDescription>Admin helpers we still need while the app becomes the main place the company works.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <HcpArchiveHealthCard />
              <CompanyDocumentsCard />
              <div className="border-t pt-4"><h4 className="text-xs font-semibold mb-2">Permit Authorities</h4><PermitAuthoritiesSection /></div>
              <div className="border-t pt-4"><h4 className="text-xs font-semibold mb-2">Scout & Test Automation</h4><PermitScoutPanel /></div>
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold mb-2">Dispatch Utilities</h4>
                <div className="flex flex-wrap gap-2"><DispatchRecalcButton /><ComfortClubRescanButton /><HcpCustomerSyncButton /></div>
              </div>
              <div className="border-t pt-4"><h4 className="text-xs font-semibold mb-2">HCP Migration Tools</h4><HcpHistoryImport /><HcpPhotoArchive /></div>
              <DuplicateManager />
              <MetaAudiencesCard />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ADMIN_SECTIONS = ADMIN_SETTING_SECTIONS;

const ADMIN_GROUPS = Array.from(new Set(ADMIN_SECTIONS.map((section) => section.group)));

const SECTION_KEYS = new Set(ADMIN_SECTIONS.map((section) => section.key));
const RETIRED_ADMIN_SECTION_TARGETS: Record<string, string> = {
  billing: "payments",
  notifications: "voice",
  leads: "data",
  "customer-intake": "dev",
  estimates: "payments",
  jobs: "dev",
  pricebook: "payments",
  "service-plans": "payments",
  checklists: "data",
  "lead-sources": "data",
  tags: "data",
  tools: "dev",
  webhooks: "dev",
  jarvis: "dev",
  marketing: "dev",
  operations: "dev",
  booking: "dev",
  "customer-portal": "dev",
  pipeline: "dev",
  "job-fields": "dev",
};
const LEGACY_TAB_TO_SECTION: Record<string, string> = {
  config: "company",
  settings: "company",
  team: "employees",
  employees: "employees",
  tools: "dev",
  reports: "reports",
  payments: "payments",
  billing: "payments",
  notifications: "voice",
  voice: "voice",
  jarvis: "dev",
  marketing: "dev",
  operations: "dev",
  webhooks: "dev",
};

function resolveAdminSection(section: string | null, legacyTab: string | null) {
  if (section && SECTION_KEYS.has(section)) return section;
  if (section && RETIRED_ADMIN_SECTION_TARGETS[section]) return RETIRED_ADMIN_SECTION_TARGETS[section];
  if (legacyTab) return LEGACY_TAB_TO_SECTION[legacyTab] ?? null;
  return null;
}

function AdminSectionContent({ section }: { section: string }) {
  switch (section) {
    case "company":
      return <div className="space-y-4"><CompanySettingsCard /><NavOrderEditor /></div>;
    case "employees":
      return <EmployeeHub />;
    case "voice":
      return <div className="space-y-4"><RegisteredDevicesCard /><AnnouncerSettingsCard /><RingtoneSettingsCard /></div>;
    case "payments":
      return <div className="space-y-4"><PaymentPlanRulesCard /><LineItemTemplatesCard /></div>;
    case "data":
      return <CustomerDataTools />;
    case "dev":
      return <DevOpsCenter />;
    case "reports":
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Operations Monitoring
              </CardTitle>
              <CardDescription>
                This page is staying focused on API usage, cost guardrails, and backend health until the business reporting sources are fully normalized.
              </CardDescription>
            </CardHeader>
          </Card>
          <ApiCostsOverviewCard />
          <ApiUsageHourlyChart />
          <ApiCostTrackerCard />
        </div>
      );
    default:
      return null;
  }
}

// Main Admin Page
export default function Admin() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = resolveAdminSection(searchParams.get("section"), searchParams.get("tab"));
  const isEmployeePaySection = activeSection === "employees" && searchParams.get("employeeTab") === "pay";
  const { loading } = useAuth();
  const allowedTabs = useEmployeeTabAccess();

  if (loading) return null;
  if (allowedTabs && !allowedTabs.has("admin") && !(isEmployeePaySection && allowedTabs.has("pay"))) {
    return <Navigate to="/" replace />;
  }

  const handleNavigateSection = (section: string) => {
    setSearchParams({ section });
  };

  const handleBack = () => {
    setSearchParams({});
  };

  // If no section selected, show the icon-grid hub
  if (!activeSection) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <AdminHub onNavigateSection={handleNavigateSection} />
      </div>
    );
  }

  // Drill-down into a specific section
  const sectionMeta = ADMIN_SECTIONS.find(s => s.key === activeSection);
  const SectionIcon = sectionMeta?.icon || Settings2;

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="h-[calc(100vh-3rem)] min-h-0">
        <ModuleWorkbench
          title={sectionMeta?.label || "Admin"}
          eyebrow="Settings"
          description="Company configuration, permissions, communications, money, data tools, and system health."
          icon={<SectionIcon className="h-4.5 w-4.5" />}
          primaryAction={
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4" /> Admin Home
            </Button>
          }
          sideRail={
            <nav className="space-y-4 p-2">
              {ADMIN_GROUPS.map((group) => (
                <div key={group} className="space-y-1">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                  {ADMIN_SECTIONS.filter((section) => section.group === group).map((section) => {
                    const Icon = section.icon;
                    const active = section.key === activeSection;
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => handleNavigateSection(section.key)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                          active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{section.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          }
          contentClassName="p-4 md:p-6"
        >
          <div className="mx-auto max-w-5xl">
            {isEmployeePaySection && allowedTabs && !allowedTabs.has("admin") ? (
              <PaysheetPanel />
            ) : (
              <AdminSectionContent section={activeSection} />
            )}
          </div>
        </ModuleWorkbench>
      </main>
    </div>
  );
}
