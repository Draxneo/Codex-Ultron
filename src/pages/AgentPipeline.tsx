import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { AgentPipelineCanvas } from "@/components/agent/AgentPipelineCanvas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function useAgentPipelineCounts() {
  return useQuery({
    queryKey: ["agent_pipeline_counts"],
    queryFn: async () => {
      const [instructions, tools, learnings, modelConfig] = await Promise.all([
        supabase.from("agent_instructions").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("agent_tools").select("id", { count: "exact", head: true }).eq("is_enabled", true),
        supabase.from("agent_learnings").select("id", { count: "exact", head: true }),
        (supabase as any).from("ai_model_config").select("model").eq("task_key", "copilot").single(),
      ]);
      return {
        instructions: instructions.count || 0,
        tools: tools.count || 0,
        learnings: learnings.count || 0,
        model: modelConfig.data?.model || "gpt-4o-mini",
      };
    },
  });
}

export default function AgentPipeline() {
  const isMobile = useIsMobile();
  const { data: counts, isLoading } = useAgentPipelineCounts();

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AI Agent Pipeline</h1>
            <p className="text-xs text-muted-foreground">How the AI processes requests — from input through tools to response.</p>
          </div>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>}
        {!isLoading && !counts && (
          <div className="text-center py-16 space-y-3">
            <Brain className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">No agent configuration found. Set up instructions and tools in Agent Training first.</p>
            <Button variant="outline" asChild><a href="/agent-training">Go to Agent Training</a></Button>
          </div>
        )}
        {counts && <AgentPipelineCanvas counts={counts} />}
      </main>
    </div>
  );
}
