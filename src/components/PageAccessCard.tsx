import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Shield, RotateCcw } from "lucide-react";
import { ALL_ACCESS_KEYS } from "@/hooks/useEmployeeTabAccess";
import { getRoleDefaults, matchesRoleDefaults, ROLE_LABELS, type RoleKey } from "@/lib/roleAccessDefaults";
import { toast } from "sonner";

/**
 * Column labels for the permissions matrix. Order is enforced by
 * ALL_ACCESS_KEYS in useEmployeeTabAccess.ts. Keep these labels short — the
 * matrix has 12 columns and label width directly affects horizontal scroll
 * behavior on narrower screens.
 */
const KEY_LABELS: Record<string, string> = {
  tech: "Tech",         // Tech mobile schedule + tools
  intake: "Intake",     // Operations Desk (phones-first triage)
  now: "Now",           // Now HQ (live job activity)
  dispatch: "Dispatch", // Schedule board
  quote: "Quote",       // Catalog + builder + estimates
  customer: "Customer", // Customer HQ / CRM
  team: "Team",         // Team HQ (chat)
  phone: "Phone",       // Phone surface
  sms: "SMS",           // SMS surface
  jarvis: "JARVIS",     // Copilot
  pay: "Pay",           // Employee pay page
  admin: "Admin",       // Settings, reports, agent training, IVR builder
};

const ROLE_ORDER: RoleKey[] = ["admin", "office", "supervisor", "tech", "installer"];

type Employee = { id: string; name: string; role: string; is_active: boolean };
type AccessRow = { allowed_tabs: string[]; is_custom: boolean };

export function PageAccessCard() {
  const queryClient = useQueryClient();

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["employees_for_access"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, name, role, is_active")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as Employee[];
    },
  });

  const { data: accessMap, isLoading: loadingAccess } = useQuery({
    queryKey: ["all_employee_tab_access"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_tab_access")
        .select("employee_id, allowed_tabs, is_custom");
      const map: Record<string, AccessRow> = {};
      for (const row of data ?? []) {
        map[row.employee_id] = {
          allowed_tabs: (row.allowed_tabs as string[]) ?? [],
          is_custom: (row as any).is_custom ?? false,
        };
      }
      return map;
    },
  });

  const allKeys = ALL_ACCESS_KEYS as readonly string[];
  const isLoading = loadingEmp || loadingAccess;

  // Group employees by role
  const grouped = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    for (const emp of employees ?? []) {
      const key = (emp.role ?? "office").toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(emp);
    }
    return groups;
  }, [employees]);

  const getRow = (empId: string, role: string): AccessRow => {
    const stored = accessMap?.[empId];
    if (stored) return stored;
    return { allowed_tabs: getRoleDefaults(role), is_custom: false };
  };

  const toggle = async (empId: string, role: string, key: string) => {
    const row = getRow(empId, role);
    const next = new Set(row.allowed_tabs);
    if (next.has(key)) {
      next.delete(key);
      if (next.size === 0) return;
    } else {
      next.add(key);
    }
    const arr = Array.from(next);

    // Optimistic update
    queryClient.setQueryData(["all_employee_tab_access"], (old: Record<string, AccessRow> | undefined) => ({
      ...(old ?? {}),
      [empId]: { allowed_tabs: arr, is_custom: true },
    }));
    queryClient.setQueryData(["employee_tab_access", empId], arr);

    const { error } = await supabase
      .from("employee_tab_access")
      .upsert(
        [{ employee_id: empId, allowed_tabs: arr, is_custom: true, updated_at: new Date().toISOString() }],
        { onConflict: "employee_id" }
      );
    if (error) toast.error("Failed to save access");
  };

  const resetToDefault = async (empId: string, role: string) => {
    const defaults = getRoleDefaults(role);

    queryClient.setQueryData(["all_employee_tab_access"], (old: Record<string, AccessRow> | undefined) => ({
      ...(old ?? {}),
      [empId]: { allowed_tabs: defaults, is_custom: false },
    }));
    queryClient.setQueryData(["employee_tab_access", empId], defaults);

    const { error } = await supabase
      .from("employee_tab_access")
      .upsert(
        [{ employee_id: empId, allowed_tabs: defaults, is_custom: false, updated_at: new Date().toISOString() }],
        { onConflict: "employee_id" }
      );
    if (error) {
      toast.error("Failed to reset");
    } else {
      toast.success(`Reset to ${role} defaults`);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Page Access
        </CardTitle>
        <CardDescription className="text-xs">
          These checkboxes decide which pages each active employee can open. Every role starts with a default setup; customized employees are marked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card z-10 min-w-[180px]">
                  Employee
                </th>
                {allKeys.map(key => (
                  <th key={key} className="text-center py-2 px-1.5 font-medium text-muted-foreground whitespace-nowrap">
                    {KEY_LABELS[key] ?? key}
                  </th>
                ))}
                <th className="py-2 pl-2 font-medium text-muted-foreground text-right min-w-[80px]">Reset</th>
              </tr>
            </thead>
            <tbody>
              {ROLE_ORDER.flatMap(roleKey => {
                const list = grouped[roleKey];
                if (!list || list.length === 0) return [];
                return [
                  <tr key={`hdr-${roleKey}`} className="bg-muted/40">
                    <td colSpan={allKeys.length + 2} className="py-1.5 px-2 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground sticky left-0 bg-muted/40">
                      {ROLE_LABELS[roleKey]} - {list.length}
                    </td>
                  </tr>,
                  ...list.map(emp => {
                    const row = getRow(emp.id, emp.role);
                    const enabled = new Set(row.allowed_tabs);
                    const isAdmin = emp.role?.toLowerCase() === "admin";
                    const isCustom = row.is_custom && !matchesRoleDefaults(emp.role, row.allowed_tabs);
                    return (
                      <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 pr-3 font-medium sticky left-0 bg-card z-10">
                          <div className="flex items-center gap-1.5">
                            {isCustom && (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0"
                                title="Customized access. This employee is not using the plain role default."
                              />
                            )}
                            <span className="truncate">{emp.name}</span>
                            {isAdmin && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 ml-0.5 shrink-0">
                                full
                              </Badge>
                            )}
                          </div>
                        </td>
                        {allKeys.map(key => (
                          <td key={key} className="text-center py-2.5 px-1.5">
                            <Checkbox
                              checked={isAdmin ? true : enabled.has(key)}
                              disabled={isAdmin}
                              onCheckedChange={() => !isAdmin && toggle(emp.id, emp.role, key)}
                              className="h-3.5 w-3.5 mx-auto"
                            />
                          </td>
                        ))}
                        <td className="py-2.5 pl-2 text-right">
                          {!isAdmin && isCustom && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resetToDefault(emp.id, emp.role)}
                              className="h-6 px-1.5 text-[10px] gap-1"
                              title={`Reset to ${emp.role} defaults`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
              {(!employees || employees.length === 0) && (
                <tr>
                  <td colSpan={allKeys.length + 2} className="text-center py-4 text-muted-foreground">
                    No active employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
