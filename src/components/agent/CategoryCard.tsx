import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Save, Trash2, Check, Loader2, Lightbulb } from "lucide-react";
import { type LucideIcon } from "lucide-react";

export type CategoryDef = {
  value: string;
  label: string;
  icon: LucideIcon;
  description: string;
  placeholder: string;
};

export type TrainingEntry = {
  id: string;
  category: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

interface CategoryCardProps {
  cat: CategoryDef;
  entry: TrainingEntry | undefined;
  onSave: (category: string, content: string, existingId?: string) => Promise<void>;
  onToggle: (id: string, is_active: boolean) => void;
  onDelete: (id: string) => void;
  onUseTemplate?: (category: string) => void;
  hasTemplate?: boolean;
}

export function CategoryCard({ cat, entry, onSave, onToggle, onDelete, onUseTemplate, hasTemplate }: CategoryCardProps) {
  const Icon = cat.icon;
  const [localContent, setLocalContent] = useState(entry?.content || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = localContent !== (entry?.content || "");

  useEffect(() => {
    setLocalContent(entry?.content || "");
  }, [entry?.content]);

  const handleSave = useCallback(async () => {
    const trimmed = localContent.trim();
    if (!trimmed && !entry) return;
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(cat.value, trimmed, entry?.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [localContent, entry, dirty, cat.value, onSave]);

  const handleBlur = () => {
    if (dirty) handleSave();
  };

  return (
    <Card className={entry && !entry.is_active ? "opacity-50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {cat.label}
          </CardTitle>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {saved && <span className="text-xs text-green-600 flex items-center gap-0.5"><Check className="h-3 w-3" /> Saved</span>}
            {entry && (
              <>
                <Switch
                  checked={entry.is_active}
                  onCheckedChange={(checked) => onToggle(entry.id, checked)}
                  className="scale-75"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(entry.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
        <CardDescription className="text-xs">{cat.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleBlur}
          placeholder={cat.placeholder}
          className="text-xs min-h-[280px] font-mono leading-relaxed resize-y"
        />
        <div className="flex items-center justify-between mt-2">
          <div>
            {!entry && hasTemplate && onUseTemplate && (
              <Button
                variant="link"
                size="sm"
                className="text-xs h-auto p-0 text-muted-foreground"
                onClick={() => onUseTemplate(cat.value)}
              >
                <Lightbulb className="h-3 w-3 mr-1" /> Use template
              </Button>
            )}
          </div>
          {dirty && (
            <Button size="sm" className="text-xs h-7" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
