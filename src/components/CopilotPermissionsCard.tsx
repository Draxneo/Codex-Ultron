import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

const ROLES = ["tech", "installer", "office", "admin"];
const CATEGORIES = [
  { key: "job_details", label: "Job Details" },
  { key: "equipment_specs", label: "Equipment Specs" },
  { key: "customer_contact", label: "Customer Contact" },
  { key: "company_procedures", label: "Procedures" },
  { key: "pricing", label: "Pricing" },
  { key: "financial_data", label: "Financial Data" },
];

type PermRow = { id: string; role: string; category: string; allowed: boolean };

export function CopilotPermissionsCard() {
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("copilot_permissions")
      .select("*")
      .then(({ data }) => {
        setPerms((data as PermRow[]) || []);
        setLoading(false);
      });
  }, []);

  const toggle = async (role: string, category: string) => {
    const existing = perms.find(p => p.role === role && p.category === category);
    if (!existing) return;

    const newVal = !existing.allowed;
    setPerms(prev =>
      prev.map(p => (p.id === existing.id ? { ...p, allowed: newVal } : p))
    );

    const { error } = await supabase
      .from("copilot_permissions")
      .update({ allowed: newVal })
      .eq("id", existing.id);

    if (error) {
      setPerms(prev =>
        prev.map(p => (p.id === existing.id ? { ...p, allowed: !newVal } : p))
      );
      toast({ title: "Error", description: "Failed to update permission", variant: "destructive" });
    }
  };

  const isAllowed = (role: string, category: string) =>
    perms.find(p => p.role === role && p.category === category)?.allowed ?? true;

  if (loading) {
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
          <ShieldCheck className="h-4 w-4" />
          JARVIS Permissions
        </CardTitle>
        <CardDescription className="text-xs">
          Control what data the Field Assistant can share with each role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Role</th>
                {CATEGORIES.map(c => (
                  <th key={c.key} className="text-center py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map(role => (
                <tr key={role} className="border-b last:border-0">
                  <td className="py-3 pr-3 font-medium capitalize">{role}</td>
                  {CATEGORIES.map(c => (
                    <td key={c.key} className="text-center py-3 px-2">
                      <Switch
                        checked={isAllowed(role, c.key)}
                        onCheckedChange={() => toggle(role, c.key)}
                        className="mx-auto"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
