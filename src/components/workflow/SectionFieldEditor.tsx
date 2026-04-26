/**
 * SectionFieldEditor — Inline editor for tech form fields within a specific
 * step_group and job_type. Used inside the workflow canvas side panel.
 * Supports add, rename, reorder, toggle required, and delete.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical, Star, Type, Image, ToggleLeft, List, Hash, FileText, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FormField {
  id: string;
  job_type: string;
  field_name: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
  options: string[] | null;
  step_group: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="h-3 w-3" />,
  textarea: <FileText className="h-3 w-3" />,
  photo: <Image className="h-3 w-3" />,
  boolean: <ToggleLeft className="h-3 w-3" />,
  select: <List className="h-3 w-3" />,
  number: <Hash className="h-3 w-3" />,
  button_group: <List className="h-3 w-3" />,
  multi_button_group: <List className="h-3 w-3" />,
  signature: <FileText className="h-3 w-3" />,
  photo_gauge: <Image className="h-3 w-3" />,
  photo_capacitor: <Image className="h-3 w-3" />,
  photo_multimeter: <Image className="h-3 w-3" />,
  photo_filter: <Image className="h-3 w-3" />,
  photo_before_after: <Image className="h-3 w-3" />,
};

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "photo", label: "Photo" },
  { value: "boolean", label: "Yes/No" },
  { value: "select", label: "Dropdown" },
  { value: "number", label: "Number" },
  { value: "button_group", label: "Button Group" },
  { value: "multi_button_group", label: "Multi Select" },
  { value: "signature", label: "Signature" },
  { value: "photo_gauge", label: "📷 Gauge (AI)" },
  { value: "photo_capacitor", label: "📷 Capacitor (AI)" },
  { value: "photo_multimeter", label: "📷 Multimeter (AI)" },
  { value: "photo_filter", label: "📷 Filter (AI)" },
  { value: "photo_before_after", label: "📷 Before/After" },
];

interface Props {
  jobType: string;
  stepGroup: string;
}

export function SectionFieldEditor({ jobType, stepGroup }: Props) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tech_form_fields" as any)
      .select("*")
      .eq("job_type", jobType)
      .eq("step_group", stepGroup)
      .order("sort_order");
    if (!error && data) {
      setFields(data as unknown as FormField[]);
    }
    setLoading(false);
  }, [jobType, stepGroup]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const addField = async () => {
    setSaving(true);
    const newField = {
      job_type: jobType,
      field_name: `field_${Date.now()}`,
      field_label: "New Field",
      field_type: "text",
      is_required: false,
      sort_order: fields.length,
      step_group: stepGroup,
    };
    const { error } = await supabase.from("tech_form_fields" as any).insert(newField as any);
    if (error) {
      toast({ title: "Error adding field", variant: "destructive" });
    } else {
      await fetchFields();
    }
    setSaving(false);
  };

  const updateField = async (id: string, updates: Partial<FormField>) => {
    const { error } = await supabase
      .from("tech_form_fields" as any)
      .update(updates as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error updating field", variant: "destructive" });
    } else {
      setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    }
  };

  const deleteField = async (id: string) => {
    const { error } = await supabase.from("tech_form_fields" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting field", variant: "destructive" });
    } else {
      setFields(prev => prev.filter(f => f.id !== id));
    }
  };

  const moveField = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    updated.forEach((f, i) => { f.sort_order = i; });
    setFields(updated);

    // Persist both sort orders
    await Promise.all([
      supabase.from("tech_form_fields" as any).update({ sort_order: updated[index].sort_order } as any).eq("id", updated[index].id),
      supabase.from("tech_form_fields" as any).update({ sort_order: updated[newIndex].sort_order } as any).eq("id", updated[newIndex].id),
    ]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading fields…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No fields yet. Add one to get started.
        </p>
      )}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className="flex items-center gap-1.5 rounded-md border bg-card p-2 group"
        >
          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              onClick={() => moveField(index, "up")}
              disabled={index === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              onClick={() => moveField(index, "down")}
              disabled={index === fields.length - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>

          {/* Type icon */}
          <div className="shrink-0 text-muted-foreground">
            {TYPE_ICONS[field.field_type] || <Type className="h-3 w-3" />}
          </div>

          {/* Label (editable) */}
          <Input
            value={field.field_label}
            onChange={e => setFields(prev => prev.map(f => f.id === field.id ? { ...f, field_label: e.target.value } : f))}
            onBlur={e => updateField(field.id, { field_label: e.target.value })}
            className="h-7 text-xs flex-1 min-w-0"
          />

          {/* Type selector */}
          <Select
            value={field.field_type}
            onValueChange={val => updateField(field.id, { field_type: val })}
          >
            <SelectTrigger className="h-7 w-20 text-[10px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Required toggle */}
          <button
            onClick={() => updateField(field.id, { is_required: !field.is_required })}
            className={`shrink-0 transition-colors ${field.is_required ? "text-amber-500" : "text-muted-foreground/30 hover:text-muted-foreground"}`}
            title={field.is_required ? "Required" : "Optional"}
          >
            <Star className="h-3 w-3" fill={field.is_required ? "currentColor" : "none"} />
          </button>

          {/* Delete */}
          <button
            onClick={() => deleteField(field.id)}
            className="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs h-8 mt-2"
        onClick={addField}
        disabled={saving}
      >
        <Plus className="h-3 w-3" /> Add Field
      </Button>
    </div>
  );
}
