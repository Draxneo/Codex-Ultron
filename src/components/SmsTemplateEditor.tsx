import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, MessageSquare, Eye, Search, ChevronDown, Zap } from "lucide-react";
import { useSmsTemplates, useAddSmsTemplate, useUpdateSmsTemplate, useDeleteSmsTemplate } from "@/hooks/useSmsTemplates";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = [
  { value: "install", label: "Install" },
  { value: "service", label: "Service" },
  { value: "maintenance", label: "Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "phone_call", label: "Phone Call" },
  { value: "estimates", label: "Estimates" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "overdue_reminder", label: "Overdue Reminder" },
  { value: "general", label: "General" },
];

const EMOJI_BAR = ["📋", "➡️", "🔧", "⚡", "✅", "❌", "🏠", "📞", "📅", "⚠️", "📍", "📝", "🔥", "❄️", "💨", "🛠️"];

const VARIABLES = [
  "{{customer_name}}", "{{job_number}}", "{{address}}", "{{scheduled_date}}",
  "{{job_type}}", "{{description}}", "{{customer_phone}}", "{{tech_name}}",
  "{{task_title}}", "{{due_date}}", "{{date}}",
];

const categoryColor = (cat: string) => {
  const map: Record<string, string> = {
    install: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    service: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    maintenance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    repair: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    overdue_reminder: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    follow_up: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    estimates: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    phone_call: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    general: "bg-muted text-muted-foreground",
  };
  return map[cat] || map.general;
};

const smsSegments = (text: string) => Math.max(1, Math.ceil(text.length / 160));

function useSequenceUsage() {
  return useQuery({
    queryKey: ["message-sequences-usage"],
    queryFn: async () => {
      const { data } = await supabase.from("message_sequences").select("name, steps");
      if (!data) return {};
      const usage: Record<string, string[]> = {};
      data.forEach((seq: any) => {
        const steps = Array.isArray(seq.steps) ? seq.steps : [];
        steps.forEach((step: any) => {
          const tpl = step?.templateName || step?.template_name;
          if (tpl) {
            if (!usage[tpl]) usage[tpl] = [];
            if (!usage[tpl].includes(seq.name)) usage[tpl].push(seq.name);
          }
        });
      });
      return usage;
    },
  });
}

const SmsTemplateEditor = () => {
  const { data: templates } = useSmsTemplates();
  const { data: sequenceUsage } = useSequenceUsage();
  const addTemplate = useAddSmsTemplate();
  const updateTemplate = useUpdateSmsTemplate();
  const deleteTemplate = useDeleteSmsTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("general");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = (templates || []).filter(
      (t: any) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.template_body.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    );
    const groups: Record<string, any[]> = {};
    CATEGORIES.forEach((c) => (groups[c.value] = []));
    filtered.forEach((t: any) => {
      const cat = groups[t.category] ? t.category : "general";
      groups[cat].push(t);
    });
    return groups;
  }, [templates, search]);

  const toggleCategory = (cat: string) =>
    setOpenCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const openNew = () => {
    setEditingId(null);
    setName("");
    setCategory("general");
    setBody("");
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setName(t.name);
    setCategory(t.category);
    setBody(t.template_body);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !body.trim()) return;
    if (editingId) {
      updateTemplate.mutate({ id: editingId, name, category, template_body: body });
    } else {
      addTemplate.mutate({ name, category, template_body: body });
    }
    setDialogOpen(false);
  };

  const insertAtCursor = (text: string) => {
    const textarea = document.getElementById("template-body-input") as HTMLTextAreaElement;
    if (!textarea) {
      setBody((prev) => prev + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = body.slice(0, start) + text + body.slice(end);
    setBody(newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const previewBody = body
    .replace(/\{\{customer_name\}\}/g, "John Smith")
    .replace(/\{\{job_number\}\}/g, "4521")
    .replace(/\{\{address\}\}/g, "123 Main St, Phoenix AZ")
    .replace(/\{\{scheduled_date\}\}/g, "Mar 5, 2026")
    .replace(/\{\{job_type\}\}/g, "Install")
    .replace(/\{\{description\}\}/g, "AC replacement")
    .replace(/\{\{customer_phone\}\}/g, "(555) 123-4567")
    .replace(/\{\{tech_name\}\}/g, "Mike")
    .replace(/\{\{task_title\}\}/g, "Schedule inspection")
    .replace(/\{\{due_date\}\}/g, "Mar 7, 2026")
    .replace(/\{\{date\}\}/g, "Mar 4, 2026")
    .replace(/\{\{[^}]+\}\}/g, "[…]");

  const nonEmptyCategories = CATEGORIES.filter((c) => grouped[c.value]?.length > 0);

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS Templates
            </CardTitle>
            <CardDescription className="text-xs">
              Define message formats the AI uses when texting your team. Emojis and {"{{variables}}"} supported.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={openNew}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* Grouped by category */}
          {nonEmptyCategories.map((cat) => {
            const items = grouped[cat.value];
            const isOpen = openCategories[cat.value] !== false; // default open

            return (
              <Collapsible key={cat.value} open={isOpen} onOpenChange={() => toggleCategory(cat.value)}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-sm font-medium hover:text-foreground/80 transition-colors">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${categoryColor(cat.value)}`}>
                    {cat.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pl-5 pt-1">
                  {items.map((t: any) => {
                    const segs = smsSegments(t.template_body);
                    const usedBy = sequenceUsage?.[t.name] || [];

                    return (
                      <div key={t.id} className="flex items-start justify-between gap-2 py-2 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{t.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {t.template_body.length} chars · {segs} seg{segs > 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                            {t.template_body}
                          </p>
                          {usedBy.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Zap className="h-3 w-3 text-amber-500" />
                              {usedBy.map((seq) => (
                                <Badge key={seq} variant="outline" className="text-[9px] px-1 py-0">
                                  {seq}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Switch
                            checked={t.is_active ?? true}
                            onCheckedChange={(checked) => updateTemplate.mutate({ id: t.id, is_active: checked })}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate.mutate(t.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}

          {nonEmptyCategories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? "No templates match your search" : "No templates yet"}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New SMS Template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Emoji bar */}
            <div className="flex flex-wrap gap-1">
              {EMOJI_BAR.map((emoji) => (
                <Button key={emoji} variant="outline" size="sm" className="h-8 w-8 p-0 text-base" onClick={() => insertAtCursor(emoji)}>
                  {emoji}
                </Button>
              ))}
            </div>

            <div>
              <Textarea
                id="template-body-input"
                placeholder={"📋 Job Assignment\n➡️ Customer: {{customer_name}}\n📍 {{address}}"}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[160px] font-mono text-sm"
              />
              {body && (
                <p className="text-[10px] text-muted-foreground mt-1 text-right">
                  {body.length} characters · {smsSegments(body)} SMS segment{smsSegments(body) > 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Variable chips */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Insert variable:</p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <Button key={v} variant="secondary" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => insertAtCursor(v)}>
                    {v}
                  </Button>
                ))}
              </div>
            </div>

            {/* Preview toggle */}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-3 w-3" /> {showPreview ? "Hide Preview" : "Show Preview"}
            </Button>

            {showPreview && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap border">
                {previewBody || "Enter a template above to see preview…"}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || !body.trim()}>
              {editingId ? "Save" : "Add Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SmsTemplateEditor;
