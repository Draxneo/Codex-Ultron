import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Search, Plus, Pencil, Trash2, Package, Loader2 } from "lucide-react";
import { usePartsCatalog, type Part } from "@/hooks/usePartsCatalog";
import { errorMessage } from "@/lib/errorMessage";

const CATEGORY_COLORS: Record<string, string> = {
  Capacitor: "bg-yellow-600 text-white",
  Contactor: "bg-orange-600 text-white",
  Motor: "bg-red-600 text-white",
  Filter: "bg-emerald-600 text-white",
  Thermostat: "bg-violet-600 text-white",
  Refrigerant: "bg-cyan-600 text-white",
  General: "bg-slate-600 text-white",
};

interface Props {
  onAddToCart?: (part: Part) => void;
}

export function PartsCatalogBrowser({ onAddToCart }: Props) {
  const { parts, isLoading, isError, error, addPart, updatePart, deletePart } = usePartsCatalog();
  const { confirmDelete } = useConfirm();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Part | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "" });

  const categories = useMemo(() => {
    const set = new Set<string>();
    parts.forEach(p => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [parts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const eff = category === "all" ? "" : category;
    return parts.filter(p => {
      if (eff && p.category !== eff) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [parts, query, category]);

  const openEdit = (p: Part) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description || "", category: p.category || "" });
  };

  const openNew = () => {
    setShowNew(true);
    setForm({ name: "", description: "", category: "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await updatePart.mutateAsync({ id: editing.id, ...form });
      setEditing(null);
    } else {
      await addPart.mutateAsync(form);
      setShowNew(false);
    }
  };

  const handleDelete = async (part: Part) => {
    const vendorCount = part.supply_house_numbers.length;
    await confirmDelete(part.name, {
      description: vendorCount > 0
        ? `This will permanently remove ${vendorCount} vendor part number${vendorCount !== 1 ? "s" : ""}. This action cannot be undone.`
        : "This action cannot be undone.",
      confirmText: "Delete Part",
      onConfirm: () => deletePart.mutateAsync(part.id).then(() => undefined),
    });
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search parts…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openNew} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> New Part
        </Button>
      </div>

      {/* Grid */}
      {isError ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Materials did not load.</p>
            <p className="text-xs leading-relaxed">{errorMessage(error)} Refresh before adding parts or checking vendor numbers.</p>
          </div>
        </div>
      ) : null}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading parts…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No parts found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(part => {
            const minCost = part.supply_house_numbers
              .map(s => s.unit_cost)
              .filter((c): c is number => typeof c === "number" && c > 0)
              .sort((a, b) => a - b)[0];
            return (
              <Card key={part.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-muted/40 flex items-center justify-center border-b">
                  <Package className="h-12 w-12 text-muted-foreground/40" />
                </div>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-semibold text-sm leading-tight line-clamp-2">{part.name}</h3>
                  </div>
                  {part.category && (
                    <Badge className={`text-[10px] ${CATEGORY_COLORS[part.category] || CATEGORY_COLORS.General}`}>
                      {part.category}
                    </Badge>
                  )}
                  {part.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{part.description}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-muted-foreground">
                      {part.supply_house_numbers.length} vendor{part.supply_house_numbers.length !== 1 ? "s" : ""}
                    </span>
                    {typeof minCost === "number" && (
                      <span className="text-sm font-bold">${minCost.toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex gap-1 pt-1">
                    {onAddToCart && (
                      <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => onAddToCart(part)}>
                        Add
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => openEdit(part)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(part)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit / New dialog */}
      <Dialog open={!!editing || showNew} onOpenChange={(open) => { if (!open) { setEditing(null); setShowNew(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Part" : "New Part"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 45/5 MFD Capacitor" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Capacitor" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setShowNew(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
