import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  customerId: string;
  tags: string[] | null;
}

export function CustomerTagsCard({ customerId, tags }: Props) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");
  const qc = useQueryClient();

  const update = async (next: string[]) => {
    await supabase.from("customers").update({ tags: next }).eq("id", customerId);
    qc.invalidateQueries({ queryKey: ["customer-overview", customerId] });
  };

  const addTag = async () => {
    const t = newTag.trim();
    if (!t) return;
    const next = Array.from(new Set([...(tags || []), t]));
    await update(next);
    setNewTag("");
    setAdding(false);
  };

  const removeTag = async (t: string) => {
    await update((tags || []).filter((x) => x !== t));
  };

  return (
    <Card className="p-4 shadow-none border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Tags</h3>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(tags || []).map((t) => (
          <Badge key={t} variant="secondary" className="text-[11px] gap-1">
            {t}
            <button onClick={() => removeTag(t)} className="hover:text-destructive">
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        {(!tags || tags.length === 0) && !adding && (
          <p className="text-xs text-muted-foreground">No tags</p>
        )}
      </div>
      {adding && (
        <div className="mt-3 flex gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="Tag name"
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <Button size="sm" className="h-7" onClick={addTag}>
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
