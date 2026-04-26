import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Save, Plus, Trash2, ChevronDown, Pencil, BarChart3 } from "lucide-react";

interface ComparisonRow { label: string; good: string; better: string; best: string; }
interface ComparisonBlock {
  id: string; category: string; icon: string; sort_order: number; rows: ComparisonRow[];
}

export default function ComparisonBlocksManager() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<ComparisonBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ComparisonBlock | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchBlocks = async () => {
    setLoading(true);
    const { data } = await supabase.from("comparison_blocks").select("*").order("sort_order");
    if (data) setBlocks(data.map((d: any) => ({ ...d, rows: (d.rows || []) as ComparisonRow[] })));
    setLoading(false);
  };

  useEffect(() => { fetchBlocks(); }, []);

  const saveBlock = async () => {
    if (!editing) return;
    setSaving(true);
    const { id, ...rest } = editing;
    const payload = { ...rest, rows: JSON.parse(JSON.stringify(rest.rows)) };
    const { error } = await supabase.from("comparison_blocks").update(payload).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Comparison block saved" });
      setEditing(null);
      fetchBlocks();
    }
    setSaving(false);
  };

  const updateRow = (index: number, field: keyof ComparisonRow, value: string) => {
    if (!editing) return;
    const newRows = [...editing.rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setEditing({ ...editing, rows: newRows });
  };

  const addRow = () => {
    if (!editing) return;
    setEditing({ ...editing, rows: [...editing.rows, { label: "", good: "", better: "", best: "" }] });
  };

  const removeRow = (index: number) => {
    if (!editing) return;
    setEditing({ ...editing, rows: editing.rows.filter((_, i) => i !== index) });
  };

  if (loading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Loading comparison blocks...</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Comparison Blocks</CardTitle>
        <p className="text-sm text-muted-foreground">
          Good / Better / Best comparison rows shown on every customer brochure.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {blocks.map(comp => {
            const isExpanded = expandedId === comp.id;
            return (
              <div key={comp.id} className={cn("rounded-xl border-2 bg-background overflow-hidden transition-all", isExpanded && "ring-4 ring-accent/20")}>
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{comp.icon}</span>
                    <span className="text-base font-bold text-foreground">{comp.category}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{comp.rows.length} rows</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={(e) => { e.stopPropagation(); setEditing({ ...comp }); }}>
                      <Pencil className="mr-1 h-3 w-3" /> Edit
                    </Button>
                    <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground w-1/4"></th>
                          <th className="px-4 py-2.5 text-center text-xs font-bold text-muted-foreground">Good</th>
                          <th className="px-4 py-2.5 text-center text-xs font-bold text-accent">Better</th>
                          <th className="px-4 py-2.5 text-center text-xs font-bold text-primary">Best</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comp.rows.map((row, i) => (
                          <tr key={i} className="border-t hover:bg-muted/20">
                            <td className="px-5 py-2.5 font-medium text-muted-foreground text-xs">{row.label}</td>
                            <td className="px-4 py-2.5 text-center text-xs text-foreground">{row.good}</td>
                            <td className="px-4 py-2.5 text-center text-xs text-foreground">{row.better}</td>
                            <td className="px-4 py-2.5 text-center text-xs font-semibold text-foreground">{row.best}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.icon} Edit: {editing?.category}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Category Name</Label>
                    <Input value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Icon (emoji)</Label>
                    <Input value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">Comparison Rows</Label>
                    <Button size="sm" variant="outline" onClick={addRow}><Plus className="mr-1 h-3.5 w-3.5" /> Add Row</Button>
                  </div>

                  <div className="space-y-4">
                    {editing.rows.map((row, i) => (
                      <div key={i} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-muted-foreground">Row {i + 1}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeRow(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Label</Label>
                          <Input value={row.label} onChange={e => updateRow(i, "label", e.target.value)} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Good</Label>
                            <Input value={row.good} onChange={e => updateRow(i, "good", e.target.value)} className="text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-accent font-bold">Better</Label>
                            <Input value={row.better} onChange={e => updateRow(i, "better", e.target.value)} className="text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-primary font-bold">Best</Label>
                            <Input value={row.best} onChange={e => updateRow(i, "best", e.target.value)} className="text-xs" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button onClick={saveBlock} disabled={saving} className="w-full"><Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
