import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { SequenceCanvas } from "@/components/sequence/SequenceCanvas";
import { useMessageSequences, useSaveSequence, type MessageSequence, type SequenceStep } from "@/hooks/useMessageSequences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_STEPS: SequenceStep[] = [
  { id: "trigger_1", type: "trigger", label: "Job Completed", config: { event: "job_completed" }, position: { x: 300, y: 0 } },
  { id: "delay_1", type: "delay", label: "Wait 2 Hours", config: { duration: 2, unit: "hours" }, position: { x: 300, y: 160 } },
  { id: "sms_1", type: "send_sms", label: "Thank You Text", config: { templateName: "Thank You" }, position: { x: 300, y: 320 } },
  { id: "end_1", type: "end", label: "End", config: {}, position: { x: 300, y: 480 } },
];

export default function SequenceBuilder() {
  const isMobile = useIsMobile();
  const { data: sequences, isLoading } = useMessageSequences();
  const saveSequence = useSaveSequence();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const selected = sequences?.find(s => s.id === selectedId) || sequences?.[0] || null;

  const handleCreate = () => {
    if (!newName.trim()) return;
    saveSequence.mutate({
      name: newName,
      job_type: "all",
      steps: DEFAULT_STEPS,
      is_active: true,
    } as any);
    setNewName("");
    setCreateOpen(false);
  };

  const handleSave = (seq: MessageSequence) => {
    saveSequence.mutate(seq);
  };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Message Sequence Builder</h1>
            <p className="text-xs text-muted-foreground">Visual flow editor for automated SMS & email drip sequences.</p>
          </div>
          <div className="flex items-center gap-2">
            {sequences && sequences.length > 0 && (
              <Select value={selected?.id || ""} onValueChange={setSelectedId}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Select sequence" /></SelectTrigger>
                <SelectContent>
                  {sequences.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Sequence
            </Button>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>}
        {!isLoading && !selected && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm mb-4">No sequences yet. Create your first automated message flow.</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Create Sequence</Button>
          </div>
        )}
        {selected && <SequenceCanvas sequence={selected} onSave={handleSave} saving={saveSequence.isPending} />}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New Sequence</DialogTitle></DialogHeader>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Post-Job Follow-up" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
