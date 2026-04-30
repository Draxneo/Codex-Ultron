import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileText, Camera, GripVertical } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";


interface FormField {
  id: string;
  job_type: string;
  field_type: string;
  label: string;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
  condition: string | null;
}

const JOB_TYPES = [
  { value: "install", label: "Install Completion Checklist" },
  { value: "service", label: "Service Checklist" },
  { value: "maintenance", label: "Tune-Up Checklist" },
  { value: "estimate", label: "Sales Checklist" },
  { value: "preinstall", label: "Install Checklist" },
  { value: "phone_call", label: "Phone Call Notes" },
  { value: "ductwork", label: "Duct Work Replacement" },
];
const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "photo", label: "Photo Upload" },
  { value: "checkbox", label: "Yes/No Checkbox" },
  { value: "select", label: "Dropdown Select" },
  { value: "button_group", label: "Button Group (Single)" },
  { value: "multi_button_group", label: "Button Group (Multi)" },
  { value: "signature", label: "Signature" },
];

/** Step groups control how TechFormSections groups fields into "What's Next" sections */
const STEP_GROUPS = [
  { value: "", label: "Auto-detect" },
  { value: "pickup", label: "Pick Up System" },
  { value: "arrival", label: "Arrived On-Site" },
  { value: "photos", label: "Photos" },
  { value: "duct_photos", label: "Duct Photos" },
  { value: "specs", label: "System Specs" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "checklist", label: "Checklist" },
  { value: "conditions", label: "Site Conditions" },
  { value: "notes", label: "Notes" },
  { value: "completion", label: "Completion & Submit" },
];

const SYSTEM_TYPES = [
  { value: "gas_heat", label: "Gas Heat" },
  { value: "heat_pump", label: "Heat Pump" },
  { value: "straight_cool", label: "Straight Cool" },
  { value: "dual_fuel", label: "Dual Fuel" },
];

