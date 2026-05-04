import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Plus, Trash2, Loader2, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAgentInstructions, useUpdateInstruction, useAddInstruction, useDeleteInstruction } from "@/hooks/useAgentInstructions";
import { toast } from "@/hooks/use-toast";

export function InstructionsManager() {
  const { data: instructions, isLoading } = useAgentInstructions();
  const updateInstruction = useUpdateInstruction();
  const addInstruction = useAddInstruction();
  const deleteInstruction = useDeleteInstruction();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const handleSave = (id: string) => {
    updateInstruction.mutate({ id, content: editContent }, {
      onSuccess: () => {
        setEditingId(null);
        toast({ title: "Saved" });
      },
    });
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const slug = newLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    addInstruction.mutate({ label: newLabel, slug }, {
      onSuccess: () => {
        setNewLabel("");
        setAddOpen(false);
      },
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;

  const activeCount = (instructions || []).filter(i => i.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>What to DO</strong> — Define behavioral rules the AI must follow: formatting standards, scheduling limits, tone of voice, escalation procedures. These override default behavior.
        </p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Instructions</h2>
          <p className="text-xs text-muted-foreground">Active instructions are injected into the system prompt.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{activeCount} active</Badge>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {(instructions || []).map(inst => (
        <Card key={inst.id} className={!inst.is_active ? "opacity-50" : ""}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">{inst.label}</CardTitle>
            <div className="flex items-center gap-2">
              <Switch
                checked={inst.is_active}
                onCheckedChange={(checked) => updateInstruction.mutate({ id: inst.id, is_active: checked })}
                className="scale-75"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteInstruction.mutate(inst.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {editingId === inst.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="text-xs min-h-[280px] font-mono resize-y"
                  placeholder={`Enter ${inst.label} instructions...`}
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button size="sm" className="text-xs h-7" onClick={() => handleSave(inst.id)} disabled={updateInstruction.isPending}>
                    {updateInstruction.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="text-xs text-muted-foreground whitespace-pre-wrap cursor-pointer hover:text-foreground transition-colors min-h-[40px] rounded border border-dashed border-border/50 p-2"
                onClick={() => { setEditingId(inst.id); setEditContent(inst.content); }}
              >
                {inst.content || <span className="italic">Click to add instructions...</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Instruction Set</DialogTitle></DialogHeader>
          <Input placeholder="Label (e.g. 'Safety Protocols')" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
