import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Bot, Building2, ClipboardList, FileText, BookOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CategoryCard, type TrainingEntry, type CategoryDef } from "@/components/agent/CategoryCard";

const CATEGORIES: CategoryDef[] = [
  { value: "email_classification", label: "Email Classification", icon: ClipboardList, description: "Rules for how inbound emails are categorized (supply_house, customer, vendor, etc.)", placeholder: "e.g. Emails from @carrierenterprise.com are always supply_house\nEmails with 'warranty claim' in subject are customer" },
  { value: "email_routing", label: "Email Routing", icon: Building2, description: "Rules for routing emails to personal vs shared inbox", placeholder: "e.g. All financing emails go to Tyler's personal inbox\nSolicitor emails always go to shared inbox" },
];

const STARTER_TEMPLATES: Record<string, string> = {
  email_classification: "Categories for classifying inbound email:\n- supply_house: From equipment distributors (Carrier Enterprise, Robert Madden, Goodman, Ferguson, Johnstone, WinSupply, Baker, Gemaire, Century AC)\n- customer: From homeowners/customers about their HVAC service/install\n- approved_estimate: Notifications that a customer approved an estimate\n- financing: From financing companies (Synchrony, GreenSky, Wells Fargo, Service Finance, Hearth, GoodLeap)\n- tech_form: Form submissions, tech completion forms, install checklists\n- vendor: From business tools/platforms (Housecall Pro, QuickBooks, Google, Microsoft)\n- solicitor: Marketing, spam, newsletters, demo requests\n\nCustom rules:\n(Add your own rules here)",
  email_routing: "Routing rules for personal vs shared inbox:\n- Emails to service@ → shared inbox\n- Emails to a personal alias → that person's personal inbox\n- All solicitor emails → shared inbox\n\nCustom routing overrides:\n(Add rules like 'All financing emails go to Tyler's inbox')",
};

export function CopilotTraining() {
  const qc = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["copilot_training"],
    queryFn: async () => {
      const { data, error } = await supabase.from("copilot_training").select("*").order("category");
      if (error) throw error;
      return data as TrainingEntry[];
    },
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase.from("copilot_training").update({ content, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot_training"] }),
  });

  const toggleEntry = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("copilot_training").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot_training"] }),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("copilot_training").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["copilot_training"] });
      toast({ title: "Deleted" });
    },
  });

  const addEntry = useMutation({
    mutationFn: async ({ category, content }: { category: string; content: string }) => {
      const { error } = await supabase.from("copilot_training").insert({ category, content });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["copilot_training"] }),
  });

  const handleSave = useCallback(async (category: string, content: string, existingId?: string) => {
    if (existingId) {
      if (!content) {
        await deleteEntry.mutateAsync(existingId);
      } else {
        await updateEntry.mutateAsync({ id: existingId, content });
      }
    } else if (content) {
      await addEntry.mutateAsync({ category, content });
    }
  }, [updateEntry, addEntry, deleteEntry]);

  const handleUseTemplate = useCallback((category: string) => {
    const template = STARTER_TEMPLATES[category];
    if (!template) return;
    const existing = entries?.find(e => e.category === category);
    if (existing) {
      updateEntry.mutate({ id: existing.id, content: template });
    } else {
      addEntry.mutate({ category, content: template });
    }
    toast({ title: "Template applied", description: `Starter content added to ${CATEGORIES.find(c => c.value === category)?.label || category}` });
  }, [entries, updateEntry, addEntry]);

  const entryMap = (entries || []).reduce<Record<string, TrainingEntry>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = e;
    return acc;
  }, {});

  const knownCategoryValues = new Set(CATEGORIES.map(c => c.value));
  const dynamicCategories: CategoryDef[] = Object.keys(entryMap)
    .filter(cat => !knownCategoryValues.has(cat))
    .map(cat => ({
      value: cat,
      label: cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      icon: BookOpen,
      description: "Auto-discovered knowledge category",
      placeholder: "Add content for this category...",
    }));
  const allCategories = [...CATEGORIES, ...dynamicCategories];

  const activeCount = (entries || []).filter(e => e.is_active).length;
  const totalCount = (entries || []).length;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Knowledge Base
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Scroll through each category and type directly. Changes auto-save when you click away.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {activeCount}/{totalCount} active
        </Badge>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
        <strong className="text-foreground">Note:</strong> Company name, phone, hours, and service area are managed in{" "}
        <span className="font-medium text-foreground">Admin → Company Settings</span> and automatically injected into every AI request. Job statuses are defined by{" "}
        <span className="font-medium text-foreground">Workflow Builder</span> steps. No need to duplicate that info here.
      </div>

      {allCategories.map(cat => (
        <CategoryCard
          key={cat.value}
          cat={cat}
          entry={entryMap[cat.value]}
          onSave={handleSave}
          onToggle={(id, is_active) => toggleEntry.mutate({ id, is_active })}
          onDelete={(id) => deleteEntry.mutate(id)}
          onUseTemplate={handleUseTemplate}
          hasTemplate={!!STARTER_TEMPLATES[cat.value]}
        />
      ))}
    </div>
  );
}
