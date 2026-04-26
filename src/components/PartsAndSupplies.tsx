import { useState, useMemo } from "react";
import { usePartsCatalog, Part } from "@/hooks/usePartsCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Search, Pencil, Trash2, Package, Hash, ChevronDown, ChevronRight } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PART_CATEGORIES = [
  "Carrier",
  "Day & Night",
  "Goodman",
  "Trane",
  "Robert Madden",
  "General",
];

export default function PartsAndSupplies() {
  const {
    parts, supplyHouses, isLoading,
    addPart, updatePart, deletePart,
    addSupplyHouseNumber, deleteSupplyHouseNumber,
  } = usePartsCatalog();
  const { confirmDelete } = useConfirm();

  const [search, setSearch] = useState("");
  const [showAddPart, setShowAddPart] = useState(false);
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [showAddNumber, setShowAddNumber] = useState<string | null>(null);
  const [expandedPart, setExpandedPart] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newSHId, setNewSHId] = useState("");
  const [newPartNum, setNewPartNum] = useState("");
  const [newCost, setNewCost] = useState("");

  const filtered = parts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase()) ||
      p.supply_house_numbers.some((s) =>
        s.part_number.toLowerCase().includes(search.toLowerCase())
      )
  );

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, Part[]> = {};
    for (const cat of PART_CATEGORIES) {
      groups[cat] = [];
    }
    for (const part of filtered) {
      const cat = PART_CATEGORIES.find(
        (c) => c.toLowerCase() === (part.category || "").toLowerCase()
      ) || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(part);
    }
    // Only return groups that have parts
    return Object.entries(groups).filter(([, parts]) => parts.length > 0);
  }, [filtered]);

  const toggleGroup = (cat: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleAddPart = () => {
    if (!newName.trim()) return;
    addPart.mutate(
      { name: newName.trim(), description: newDesc.trim() || undefined, category: newCategory || "General" },
      { onSuccess: () => { setShowAddPart(false); setNewName(""); setNewDesc(""); setNewCategory("General"); } }
    );
  };

  const handleUpdatePart = () => {
    if (!editPart || !newName.trim()) return;
    updatePart.mutate(
      { id: editPart.id, name: newName.trim(), description: newDesc.trim() || null, category: newCategory || "General" },
      { onSuccess: () => { setEditPart(null); setNewName(""); setNewDesc(""); setNewCategory("General"); } }
    );
  };

  const handleAddSHNumber = () => {
    if (!showAddNumber || !newSHId || !newPartNum.trim()) return;
    addSupplyHouseNumber.mutate(
      { part_id: showAddNumber, supply_house_id: newSHId, part_number: newPartNum.trim(), unit_cost: newCost ? parseFloat(newCost) : undefined },
      { onSuccess: () => { setShowAddNumber(null); setNewSHId(""); setNewPartNum(""); setNewCost(""); } }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search parts, categories, or part numbers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button size="sm" onClick={() => { setShowAddPart(true); setNewName(""); setNewDesc(""); setNewCategory("General"); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Part
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No parts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([category, categoryParts]) => {
            const isCollapsed = collapsedGroups.has(category);
            return (
              <div key={category}>
                <button
                  className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-muted/50 rounded-md transition-colors"
                  onClick={() => toggleGroup(category)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-foreground">{category}</span>
                  <Badge variant="secondary" className="text-xs">{categoryParts.length}</Badge>
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 ml-1">
                    {categoryParts.map((part) => {
                      const isExpanded = expandedPart === part.id;
                      return (
                        <Card key={part.id} className="overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpandedPart(isExpanded ? null : part.id)}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground truncate">{part.name}</span>
                              </div>
                              {part.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{part.description}</p>}
                            </div>
                            <Badge variant="outline" className="text-xs shrink-0 ml-2">
                              <Hash className="h-3 w-3 mr-0.5" />{part.supply_house_numbers.length}
                            </Badge>
                          </div>

                          {isExpanded && (
                            <CardContent className="border-t bg-muted/30 px-4 py-3 space-y-3">
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditPart(part); setNewName(part.name); setNewDesc(part.description || ""); setNewCategory(part.category || "General"); }}>
                                  <Pencil className="h-3 w-3 mr-1" /> Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setShowAddNumber(part.id); setNewSHId(""); setNewPartNum(""); setNewCost(""); }}>
                                  <Plus className="h-3 w-3 mr-1" /> Add Part #
                                </Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-auto" onClick={async (e) => {
                                  e.stopPropagation();
                                  const vendorCount = part.supply_house_numbers.length;
                                  await confirmDelete(part.name, {
                                    description: vendorCount > 0
                                      ? `This will remove ${vendorCount} supply house part number${vendorCount !== 1 ? "s" : ""}. This action cannot be undone.`
                                      : "This action cannot be undone.",
                                    confirmText: "Delete Part",
                                    onConfirm: async () => {
                                      await deletePart.mutateAsync(part.id);
                                      setExpandedPart(null);
                                    },
                                  });
                                }}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              {part.supply_house_numbers.length > 0 ? (
                                <div className="space-y-1.5">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Supply House Part Numbers</p>
                                  {part.supply_house_numbers.map((shn) => (
                                    <div key={shn.id} className="flex items-center justify-between bg-background rounded-md px-3 py-2 border text-sm">
                                      <div>
                                        <span className="font-medium text-foreground">{shn.supply_house?.name || "Unknown"}</span>
                                        <span className="mx-2 text-muted-foreground">→</span>
                                        <span className="font-mono text-primary">{shn.part_number}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {shn.unit_cost != null && <span className="text-xs text-muted-foreground">${shn.unit_cost.toFixed(2)}</span>}
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive" onClick={() => deleteSupplyHouseNumber.mutate(shn.id)}>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No supply house numbers yet</p>
                              )}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Part Dialog */}
      <Dialog open={showAddPart} onOpenChange={setShowAddPart}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Part</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Part name *" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger><SelectValue placeholder="Select company/brand" /></SelectTrigger>
              <SelectContent>
                {PART_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button onClick={handleAddPart} disabled={!newName.trim() || addPart.isPending}>
              {addPart.isPending ? "Adding..." : "Add Part"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Part Dialog */}
      <Dialog open={!!editPart} onOpenChange={(o) => !o && setEditPart(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Part</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Part name *" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger><SelectValue placeholder="Select company/brand" /></SelectTrigger>
              <SelectContent>
                {PART_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button onClick={handleUpdatePart} disabled={!newName.trim() || updatePart.isPending}>
              {updatePart.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Supply House Number Dialog */}
      <Dialog open={!!showAddNumber} onOpenChange={(o) => !o && setShowAddNumber(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Supply House Part Number</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={newSHId} onValueChange={setNewSHId}>
              <SelectTrigger><SelectValue placeholder="Select supply house" /></SelectTrigger>
              <SelectContent>
                {supplyHouses.map((sh) => (
                  <SelectItem key={sh.id} value={sh.id}>{sh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Part number at this supply house *" value={newPartNum} onChange={(e) => setNewPartNum(e.target.value)} />
            <Input placeholder="Unit cost (optional)" type="number" step="0.01" value={newCost} onChange={(e) => setNewCost(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleAddSHNumber} disabled={!newSHId || !newPartNum.trim() || addSupplyHouseNumber.isPending}>
              {addSupplyHouseNumber.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
