import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  customerId: string;
  notificationsEnabled: boolean;
  textConsent: string;
  emailConsent: string;
}

export function CommunicationPreferencesCard({ customerId, notificationsEnabled, textConsent, emailConsent }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const update = async (patch: Record<string, any>) => {
    const { error } = await supabase.from("customers").update(patch).eq("id", customerId);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["customer-overview", customerId] });
  };

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Communication preferences</h3>
      <div className="space-y-3 text-sm">
        <Toggle
          id="notif"
          label="Notifications enabled"
          checked={notificationsEnabled}
          onChange={(v) => update({ notifications_enabled: v })}
        />
        <Toggle
          id="text"
          label="Text consent"
          checked={textConsent === "opted_in"}
          onChange={(v) => update({ text_consent: v ? "opted_in" : "opted_out" })}
        />
        <Toggle
          id="email"
          label="Email consent"
          checked={emailConsent === "opted_in"}
          onChange={(v) => update({ email_consent: v ? "opted_in" : "opted_out" })}
        />
      </div>
    </Card>
  );
}

function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
