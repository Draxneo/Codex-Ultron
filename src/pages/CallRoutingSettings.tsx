/**
 * CallRoutingSettings — Admin page for managing which recipients each IVR
 * department routes to (Sales, Service, Billing, General).
 *
 * Backed by the `call_routing_rules` table. The server reads these rules
 * after IVR selection and before generating <Dial><Client/></Dial> TwiML,
 * skipping anyone busy or marked Away from Desk.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, GripVertical, Phone } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Rule = {
  id: string;
  department: string;
  employee_name: string;
  priority: number;
  is_active: boolean;
};

type Department = { value: string; label: string; emoji: string; description: string };
type IvrMenuRoutingRow = {
  digit: string;
  label: string | null;
  routing_department_key?: string | null;
};

const ROUTING_DEPARTMENT_KEYS = ["sales", "service", "billing", "general"] as const;
type RoutingDepartmentKey = typeof ROUTING_DEPARTMENT_KEYS[number];

function isRoutingDepartmentKey(value: string | null | undefined): value is RoutingDepartmentKey {
  return ROUTING_DEPARTMENT_KEYS.includes((value || "").toLowerCase().trim() as RoutingDepartmentKey);
}

function keyFromLegacyLabel(label: string | null | undefined): RoutingDepartmentKey {
  const l = (label || "").toLowerCase().trim();
  if (l.includes("sales")) return "sales";
  if (l.includes("service") || l.includes("repair") || l.includes("tech")) return "service";
  if (l.includes("bill") || l.includes("pay") || l.includes("invoic")) return "billing";
  return "general";
}

function routingKeyForOption(option: { label?: string | null; routing_department_key?: string | null }): RoutingDepartmentKey {
  const explicit = (option.routing_department_key || "").toLowerCase().trim();
  return isRoutingDepartmentKey(explicit) ? explicit : keyFromLegacyLabel(option.label);
}

// Map an IVR menu label → emoji for visual grouping. Falls back to 📞.
function emojiFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("sales")) return "💰";
  if (l.includes("service") || l.includes("repair")) return "🔧";
  if (l.includes("bill") || l.includes("pay") || l.includes("account")) return "💳";
  if (l.includes("emergency") || l.includes("urgent")) return "🚨";
  if (l.includes("install")) return "🛠️";
  return "📞";
}

export function CallRoutingSettings() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [newDept, setNewDept] = useState<string>("");
  const [newName, setNewName] = useState("");

  // Pull departments live from the IVR menu so this page always matches what
  // the caller actually hears. Adds a synthetic "general" entry for direct
  // dials that bypass the IVR.
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["ivr-departments-for-routing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ivr_menu_options")
        .select("digit, label, routing_department_key, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      const departmentByKey = new Map<string, Department & { digits: string[]; labels: string[]; usedFallback: boolean }>();
      for (const option of ((data || []) as IvrMenuRoutingRow[])) {
        const key = routingKeyForOption(option);
        const label = option.label || `Option ${option.digit}`;
        const existing = departmentByKey.get(key);
        const usedFallback = !isRoutingDepartmentKey(option.routing_department_key);
        if (existing) {
          existing.digits.push(option.digit);
          if (!existing.labels.includes(label)) existing.labels.push(label);
          existing.usedFallback = existing.usedFallback || usedFallback;
          existing.label = existing.labels.join(" / ");
          existing.description = `IVR key ${existing.digits.join(", ")} - routing key ${key}${existing.usedFallback ? " (legacy fallback)" : ""}`;
        } else {
          departmentByKey.set(key, {
            value: key,
            label,
            emoji: emojiFor(label),
            description: `IVR key ${option.digit} - routing key ${key}${usedFallback ? " (legacy fallback)" : ""}`,
            digits: [option.digit],
            labels: [label],
            usedFallback,
          });
        }
      }
      const fromIvr: Department[] = Array.from(departmentByKey.values()).map(({ digits, labels, usedFallback, ...department }) => department);
      // Always include "general" for non-IVR direct dials
      if (fromIvr.some((department) => department.value === "general")) return fromIvr;
      return [
        ...fromIvr,
        { value: "general", label: "General", emoji: "📞", description: "Direct dial / no IVR menu" },
      ];
    },
  });

  // Default the dept dropdown to the first IVR option once loaded
  useEffect(() => {
    if (!newDept && departments.length > 0) setNewDept(departments[0].value);
  }, [departments, newDept]);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["call_routing_rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_routing_rules" as any)
        .select("*")
        .order("department", { ascending: true })
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data as unknown as Rule[]) || [];
    },
  });

  const { data: employees = [] } = useQuery<Array<{ name: string; ooo_enabled: boolean | null; profile_id: string | null }>>({
    queryKey: ["employees-for-routing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("name, ooo_enabled, profile_id")
        .eq("is_active", true)
        .order("name", { ascending: true });
      return (data || []) as Array<{ name: string; ooo_enabled: boolean | null; profile_id: string | null }>;
    },
  });

  const employeeByName = new Map(employees.map((e) => [e.name, e]));

  const addMut = useMutation({
    mutationFn: async (input: { department: Rule["department"]; employee_name: string; priority: number }) => {
      const { error } = await supabase.from("call_routing_rules" as any).insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call_routing_rules"] });
      setNewName("");
      toast({ title: "Routing rule added" });
    },
    onError: (e: any) => toast({ title: "Couldn't add rule", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<Rule> }) => {
      const { error } = await supabase
        .from("call_routing_rules" as any)
        .update(input.patch as any)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call_routing_rules"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const updateAwayMut = useMutation({
    mutationFn: async (input: { employee_name: string; away: boolean }) => {
      const { error } = await supabase
        .from("employees")
        .update({ ooo_enabled: input.away } as any)
        .eq("name", input.employee_name);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees-for-routing"] });
      toast({ title: "Availability updated" });
    },
    onError: (e: any) => toast({ title: "Availability update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("call_routing_rules" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call_routing_rules"] });
      toast({ title: "Rule removed" });
    },
  });

  const handleAdd = () => {
    if (!newName.trim()) {
      toast({ title: "Pick an employee", variant: "destructive" });
      return;
    }
    const existingForDept = rules.filter((r) => r.department === newDept);
    const nextPriority = existingForDept.length > 0
      ? Math.max(...existingForDept.map((r) => r.priority)) + 1
      : 1;
    addMut.mutate({ department: newDept, employee_name: newName.trim(), priority: nextPriority });
  };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="container py-6 space-y-6 max-w-5xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Department Routing</h1>
            <p className="text-sm text-muted-foreground">
              Manage the recipients each IVR department routes to.
            </p>
          </div>
        </div>

        <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle>Department Routing</CardTitle>
              <CardDescription>
                This page follows the IVR Builder. Departments come from your live IVR menu, and the server routes each call to the next available assigned recipient.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

        {/* Add new rule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a department recipient</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={newDept} onValueChange={(v) => setNewDept(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.emoji} {d.label} — <span className="text-muted-foreground">{d.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Employee</Label>
              <Select value={newName} onValueChange={setNewName}>
                <SelectTrigger><SelectValue placeholder="Pick employee…" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.name} value={e.name}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={addMut.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rules grouped by department */}
      {/* Show every department from IVR + any orphaned rules from removed departments */}
      {(() => {
        const known = new Set(departments.map((d) => d.value));
        const orphaned = Array.from(new Set(rules.map((r) => r.department)))
          .filter((v) => !known.has(v))
          .map((v) => ({ value: v, label: v, emoji: "⚠️", description: "No longer in the IVR Builder — review or remove" }));
        return [...departments, ...orphaned];
      })().map((dept) => {
        const deptRules = rules.filter((r) => r.department === dept.value);
        return (
          <Card key={dept.value}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <span>{dept.emoji}</span>
                <span>{dept.label}</span>
                <span className="text-xs font-normal text-muted-foreground ml-2">{dept.description}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground px-6 py-4">Loading…</p>
              ) : deptRules.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 py-4">
                  No assigned recipients — calls to this department will continue to queue, overflow, or voicemail based on the IVR settings.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-20">Order</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead className="w-28">Route</TableHead>
                      <TableHead className="w-32">Away</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deptRules.map((rule) => {
                      const employee = employeeByName.get(rule.employee_name);
                      const hasLogin = Boolean(employee?.profile_id);
                      return (
                      <TableRow key={rule.id} className={!hasLogin ? "bg-warning/5" : undefined}>
                        <TableCell>
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={rule.priority}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!isNaN(v) && v >= 1) {
                                updateMut.mutate({ id: rule.id, patch: { priority: v } });
                              }
                            }}
                            className="w-16 h-8"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>{rule.employee_name}</div>
                          {!hasLogin && (
                            <div className="text-xs text-warning">
                              No app login linked - Twilio cannot ring this webphone yet.
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={(checked) =>
                              updateMut.mutate({ id: rule.id, patch: { is_active: checked } })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={employeeByName.get(rule.employee_name)?.ooo_enabled === true}
                            onCheckedChange={(checked) =>
                              updateAwayMut.mutate({ employee_name: rule.employee_name, away: checked })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMut.mutate(rule.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )})}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6 space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">How routing works</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The IVR Builder defines the departments; this page only controls who each department routes to.</li>
            <li>When a call comes in for a department, the server tries recipients in priority order (1, 2, 3…).</li>
            <li>Only employees with a linked app login can receive in-app webphone calls.</li>
            <li>Anyone currently on a live call is skipped until they become available again.</li>
            <li>Anyone with "Away from Desk" toggled on is also skipped.</li>
            <li>If everyone is busy, queue and overflow behavior comes from the IVR Builder settings.</li>
            <li><strong>General</strong> is used when there's no IVR menu — direct dials to the main line.</li>
          </ul>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

export default CallRoutingSettings;
