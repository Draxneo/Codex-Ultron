import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Brain, MessageSquare, Mail, FileText, Calendar, DollarSign,
  Wrench, Search, Package, Shield, Activity, ExternalLink, ArrowRight,
  Zap, CheckCircle2, Bot, Server, Webhook, Clock, Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAgentTools } from "@/hooks/useAgentTools";
import { useAgentNetwork } from "@/hooks/useAgentNetwork";

const TOOL_CATEGORIES = [
  {
    id: "communications",
    label: "Communications",
    icon: MessageSquare,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    description: "SMS, calls, chat — direct tools inside JARVIS",
    status: "collapsed" as const,
    tools: ["send_sms_to_customer", "send_sms_to_employee", "send_tech_form_link", "search_sms_history", "search_call_history", "read_chat_messages"],
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    description: "Search, read threads, extract attachments",
    status: "collapsed" as const,
    tools: ["search_emails", "read_email_thread", "extract_email_attachment"],
  },
  {
    id: "sales_docs",
    label: "Sales & Documents",
    icon: FileText,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    description: "Quotes, estimates, letterheads",
    status: "collapsed" as const,
    tools: ["create_quote", "convert_estimate_to_job", "generate_letterhead_document"],
  },
  {
    id: "scheduling",
    label: "Scheduling",
    icon: Calendar,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    description: "Travel times, schedule optimization, fit checks",
    status: "collapsed" as const,
    tools: ["get_travel_times", "check_scheduling_fit", "suggest_schedule_optimization"],
  },
  {
    id: "customer",
    label: "Customer & Jobs",
    icon: Bot,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    description: "CRM creation, job booking, field updates",
    status: "collapsed" as const,
    tools: ["create_customer", "create_job", "update_job_field"],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: Package,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    description: "Equipment lookup, CE orders, SupplyHouse orders",
    status: "collapsed" as const,
    tools: ["lookup_equipment", "order_from_carrier_enterprise", "order_from_supplyhouse", "invoke_carrier_enterprise", "create_parts_order"],
  },
  {
    id: "invoicing",
    label: "Invoicing",
    icon: DollarSign,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    description: "External edge function — Stripe complexity",
    status: "external" as const,
    tools: ["invoke_invoicing", "create_invoice", "generate_payment_link"],
  },
  {
    id: "repair",
    label: "Repair Quoting",
    icon: Wrench,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    description: "External edge function — repair pricing engine",
    status: "external" as const,
    tools: ["invoke_repair_quote"],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Search,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    description: "Web scraping, AHRI lookups, learning",
    status: "collapsed" as const,
    tools: ["scrape_url", "ahri_lookup_carrier_enterprise", "log_learning", "update_warranty_status"],
  },
];

const TYPE_CONFIG: Record<string, { icon: typeof Server; label: string; color: string; bg: string }> = {
  edge_function: { icon: Server, label: "EDGE FUNCTION", color: "text-amber-600", bg: "bg-amber-500/10" },
  webhook: { icon: Webhook, label: "WEBHOOK", color: "text-blue-600", bg: "bg-blue-500/10" },
  cron: { icon: Clock, label: "CRON JOB", color: "text-violet-600", bg: "bg-violet-500/10" },
  orchestrator: { icon: Brain, label: "ORCHESTRATOR", color: "text-primary", bg: "bg-primary/10" },
  deprecated: { icon: Trash2, label: "DEPRECATED", color: "text-destructive", bg: "bg-destructive/10" },
};

