import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Save, Trash2, Plug, GripVertical } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Addon {
  id: string; name: string; description: string | null; detail: string | null;
  cost: number; active: boolean; sort_order: number;
  promo_active: boolean; promo_percent: number;
}

export default function AddonsManager() {
  const { toast } = useToast();
  const { confirmDelete } = useConfirm();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAddons = async () => {
    setLoading(true);
    const { data } = await supabase.from("addons").select("*").order("sort_order");
    if (data) setAddons(data as Addon[]);
    setLoading(false);
  };

  useEffect(() => { fetchAddons(); }, []);

  const saveAddon = async () => {
    if (!editing) return;
    setSaving(true);
    const { id, ...rest } = editing;
    if (id.startsWith("new-")) {
      const { error } = await supabase.from("addons").insert({
        name: rest.name, description: rest.description, detail: rest.detail,
        cost: rest.cost, active: rest.active, sort_order: rest.sort_order,
        promo_active: rest.promo_active, promo_percent: rest.promo_percent,
      });
      if (error) toast({ title: "Create failed", description: error.message, variant: "destructive" });
      else { toast({ title: "Add-on created" }); setEditing(null); fetchAddons(); }
    } else {
      const { error } = await supabase.from("addons").update({
        name: rest.name, description: rest.description, detail: rest.detail,
        cost: rest.cost, active: rest.active, sort_order: rest.sort_order,
        promo_active: rest.promo_active, promo_percent: rest.promo_percent,
      }).eq("id", id);
      if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
      else { toast({ title: "Add-on saved" }); setEditing(null); fetchAddons(); }
    }
    setSaving(false);
  };

  const deleteAddon = async (id: string) => {
    const addon = addons.find(a => a.id === id);
    await confirmDelete(addon?.name || "add-on", {
      onConfirm: async () => {
        const { error } = await supabase.from("addons").delete().eq("id", id);
        if (error) {
          toast({ title: "Delete failed", description: error.message, variant: "destructive" });
          throw error;
        }
        toast({ title: "Add-on deleted" });
        fetchAddons();
      },
    });
  };

  const addNew = () => {
    setEditing({ id: `new-${Date.now()}`, name: "", description: "", detail: "", cost: 0, active: true, sort_order: addons.length, promo_active: false, promo_percent: 0 });
  };

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading add-ons...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" /> Brochure Add-Ons</CardTitle>
          <Button size="sm" onClick={addNew} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add New</Button>
        </div>
        <p className="text-sm text-muted-foreground">Manage the add-on upgrades shown on customer brochures.</p>
      </CardHeader>
      <CardContent>
        {addons.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">No add-ons yet.</p>
        ) : (
          <div className="space-y-3">
            {addons.map(addon => (
              <div key={addon.id} className="flex items-center gap-4 rounded-xl border bg-background p-4 hover:shadow-sm transition-all cursor-pointer" onClick={() => setEditing({ ...addon })}>
                <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground truncate">{addon.name}</p>
                    {!addon.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Inactive</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{addon.description}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {addon.promo_active && <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold text-accent">{addon.promo_percent}% OFF</span>}
                  <p className="text-sm font-bold text-foreground">${addon.cost.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing?.id.startsWith("new-") ? "New Add-On" : `Edit: ${editing?.name}`}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. UV Air Purifier" /></div>
                <div className="space-y-2"><Label>Short Description</Label><Input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
                <div className="space-y-2"><Label>Brochure Detail</Label><Textarea value={editing.detail || ""} onChange={e => setEditing({ ...editing, detail: e.target.value })} className="min-h-[100px]" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Cost ($)</Label><Input type="number" value={editing.cost} onChange={e => setEditing({ ...editing, cost: parseFloat(e.target.value) || 0 })} /></div>
                  <div className="space-y-2"><Label>Sort Order</Label><Input type="number" value={editing.sort_order} onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })} /></div>
                </div>
                <div className="flex items-center gap-3"><Switch checked={editing.active} onCheckedChange={checked => setEditing({ ...editing, active: checked })} /><Label>Active</Label></div>
                <div className="rounded-lg border border-dashed border-accent/40 bg-accent/5 p-4 space-y-3">
                  <div className="flex items-center gap-3"><Switch checked={editing.promo_active} onCheckedChange={checked => setEditing({ ...editing, promo_active: checked, promo_percent: checked ? (editing.promo_percent || 100) : editing.promo_percent })} /><Label className="font-semibold text-accent">🏷️ Promotion Active</Label></div>
                  {editing.promo_active && (
                    <div className="space-y-2"><Label>Discount %</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={0} max={100} value={editing.promo_percent} onChange={e => setEditing({ ...editing, promo_percent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} className="w-24" />
                        <span className="ml-auto text-sm font-bold text-accent">{editing.promo_percent === 100 ? "FREE" : `Sale: $${(editing.cost * (1 - editing.promo_percent / 100)).toFixed(0)}`}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveAddon} disabled={saving || !editing.name.trim()} className="flex-1"><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : editing.id.startsWith("new-") ? "Create" : "Save"}</Button>
                  {!editing.id.startsWith("new-") && <Button variant="destructive" size="icon" onClick={() => { deleteAddon(editing.id); setEditing(null); }}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
