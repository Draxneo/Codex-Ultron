import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Tag, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

interface AddonRule {
  id: string;
  trigger_kind: string;
  suggestion_kind: string;
  name: string;
  description: string | null;
  unit_price: number;
  badge: string | null;
  sort_order: number;
  is_active: boolean;
}

interface Discount {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_total: number;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
}

export function CartAddonsManager() {
  return (
    <Tabs defaultValue="addons" className="w-full">
      <TabsList>
        <TabsTrigger value="addons" className="gap-1.5"><Sparkles className="h-4 w-4" /> Add-On Suggestions</TabsTrigger>
        <TabsTrigger value="discounts" className="gap-1.5"><Tag className="h-4 w-4" /> Promo Codes</TabsTrigger>
      </TabsList>
      <TabsContent value="addons" className="mt-4"><AddonRulesPanel /></TabsContent>
      <TabsContent value="discounts" className="mt-4"><DiscountsPanel /></TabsContent>
    </Tabs>
  );
}

function AddonRulesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AddonRule | null>(null);
  const [open, setOpen] = useState(false);

  const { data: rules = [] } = useQuery({
    queryKey: ["admin_addon_rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("cart_addon_rules").select("*").order("sort_order");
      if (error) throw error;
      return (data || []) as AddonRule[];
    },
  });

  const save = useMutation({
    mutationFn: async (rule: Partial<AddonRule> & { id?: string }) => {
      const payload = {
        trigger_kind: rule.trigger_kind || "equipment",
        suggestion_kind: rule.suggestion_kind || "custom",
        name: rule.name,
        description: rule.description || null,
        unit_price: Number(rule.unit_price) || 0,
        badge: rule.badge || null,
        sort_order: Number(rule.sort_order) || 0,
        is_active: rule.is_active ?? true,
      };
      if (rule.id) {
        const { error } = await (supabase as any).from("cart_addon_rules").update(payload).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("cart_addon_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_addon_rules"] });
      qc.invalidateQueries({ queryKey: ["cart_addon_rules"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cart_addon_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_addon_rules"] });
      qc.invalidateQueries({ queryKey: ["cart_addon_rules"] });
      toast.success("Deleted");
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("cart_addon_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin_addon_rules"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">When a tech adds an item of <strong>trigger kind</strong>, suggest these add-ons.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1" /> New Suggestion</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Add-On Rule</DialogTitle></DialogHeader>
            <AddonForm initial={editing} onSubmit={(r) => save.mutate(r)} busy={save.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-2">
        {rules.map((r) => (
          <Card key={r.id} className="p-3 flex items-center gap-3">
            <Badge variant="outline" className="capitalize">{r.trigger_kind}</Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">{r.name}</p>
                {r.badge && <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">{r.badge}</Badge>}
              </div>
              {r.description && <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>}
            </div>
            <span className="font-bold text-sm">${Number(r.unit_price).toFixed(0)}</span>
            <Switch checked={r.is_active} onCheckedChange={(v) => toggle.mutate({ id: r.id, is_active: v })} />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(r); setOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del.mutate(r.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ))}
        {rules.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No rules yet.</p>}
      </div>
    </div>
  );
}

function AddonForm({ initial, onSubmit, busy }: { initial: AddonRule | null; onSubmit: (r: Partial<AddonRule>) => void; busy: boolean }) {
  const [form, setForm] = useState({
    id: initial?.id,
    trigger_kind: initial?.trigger_kind || "equipment",
    suggestion_kind: initial?.suggestion_kind || "custom",
    name: initial?.name || "",
    description: initial?.description || "",
    unit_price: initial?.unit_price || 0,
    badge: initial?.badge || "",
    sort_order: initial?.sort_order || 0,
    is_active: initial?.is_active ?? true,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>When cart contains</Label>
          <Select value={form.trigger_kind} onValueChange={(v) => setForm({ ...form, trigger_kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="equipment">Equipment</SelectItem>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="part">Part</SelectItem>
              <SelectItem value="any">Anything</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Sort order</Label>
          <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <Label>Suggestion name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Whole-Home Surge Protector" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Price</Label>
          <Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Badge (optional)</Label>
          <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="Most Added" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label className="text-sm">Active</Label>
        </div>
        <Button onClick={() => onSubmit(form)} disabled={busy || !form.name.trim()}>Save</Button>
      </div>
    </div>
  );
}

function DiscountsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);

  const { data: discounts = [] } = useQuery({
    queryKey: ["admin_discounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("cart_discounts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Discount[];
    },
  });

  const save = useMutation({
    mutationFn: async (d: Partial<Discount> & { id?: string }) => {
      const payload = {
        code: (d.code || "").trim().toUpperCase(),
        description: d.description || null,
        discount_type: d.discount_type || "percent",
        discount_value: Number(d.discount_value) || 0,
        min_total: Number(d.min_total) || 0,
        max_uses: d.max_uses ? Number(d.max_uses) : null,
        expires_at: d.expires_at || null,
        is_active: d.is_active ?? true,
      };
      if (d.id) {
        const { error } = await (supabase as any).from("cart_discounts").update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("cart_discounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_discounts"] });
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cart_discounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_discounts"] });
      toast.success("Deleted");
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Promo codes customers can apply at checkout.</p>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1" /> New Code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Promo Code</DialogTitle></DialogHeader>
            <DiscountForm initial={editing} onSubmit={(d) => save.mutate(d)} busy={save.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-2">
        {discounts.map((d) => (
          <Card key={d.id} className="p-3 flex items-center gap-3">
            <Badge className="font-mono text-xs">{d.code}</Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{d.description || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {d.discount_type === "percent" ? `${d.discount_value}% off` : `$${d.discount_value} off`}
                {d.min_total > 0 && ` • min $${d.min_total}`}
                {d.max_uses && ` • ${d.use_count}/${d.max_uses} used`}
              </p>
            </div>
            {!d.is_active && <Badge variant="outline">Inactive</Badge>}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(d); setOpen(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => del.mutate(d.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ))}
        {discounts.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No codes yet.</p>}
      </div>
    </div>
  );
}

function DiscountForm({ initial, onSubmit, busy }: { initial: Discount | null; onSubmit: (d: Partial<Discount>) => void; busy: boolean }) {
  const [form, setForm] = useState({
    id: initial?.id,
    code: initial?.code || "",
    description: initial?.description || "",
    discount_type: (initial?.discount_type || "percent") as "percent" | "fixed",
    discount_value: initial?.discount_value || 10,
    min_total: initial?.min_total || 0,
    max_uses: initial?.max_uses ?? null,
    expires_at: initial?.expires_at || "",
    is_active: initial?.is_active ?? true,
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>Code</Label>
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE20" className="font-mono uppercase" />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this code for?" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Type</Label>
          <Select value={form.discount_type} onValueChange={(v: "percent" | "fixed") => setForm({ ...form, discount_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percent off</SelectItem>
              <SelectItem value="fixed">Fixed dollar amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Value</Label>
          <Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Minimum total ($)</Label>
          <Input type="number" value={form.min_total} onChange={(e) => setForm({ ...form, min_total: Number(e.target.value) })} />
        </div>
        <div>
          <Label>Max uses (optional)</Label>
          <Input type="number" value={form.max_uses ?? ""} onChange={(e) => setForm({ ...form, max_uses: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label className="text-sm">Active</Label>
        </div>
        <Button onClick={() => onSubmit(form)} disabled={busy || !form.code.trim()}>Save</Button>
      </div>
    </div>
  );
}
