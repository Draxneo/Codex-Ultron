import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess } from "@/hooks/useEmployeeTabAccess";
import {
  Package, CreditCard, Brain, ChevronRight, ChevronLeft, Gift, Phone, Mail,
  Settings2, FileText, Webhook, MessageSquare, Users, Shield,
  Plus, Trash2, Pencil, BarChart3, Copy, UserPlus, Building2, Store, MapPin, RefreshCw, ScanSearch, Activity,
} from "lucide-react";
import { AdminHub } from "@/components/AdminHub";
import { EmployeeHub } from "@/components/admin/EmployeeHub";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportsPanel } from "@/components/ReportsPanel";
import { PaysheetPanel } from "@/components/PaysheetPanel";
import { QuickLinksGrid } from "@/components/QuickLinksGrid";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";
import { useCapacitor } from "@/hooks/useCapacitor";

// Config components (absorbed from SettingsPage)
import { CompanySettingsCard } from "@/components/CompanySettingsCard";
import { NavOrderEditor } from "@/components/NavOrderEditor";
import { HumanInTheLoopCard } from "@/components/HumanInTheLoopCard";
import { IntakeSimulator } from "@/components/IntakeSimulator";
import { CopilotPermissionsCard } from "@/components/CopilotPermissionsCard";

import { PageAccessCard } from "@/components/PageAccessCard";
import { ViewAsCard } from "@/components/ViewAsCard";

import { CompanyDocumentsCard } from "@/components/CompanyDocumentsCard";
import { RingtoneSettingsCard } from "@/components/RingtoneSettingsCard";
import { AnnouncerSettingsCard } from "@/components/voice/AnnouncerSettingsCard";
import { RegisteredDevicesCard } from "@/components/admin/RegisteredDevicesCard";

import { PayRatesCard } from "@/components/PayRatesCard";
import { LineItemTemplatesCard } from "@/components/LineItemTemplatesCard";
import { ProfitWatchCard } from "@/components/ProfitWatchCard";
import { TimeTrackerCard } from "@/components/TimeTrackerCard";
import { MetaAudiencesCard } from "@/components/MetaAudiencesCard";
import { PaymentPlanRulesCard } from "@/components/PaymentPlanRulesCard";
import { useEmployees, useAddEmployee, useToggleEmployee, useUpdateEmployee, useInviteUser, useDeleteEmployee } from "@/hooks/useEmployees";
import { usePermitAuthorities } from "@/hooks/usePermitAuthorities";
import { PermitScoutPanel } from "@/components/PermitScoutPanel";
import { DuplicateManager } from "@/components/DuplicateManager";
import { HcpHistoryImport } from "@/components/HcpHistoryImport";
import { HcpPhotoArchive } from "@/components/HcpPhotoArchive";
import { Textarea } from "@/components/ui/textarea";
import { ApiCostTrackerCard } from "@/components/ApiCostTrackerCard";
import { ApiCostsOverviewCard } from "@/components/ApiCostsOverviewCard";
import { ApiUsageHourlyChart } from "@/components/ApiUsageHourlyChart";
import { ClickToCall } from "@/components/ClickToCall";
import HcpCustomerSyncButton from "@/components/HcpCustomerSyncButton";

