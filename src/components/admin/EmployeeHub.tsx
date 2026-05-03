/**
 * EmployeeHub.tsx — Centralized hub for everything employee-related.
 *
 * Sub-tabs:
 *   • Roster       — list, add, edit, deactivate employees
 *   • Permissions  — page-access matrix (PageAccessCard) + impersonation (ViewAsCard)
 *   • Pay & Payroll — pay rates, time tracking, paysheet
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Shield, DollarSign, Plus, Trash2, UserPlus, Mail, MessageSquare, Power, KeyRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEmployees, useAddEmployee, useUpdateEmployee, useToggleEmployee, useDeleteEmployee, useInviteUser } from "@/hooks/useEmployees";
import { ROLE_LABELS, type RoleKey } from "@/lib/roleAccessDefaults";
import { PageAccessCard } from "@/components/PageAccessCard";
import { ViewAsCard } from "@/components/ViewAsCard";
import { PayRatesCard } from "@/components/PayRatesCard";
import { TimeTrackerCard } from "@/components/TimeTrackerCard";
import { PaysheetPanel } from "@/components/PaysheetPanel";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { ClickToCall } from "@/components/ClickToCall";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { formatPhone, formatPhoneInput } from "@/lib/formatters";

const CANONICAL_ROLES: RoleKey[] = ["admin", "office", "supervisor", "tech", "installer"];

/* ──────────── Roster Tab ──────────── */
function RosterTab() {
  const { data: employees } = useEmployees();
  const addEmployee = useAddEmployee();
  const updateEmployee = useUpdateEmployee();
  const toggleEmployee = useToggleEmployee();
  const deleteEmployee = useDeleteEmployee();
  const inviteUser = useInviteUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [appRolesMap, setAppRolesMap] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, employee_id");
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      if (!profiles || !roles) return;
      const userToRole: Record<string, string> = {};
      for (const r of roles) userToRole[r.user_id] = r.role;
      const map: Record<string, string> = {};
      for (const p of profiles) {
        if (p.employee_id && userToRole[p.id]) map[p.employee_id] = userToRole[p.id];
      }
      setAppRolesMap(map);
    })();
  }, []);

  // Add/Edit dialog state
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", role: "tech" as RoleKey, phone: "", home_address: "", email: "" });
  const [deleting, setDeleting] = useState<any | null>(null);

  // Invite/reset password dialog
  const [inviting, setInviting] = useState<any | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("tech");

  const openAdd = () => {
    setForm({ name: "", role: "tech", phone: "", home_address: "", email: "" });
    setAdding(true);
  };

  const openEdit = (emp: any) => {
    const role: RoleKey = CANONICAL_ROLES.includes(emp.role as RoleKey) ? (emp.role as RoleKey) : "tech";
    setForm({
      name: emp.name ?? "",
      role,
      phone: formatPhoneInput(emp.phone),
      home_address: emp.home_address ?? "",
      email: emp.email ?? "",
    });
    setEditing(emp);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editing) {
      updateEmployee.mutate({
        id: editing.id, name: form.name, role: form.role,
        phone: form.phone || null, home_address: form.home_address || null, email: form.email || null,
      });
      setEditing(null);
    } else {
      addEmployee.mutate({
        name: form.name, role: form.role,
        phone: form.phone || null, home_address: form.home_address || null, email: form.email || null,
      });
      setAdding(false);
    }
  };

  const handleInvite = () => {
    if (!inviteEmail.trim() || !invitePassword.trim() || !inviting) return;
    if (invitePassword.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters", variant: "destructive" });
      return;
    }
    inviteUser.mutate(
      { email: inviteEmail, password: invitePassword, employee_id: inviting.id, role: inviteRole, full_name: inviting.name },
      {
        onSuccess: () => {
          toast({ title: "Account created", description: `${inviting.name} can now log in.` });
          setInviting(null); setInviteEmail(""); setInvitePassword("");
        },
        onError: (err: any) => toast({ title: "Invite failed", description: err.message, variant: "destructive" }),
      }
    );
  };

  // Group by canonical role
  const grouped: Record<RoleKey, any[]> = { admin: [], office: [], supervisor: [], tech: [], installer: [] };
  for (const emp of employees ?? []) {
    const k: RoleKey = CANONICAL_ROLES.includes(emp.role as RoleKey) ? (emp.role as RoleKey) : "tech";
    grouped[k].push(emp);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Team Roster</CardTitle>
            <CardDescription className="text-xs">
              {employees?.length ?? 0} employees grouped by role. This is who can be assigned, contacted, and shown around the app.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-lg border bg-muted/25 p-3 text-xs text-muted-foreground md:grid-cols-3">
            <div className="flex items-start gap-2">
              <Power className="mt-0.5 h-3.5 w-3.5 text-primary" />
              <p><span className="font-semibold text-foreground">Active employee</span> means they show up for scheduling, pay, testing, and employee pickers.</p>
            </div>
            <div className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 text-primary" />
              <p><span className="font-semibold text-foreground">Login</span> creates or resets their app password. It does not control whether they are active.</p>
            </div>
            <div className="flex items-start gap-2">
              <Trash2 className="mt-0.5 h-3.5 w-3.5 text-destructive" />
              <p><span className="font-semibold text-foreground">Delete</span> removes the roster record. Use inactive first when someone may return.</p>
            </div>
          </div>
          {CANONICAL_ROLES.map(roleKey => {
            const list = grouped[roleKey];
            if (list.length === 0) return null;
            return (
              <div key={roleKey}>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                  {ROLE_LABELS[roleKey]} - {list.length}
                </p>
                <div className="space-y-1">
                  {list.map((emp: any) => (
                    <div key={emp.id} className="flex flex-col gap-3 border rounded-md px-3 py-3 hover:bg-muted/30 transition-colors lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(emp)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{emp.name}</span>
                          {appRolesMap[emp.id] === "admin" && (
                            <Badge className="text-[9px] bg-primary/15 text-primary border-primary/30">Login: Admin</Badge>
                          )}
                          {appRolesMap[emp.id] === "supervisor" && (
                            <Badge variant="outline" className="text-[9px] border-warning text-warning">Login: Supervisor</Badge>
                          )}
                          {emp.is_active === false && <Badge variant="outline" className="text-[9px]">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          {emp.phone && (
                            <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <ClickToCall phone={emp.phone} contactName={emp.name} iconClassName="h-3 w-3" className="text-muted-foreground hover:text-primary">
                                {formatPhone(emp.phone) || emp.phone}
                              </ClickToCall>
                              <button
                                onClick={() => {
                                  openSmsComposer(emp.phone, { contactName: emp.name });
                                }}
                                className="hover:text-primary"
                                title={`SMS ${emp.name}`}
                              >
                                <MessageSquare className="h-3 w-3" />
                              </button>
                            </span>
                          )}
                          {emp.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{emp.email}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Button
                          variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1"
                          onClick={() => {
                            setInviting(emp); setInviteEmail(emp.email || ""); setInvitePassword("");
                            setInviteRole(emp.role === "admin" ? "admin" : emp.role === "office" ? "office" : "tech");
                          }}
                          title={emp.email ? "Reset this employee's app login password" : "Create an app login for this employee"}
                        >
                          <UserPlus className="h-3 w-3" /> {emp.email ? "Reset login" : "Create login"}
                        </Button>
                        <div
                          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1"
                          title="Turn this off to hide the employee from normal active staff lists without deleting them."
                        >
                          <Switch
                            checked={emp.is_active ?? true}
                            onCheckedChange={(v) => toggleEmployee.mutate({ id: emp.id, is_active: v })}
                            aria-label={`${emp.name} active employee`}
                          />
                          <div className="min-w-[92px]">
                            <p className="text-[11px] font-semibold leading-none">
                              {emp.is_active === false ? "Inactive" : "Active"}
                            </p>
                            <p className="mt-0.5 text-[10px] leading-none text-muted-foreground">
                              employee
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(emp)}
                          title="Delete employee record"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {(!employees || employees.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-6">No employees yet. Click Add to get started.</p>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={adding || !!editing} onOpenChange={(o) => { if (!o) { setAdding(false); setEditing(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as RoleKey }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CANONICAL_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Page access auto-syncs to role defaults.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: formatPhoneInput(e.target.value) }))} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Home Address</Label>
              <AddressAutocomplete value={form.home_address} onChange={(v) => setForm(f => ({ ...f, home_address: v }))} placeholder="For travel time" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAdding(false); setEditing(null); }}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite/reset PW dialog */}
      <Dialog open={!!inviting} onOpenChange={(o) => { if (!o) setInviting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{inviting?.email ? "Reset Password" : "Create Login"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password</Label>
              <Input type="text" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="6+ chars" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">App Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(null)}>Cancel</Button>
            <Button onClick={handleInvite}>{inviting?.email ? "Reset" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the employee record. Their login account is not deleted automatically.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleting) deleteEmployee.mutate(deleting.id); setDeleting(null); }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ──────────── Pay & Payroll Tab ──────────── */
function PayPayrollTab() {
  return (
    <div className="space-y-4">
      <PayRatesCard />
      <TimeTrackerCard />
      <PaysheetPanel />
    </div>
  );
}

/* ──────────── Hub ──────────── */
export function EmployeeHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("employeeTab") || "roster";
  const initialTab = ["roster", "permissions", "pay"].includes(requestedTab) ? requestedTab : "roster";
  const [tab, setTab] = useState(initialTab);

  const handleTabChange = (nextTab: string) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "roster") {
      nextParams.delete("employeeTab");
    } else {
      nextParams.set("employeeTab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="roster" className="gap-1.5"><Users className="h-3.5 w-3.5" />Roster</TabsTrigger>
        <TabsTrigger value="permissions" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Permissions</TabsTrigger>
        <TabsTrigger value="pay" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />Pay</TabsTrigger>
      </TabsList>

      <TabsContent value="roster" className="mt-4"><RosterTab /></TabsContent>
      <TabsContent value="permissions" className="mt-4 space-y-4">
        <PageAccessCard />
        <ViewAsCard />
      </TabsContent>
      <TabsContent value="pay" className="mt-4"><PayPayrollTab /></TabsContent>
    </Tabs>
  );
}
