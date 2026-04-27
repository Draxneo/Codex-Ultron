import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Smartphone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { DEVICE_KEYS, VIEW_AS_DEVICES, type ViewAsDeviceKey } from "@/lib/viewAsDevices";

type FieldRole = "tech" | "supervisor" | "installer";

interface EmployeeOption {
  id: string;
  name: string;
  role: FieldRole;
}

function mapFieldRole(raw: string | null): FieldRole {
  const role = (raw || "").toLowerCase();
  if (role.includes("supervisor")) return "supervisor";
  if (role.includes("installer")) return "installer";
  return "tech";
}

function isFieldEmployee(raw: string | null): boolean {
  const role = (raw || "").toLowerCase();
  return (
    role.includes("tech") ||
    role.includes("service") ||
    role.includes("installer") ||
    role.includes("supervisor")
  );
}

export function ViewAsTechTester() {
  const { role } = useAuth();
  const viewAs = useViewAs();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [device, setDevice] = useState<ViewAsDeviceKey>("s23");

  const { data: employees = [] } = useQuery({
    queryKey: ["view-as-field-employees"],
    enabled: role === "admin",
    queryFn: async (): Promise<EmployeeOption[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, role, is_active")
        .order("name");
      if (error) throw error;
      return (data || [])
        .filter((employee: any) => employee.is_active !== false && isFieldEmployee(employee.role))
        .map((employee: any) => ({
          id: employee.id,
          name: employee.name || "Unnamed employee",
          role: mapFieldRole(employee.role),
        }));
    },
  });

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === employeeId) || employees[0],
    [employeeId, employees]
  );

  if (role !== "admin") return null;

  const startPreview = () => {
    if (!selectedEmployee) return;
    viewAs.startViewAs(selectedEmployee.id, selectedEmployee.name, selectedEmployee.role);
    viewAs.setDevice(device);
    setOpen(false);
    navigate(selectedEmployee.role === "installer" ? "/tech" : "/tech");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          title="View as tech"
        >
          <Smartphone className="h-4.5 w-4.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end" sideOffset={8}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4" />
              View As Tech
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Open the field app as a real employee inside a phone-sized preview.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Employee</label>
            <Select value={employeeId || selectedEmployee?.id || ""} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tech" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Phone size</label>
            <Select value={device} onValueChange={(value) => setDevice(value as ViewAsDeviceKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_KEYS.filter((key) => key !== "none").map((key) => (
                  <SelectItem key={key} value={key}>
                    {VIEW_AS_DEVICES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={startPreview} disabled={!selectedEmployee}>
            <Smartphone className="h-4 w-4 mr-2" />
            Open Tech Preview
          </Button>

          <p className="text-[11px] text-muted-foreground">
            This never changes the real login. It only previews role, permissions, schedule, and mobile layout in this browser tab.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