// ─── Webhook URLs ───
const WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/hcp-webhook`;
const SMS_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/sms-webhook`;
const STRIPE_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/stripe-webhook`;
const VOICE_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/voice-webhook`;
const FB_LEAD_WEBHOOK_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/facebook-lead-webhook`;

// ─── Dispatch Utility Buttons (moved from Jobs toolbar) ───
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

// ─── Tool Card Registry (only standalone-page tools) ───
interface ToolCardDef {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  borderColor: string;
  iconColor: string;
  iconBg: string;
  to: string;
  hasCanvas?: boolean;
}

const TOOL_CARDS: ToolCardDef[] = [
  { key: "jarvis", title: "JARVIS", description: "Proactive dashboard — what needs attention, AI activity, and quick actions.", icon: Brain, borderColor: "border-l-violet-500", iconColor: "text-violet-500", iconBg: "bg-violet-500/10", to: "/copilot" },
  { key: "shopping-cart", title: "Catalog & Pricebook", description: "Browse and manage equipment matchups, repairs, parts, and AHRI lookups — your master pricebook.", icon: Package, borderColor: "border-l-orange-500", iconColor: "text-orange-500", iconBg: "bg-orange-500/10", to: "/catalog" },
  { key: "agent-training", title: "JARVIS Training", description: "Configure JARVIS instructions, tools, knowledge base, and output templates.", icon: Brain, borderColor: "border-l-violet-500", iconColor: "text-violet-500", iconBg: "bg-violet-500/10", to: "/agent-training" },
  { key: "phone-system", title: "IVR Builder", description: "Canonical IVR editor for greetings, departments, queues, and routing.", icon: Phone, borderColor: "border-l-cyan-500", iconColor: "text-cyan-500", iconBg: "bg-cyan-500/10", to: "/ivr-builder", hasCanvas: true },
  { key: "payments", title: "Payments Dashboard", description: "Track invoices, payment plans, and revenue.", icon: CreditCard, borderColor: "border-l-sky-500", iconColor: "text-sky-500", iconBg: "bg-sky-500/10", to: "/payments" },
  { key: "locations", title: "Supply Houses & Vendors", description: "Manage vendors, ordering portals, brand mappings, and locations.", icon: Store, borderColor: "border-l-teal-500", iconColor: "text-teal-500", iconBg: "bg-teal-500/10", to: "/vendors" },
  { key: "agent-network", title: "AI Agent Network", description: "Visual map of specialist AI agents, their tools, and handoff connections.", icon: Brain, borderColor: "border-l-purple-500", iconColor: "text-purple-500", iconBg: "bg-purple-500/10", to: "/agent-network", hasCanvas: true },
  { key: "lsa-leads", title: "LSA Leads", description: "View and manage Google LSA leads.", icon: MapPin, borderColor: "border-l-blue-500", iconColor: "text-blue-500", iconBg: "bg-blue-500/10", to: "/leads?source=google_lsa" },
  { key: "system-log", title: "System Log (Mission Control)", description: "Errors, cron health, retry queue, and on-call pages — full operational telemetry.", icon: Activity, borderColor: "border-l-rose-500", iconColor: "text-rose-500", iconBg: "bg-rose-500/10", to: "/system-log" },
];

// Canonical role options (must match employees_role_canonical_check constraint)
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "office", label: "Office" },
  { value: "supervisor", label: "Supervisor" },
  { value: "tech", label: "Technician" },
  { value: "installer", label: "Installer" },
];

function ToolCard({ card }: { card: ToolCardDef }) {
  return (
    <Link
      to={card.to}
      className={`flex items-start gap-3 rounded-lg border border-l-4 ${card.borderColor} bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-l-[6px]`}
    >
      <div className={`shrink-0 rounded-lg p-2 ${card.iconBg}`}>
        <card.icon className={`h-4 w-4 ${card.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
            {card.title}
            {card.hasCanvas && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-bold tracking-wider bg-primary/10 text-primary border-0">
                CANVAS
              </Badge>
            )}
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
      </div>
    </Link>
  );
}

