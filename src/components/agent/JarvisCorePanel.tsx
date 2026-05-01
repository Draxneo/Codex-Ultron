import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, CheckCircle2, Database, ShieldCheck, Sparkles, TriangleAlert, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JARVIS_BRAINS, isCanonicalJarvisTool, isRetiredJarvisTool } from "@/lib/jarvisCore";
import { APP_ACTION_GO_LIVE_ISO } from "@/lib/appLifecycle";

type PromptSectionRow = {
  slug: string;
  title: string;
  category: string;
  is_active: boolean;
  is_locked: boolean;
  route_scope: string[] | null;
};

type ToolRow = {
  function_name: string;
  name: string;
  is_enabled: boolean;
};

type CountResult = { count: number | null };

async function getCount(table: string, filters?: (query: any) => any): Promise<number> {
  let query = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (filters) query = filters(query);
  const { count } = (await query) as CountResult;
  return count || 0;
}

export function JarvisCorePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["jarvis-core-panel"],
    queryFn: async () => {
      const [
        promptSections,
        tools,
        trainingCount,
        instructionsCount,
        learningsCount,
        pendingApprovals,
        pendingBookings,
        pendingSms,
      ] = await Promise.all([
        supabase
          .from("prompt_sections")
          .select("slug,title,category,is_active,is_locked,route_scope")
          .order("sort_order"),
        supabase
          .from("agent_tools")
          .select("function_name,name,is_enabled")
          .order("function_name"),
        getCount("copilot_training", (q) => q.eq("is_active", true)),
        getCount("agent_instructions", (q) => q.eq("is_active", true)),
        getCount("agent_learnings"),
        getCount("action_items", (q) => q.eq("category", "jarvis_action_approval").eq("status", "pending").gte("created_at", APP_ACTION_GO_LIVE_ISO)),
        getCount("action_items", (q) => q.eq("category", "new_appointment").eq("status", "pending").gte("created_at", APP_ACTION_GO_LIVE_ISO)),
        getCount("outbound_drafts", (q) => q.eq("status", "pending").gte("created_at", APP_ACTION_GO_LIVE_ISO)),
      ]);

      if (promptSections.error) throw promptSections.error;
      if (tools.error) throw tools.error;

      return {
        promptSections: (promptSections.data || []) as PromptSectionRow[],
        tools: (tools.data || []) as ToolRow[],
        trainingCount,
        instructionsCount,
        learningsCount,
        pendingApprovals,
        pendingBookings,
        pendingSms,
      };
    },
  });

  const toolStats = useMemo(() => {
    const all = data?.tools || [];
    const enabled = all.filter((tool) => tool.is_enabled);
    const staleEnabled = enabled.filter((tool) => !isCanonicalJarvisTool(tool.function_name));
    const retiredEnabled = enabled.filter((tool) => isRetiredJarvisTool(tool.function_name));
    return { all, enabled, staleEnabled, retiredEnabled };
  }, [data?.tools]);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Checking JARVIS core...</p>;
  }

  const activePromptCount = data?.promptSections.filter((section) => section.is_active).length || 0;
  const lockedPromptCount = data?.promptSections.filter((section) => section.is_locked).length || 0;
  const hasToolDrift = toolStats.staleEnabled.length > 0 || toolStats.retiredEnabled.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">JARVIS Core Control Center</h2>
          <Badge variant={hasToolDrift ? "destructive" : "secondary"} className="ml-auto">
            {hasToolDrift ? "cleanup needed" : "centralized"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          One place to see the live rule source, tool registry, approval queues, and knowledge layers JARVIS is using.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={ShieldCheck} label="Prompt sections" value={`${activePromptCount}/${data?.promptSections.length || 0}`} detail={`${lockedPromptCount} locked`} />
        <MetricCard icon={Wrench} label="Enabled tools" value={`${toolStats.enabled.length}/${toolStats.all.length}`} detail={`${toolStats.staleEnabled.length} stale`} warn={toolStats.staleEnabled.length > 0} />
        <MetricCard icon={Sparkles} label="Pending actions" value={String(data?.pendingApprovals || 0)} detail={`${data?.pendingBookings || 0} bookings`} warn={(data?.pendingApprovals || 0) > 0} />
        <MetricCard icon={Database} label="Knowledge layers" value={String((data?.trainingCount || 0) + (data?.instructionsCount || 0))} detail={`${data?.learningsCount || 0} learnings`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Company Brain Map</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {JARVIS_BRAINS.map((brain) => (
            <div key={brain.key} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{brain.label}</p>
                <Badge variant="outline" className="text-[10px]">{brain.owns}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{brain.purpose}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {hasToolDrift && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              Tool Registry Drift
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              These enabled rows do not match the current JARVIS Core tool map. They should stay disabled unless we intentionally rebuild them.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {toolStats.staleEnabled.slice(0, 18).map((tool) => (
                <Badge key={tool.function_name} variant="outline" className="font-mono text-[10px]">
                  {tool.function_name}
                </Badge>
              ))}
              {toolStats.staleEnabled.length > 18 && (
                <Badge variant="outline" className="text-[10px]">+{toolStats.staleEnabled.length - 18} more</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasToolDrift && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Tool registry is aligned with the current JARVIS Core map.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Current Source Of Truth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Rules:</strong> active rows in <code>prompt_sections</code>.</p>
          <p><strong className="text-foreground">Reference knowledge:</strong> <code>copilot_training</code>, uploaded documents, and RAG chunks.</p>
          <p><strong className="text-foreground">Tools:</strong> code-defined tools exposed only when matching enabled <code>agent_tools</code> rows.</p>
          <p><strong className="text-foreground">Human approval:</strong> <code>action_items</code> plus pending SMS drafts. JARVIS prepares; humans approve.</p>
          <p><strong className="text-foreground">Pending SMS:</strong> {data?.pendingSms || 0} customer-facing draft(s) waiting for review.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  warn = false,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
  detail: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-500/40" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={warn ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-primary"} />
          {label}
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
