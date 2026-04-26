import { useState } from "react";
import { usePresentationSections, type PresentationSection } from "@/hooks/usePresentationSections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Layout } from "lucide-react";

export function PresentationSectionsEditor() {
  const { sections, upsert, remove } = usePresentationSections();
  const [editing, setEditing] = useState<PresentationSection | null>(null);
  const [form, setForm] = useState({ section_key: "", title: "", subtitle: "", body_html: "", items: "[]", sort_order: "0" });

  const openEdit = (s?: PresentationSection) => {
    if (s) {
      setForm({
        section_key: s.section_key, title: s.title, subtitle: s.subtitle,
        body_html: s.body_html, items: JSON.stringify(s.items, null, 2), sort_order: String(s.sort_order),
      });
      setEditing(s);
    } else {
      setForm({ section_key: "", title: "", subtitle: "", body_html: "", items: "[]", sort_order: "0" });
      setEditing({} as any);
    }
  };

  const handleSave = () => {
    if (!form.section_key.trim()) return;
    let items: any[];
    try { items = JSON.parse(form.items); } catch { items = []; }
    upsert.mutate({
      ...(editing?.id ? { id: editing.id } : {}),
      section_key: form.section_key, title: form.title, subtitle: form.subtitle,
      body_html: form.body_html, items, sort_order: parseInt(form.sort_order) || 0,
    } as any);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Edit trust strip, why-us bullets, installation includes, and more.</p>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit()}>
          <Plus className="h-3 w-3" /> Add Section
        </Button>
      </div>
      <div className="space-y-2">
        {sections.map((s) => (
          <div key={s.id} className="flex items-start gap-3 rounded-lg border p-3 text-xs">
            <Layout className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-semibold text-foreground">{s.title || s.section_key}</p>
              {s.subtitle && <p className="text-muted-foreground">{s.subtitle}</p>}
              <div className="flex gap-1 mt-1">
                <Badge variant="secondary" className="text-[10px]">{s.section_key}</Badge>
                <Badge variant="outline" className="text-[10px]">{s.items.length} items</Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => remove.mutate(s.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {sections.length === 0 && <p className="text-xs text-muted-foreground italic">No presentation sections configured.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Presentation Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Section Key</Label><Input value={form.section_key} onChange={(e) => setForm(f => ({ ...f, section_key: e.target.value }))} placeholder="trust_strip" disabled={!!editing?.id} /></div>
              <div className="space-y-1"><Label className="text-xs">Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Subtitle</Label><Input value={form.subtitle} onChange={(e) => setForm(f => ({ ...f, subtitle: e.target.value }))} /></div>
            <div className="space-y-1"><Label className="text-xs">Body HTML</Label><Textarea rows={3} value={form.body_html} onChange={(e) => setForm(f => ({ ...f, body_html: e.target.value }))} className="text-xs" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Items (JSON array)</Label>
              <Textarea rows={6} value={form.items} onChange={(e) => setForm(f => ({ ...f, items: e.target.value }))} className="text-xs font-mono" placeholder='["Item 1", "Item 2"]' />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
