import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Terminal, Lock, ChevronDown, Pencil, Save, X, Info, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PromptSection = {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  route_scope: string[] | null;
  is_active: boolean;
  is_locked: boolean;
  sort_order: number;
};

const CATEGORY_COLORS: Record<string, string> = {
  identity: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  hard_limits: "bg-red-500/10 text-red-600 border-red-500/30",
  schedule: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  workflow: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  data: "bg-purple-500/10 text-purple-600 border-purple-500/30",
  intake: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  conditional: "bg-slate-500/10 text-slate-500 border-slate-500/30",
};

function tokensOf(s: string) {
  return Math.round((s?.length || 0) / 4);
}

function SectionCard({ section }: { section: PromptSection }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.content);

  const update = useMutation({
    mutationFn: async (patch: Partial<PromptSection>) => {
      const { error } = await supabase
        .from("prompt_sections")
        .update(patch as any)
        .eq("id", section.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prompt_sections"] });
    },
  });

  const handleSave = async () => {
    try {
      await update.mutateAsync({ content: draft });
      toast.success(`Saved: ${section.title}`);
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleToggle = async (val: boolean) => {
    if (section.is_locked && !val) {
      toast.error("Locked rule — cannot disable");
      return;
    }
    try {
      await update.mutateAsync({ is_active: val });
      toast.success(val ? "Activated" : "Deactivated");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const tokens = tokensOf(section.content);
  const catColor = CATEGORY_COLORS[section.category] || "bg-muted text-muted-foreground border-border";
  const isConditional = section.route_scope && section.route_scope.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          section.is_active ? "border-border bg-card" : "border-dashed border-border/50 bg-muted/20 opacity-60"
        )}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <CollapsibleTrigger asChild>
            <button className="flex flex-1 items-center gap-2 text-left">
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              <span className="text-sm font-medium truncate">{section.title}</span>
              {section.is_locked && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
              {isConditional && (
                <Badge variant="outline" className="text-[9px] gap-1 h-4 px-1 font-normal">
                  <Globe className="h-2.5 w-2.5" />
                  {section.route_scope!.join(", ")}
                </Badge>
              )}
            </button>
          </CollapsibleTrigger>
          <Badge variant="outline" className={cn("text-[10px] font-normal h-5", catColor)}>
            {section.category}
          </Badge>
          <Badge variant="secondary" className="text-[10px] font-mono h-5">
            ~{tokens}t
          </Badge>
          <Switch
            checked={section.is_active}
            onCheckedChange={handleToggle}
            disabled={section.is_locked}
            className="scale-75"
          />
        </div>
        <CollapsibleContent>
          <div className="border-t px-3 py-2 space-y-2">
            {editing ? (
              <>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-h-[180px] font-mono text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setDraft(section.content); setEditing(false); }}>
                    <X className="h-3 w-3" /> Cancel
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave}>
                    <Save className="h-3 w-3" /> Save
                  </Button>
                </div>
              </>
            ) : (
              <>
                <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/80 max-h-[400px] overflow-auto">
                  {section.content}
                </pre>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] text-muted-foreground font-mono">slug: {section.slug}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { setDraft(section.content); setEditing(true); }}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function SystemPromptViewer() {
  const { data: sections, isLoading } = useQuery({
    queryKey: ["prompt_sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_sections")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data || []) as PromptSection[];
    },
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading rules…</p>;
  }

  const all = sections || [];
  const activeCount = all.filter(s => s.is_active).length;
  const totalTokens = all.filter(s => s.is_active).reduce((sum, s) => sum + tokensOf(s.content), 0);
  const lockedCount = all.filter(s => s.is_locked).length;

  // Group by category for display
  const grouped = all.reduce<Record<string, PromptSection[]>>((acc, s) => {
    (acc[s.category] ||= []).push(s);
    return acc;
  }, {});

  const categoryOrder = ["hard_limits", "identity", "schedule", "workflow", "intake", "data", "conditional"];
  const orderedCats = [
    ...categoryOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)),
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <Info className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed font-medium">
          Internal Only — JARVIS helps dispatch and techs but never communicates directly with customers.
        </p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          System Prompt — Rules
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-xs">{activeCount} / {all.length} active</Badge>
          <Badge variant="outline" className="text-xs font-mono">~{totalTokens.toLocaleString()} tokens</Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Lock className="h-3 w-3" /> {lockedCount} locked
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Each rule is loaded from the database on every JARVIS request. Toggle, edit, or expand any section. Locked rules are non-negotiable. Sections with a route scope only load on matching pages.
      </p>

      <div className="space-y-4">
        {orderedCats.map(cat => (
          <div key={cat} className="space-y-1.5">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-1">
              {cat.replace(/_/g, " ")}
            </h3>
            {grouped[cat].map(s => (
              <SectionCard key={s.id} section={s} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
