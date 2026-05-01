import { useModelConfig } from "@/hooks/useModelConfig";
import { MODEL_OPTIONS } from "@/components/CopilotModelSelector";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  MessageSquare, Sun, Eye, MessageCircle, Users, Wrench, Globe, Clock, Timer, AlertTriangle,
  Send, FileText, DollarSign, CalendarClock, PenTool,
} from "lucide-react";
import { useState, useEffect } from "react";

const TASK_META: Record<string, { icon: typeof MessageSquare; group: "conversational" | "processing"; description: string }> = {
  copilot_chat: { icon: MessageSquare, group: "conversational", description: "Main office Jarvis chat - handles scheduling, lookups, drafts, and reasoning." },
  daily_briefing: { icon: Sun, group: "conversational", description: "Morning briefing summary and attention cards." },
  portal_chat: { icon: Globe, group: "conversational", description: "Customer portal Jarvis chat - answers customer questions about their jobs and agreements." },
  tech_form: { icon: Wrench, group: "conversational", description: "Field Jarvis chat embedded in tech forms - helps techs with diagnostics and notes." },
  communications: { icon: Send, group: "processing", description: "Drafts and sends outbound SMS sequences and notifications." },
  vision_extraction: { icon: Eye, group: "processing", description: "Reads data plates, supply tickets, invoices, and documents from photos using vision/OCR." },
  sms_auto_reply: { icon: MessageCircle, group: "processing", description: "Generates auto-reply SMS to customer texts using job context." },
  customer_parsing: { icon: Users, group: "processing", description: "Parses raw SMS text into structured customer data (name, address, phone)." },
  follow_up: { icon: Clock, group: "processing", description: "Generates follow-up check-in texts and calculates next check-in dates." },
  invoicing: { icon: DollarSign, group: "processing", description: "Generates invoice line items and calculates totals from job data." },
  scheduling: { icon: CalendarClock, group: "processing", description: "Smart scheduling - slot finding, conflict detection, and route optimization." },
  sales_docs: { icon: FileText, group: "conversational", description: "Sales presentations, quotes, and document generation." },
  repair_quote: { icon: PenTool, group: "processing", description: "Generates repair quotes with parts lookup and pricing." },
};

export function ModelConfigPanel() {
  const { configs, isLoading, updateModel } = useModelConfig();
  const { settings, updateSettings } = useCompanySettings();

  const [responseDelay, setResponseDelay] = useState(8);
  const [techThreshold, setTechThreshold] = useState(3);
  const [officeThreshold, setOfficeThreshold] = useState(24);
  const [customerThreshold, setCustomerThreshold] = useState(48);

  useEffect(() => {
    if (settings) {
      setResponseDelay(parseInt((settings as any).sms_response_delay_seconds || "8") || 8);
      setTechThreshold(parseInt((settings as any).stall_threshold_tech_hours || "3") || 3);
      setOfficeThreshold(parseInt((settings as any).stall_threshold_office_hours || "24") || 24);
      setCustomerThreshold(parseInt((settings as any).stall_threshold_customer_hours || "48") || 48);
    }
  }, [settings]);

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Loading model config...</p>;
  if (!configs?.length) return <p className="text-sm text-muted-foreground text-center py-8">No task configs found.</p>;

  const conversational = configs.filter(c => TASK_META[c.task_key]?.group === "conversational");
  const processing = configs.filter(c => TASK_META[c.task_key]?.group === "processing");

  const handleChange = (id: string, taskKey: string, model: string) => {
    updateModel.mutate({ id, model });
    const opt = MODEL_OPTIONS.find(m => m.id === model);
    toast({ title: "Model updated", description: `${TASK_META[taskKey]?.description?.split(" - ")[0] || taskKey} -> ${opt?.label || model}` });

    if (taskKey === "copilot_chat") {
      try { localStorage.setItem("copilot_model_cache", model); } catch {}
    }
  };

  const saveResponseDelay = (val: number) => {
    setResponseDelay(val);
    updateSettings.mutate({ sms_response_delay_seconds: String(val) } as any);
  };

  const saveStallThreshold = (key: string, val: number) => {
    updateSettings.mutate({ [key]: String(val) } as any);
  };

  const renderGroup = (label: string, items: typeof configs) => (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</h3>
      {items.map(cfg => {
        const meta = TASK_META[cfg.task_key];
        if (!meta) return null;
        const Icon = meta.icon;
        const selected = MODEL_OPTIONS.find(m => m.id === cfg.model);
        

        return (
          <Card key={cfg.id} className="border-border/60">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2 font-medium">
                  <Icon className="h-4 w-4 text-primary shrink-0" />
                  {cfg.label}
                </CardTitle>
                {selected && <Badge variant="outline" className="text-[10px]">{selected.label}</Badge>}
              </div>
              <CardDescription className="text-xs mt-0.5">{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <Select value={cfg.model} onValueChange={(v) => handleChange(cfg.id, cfg.task_key, v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <span>{m.label}</span>
                      <span className="text-muted-foreground ml-1.5">- {m.description}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader className="pb-3 pt-3 px-4">
          <CardTitle className="text-sm font-medium">JARVIS Model Router</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Saved OpenAI model IDs are used by the backend runtime. Stale Gemini, Anthropic, and GPT-4o values are normalized to GPT-5 Mini.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Response Gate */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 font-medium">
            <Timer className="h-4 w-4 text-primary shrink-0" />
            SMS Response Gate
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Seconds to wait before sending auto-replies — simulates human typing speed so customers don't know it's AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex items-center gap-4">
            <Slider
              value={[responseDelay]}
              onValueChange={(v) => setResponseDelay(v[0])}
              onValueCommit={(v) => saveResponseDelay(v[0])}
              min={2}
              max={30}
              step={1}
              className="flex-1"
            />
            <span className="text-sm font-mono w-10 text-right">{responseDelay}s</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Average human texts ~40 WPM on mobile. 8s feels natural for a short reply. Max 30s.
          </p>
        </CardContent>
      </Card>

      {/* Stall Detection Thresholds */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            Attention Stall Detection
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            JARVIS texts the responsible party when a job has gone quiet longer than these thresholds. If no response, escalates to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tech Steps</label>
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  type="number"
                  value={techThreshold}
                  onChange={(e) => setTechThreshold(parseInt(e.target.value) || 3)}
                  onBlur={() => saveStallThreshold("stall_threshold_tech_hours", techThreshold)}
                  className="h-8 text-xs w-16"
                  min={1}
                  max={48}
                />
                <span className="text-xs text-muted-foreground">hrs</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Office Steps</label>
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  type="number"
                  value={officeThreshold}
                  onChange={(e) => setOfficeThreshold(parseInt(e.target.value) || 24)}
                  onBlur={() => saveStallThreshold("stall_threshold_office_hours", officeThreshold)}
                  className="h-8 text-xs w-16"
                  min={1}
                  max={168}
                />
                <span className="text-xs text-muted-foreground">hrs</span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Customer Steps</label>
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  type="number"
                  value={customerThreshold}
                  onChange={(e) => setCustomerThreshold(parseInt(e.target.value) || 48)}
                  onBlur={() => saveStallThreshold("stall_threshold_customer_hours", customerThreshold)}
                  className="h-8 text-xs w-16"
                  min={1}
                  max={336}
                />
                <span className="text-xs text-muted-foreground">hrs</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Example: Tech threshold of 3h means if a tech hasn't sent an ETA within 3 hours of dispatch, JARVIS texts them to check in.
          </p>
        </CardContent>
      </Card>

      {renderGroup("Conversational", conversational)}
      {renderGroup("Processing", processing)}
    </div>
  );
}
