/**
 * SectionReorderToolbar — Reusable Edit/Save/Reset/Cancel bar for any page
 * using `useSectionOrder`. Sticks to the top, only renders for staff.
 */
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Save, RotateCcw, X } from "lucide-react";

interface Props {
  editing: boolean;
  dirty: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onReset: () => void;
  onCancel: () => void;
  hint?: string;
  className?: string;
}

export function SectionReorderToolbar({
  editing,
  dirty,
  isSaving,
  onEdit,
  onSave,
  onReset,
  onCancel,
  hint = "Staff preview",
  className = "",
}: Props) {
  return (
    <div className={`sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur ${className}`}>
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {editing ? "Drag sections to reorder. Order applies for everyone." : hint}
        </p>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Layout
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || isSaving}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Layout
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
