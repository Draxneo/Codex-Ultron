import { useState } from "react";
import { useBrandProfiles, type BrandProfile } from "@/hooks/useBrandProfiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Palette } from "lucide-react";

export function BrandProfilesEditor() {
  const { profiles, upsert, remove } = useBrandProfiles();
  const [editing, setEditing] = useState<BrandProfile | null>(null);
  const [form, setForm] = useState({
    brand_key: "", display_name: "", headline: "", subhead: "", eyebrow: "", title: "",
    body_1: "", body_2: "", badges: "[]", refrigerant: '{"name":"","detail":""}',
    logo_url: "", accent_color: "text-accent", accent_bg: "bg-accent/10", pill_bg: "bg-accent/20",
    gradient: "from-primary via-primary to-primary/80",
  });

  const openEdit = (p?: BrandProfile) => {
    if (p) {
      setForm({
        brand_key: p.brand_key, display_name: p.display_name, headline: p.headline, subhead: p.subhead,
        eyebrow: p.eyebrow, title: p.title, body_1: p.body_1, body_2: p.body_2,
        badges: JSON.stringify(p.badges, null, 2), refrigerant: JSON.stringify(p.refrigerant, null, 2),
        logo_url: p.logo_url, accent_color: p.accent_color, accent_bg: p.accent_bg, pill_bg: p.pill_bg, gradient: p.gradient,
      });
      setEditing(p);
    } else {
      setForm({
        brand_key: "", display_name: "", headline: "", subhead: "", eyebrow: "", title: "",
        body_1: "", body_2: "", badges: "[]", refrigerant: '{"name":"","detail":""}',
        logo_url: "", accent_color: "text-accent", accent_bg: "bg-accent/10", pill_bg: "bg-accent/20",
        gradient: "from-primary via-primary to-primary/80",
      });
      setEditing({} as any);
    }
  };

  const handleSave = () => {
    if (!form.brand_key.trim() || !form.display_name.trim()) return;
    let badges: any[], refrigerant: any;
    try { badges = JSON.parse(form.badges); } catch { badges = []; }
    try { refrigerant = JSON.parse(form.refrigerant); } catch { refrigerant = { name: "", detail: "" }; }
    upsert.mutate({
      ...(editing?.id ? { id: editing.id } : {}),
      brand_key: form.brand_key, display_name: form.display_name, headline: form.headline,
      subhead: form.subhead, eyebrow: form.eyebrow, title: form.title,
      body_1: form.body_1, body_2: form.body_2, badges, refrigerant,
      logo_url: form.logo_url, accent_color: form.accent_color, accent_bg: form.accent_bg,
      pill_bg: form.pill_bg, gradient: form.gradient,
    } as any);
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Manage brand marketing copy, logos, and visual themes.</p>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit()}>
          <Plus className="h-3 w-3" /> Add Brand
        </Button>
      </div>
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-lg border p-3 text-xs">
            <Palette className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="font-semibold text-foreground">{p.display_name}</p>
              <p className="text-muted-foreground truncate">{p.headline}</p>
              <div className="flex gap-1 mt-1">
                <Badge variant="secondary" className="text-[10px]">{p.brand_key}</Badge>
                <Badge variant="outline" className="text-[10px]">{p.badges.length} badges</Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => remove.mutate(p.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && <p className="text-xs text-muted-foreground italic">No brand profiles configured.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Brand Profile</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Brand Key</Label><Input value={form.brand_key} onChange={(e) => setForm(f => ({ ...f, brand_key: e.target.value }))} placeholder="carrier" disabled={!!editing?.id} /></div>
              <div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={form.display_name} onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Carrier" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Headline</Label><Input value={form.headline} onChange={(e) => setForm(f => ({ ...f, headline: e.target.value }))} placeholder="The Cadillac of Air Conditioning" /></div>
            <div className="space-y-1"><Label className="text-xs">Subhead</Label><Textarea rows={2} value={form.subhead} onChange={(e) => setForm(f => ({ ...f, subhead: e.target.value }))} className="text-xs" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Eyebrow</Label><Input value={form.eyebrow} onChange={(e) => setForm(f => ({ ...f, eyebrow: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Body 1</Label><Textarea rows={3} value={form.body_1} onChange={(e) => setForm(f => ({ ...f, body_1: e.target.value }))} className="text-xs" /></div>
            <div className="space-y-1"><Label className="text-xs">Body 2 (HTML OK)</Label><Textarea rows={3} value={form.body_2} onChange={(e) => setForm(f => ({ ...f, body_2: e.target.value }))} className="text-xs" /></div>
            <div className="space-y-1"><Label className="text-xs">Logo URL</Label><Input value={form.logo_url} onChange={(e) => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="Leave blank for built-in logo" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Accent Color</Label><Input value={form.accent_color} onChange={(e) => setForm(f => ({ ...f, accent_color: e.target.value }))} placeholder="text-accent" /></div>
              <div className="space-y-1"><Label className="text-xs">Gradient</Label><Input value={form.gradient} onChange={(e) => setForm(f => ({ ...f, gradient: e.target.value }))} placeholder="from-primary via-primary to-primary/80" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Badges (JSON)</Label><Textarea rows={3} value={form.badges} onChange={(e) => setForm(f => ({ ...f, badges: e.target.value }))} className="text-xs font-mono" /></div>
            <div className="space-y-1"><Label className="text-xs">Refrigerant (JSON)</Label><Textarea rows={2} value={form.refrigerant} onChange={(e) => setForm(f => ({ ...f, refrigerant: e.target.value }))} className="text-xs font-mono" /></div>
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