import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Wrench, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAgentTools, useToggleAgentTool, useAddAgentTool, useUpdateAgentTool, useDeleteAgentTool } from "@/hooks/useAgentTools";

/** Functional categories — replaces old agent-based grouping */
const CATEGORY_MAP: Record<string, { label: string; emoji: string; order: number }> = {
  communications: { label: "Communications", emoji: "💬", order: 1 },
  sales: { label: "Sales & Documents", emoji: "📄", order: 3 },
  scheduling: { label: "Scheduling", emoji: "📅", order: 4 },
  customer: { label: "Customer & Jobs", emoji: "👤", order: 5 },
  procurement: { label: "Procurement", emoji: "📦", order: 6 },
  invoicing: { label: "Invoicing", emoji: "💰", order: 7 },
  repair: { label: "Repair Quoting", emoji: "🔧", order: 8 },
  intelligence: { label: "Intelligence & Learning", emoji: "🧠", order: 9 },
  other: { label: "Other", emoji: "⚙️", order: 99 },
};

/** Map function_name → category */
function getCategoryKey(fn: string): string {
  if (["send_sms_to_customer", "send_sms_to_employee", "send_tech_form_link", "search_sms_history", "search_call_history", "read_team_messages", "send_team_message", "read_chat_messages", "send_chat_message"].includes(fn)) return "communications";
  if (["create_quote", "convert_estimate_to_job", "generate_letterhead_document"].includes(fn)) return "sales";
  if (["get_travel_times", "check_scheduling_fit", "suggest_schedule_optimization"].includes(fn)) return "scheduling";
  if (["create_customer", "create_job", "update_job_field", "verify_address", "suggest_actions"].includes(fn)) return "customer";
  if (["lookup_equipment", "order_from_carrier_enterprise", "order_from_supplyhouse", "invoke_carrier_enterprise", "ahri_lookup_carrier_enterprise", "create_parts_order"].includes(fn)) return "procurement";
  if (["invoke_invoicing", "create_invoice", "generate_payment_link"].includes(fn)) return "invoicing";
  if (["invoke_repair_quote"].includes(fn)) return "repair";
  if (["scrape_url", "web_search", "log_learning", "update_instruction", "update_warranty_status"].includes(fn)) return "intelligence";
  return "other";
}

/** Which tools call external edge functions (not direct) */
const EXTERNAL_TOOLS = new Set(["invoke_invoicing", "invoke_repair_quote", "invoke_carrier_enterprise"]);

/** Customer-facing tools — disabled by default, shown with amber warning */
const CUSTOMER_FACING_TOOLS = new Set(["send_sms_to_customer"]);

/* Plain-English descriptions keyed by function_name */
const FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  get_travel_times: "Calculates drive times between jobs on a tech's schedule for a given day.",
  check_scheduling_fit: "Checks if a new job fits into a tech's existing schedule without excessive driving.",
  suggest_schedule_optimization: "Suggests a better job order to reduce total driving time.",
  send_sms_to_customer: "Sends a text message to a customer. Currently disabled — all customer SMS goes through the dispatcher.",
  send_sms_to_employee: "Sends a text message to an employee through Twilio.",
  send_team_message: "Prepares a Team Headquarters message for dispatcher approval, then posts it to the selected room.",
  read_team_messages: "Reads recent messages from Team Headquarters rooms and direct conversations.",
  send_chat_message: "Retired legacy chat tool. Use send_team_message instead.",
  read_chat_messages: "Retired legacy chat tool. Use read_team_messages instead.",
  search_call_history: "Searches past phone calls by number, name, or status.",
  search_sms_history: "Searches past text messages by number, name, or keywords.",
  send_tech_form_link: "Texts the tech a link to their pre-install checklist or completion form.",
  create_quote: "Builds a Good/Better/Best equipment quote based on home requirements.",
  create_invoice: "Creates a customer invoice with line items and tax.",
  generate_payment_link: "Creates a Stripe payment link for online payment.",
  lookup_equipment: "Searches equipment database by brand, tonnage, SEER2 rating, etc.",
  convert_estimate_to_job: "Converts an approved estimate into an active job.",
  verify_address: "Validates a street address using Google geocoding before saving.",
  generate_letterhead_document: "Creates a professional letterhead PDF document.",
  scrape_url: "Visits a web page and extracts its content.",
  log_learning: "Saves a correction so JARVIS remembers it next time.",
  update_instruction: "Adds new rules to JARVIS's instruction sets.",
  invoke_invoicing: "Delegates to invoicing edge function (Stripe integration).",
  invoke_repair_quote: "Delegates to repair quote edge function (pricing engine).",
  invoke_carrier_enterprise: "Delegates to CE portal edge function (procurement).",
  create_customer: "Creates a new customer record in the CRM.",
  create_job: "Books a new job on the dispatch board.",
  update_job_field: "Stamps a timestamp or status field on a job record.",
  create_parts_order: "Creates a parts/equipment order for a job.",
  update_warranty_status: "Updates warranty registration status for a job.",
  order_from_carrier_enterprise: "Places an order through the Carrier Enterprise portal.",
  order_from_supplyhouse: "Places an order through SupplyHouse.com.",
  ahri_lookup_carrier_enterprise: "Looks up AHRI certification data on the CE portal.",
  web_search: "Searches the internet for current information.",
  suggest_actions: "Surfaces smart action buttons (Book Job, Book Estimate, Create Customer) to the dispatcher based on conversation context.",
};