// ─── Referrals Panel ───
function ReferralsPanel() {
  const { toast: t } = useToast();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("referrals")
        .select("*, referral_codes(code, customers(first_name, last_name))")
        .order("created_at", { ascending: false }).limit(50);
      setReferrals(data || []);
      setLoading(false);
    })();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "paid") updates.bonus_awarded = true;
    await supabase.from("referrals").update(updates).eq("id", id);
    setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    t({ title: "Updated", description: `Referral marked as ${status}` });
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading referrals...</p>;
  if (!referrals.length) return <p className="text-sm text-muted-foreground py-4">No referrals yet</p>;

  return (
    <div className="space-y-2">
      {referrals.map(r => {
        const referrer = r.referral_codes?.customers;
        const referrerName = referrer ? [referrer.first_name, referrer.last_name].filter(Boolean).join(" ") : r.referrer_code;
        return (
          <Card key={r.id} className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{r.referred_name}</span>
                <span className="text-xs text-muted-foreground ml-2">via {referrerName}</span>
              </div>
              <Select defaultValue={r.status} onValueChange={(val) => updateStatus(r.id, val)}>
                <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="paid">Bonus Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-x-3">
              {r.referred_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.referred_phone}</span>}
              {r.referred_email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.referred_email}</span>}
              <span>{format(new Date(r.created_at), "MMM d, yyyy")}</span>
            </div>
            {r.service_needed && <p className="text-xs mt-1">{r.service_needed}</p>}
          </Card>
        );
      })}
    </div>
  );
}

// Small controlled input that only saves on blur — prevents mutation spam
function OooForwardInput({ initialValue, onSave }: { initialValue: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initialValue);
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value !== initialValue) onSave(value); }}
      className="w-40 h-7 text-xs"
      placeholder="Cell to forward to"
    />
  );
}

