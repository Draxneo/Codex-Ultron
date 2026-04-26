import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, ListChecks } from "lucide-react";
import { useMaintenancePlanTemplates, useCreatePlanTemplate, useUpdatePlanTemplate, type PlanTemplate } from "@/hooks/useMaintenancePlanTemplates";
import { toast } from "@/hooks/use-toast";

function PlanForm({ initial, onSave, onCancel }: { initial?: Partial<PlanTemplate>; onSave: (d: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    plan_type: initial?.plan_type || "annual",
    frequency: initial?.frequency || "biannual",
    price: String(initial?.price ?? "199"),
    description: initial?.description || "",
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order ?? 0,
  });

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Plan Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Gold Maintenance" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={form.plan_type} onValueChange={v => setForm(p => ({ ...p, plan_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="biannual">Bi-Annual</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Frequency</Label>
          <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="annual">1x/year</SelectItem>
              <SelectItem value="biannual">2x/year</SelectItem>
              <SelectItem value="quarterly">4x/year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label className="text-xs">Price ($)</Label><Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} /></div>
      <div><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" /></div>
      <div className="flex items-center gap-2">
        <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
        <Label className="text-xs">Active</Label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => {
          if (!form.name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
          onSave({ ...form, price: Number(form.price) });
        }}>Save</Button>
      </DialogFooter>
    </div>
  );
}

export function MaintenancePlanTemplatesCard() {
  const { data: templates, isLoading } = useMaintenancePlanTemplates();
  const createMut = useCreatePlanTemplate();
  const updateMut = useUpdatePlanTemplate();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlanTemplate | null>(null);

  const handleCreate = async (data: any) => {
    await createMut.mutateAsync(data);
    setCreating(false);
    toast({ title: "Plan template created" });
  };

  const handleUpdate = async (data: any) => {
    if (!editing) return;
    await updateMut.mutateAsync({ id: editing.id, ...data });
    setEditing(null);
    toast({ title: "Plan template updated" });
  };

  const freqLabel: Record<string, string> = { annual: "1x/yr", biannual: "2x/yr", quarterly: "4x/yr" };

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Maintenance Plans</CardTitle>
            <CardDescription className="text-xs">Reusable plan templates for maintenance agreements.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {templates?.length === 0 && !isLoading && <p className="text-xs text-muted-foreground text-center py-4">No plan templates yet. Add one to get started.</p>}
          {templates?.map(t => (
            <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{t.name} {!t.is_active && <span className="text-muted-foreground">(inactive)</span>}</p>
                <p className="text-xs text-muted-foreground">${Number(t.price).toLocaleString()}/{t.plan_type} · {freqLabel[t.frequency] || t.frequency}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Plan Template</DialogTitle></DialogHeader>
          <PlanForm onSave={handleCreate} onCancel={() => setCreating(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Plan Template</DialogTitle></DialogHeader>
          {editing && <PlanForm initial={editing} onSave={handleUpdate} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
