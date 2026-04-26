import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, LayoutGrid, TableProperties, Pencil, Check, X, Eye, EyeOff, Wrench, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { RepairCatalogBrowser } from "@/components/RepairCatalogBrowser";
import type { RepairCatalogItem } from "@/components/RepairProductCard";
import { SeedRepairCatalogButton } from "@/components/admin/SeedRepairCatalogButton";

const CATEGORIES = ["Electrical", "Refrigerant", "Airflow", "Motors", "Controls", "Safety", "Drainage", "Upgrades", "General"];
const SEVERITY_COLORS: Record<string, string> = {
  necessary: "bg-red-500/10 text-red-600 border-red-200",
  recommended: "bg-amber-500/10 text-amber-600 border-amber-200",
  deluxe: "bg-blue-500/10 text-blue-600 border-blue-200",
};

const emptyItem: Omit<RepairCatalogItem, "id" | "created_at"> = {
  name: "",
  category: "General",
  tech_description: "",
  customer_description: "",
  importance: "",
  consequences: "",
  default_severity: "necessary",
  default_labor_hours: 1,
  keywords: [],
  is_active: true,
  base_price: 0,
  parts_cost: 0,
  member_price: null,
  flat_rate: true,
};

export default function RepairCatalog() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [catalogView, setCatalogView] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState(emptyItem);
  const [editItem, setEditItem] = useState<RepairCatalogItem | null>(null);
  const [editData, setEditData] = useState<Partial<RepairCatalogItem>>({});

  // Table view state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["repair-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as RepairCatalogItem[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<RepairCatalogItem> }) => {
      const { error } = await supabase.from("repair_catalog").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
      setEditItem(null);
      toast({ title: "Catalog item updated" });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (item: typeof emptyItem) => {
      const { error } = await supabase.from("repair_catalog").insert(item);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repair-catalog"] });
      setShowAdd(false);
      setNewItem(emptyItem);
      toast({ title: "Catalog item added" });
    },
  });

  const handleEditFromCard = (item: RepairCatalogItem) => {
    setEditItem(item);
    setEditData({
      name: item.name,
      category: item.category,
      customer_description: item.customer_description,
      tech_description: item.tech_description,
      importance: item.importance,
      consequences: item.consequences,
      default_severity: item.default_severity,
      default_labor_hours: item.default_labor_hours,
      keywords: item.keywords,
      base_price: item.base_price ?? 0,
      parts_cost: item.parts_cost ?? 0,
      member_price: item.member_price ?? null,
    });
  };

  const filtered = items.filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.customer_description.toLowerCase().includes(q) || item.keywords.some(k => k.toLowerCase().includes(q));
    }
    return true;
  });

  const grouped = filtered.reduce<Record<string, RepairCatalogItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Repair Catalog</h1>
            <p className="text-sm text-muted-foreground">Curated descriptions JARVIS uses for repair quotes.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={catalogView ? "default" : "outline"}
              onClick={() => setCatalogView(v => !v)}
            >
              {catalogView ? <TableProperties className="h-4 w-4 mr-1.5" /> : <LayoutGrid className="h-4 w-4 mr-1.5" />}
              {catalogView ? "Table View" : "Catalog View"}
            </Button>
            <SeedRepairCatalogButton />
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Repair
            </Button>
          </div>
        </div>

        {catalogView ? (
          <RepairCatalogBrowser editable onEdit={handleEditFromCard} />
        ) : (
          <>
            {/* Table view filters */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search repairs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Table view items */}
            {isLoading ? (
              <p className="text-muted-foreground text-center py-8">Loading catalog...</p>
            ) : Object.keys(grouped).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No repairs found.</p>
            ) : (
              Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, catItems]) => (
                <div key={category} className="space-y-2">
                  <div className="flex items-center gap-2 pt-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-semibold text-sm">{category}</h2>
                    <Badge variant="secondary" className="text-xs">{catItems.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {catItems.map(item => (
                      <Card key={item.id} className={`transition-all ${!item.is_active ? "opacity-50" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-medium text-sm">{item.name}</span>
                                <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS[item.default_severity] || ""}`}>
                                  {item.default_severity}
                                </Badge>
                                <span className="font-bold text-sm tabular-nums text-primary">
                                  ${Number(item.base_price ?? 0).toFixed(0)}
                                </span>
                                {item.member_price != null && (
                                  <span className="text-[10px] text-emerald-600 font-semibold">
                                    Club ${Number(item.member_price).toFixed(0)}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">{item.default_labor_hours}h labor</span>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1">{item.customer_description}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEditFromCard(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateMutation.mutate({ id: item.id, updates: { is_active: !item.is_active } })}>
                                {item.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Repair</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={editData.name || ""} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editData.category} onValueChange={v => setEditData(d => ({ ...d, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Customer Description</Label>
                <Textarea value={editData.customer_description || ""} onChange={e => setEditData(d => ({ ...d, customer_description: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Tech Description</Label>
                <Textarea value={editData.tech_description || ""} onChange={e => setEditData(d => ({ ...d, tech_description: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Importance</Label>
                  <Textarea value={editData.importance || ""} onChange={e => setEditData(d => ({ ...d, importance: e.target.value }))} rows={2} />
                </div>
                <div>
                  <Label className="text-xs">Consequences</Label>
                  <Textarea value={editData.consequences || ""} onChange={e => setEditData(d => ({ ...d, consequences: e.target.value }))} rows={2} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Severity</Label>
                  <Select value={editData.default_severity} onValueChange={v => setEditData(d => ({ ...d, default_severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="necessary">Necessary</SelectItem>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="deluxe">Deluxe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Labor Hours</Label>
                  <Input type="number" step="0.25" value={editData.default_labor_hours ?? 1} onChange={e => setEditData(d => ({ ...d, default_labor_hours: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              {/* Pricing block */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Base Price ($)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={editData.base_price ?? 0}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        setEditData(d => ({
                          ...d,
                          base_price: v,
                          member_price: Math.round(v * 0.85 * 100) / 100,
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Parts Cost ($)</Label>
                    <Input type="number" step="1" value={editData.parts_cost ?? 0} onChange={e => setEditData(d => ({ ...d, parts_cost: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Member Price ($)</Label>
                    <Input type="number" step="1" value={editData.member_price ?? ""} onChange={e => setEditData(d => ({ ...d, member_price: e.target.value === "" ? null : parseFloat(e.target.value) }))} placeholder="auto" />
                  </div>
                </div>
                {editData.base_price != null && editData.base_price > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Margin: <span className={
                      ((editData.base_price - (editData.parts_cost ?? 0)) / editData.base_price) >= 0.5 ? "text-emerald-600 font-semibold"
                      : ((editData.base_price - (editData.parts_cost ?? 0)) / editData.base_price) >= 0.3 ? "text-amber-600 font-semibold"
                      : "text-rose-600 font-semibold"
                    }>
                      {Math.round(((editData.base_price - (editData.parts_cost ?? 0)) / editData.base_price) * 100)}%
                    </span>
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Keywords (comma-separated)</Label>
                <Input value={(editData.keywords || []).join(", ")} onChange={e => setEditData(d => ({ ...d, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={() => editItem && updateMutation.mutate({ id: editItem.id, updates: editData })}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Catalog Repair</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={newItem.name} onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))} placeholder="Capacitor Replacement" />
              </div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={newItem.category} onValueChange={v => setNewItem(n => ({ ...n, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tech Description</Label>
              <Textarea value={newItem.tech_description} onChange={e => setNewItem(n => ({ ...n, tech_description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Customer Description</Label>
              <Textarea value={newItem.customer_description} onChange={e => setNewItem(n => ({ ...n, customer_description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Importance</Label>
                <Textarea value={newItem.importance} onChange={e => setNewItem(n => ({ ...n, importance: e.target.value }))} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Consequences</Label>
                <Textarea value={newItem.consequences} onChange={e => setNewItem(n => ({ ...n, consequences: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={newItem.default_severity} onValueChange={v => setNewItem(n => ({ ...n, default_severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="necessary">Necessary</SelectItem>
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="deluxe">Deluxe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Labor Hours</Label>
                <Input type="number" step="0.25" value={newItem.default_labor_hours} onChange={e => setNewItem(n => ({ ...n, default_labor_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label className="text-xs">Keywords (comma-sep)</Label>
                <Input value={newItem.keywords.join(", ")} onChange={e => setNewItem(n => ({ ...n, keywords: e.target.value.split(",").map(k => k.trim()).filter(Boolean) }))} />
              </div>
            </div>
            {/* Pricing block */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pricing</Label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Base Price ($)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={newItem.base_price ?? 0}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setNewItem(n => ({ ...n, base_price: v, member_price: Math.round(v * 0.85 * 100) / 100 }));
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Parts Cost ($)</Label>
                  <Input type="number" step="1" value={newItem.parts_cost ?? 0} onChange={e => setNewItem(n => ({ ...n, parts_cost: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="text-xs">Member Price ($)</Label>
                  <Input type="number" step="1" value={newItem.member_price ?? ""} onChange={e => setNewItem(n => ({ ...n, member_price: e.target.value === "" ? null : parseFloat(e.target.value) }))} placeholder="auto 15% off" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate(newItem)} disabled={!newItem.name}>Add to Catalog</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
