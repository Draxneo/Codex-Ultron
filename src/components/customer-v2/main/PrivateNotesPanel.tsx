import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useCustomerNotes, useAddCustomerNote, useDeleteCustomerNote } from "@/hooks/useCustomerOverview";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  customerId: string;
}

const SCOPES = [
  { value: "all", label: "All" },
  { value: "customer", label: "Customer" },
  { value: "estimate", label: "Estimates" },
  { value: "job", label: "Jobs" },
];

export function PrivateNotesPanel({ customerId }: Props) {
  const [scope, setScope] = useState("all");
  const [body, setBody] = useState("");
  const { data: notes = [] } = useCustomerNotes(customerId, scope);
  const add = useAddCustomerNote();
  const del = useDeleteCustomerNote();
  const { toast } = useToast();

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate(
      { customer_id: customerId, body: text, scope: (scope === "all" ? "customer" : scope) as any },
      {
        onSuccess: () => {
          setBody("");
          toast({ title: "Note added" });
        },
      }
    );
  };

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Private notes</h3>

      <Tabs value={scope} onValueChange={setScope} className="mb-3">
        <TabsList className="h-8 p-0.5">
          {SCOPES.map((s) => (
            <TabsTrigger key={s.value} value={s.value} className="text-xs h-7 px-3">
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
                    {n.scope !== "customer" && ` · on ${n.scope}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 opacity-0 group-hover:opacity-100"
                  onClick={() => del.mutate({ id: n.id, customer_id: customerId })}
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
