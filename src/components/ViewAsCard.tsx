/**
 * ViewAsCard — Admin impersonation picker for the Admin config area.
 * Lets admins select an employee to preview the app as that user AND
 * choose a device frame (Samsung S23, iPhone, etc.) to see the screen
 * exactly how it looks on that phone.
 */
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Eye, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VIEW_AS_DEVICES, DEVICE_KEYS, ViewAsDeviceKey } from "@/lib/viewAsDevices";

type AppRole = "admin" | "office" | "tech" | "supervisor";

interface EmployeeOption {
  id: string;
  name: string;
  role: AppRole;
}

function mapRole(raw: string | null): AppRole {
  if (!raw) return "tech";
  const lower = raw.toLowerCase();
  if (lower.includes("admin")) return "admin";
  if (lower.includes("office")) return "office";
  if (lower.includes("supervisor")) return "supervisor";
  return "tech";
}

export function ViewAsCard() {
  const { role } = useAuth();
  const viewAs = useViewAs();

  const { data: employees = [] } = useQuery({
    queryKey: ["view-as-employees"],
    enabled: role === "admin",
    queryFn: async (): Promise<EmployeeOption[]> => {
      const query = supabase.from("employees").select("id, name, role");
      const { data, error } = await (query as any).eq("is_active", true).order("name");
      if (error) throw error;
      return (data || []).map((e: any) => ({
        id: e.id as string,
        name: (e.name as string) || "Unnamed",
        role: mapRole(e.role as string | null),
      }));
    },
  });

  if (role !== "admin") return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="h-4 w-4" /> View As Employee
        </CardTitle>
        <CardDescription className="text-xs">
          Preview the app as any employee, optionally inside a phone frame to see it exactly as they would on their device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {viewAs.active ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm">
              Currently viewing as <span className="font-semibold">{viewAs.employeeName}</span>{" "}
              <span className="text-muted-foreground">({viewAs.role})</span>
            </div>
            <Button size="sm" variant="outline" onClick={viewAs.stopViewAs}>
              <X className="h-3.5 w-3.5 mr-1" /> Exit
            </Button>
          </div>
        ) : (
          <Select
            onValueChange={(val) => {
              const emp = employees.find((e) => e.id === val);
              if (emp) viewAs.startViewAs(emp.id, emp.name, emp.role);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an employee…" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
            <Smartphone className="h-3.5 w-3.5" /> Device frame
          </label>
          <Select
            value={viewAs.device}
            onValueChange={(val) => viewAs.setDevice(val as ViewAsDeviceKey)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {VIEW_AS_DEVICES[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            Wraps the preview in a phone bezel sized to the chosen device.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