function EditEmployeeDialog({
  employee,
  open,
  onClose,
  onSave,
}: {
  employee: any;
  open: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; role: string; phone: string; home_address: string; email: string }) => void;
}) {
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<string[]>(["service_tech"]);
  const [phone, setPhone] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open || !employee) return;
    setName(employee.name || "");
    setRoles((employee.role || "service_tech").split(",").filter(Boolean));
    setPhone(employee.phone || "");
    setHomeAddress(employee.home_address || "");
    setEmail(employee.email || "");
  }, [open, employee]);

  const toggleRole = (role: string) => {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  };

  const handleSave = () => {
    if (!name.trim() || roles.length === 0) return;
    onSave({ name, role: roles.join(","), phone, home_address: homeAddress, email });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Employee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input placeholder="email@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Home Address</Label>
            <AddressAutocomplete value={homeAddress} onChange={setHomeAddress} placeholder="For travel time calculation" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={roles.includes(opt.value)} onCheckedChange={() => toggleRole(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Team Section (absorbed from SettingsPage) ───
function TeamSection() {
  const { data: employees } = useEmployees();
  const addEmployee = useAddEmployee();
  const toggleEmployee = useToggleEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();
  const inviteUser = useInviteUser();
  const navigate = useNavigate();
  const telephony = useTelephonyMode();
  const handoffActive = telephony.isHandoff;
  const [deletingEmployee, setDeletingEmployee] = useState<any>(null);

  // Fetch app roles (user_roles) to show supervisor badges
  const [appRolesMap, setAppRolesMap] = useState<Record<string, string>>({});
  useEffect(() => {
    async function fetchAppRoles() {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, employee_id");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (!profiles || !roles) return;
      const userToRole: Record<string, string> = {};
      for (const r of roles) userToRole[r.user_id] = r.role;
      const empToRole: Record<string, string> = {};
      for (const p of profiles) {
        if (p.employee_id && userToRole[p.id]) {
          empToRole[p.employee_id] = userToRole[p.id];
        }
      }
      setAppRolesMap(empToRole);
    }
    fetchAppRoles();
  }, []);

  const [addingEmployee, setAddingEmployee] = useState(false);
  const [empName, setEmpName] = useState("");
  const [empRoles, setEmpRoles] = useState<string[]>(["service_tech"]);
  const [empPhone, setEmpPhone] = useState("");
  const [empHomeAddress, setEmpHomeAddress] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [invitingEmployee, setInvitingEmployee] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("tech");

  const toggleRole = (role: string) => {
    setEmpRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const handleAddEmployee = () => {
    if (!empName.trim() || empRoles.length === 0) return;
    addEmployee.mutate({ name: empName, role: empRoles.join(","), phone: empPhone || null, home_address: empHomeAddress || null, email: empEmail || null });
    setEmpName(""); setEmpPhone(""); setEmpHomeAddress(""); setEmpEmail(""); setEmpRoles(["service_tech"]);
    setAddingEmployee(false);
  };

  const handleInvite = () => {
    if (!inviteEmail.trim() || !invitePassword.trim() || !invitingEmployee) return;
    if (invitePassword.length < 6) { toast({ title: "Password too short", description: "Must be at least 6 characters", variant: "destructive" }); return; }
    inviteUser.mutate(
      { email: inviteEmail, password: invitePassword, employee_id: invitingEmployee.id, role: inviteRole, full_name: invitingEmployee.name },
      {
        onSuccess: (data) => { toast({ title: "Account created", description: `${invitingEmployee.name} can now log in with their email and password.` }); setInvitingEmployee(null); setInviteEmail(""); setInvitePassword(""); },
        onError: (err: any) => { toast({ title: "Invite failed", description: err.message, variant: "destructive" }); },
      }
    );
  };

  const renderEmployeeDialog = (open: boolean, onClose: () => void, title: string, onSave: () => void, saveLabel: string) => (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input placeholder="Full name" value={empName} onChange={(e) => setEmpName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input placeholder="email@company.com" type="email" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input placeholder="+15551234567" value={empPhone} onChange={(e) => setEmpPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Home Address</Label>
            <AddressAutocomplete value={empHomeAddress} onChange={setEmpHomeAddress} placeholder="For travel time calculation" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={empRoles.includes(opt.value)} onCheckedChange={() => toggleRole(opt.value)} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave}>{saveLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Team & User Accounts</CardTitle>
            <CardDescription className="text-xs">Manage employees, login accounts, and roles.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setAddingEmployee(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {employees?.map((emp: any) => (
            <div key={emp.id} className="border-b last:border-0">
              <div className="flex items-center justify-between py-3 gap-2">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                  setEditingEmployee(emp);
                }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{emp.name}</span>
                    {appRolesMap[emp.id] === "supervisor" && (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300 hover:bg-amber-500/20">Supervisor</Badge>
                    )}
                    {appRolesMap[emp.id] === "admin" && (
                      <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">Admin</Badge>
                    )}
                    {(emp.role || "").split(",").map((r: string) => {
                      const label = ROLE_OPTIONS.find(o => o.value === r)?.label || r;
                      return <Badge key={r} variant="secondary" className="text-[10px]">{label}</Badge>;
                    })}
                    {emp.ooo_enabled && <Badge variant="outline" className="text-[9px] border-warning text-warning">OOO</Badge>}
                  </div>
                  {emp.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ClickToCall
                        phone={emp.phone}
                        contactName={emp.name}
                        iconClassName="h-3 w-3"
                        className="text-muted-foreground hover:text-primary"
                      >
                        {emp.phone}
                      </ClickToCall>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (handoffActive) void telephony.openSms(emp.phone);
                          else navigate(`/inbox?section=sms&phone=${encodeURIComponent(emp.phone)}`);
                        }}
                        className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                        title={`SMS ${emp.name}`}
                      >
                        <MessageSquare className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {(emp as any).email && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{(emp as any).email}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                    setInvitingEmployee(emp); setInviteEmail((emp as any).email || ""); setInvitePassword("");
                    setInviteRole(emp.role === "admin" ? "admin" : emp.role === "office" ? "office" : "tech");
                  }}>
                    <UserPlus className="h-3 w-3" /> {(emp as any).email ? "Reset Password" : "Invite"}
                  </Button>
                  <Switch checked={emp.is_active ?? true} onCheckedChange={(checked) => toggleEmployee.mutate({ id: emp.id, is_active: checked })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeletingEmployee(emp)} title="Delete employee">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3 pb-3 pl-2">
                <div className="flex items-center gap-1.5">
                  <Switch checked={emp.ooo_enabled ?? false} onCheckedChange={(checked) => updateEmployee.mutate({ id: emp.id, name: emp.name, role: emp.role, ooo_enabled: checked })} className="scale-75" />
                  <span className="text-[11px] text-muted-foreground">Out of office</span>
                </div>
                {emp.ooo_enabled && (
                  <OooForwardInput
                    key={emp.id}
                    initialValue={emp.ooo_forward_number || ""}
                    onSave={(value) => updateEmployee.mutate({ id: emp.id, name: emp.name, role: emp.role, ooo_forward_number: value || null })}
                  />
                )}
              </div>
              
            </div>
          ))}
          {(!employees || employees.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">No employees added yet</p>}
        </CardContent>
      </Card>
      <div className="pt-4">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold text-muted-foreground">Payroll</h4>
        </div>
        <Separator className="mb-4" />
        <div className="space-y-4">
          <PayRatesCard />
          <TimeTrackerCard />
        </div>
      </div>


      {renderEmployeeDialog(addingEmployee, () => { setAddingEmployee(false); setEmpName(""); setEmpPhone(""); setEmpRoles(["service_tech"]); setEmpHomeAddress(""); setEmpEmail(""); }, "Add Employee", handleAddEmployee, "Add")}

      <EditEmployeeDialog
        employee={editingEmployee}
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        onSave={({ name, role, phone, home_address, email }) => {
          if (!editingEmployee) return;
          updateEmployee.mutate({
            id: editingEmployee.id,
            name,
            role,
            phone: phone || null,
            home_address: home_address || null,
            email: email || null,
          });
          setEditingEmployee(null);
        }}
      />

      <Dialog open={!!invitingEmployee} onOpenChange={(open) => { if (!open) setInvitingEmployee(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Create Login for {invitingEmployee?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">This will create a user account, link it to this employee, and assign an app role.</p>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input type="email" placeholder="email@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <Input type="password" placeholder="Min 6 characters" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App Role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tech">Tech</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvitingEmployee(null)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviteUser.isPending}>
              {inviteUser.isPending ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deletingEmployee} onOpenChange={(open) => { if (!open) setDeletingEmployee(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingEmployee?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this team member. Any jobs or records referencing them may be affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingEmployee) {
                  deleteEmployee.mutate(deletingEmployee.id, {
                    onSuccess: () => { toast({ title: "Employee deleted", description: `${deletingEmployee.name} has been removed.` }); setDeletingEmployee(null); },
                    onError: (err: any) => { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); },
                  });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Webhooks & Integrations Section ───
function WebhooksIntegrationsSection() {
  const copyToClipboard = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  const webhooks = [
    { label: "Job Webhook (HCP)", url: WEBHOOK_URL, icon: Webhook, desc: "Receives new jobs and estimates automatically.", setup: (
      <div className="text-xs text-muted-foreground space-y-1.5 bg-muted/50 rounded-lg p-3">
        <p className="font-semibold">Setup:</p>
        <p>1. Go to your scheduling platform's <strong>Settings → Webhooks</strong></p>
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
        <p>1. Go to <strong>Facebook Business → Integrations → Leads Access</strong></p>
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
              <p>• <code className="bg-muted px-1 rounded">TWILIO_ACCOUNT_SID</code></p>
              <p>• <code className="bg-muted px-1 rounded">TWILIO_AUTH_TOKEN</code></p>
              <p>• <code className="bg-muted px-1 rounded">TWILIO_PHONE_NUMBER</code></p>
            </div>
            <div>
              <p className="font-semibold mb-1">Stripe</p>
              <p>• <code className="bg-muted px-1 rounded">STRIPE_SECRET_KEY</code></p>
              <p>• <code className="bg-muted px-1 rounded">STRIPE_WEBHOOK_SECRET</code></p>
            </div>
            <p className="text-green-600 font-medium mt-2">✅ All configured.</p>
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


// ─── Sidebar sections for admin ───
const ADMIN_SECTIONS = [
  { key: "employees", label: "Employees", icon: Users },
  { key: "company", label: "Company Settings", icon: Settings2 },
  { key: "webhooks", label: "Webhooks & Integrations", icon: Webhook },
  { key: "voice", label: "Voice & Phone", icon: Phone },
  { key: "payments", label: "Payments & Invoicing", icon: CreditCard },
  { key: "jarvis", label: "JARVIS Controls", icon: Brain },
  { key: "marketing", label: "Marketing", icon: BarChart3 },
  { key: "operations", label: "Operations", icon: Building2 },
  { key: "tools", label: "Tools", icon: Package },
  { key: "reports", label: "Dashboard & Reports", icon: BarChart3 },
];

function AdminSectionContent({ section }: { section: string }) {
  switch (section) {
    case "company":
      return <div className="space-y-4"><CompanySettingsCard /><NavOrderEditor /></div>;
    case "employees":
    case "team": // legacy alias
      return <EmployeeHub />;
    case "webhooks":
      return <WebhooksIntegrationsSection />;
    case "voice":
      return <div className="space-y-4"><RegisteredDevicesCard /><AnnouncerSettingsCard /><RingtoneSettingsCard /></div>;
    case "payments":
      return <div className="space-y-4"><PaymentPlanRulesCard /><LineItemTemplatesCard /></div>;
    case "jarvis":
      return <div className="space-y-4"><HumanInTheLoopCard /><IntakeSimulator /><CopilotPermissionsCard /></div>;
    case "marketing":
      return <MetaAudiencesCard />;
    case "operations":
      return (
        <div className="space-y-4">
          <CompanyDocumentsCard />
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-2">Permit Authorities</h4>
            <PermitAuthoritiesSection />
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-2">Scout & Test Automation</h4>
            <PermitScoutPanel />
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-2">Dispatch Utilities</h4>
            <div className="flex flex-wrap gap-2">
              <DispatchRecalcButton />
              <ComfortClubRescanButton />
              <HcpCustomerSyncButton />
            </div>
          </div>
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold mb-2">HCP Migration Tools</h4>
            <HcpHistoryImport />
            <HcpPhotoArchive />
          </div>
          <DuplicateManager />
        </div>
      );
    case "tools":
      return (
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">AI & Automation</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOL_CARDS.filter(c => ["jarvis", "agent-training", "agent-network"].includes(c.key)).map(card => (
                <ToolCard key={card.key} card={card} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Sales & Pricing</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOL_CARDS.filter(c => ["shopping-cart", "sales-presentations"].includes(c.key)).map(card => (
                <ToolCard key={card.key} card={card} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-cyan-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Operations</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOL_CARDS.filter(c => ["phone-system"].includes(c.key)).map(card => (
                <ToolCard key={card.key} card={card} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-sky-500" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Financials & Reporting</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOL_CARDS.filter(c => ["payments", "locations", "lsa-leads"].includes(c.key)).map(card => (
                <ToolCard key={card.key} card={card} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dev & Testing</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TOOL_CARDS.filter(c => ["system-log"].includes(c.key)).map(card => (
                <ToolCard key={card.key} card={card} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Links</h2>
            <QuickLinksGrid excludeCategories={["Supply Houses"]} />
          </div>
        </div>
      );
    case "reports":
      return (
        <div className="space-y-6">
          <ApiCostsOverviewCard />
          <ApiUsageHourlyChart />
          <ApiCostTrackerCard />
          <ReportsPanel />
          <ProfitWatchCard />
          <PaysheetPanel />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" /> Referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ReferralsPanel />
            </CardContent>
          </Card>
        </div>
      );
    default:
      return null;
  }
}

// ─── Main Admin Page ───
export default function Admin() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get("section") || null;
  const { role, loading } = useAuth();
  const allowedTabs = useEmployeeTabAccess();

  if (loading) return null;
  if (allowedTabs && !allowedTabs.has("admin")) {
    return <Navigate to="/pay" replace />;
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

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 min-w-0">
        <div className="mb-6">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2 mb-2" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4" /> Back to Admin
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            {sectionMeta?.label || "Admin"}
          </h1>
        </div>
        <AdminSectionContent section={activeSection} />
      </main>
    </div>
  );
}