export default function AgentNetwork() {
  const isMobile = useIsMobile();
  const { data: tools, isLoading } = useAgentTools();
  const { agents } = useAgentNetwork();

  const getToolStatus = (functionName: string) => {
    if (!tools) return null;
    const tool = tools.find(t => t.function_name === functionName && !t.agent_id)
      || tools.find(t => t.function_name === functionName);
    return tool;
  };

  const directToolCount = tools?.filter(t => !t.agent_id && t.is_enabled).length ?? 0;

  // Group agents by type
  const grouped = (agents || []).reduce<Record<string, typeof agents>>((acc, agent) => {
    const key = agent.status === "deprecated" ? "deprecated" : (agent.type || "edge_function");
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(agent);
    return acc;
  }, {});

  const groupOrder = ["orchestrator", "edge_function", "webhook", "cron", "deprecated"];

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">JARVIS Architecture</h1>
            <p className="text-xs text-muted-foreground">How JARVIS processes requests — direct tools + external function calls.</p>
          </div>
        </div>

        {/* Central Hub */}
        <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                <Brain className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold">JARVIS</h2>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                    <Activity className="h-2.5 w-2.5 mr-1" /> Active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  Single orchestrator with all tools as direct function calls. No sub-agent handoffs —
                  every tool executes inside <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">ai-task-agent</code>.
                </p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <span><strong className="text-foreground">{directToolCount}</strong> direct tools</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <ExternalLink className="h-3.5 w-3.5 text-amber-500" />
                    <span><strong className="text-foreground">2</strong> external edge functions</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 text-emerald-500" />
                    <span>No double-LLM hops</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Architecture Change Notice */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 mb-6">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-foreground mb-0.5">Architecture Simplified</p>
              <p className="text-muted-foreground">
                Communications, Email, Sales & Docs, and Scheduling were collapsed from separate sub-agents into direct tool calls.
                Only Invoicing and Repair Quoting remain as external edge functions due to their complexity.
              </p>
            </div>
          </div>
        </div>

        {/* Tool Categories Grid */}
        <h3 className="text-sm font-semibold mb-3">JARVIS Direct Tools</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOL_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isExternal = cat.status === "external";

            return (
              <Card key={cat.id} className={`relative overflow-hidden ${isExternal ? 'border-amber-500/20' : ''}`}>
                {isExternal && (
                  <div className="absolute top-0 right-0 bg-amber-500/10 text-amber-600 text-[9px] font-medium px-2 py-0.5 rounded-bl-md">
                    EDGE FUNCTION
                  </div>
                )}
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-8 w-8 rounded-lg ${cat.bg} flex items-center justify-center`}>
                      <Icon className={`h-4 w-4 ${cat.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{cat.label}</CardTitle>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-1">
                    {cat.tools.map((toolFn) => {
                      const tool = getToolStatus(toolFn);
                      const enabled = tool?.is_enabled ?? false;

                      return (
                        <div key={toolFn} className="flex items-center gap-2 py-1 px-2 rounded bg-muted/40">
                          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                          <code className="text-[10px] font-mono flex-1 truncate text-muted-foreground">
                            {toolFn}
                          </code>
                          {isExternal && (
                            <ArrowRight className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Edge Functions Registry */}
        <div className="mt-8 mb-6">
          <h3 className="text-sm font-semibold mb-1">Edge Functions Registry</h3>
          <p className="text-xs text-muted-foreground mb-4">
            All deployed backend functions — utilities, webhooks, and cron jobs that power the system.
          </p>

          {groupOrder.map((groupKey) => {
            const group = grouped[groupKey];
            if (!group || group.length === 0) return null;
            const config = TYPE_CONFIG[groupKey] || TYPE_CONFIG.edge_function;
            const GroupIcon = config.icon;

            return (
              <div key={groupKey} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <GroupIcon className={`h-3.5 w-3.5 ${config.color}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {config.label}s ({group.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {group.map((agent) => {
                    const isDeprecated = agent.status === "deprecated";
                    return (
                      <div
                        key={agent.id}
                        className={`rounded-lg border p-3 ${
                          isDeprecated
                            ? "border-destructive/20 bg-destructive/5 opacity-60"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-semibold ${isDeprecated ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {agent.label}
                              </p>
                              <Badge
                                className={`text-[9px] ${
                                  agent.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                    : agent.status === "planned"
                                    ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                    : "bg-destructive/10 text-destructive border-destructive/20"
                                }`}
                              >
                                {agent.status}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                              {agent.description}
                            </p>
                          </div>
                        </div>
                        {agent.edge_function && (
                          <code className="text-[10px] font-mono text-muted-foreground mt-1.5 block">
                            {agent.edge_function}
                          </code>
                        )}
                        {agent.triggers && agent.triggers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {agent.triggers.map((t: string) => (
                              <span key={t} className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                ← {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Flow Legend */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Request Flow</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="bg-muted px-2 py-1 rounded font-medium text-foreground">User Message</span>
            <ArrowRight className="h-3 w-3" />
            <span className="bg-primary/10 text-primary px-2 py-1 rounded font-medium">JARVIS (ai-task-agent)</span>
            <ArrowRight className="h-3 w-3" />
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-primary" />
                <span>Direct tool call</span>
              </span>
              <span className="text-muted-foreground/50">or</span>
              <span className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3 text-amber-500" />
                <span className="text-amber-600">supabase.functions.invoke()</span>
              </span>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="flex gap-3 mt-6">
          <Link to="/agent-training">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Brain className="h-3 w-3" /> Agent Training
            </Button>
          </Link>
          <Link to="/agent-pipeline">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Activity className="h-3 w-3" /> Pipeline
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
