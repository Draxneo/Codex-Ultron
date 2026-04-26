import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  vendorId: string;
}

export function PrivateNotesCard({ vendorId }: Props) {
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: notes = [] } = useQuery({
    queryKey: ["vendor_notes", vendorId],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("vendor_notes")
        .select("*") as any)
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async (text: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const author_name = user?.user_metadata?.full_name || user?.email || null;
      const { error } = await (supabase.from("vendor_notes") as any).insert({
        vendor_id: vendorId,
        body: text,
        author_id: user?.id || null,
        author_name,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_notes", vendorId] });
      setBody("");
      toast({ title: "Note added" });
    },
    onError: (err: any) => toast({ title: "Failed to add note", description: err.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("vendor_notes") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor_notes", vendorId] }),
  });

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate(text);
  };

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Private notes</h3>

      <div className="space-y-2 mb-3">
        <Textarea
          placeholder="Add a private note (only visible to your team)…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
            Add note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No notes yet</p>
      ) : (
        <ul className="divide-y">
          {notes.map((n: any) => (
            <li key={n.id} className="py-2.5 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {n.author_name || "Someone"} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 opacity-0 group-hover:opacity-100"
                  onClick={() => del.mutate(n.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
