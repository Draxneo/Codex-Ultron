import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  customerId: string;
  leadSource?: string | null;
}

export function LeadSourceCard({ customerId, leadSource }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(leadSource || "");
  const qc = useQueryClient();

  const save = async () => {
    await supabase.from("customers").update({ lead_source: value || null }).eq("id", customerId);
    qc.invalidateQueries({ queryKey: ["customer-overview", customerId] });
    setEditing(false);
  };

  return (
    <Card className="p-4 shadow-none border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold">Lead source</h3>
        {!editing && (
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="flex gap-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Google, Referral"
            className="h-7 text-xs"
            autoFocus
          />
          <Button size="sm" className="h-7 px-2" onClick={save}>
            <Check className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <p className="text-sm">{leadSource || <span className="text-muted-foreground">—</span>}</p>
      )}
    </Card>
  );
}
