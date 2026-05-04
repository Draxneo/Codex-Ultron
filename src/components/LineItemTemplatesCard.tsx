import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, DollarSign, Tag } from "lucide-react";
import {
  useLineItemTemplates,
  useUpsertTemplate,
  useDeleteTemplate,
  type LineItemTemplate,
} from "@/hooks/useLineItemTemplates";

const KINDS = ["fee", "labor", "material"];
const CATEGORIES = ["service", "maintenance", "inspection"];
const JOB_TYPES = ["service", "maintenance", "install", "ductwork"];

const empty: Partial<LineItemTemplate> = {
  name: "", slug: "", description: "", base_price: 0, kind: "fee",
  category: "service", rules: {}, auto_add_for: [], is_active: true, sort_order: 0,
};

export function LineItemTemplatesCard() {
  const { data: templates, isLoading } = useLineItemTemplates();
  const upsert = useUpsertTemplate();
  const del = useDeleteTemplate();
  const [editing, setEditing] = useState<Partial<LineItemTemplate> | null>(null);

  const openNew = () => setEditing({ ...empty });
  const openEdit = (t: LineItemTemplate) => setEditing({ ...t });

  const save = () => {
    if (!editing?.name || !editing?.slug) return;
    upsert.mutate(editing as any, { onSuccess: () => setEditing(null) });
  };

  const setField = (key: string, value: any) =>
    setEditing((prev) => prev ? { ...prev, [key]: value } : prev);

  const setRule = (key: string, value: any) =>
    setEditing((prev) => prev ? { ...prev, rules: { ...(prev.rules || {}), [key]: value } } : prev);

  const toggleAutoAdd = (jt: string) =>
    setEditing((prev) => {
      if (!prev) return prev;
      const arr = prev.auto_add_for || [];
      return { ...prev, auto_add_for: arr.includes(jt) ? arr.filter((x) => x !== jt) : [...arr, jt] };
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Line Item Templates
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !templates?.length ? (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border p-3 bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{t.name}</span>
                    {!t.is_active && <Badge variant="secondary" className="text-[9px]">Inactive</Badge>}
                    {t.rules?.show_as_complimentary && (
                      <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-300">FREE</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ${Number(t.base_price).toFixed(2)} · {t.kind} · {t.category}
                    {t.auto_add_for?.length > 0 && (
                      <span className="ml-2">
                        Auto: {t.auto_add_for.map((jt) => (
                          <Badge key={jt} variant="secondary" className="text-[8px] ml-1 px-1">{jt}</Badge>
                        ))}
                      </span>
                    )}
                  </p>
                  {t.rules?.plan_member_price != null && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Plan member: ${Number(t.rules.plan_member_price).toFixed(2)}
                      {t.rules.waive_with_repair && " · Waived w/ repair"}
                    </p>
                  )}
                  {t.rules?.plan_pct_of_annual && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Plan member: {t.rules.plan_pct_of_annual}% of annual plan price
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del.mutate(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit / Create Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={editing.name || ""} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div>
                <Label>Slug (unique key)</Label>
                <Input value={editing.slug || ""} onChange={(e) => setField("slug", e.target.value)} placeholder="e.g. service_call_fee" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description || ""} onChange={(e) => setField("description", e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base Price ($)</Label>
                  <Input type="number" step="0.01" value={editing.base_price ?? 0} onChange={(e) => setField("base_price", parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setField("sort_order", parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Kind</Label>
                  <Select value={editing.kind || "fee"} onValueChange={(v) => setField("kind", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={editing.category || "service"} onValueChange={(v) => setField("category", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {/* Auto-add for job types */}
              <div>
                <Label>Auto-add for job types</Label>
                <div className="flex gap-2 mt-1">
                  {JOB_TYPES.map((jt) => (
                    <Button
                      key={jt}
                      variant={(editing.auto_add_for || []).includes(jt) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleAutoAdd(jt)}
                    >
                      {jt}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Pricing Rules */}
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1"><Tag className="h-3 w-3" /> Pricing Rules</p>
                <div>
                  <Label className="text-xs">Plan Member Price ($)</Label>
                  <Input type="number" step="0.01" value={editing.rules?.plan_member_price ?? ""} onChange={(e) => setRule("plan_member_price", e.target.value ? parseFloat(e.target.value) : null)} placeholder="Leave blank if N/A" />
                </div>
                <div>
                  <Label className="text-xs">Plan % of Annual Price</Label>
                  <Input type="number" step="1" value={editing.rules?.plan_pct_of_annual ?? ""} onChange={(e) => setRule("plan_pct_of_annual", e.target.value ? parseInt(e.target.value) : null)} placeholder="e.g. 50 for half" />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!editing.rules?.waive_with_repair} onCheckedChange={(v) => setRule("waive_with_repair", v)} />
                  <Label className="text-xs">Waive with repair</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={!!editing.rules?.show_as_complimentary} onCheckedChange={(v) => setRule("show_as_complimentary", v)} />
                  <Label className="text-xs">Show as complimentary ($0)</Label>
                </div>
                <div>
                  <Label className="text-xs">Customer-facing Note</Label>
                  <Input value={editing.rules?.customer_facing_note ?? ""} onChange={(e) => setRule("customer_facing_note", e.target.value || null)} placeholder="e.g. Complimentary — no charge" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setField("is_active", v)} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