export function ToolsRegistry() {
  const { data: tools, isLoading } = useAgentTools();
  const toggleTool = useToggleAgentTool();
  const addTool = useAddAgentTool();
  const updateTool = useUpdateAgentTool();
  const deleteTool = useDeleteAgentTool();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", function_name: "" });
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", description: "", function_name: "" });
    setDialogOpen(true);
  };

  const openEdit = (tool: any) => {
    setEditId(tool.id);
    setForm({ name: tool.name, description: tool.description, function_name: tool.function_name });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.function_name.trim()) return;
    if (editId) {
      updateTool.mutate({ id: editId, ...form }, { onSuccess: () => setDialogOpen(false) });
    } else {
      addTool.mutate(form, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const toggleCategory = (key: string) => {
    setCollapsedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;

  const allTools = tools || [];
  const enabledCount = allTools.filter(t => t.is_enabled).length;

  // Deduplicate: prefer tools without agent_id (direct JARVIS tools)
  const seen = new Map<string, typeof allTools[0]>();
  for (const tool of allTools) {
    const existing = seen.get(tool.function_name);
    if (!existing || (!tool.agent_id && existing.agent_id)) {
      seen.set(tool.function_name, tool);
    }
  }
  const deduped = Array.from(seen.values());

  // Group by functional category
  const categoryGroups: Record<string, typeof deduped> = {};
  for (const tool of deduped) {
    const cat = getCategoryKey(tool.function_name);
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(tool);
  }

  const sortedKeys = Object.keys(categoryGroups).sort((a, b) => {
    return (CATEGORY_MAP[a]?.order ?? 99) - (CATEGORY_MAP[b]?.order ?? 99);
  });

  return (
    <div className="space-y-4">
      {/* Internal-only notice */}
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <Wrench className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
          <strong>Internal only</strong> — Customer-facing tools are disabled. JARVIS only sends messages to staff. Tools marked <span className="text-amber-600 font-semibold">Customer-Facing</span> require manual dispatcher action.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">JARVIS Tools</h2>
          <p className="text-xs text-muted-foreground">
            Internal tools grouped by function. Direct calls unless marked as external edge function.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{enabledCount}/{allTools.length} enabled</Badge>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Tool
          </Button>
        </div>
      </div>

      {sortedKeys.map(catKey => {
        const groupTools = categoryGroups[catKey];
        const isOpen = !collapsedCategories[catKey];
        const catEnabled = groupTools.filter(t => t.is_enabled).length;
        const meta = CATEGORY_MAP[catKey] || CATEGORY_MAP.other;
        const hasExternal = groupTools.some(t => EXTERNAL_TOOLS.has(t.function_name));

        return (
          <Collapsible key={catKey} open={isOpen} onOpenChange={() => toggleCategory(catKey)}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left group">
                <span className="text-lg">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{catEnabled}/{groupTools.length} on</span>
                  {hasExternal && (
                    <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1.5 text-amber-600 border-amber-500/30">
                      <ExternalLink className="h-2.5 w-2.5 mr-0.5" /> Edge Fn
                    </Badge>
                  )}
                </div>
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 pl-2 mt-1">
                {groupTools.map(tool => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    friendlyDesc={FRIENDLY_DESCRIPTIONS[tool.function_name]}
                    isExternal={EXTERNAL_TOOLS.has(tool.function_name)}
                    isCustomerFacing={CUSTOMER_FACING_TOOLS.has(tool.function_name)}
                    onToggle={(checked) => toggleTool.mutate({ id: tool.id, is_enabled: checked })}
                    onEdit={() => openEdit(tool)}
                    onDelete={() => deleteTool.mutate(tool.id)}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Tool" : "Add Tool"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Tool name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Function name (e.g. send_sms)" value={form.function_name} onChange={e => setForm(p => ({ ...p, function_name: e.target.value }))} className="font-mono text-sm" />
            <Textarea placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="text-sm min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editId ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Individual tool card ── */
function ToolCard({ tool, friendlyDesc, isExternal, isCustomerFacing, onToggle, onEdit, onDelete }: {
  tool: any;
  friendlyDesc?: string;
  isExternal?: boolean;
  isCustomerFacing?: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn(!tool.is_enabled ? "opacity-50" : "", isCustomerFacing && "border-amber-500/30")}>
      <CardHeader className="pb-1 flex flex-row items-start justify-between space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            {tool.name}
            {isExternal && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 border-amber-500/30">
                external
              </Badge>
            )}
            {isCustomerFacing && (
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 border-amber-500/40 bg-amber-500/10">
                Customer-Facing
              </Badge>
            )}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={tool.is_enabled}
            onCheckedChange={onToggle}
            className="scale-75"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        <p className="text-xs text-foreground/80">{friendlyDesc || tool.description}</p>
        <code className="text-[10px] text-muted-foreground/60 font-mono block">{tool.function_name}</code>
      </CardContent>
    </Card>
  );
}