function SortableFieldRow({ field, editingId, editLabel, setEditingId, setEditLabel, handleRename, fieldTypeIcon, conditionLabel, toggleRequired, handleDelete }: {
  field: FormField;
  editingId: string | null;
  editLabel: string;
  setEditingId: (id: string | null) => void;
  setEditLabel: (label: string) => void;
  handleRename: (id: string) => void;
  fieldTypeIcon: (type: string) => string;
  conditionLabel: (condition: string | null) => string | null;
  toggleRequired: (id: string, value: boolean) => void;
  handleDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-2 px-2 rounded border bg-card">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-sm w-6 text-center opacity-60">{fieldTypeIcon(field.field_type)}</span>
      <div className="flex-1 min-w-0">
        {editingId === field.id ? (
          <form onSubmit={(e) => { e.preventDefault(); handleRename(field.id); }} className="flex items-center gap-1">
            <Input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onBlur={() => handleRename(field.id)}
              autoFocus
              className="h-7 text-sm"
            />
          </form>
        ) : (
          <p
            className="text-sm font-medium truncate cursor-pointer hover:text-primary"
            onClick={() => { setEditingId(field.id); setEditLabel(field.label); }}
            title="Click to rename"
          >
            {field.label}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-0.5">
          {(field.field_type === "select" || field.field_type === "button_group") && field.options && (
            <p className="text-xs text-muted-foreground truncate">
              Options: {(field.options as string[]).join(", ")}
            </p>
          )}
          {field.condition && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {conditionLabel(field.condition)}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Req</span>
          <Switch
            checked={field.is_required}
            onCheckedChange={(v) => toggleRequired(field.id, v)}
            className="scale-75"
          />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(field.id)}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export function FormFieldsEditor() {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState("install");
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [previewSystemType, setPreviewSystemType] = useState("gas_heat");
  // New field form
  const [newLabel, setNewLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newOptions, setNewOptions] = useState("");
  const [newConditions, setNewConditions] = useState<string[]>([]);
  const [newStepGroup, setNewStepGroup] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex(f => f.id === active.id);
    const newIndex = fields.findIndex(f => f.id === over.id);
    const reordered = arrayMove(fields, oldIndex, newIndex);
    setFields(reordered);
    // Persist new sort_order
    await Promise.all(reordered.map((f, i) =>
      supabase.from("tech_form_fields").update({ sort_order: i }).eq("id", f.id)
    ));
    toast({ title: "Order updated" });
    queryClient.invalidateQueries({ queryKey: ["tech_form_field_counts"] });
  };

  const fetchFields = async (jobType: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("tech_form_fields")
      .select("*")
      .eq("job_type", jobType)
      .order("sort_order");
    setFields((data as FormField[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFields(activeType);
  }, [activeType]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    const maxOrder = fields.length > 0 ? Math.max(...fields.map(f => f.sort_order)) : 0;
    const opts = (newFieldType === "select" || newFieldType === "button_group" || newFieldType === "multi_button_group") && newOptions.trim()
      ? newOptions.split(",").map(o => o.trim()).filter(Boolean)
      : null;

    await supabase.from("tech_form_fields").insert({
      job_type: activeType,
      field_type: newFieldType,
      label: newLabel.trim(),
      is_required: newRequired,
      options: opts,
      sort_order: maxOrder + 1,
      condition: newConditions.length > 0 ? newConditions.join(",") : null,
      step_group: newStepGroup || null,
    } as any);

    setNewLabel("");
    setNewFieldType("text");
    setNewRequired(false);
    setNewOptions("");
    setNewConditions([]);
    setNewStepGroup("");
    setAddOpen(false);
    fetchFields(activeType);
    toast({ title: "Field added" });
    queryClient.invalidateQueries({ queryKey: ["tech_form_field_counts"] });
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tech_form_fields").delete().eq("id", id);
    fetchFields(activeType);
    toast({ title: "Field removed" });
    queryClient.invalidateQueries({ queryKey: ["tech_form_field_counts"] });
  };

  const toggleRequired = async (id: string, value: boolean) => {
    await supabase.from("tech_form_fields").update({ is_required: value }).eq("id", id);
    setFields(prev => prev.map(f => f.id === id ? { ...f, is_required: value } : f));
  };

  const handleRename = async (id: string) => {
    if (!editLabel.trim()) { setEditingId(null); return; }
    await supabase.from("tech_form_fields").update({ label: editLabel.trim() }).eq("id", id);
    setFields(prev => prev.map(f => f.id === id ? { ...f, label: editLabel.trim() } : f));
    setEditingId(null);
    toast({ title: "Field renamed" });
  };

  const toggleCondition = (val: string) => {
    setNewConditions(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const fieldTypeIcon = (type: string) => {
    switch (type) {
      case "text": return "Aa";
      case "photo": return "📷";
      case "checkbox": return "☑";
      case "select": return "▾";
      case "button_group": return "▦";
      case "signature": return "✍️";
      default: return "·";
    }
  };

  const conditionLabel = (condition: string | null) => {
    if (!condition) return null;
    if (condition === "service_agreement") return "Service Agreement only";
    if (condition === "!service_agreement") return "Non-Agreement only";
    if (condition.startsWith("field:")) {
      const match = condition.match(/^field:(.+)=(.+)$/);
      if (match) {
        const show = match[2] === "true" ? "Yes" : match[2] === "false" ? "No" : match[2];
        return `If "${match[1]}" = ${show}`;
      }
    }
    const labels = condition.split(",").map(c => {
      const found = SYSTEM_TYPES.find(s => s.value === c.trim());
      return found ? found.label : c.trim();
    });
    return labels.join(", ");
  };

  // Filter fields for preview
  const previewFields = fields.filter(f => {
    if (!f.condition) return true;
    const conditions = f.condition.split(",").map(c => c.trim());
    return conditions.includes(previewSystemType);
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Field Forms
        </CardTitle>
        <CardDescription className="text-xs">
          Customize which fields each form shows. Fields with conditions only show for matching system types.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeType} onValueChange={setActiveType}>
          <TabsList className="grid grid-cols-4 w-full">
            {JOB_TYPES.map(jt => (
              <TabsTrigger key={jt.value} value={jt.value} className="text-xs">{jt.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {fields.map((field) => (
                  <SortableFieldRow
                    key={field.id}
                    field={field}
                    editingId={editingId}
                    editLabel={editLabel}
                    setEditingId={setEditingId}
                    setEditLabel={setEditLabel}
                    handleRename={handleRename}
                    fieldTypeIcon={fieldTypeIcon}
                    conditionLabel={conditionLabel}
                    toggleRequired={toggleRequired}
                    handleDelete={handleDelete}
                  />
                ))}
                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No fields yet. Add one below.</p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Field
          </Button>
        </div>

        {/* Add Field Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-sm" aria-describedby="add-field-desc">
            <DialogHeader>
              <DialogTitle>Add Form Field — {JOB_TYPES.find(j => j.value === activeType)?.label || activeType}</DialogTitle>
              <DialogDescription id="add-field-desc">Configure a new field for this form type.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Label</Label>
                <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Condenser Serial #" />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={newFieldType} onValueChange={setNewFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(ft => (
                      <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(newFieldType === "select" || newFieldType === "button_group" || newFieldType === "multi_button_group") && (
                <div className="space-y-1">
                  <Label>Options (comma separated)</Label>
                  <Input value={newOptions} onChange={e => setNewOptions(e.target.value)} placeholder="Option A, Option B, Option C" />
                </div>
              )}
              <div className="space-y-1">
                <Label>Section Group</Label>
                <Select value={newStepGroup} onValueChange={setNewStepGroup}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                  <SelectContent>
                    {STEP_GROUPS.map(sg => (
                      <SelectItem key={sg.value} value={sg.value || "__auto__"}>{sg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">Controls which "What's Next" section this field appears in</p>
              </div>
              <div className="space-y-1">
                <Label>Show only for system types (leave unchecked = always)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {SYSTEM_TYPES.map(st => (
                    <label key={st.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={newConditions.includes(st.value)}
                        onCheckedChange={() => toggleCondition(st.value)}
                      />
                      {st.label}
                    </label>
                  ))}
                </div>
              </div>
              {activeType === "maintenance" && (
                <div className="space-y-1">
                  <Label>Service Agreement condition</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={newConditions.includes("service_agreement")}
                        onCheckedChange={() => toggleCondition("service_agreement")}
                      />
                      Show only for agreement visits
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={newConditions.includes("!service_agreement")}
                        onCheckedChange={() => toggleCondition("!service_agreement")}
                      />
                      Show only for non-agreement visits
                    </label>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                <Label>Required</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Form Preview — {activeType.charAt(0).toUpperCase() + activeType.slice(1)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">Simulate System Type</Label>
                <Select value={previewSystemType} onValueChange={setPreviewSystemType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYSTEM_TYPES.map(st => (
                      <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-md bg-muted text-sm">
                <span className="font-medium">Tech:</span> John Smith
              </div>
              {previewFields.map(field => (
                <div key={field.id} className="space-y-2">
                  {field.field_type === "text" && (
                    <>
                      <Label>
                        {field.label} {field.is_required && <span className="text-destructive">*</span>}
                      </Label>
                      {field.label.toLowerCase().includes("note") || field.label.toLowerCase().includes("diagnosis") || field.label.toLowerCase().includes("recommendation") ? (
                        <Textarea disabled rows={3} placeholder={field.label} />
                      ) : (
                        <Input disabled placeholder={field.label} />
                      )}
                    </>
                  )}
                  {field.field_type === "checkbox" && (
                    <div className="flex items-center gap-3 py-1">
                      <Checkbox disabled />
                      <Label>
                        {field.label} {field.is_required && <span className="text-destructive">*</span>}
                      </Label>
                    </div>
                  )}
                  {field.field_type === "select" && (
                    <>
                      <Label>
                        {field.label} {field.is_required && <span className="text-destructive">*</span>}
                      </Label>
                      <Select disabled>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {(field.options as string[] || []).map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  {field.field_type === "photo" && (
                    <>
                      <Label className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        {field.label} {field.is_required && <span className="text-destructive">*</span>}
                      </Label>
                      <Input disabled type="file" className="cursor-not-allowed" />
                    </>
                  )}
                </div>
              ))}
              {previewFields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No fields visible for this system type.</p>
              )}
              <Button disabled className="w-full">Submit Completion</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
