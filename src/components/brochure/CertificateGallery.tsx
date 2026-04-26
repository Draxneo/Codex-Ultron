import { useState } from "react";
import { useCertificateTemplates, type CertificateTemplate } from "@/hooks/useCertificateTemplates";
import { DynamicCertificate } from "@/components/certificates/DynamicCertificate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Award, Eye, Plus, Pencil, Trash2 } from "lucide-react";

const SAMPLE_DATA: Record<string, any> = {
  manufacturer_warranty: { customerName: "John Smith", brand: "Carrier", model: "24ACC636A003", serial: "1234567890", serialNumber: "1234567890", installDate: new Date().toISOString(), equipmentDescription: "3-Ton 16 SEER2 Air Conditioner", confirmationNumber: "WR-2026-48291" },
  labor_warranty: { customerName: "John Smith", brand: "Carrier", model: "24ACC636A003", serial: "1234567890", serialNumber: "1234567890", installDate: new Date().toISOString(), equipmentDescription: "3-Ton 16 SEER2 Air Conditioner" },
  labor_warranty_10yr: { customerName: "John Smith", brand: "Carrier", model: "24ACC636A003", serialNumber: "1234567890", installDate: new Date().toISOString(), equipmentDescription: "3-Ton 16 SEER2 Air Conditioner" },
  no_lemon: { customerName: "John Smith", brand: "Carrier", model: "24ACC636A003", serial: "1234567890", serialNumber: "1234567890", installDate: new Date().toISOString(), equipmentDescription: "3-Ton 16 SEER2 Air Conditioner" },
  price_match: { customerName: "John Smith", estimateDate: new Date().toISOString() },
  comfort_club: { customerName: "John Smith", planName: "Comfort Club Membership", installDate: new Date().toISOString(), annualRate: "$199/year", membershipId: "CC-2026-00142" },
};

export default function CertificateGallery() {
  const { templates, isLoading, upsert, remove } = useCertificateTemplates();
  const [editing, setEditing] = useState<CertificateTemplate | null>(null);
  const [previewing, setPreviewing] = useState<CertificateTemplate | null>(null);
  const [form, setForm] = useState({ type_key: "", display_name: "", subtitle_template: "", body_template: "", warranty_years: "", fields_schema: "[]" });

  const openEdit = (t?: CertificateTemplate) => {
    if (t) {
      setForm({
        type_key: t.type_key, display_name: t.display_name, subtitle_template: t.subtitle_template,
        body_template: t.body_template, warranty_years: t.warranty_years != null ? String(t.warranty_years) : "",
        fields_schema: JSON.stringify(t.fields_schema, null, 2),
      });
      setEditing(t);
    } else {
      setForm({ type_key: "", display_name: "", subtitle_template: "", body_template: "", warranty_years: "", fields_schema: "[]" });
      setEditing({} as any);
    }
  };

  const handleSave = () => {
    if (!form.type_key.trim() || !form.display_name.trim()) return;
    let fieldsSchema: any[];
    try { fieldsSchema = JSON.parse(form.fields_schema); } catch { fieldsSchema = []; }
    upsert.mutate({
      ...(editing?.id ? { id: editing.id } : {}),
      type_key: form.type_key, display_name: form.display_name,
      subtitle_template: form.subtitle_template, body_template: form.body_template,
      warranty_years: form.warranty_years ? parseInt(form.warranty_years) : null,
      fields_schema: fieldsSchema,
    } as any);
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-[1.414/1] rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Click any certificate to preview full-size</span>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openEdit()}>
          <Plus className="h-3.5 w-3.5" /> New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Award className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No certificate templates yet. Click "New Template" to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((template) => {
            const sampleData = SAMPLE_DATA[template.type_key] || SAMPLE_DATA.manufacturer_warranty;
            return (
              <div key={template.id} className="group relative rounded-xl border-2 border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg">
                {/* Scaled-down preview */}
                <button className="w-full text-left" onClick={() => setPreviewing(template)}>
                  <div className="pointer-events-none origin-top-left scale-[0.5] w-[200%] h-[200%]">
                    <DynamicCertificate template={template} data={sampleData} />
                  </div>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 pointer-events-none">
                    <div className="flex items-center gap-2 bg-white/90 text-foreground rounded-full px-4 py-1.5 text-xs font-medium shadow-lg">
                      <Eye className="h-3.5 w-3.5" /> View Full Size
                    </div>
                  </div>
                </button>
                {/* Label + action buttons */}
                <div className="absolute top-3 left-3 bg-background/90 backdrop-blur rounded-md px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
                  {template.display_name}
                </div>
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="secondary" className="h-7 w-7 shadow-sm" onClick={() => openEdit(template)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="secondary" className="h-7 w-7 shadow-sm text-destructive" onClick={() => remove.mutate(template.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-size preview dialog */}
      <Dialog open={!!previewing} onOpenChange={(o) => { if (!o) setPreviewing(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-2 sm:p-4">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Certificate Preview</DialogTitle></DialogHeader>
          {previewing && <DynamicCertificate template={previewing} data={SAMPLE_DATA[previewing.type_key] || SAMPLE_DATA.manufacturer_warranty} />}
        </DialogContent>
      </Dialog>

      {/* Edit/Create dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "New"} Certificate Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Type Key</Label><Input value={form.type_key} onChange={(e) => setForm(f => ({ ...f, type_key: e.target.value }))} placeholder="labor_warranty" disabled={!!editing?.id} /></div>
              <div className="space-y-1"><Label className="text-xs">Warranty Years</Label><Input type="number" value={form.warranty_years} onChange={(e) => setForm(f => ({ ...f, warranty_years: e.target.value }))} placeholder="Optional" /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={form.display_name} onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Labor Warranty Certificate" /></div>
            <div className="space-y-1"><Label className="text-xs">Subtitle Template</Label><Input value={form.subtitle_template} onChange={(e) => setForm(f => ({ ...f, subtitle_template: e.target.value }))} placeholder="{{warrantyYears}}-Year Coverage" /></div>
            <div className="space-y-1"><Label className="text-xs">Body Template</Label><Textarea rows={4} value={form.body_template} onChange={(e) => setForm(f => ({ ...f, body_template: e.target.value }))} placeholder="Use {{customerName}}, {{brand}}, {{warrantyYears}} variables..." className="text-xs" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Fields Schema (JSON)</Label>
              <Textarea rows={4} value={form.fields_schema} onChange={(e) => setForm(f => ({ ...f, fields_schema: e.target.value }))} className="text-xs font-mono" placeholder='[{"label":"Brand","variable":"brand"}]' />
              <p className="text-[10px] text-muted-foreground">Available: customerName, brand, model, serialNumber, installDate, expirationDate, warrantyYears, equipmentDescription, confirmationNumber, estimateDate</p>
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
