import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Globe } from "lucide-react";

const CATEGORIES = [
  { key: "job_details", label: "Job History" },
  { key: "upcoming_appointments", label: "Upcoming Appointments" },
  { key: "equipment_specs", label: "Equipment" },
  { key: "warranty_info", label: "Warranty Info" },
  { key: "invoices", label: "Invoices" },
  { key: "payment_balances", label: "Payment Balances" },
  { key: "maintenance_plans", label: "Maintenance Plans" },
  { key: "referral_status", label: "Referral Status" },
  { key: "service_requests", label: "Service Requests" },
  { key: "company_info", label: "Company Info / FAQ" },
];

type PermRow = { id: string; role: string; category: string; allowed: boolean };

export function PortalCopilotPermissionsCard() {
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("copilot_permissions")
      .select("*")
      .eq("role", "customer")
      .then(({ data }) => {
        setPerms((data as PermRow[]) || []);
        setLoading(false);
      });
  }, []);

  const toggle = async (category: string) => {
    const existing = perms.find(p => p.category === category);
    if (!existing) return;

    const newVal = !existing.allowed;
    setPerms(prev => prev.map(p => (p.id === existing.id ? { ...p, allowed: newVal } : p)));

    const { error } = await supabase
      .from("copilot_permissions")
      .update({ allowed: newVal })
      .eq("id", existing.id);

    if (error) {
      setPerms(prev => prev.map(p => (p.id === existing.id ? { ...p, allowed: !newVal } : p)));
      toast({ title: "Error", description: "Failed to update permission", variant: "destructive" });
    }
  };

  const isAllowed = (category: string) =>
    perms.find(p => p.category === category)?.allowed ?? true;

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
          <Globe className="h-4 w-4" />
          Portal JARVIS Permissions
        </CardTitle>
        <CardDescription className="text-xs">
          Control what data the Customer Portal assistant can share with customers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {CATEGORIES.map(c => (
            <div key={c.key} className="flex items-center justify-between">
              <span className="text-sm">{c.label}</span>
              <Switch checked={isAllowed(c.key)} onCheckedChange={() => toggle(c.key)} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
