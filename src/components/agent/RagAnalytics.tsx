import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Database, BarChart3, ThumbsDown } from "lucide-react";

interface ChunkStats {
  source_table: string;
  count: number;
  avg_quality: number;
}

export function RagAnalytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["rag-analytics"],
    queryFn: async () => {
      // Get chunk counts by source
      const { data: chunks } = await supabase
        .from("knowledge_chunks")
        .select("source_table, quality_score");

      const bySource: Record<string, { count: number; totalQuality: number }> = {};
      let totalChunks = 0;
      for (const c of (chunks || [])) {
        const src = c.source_table || "unknown";
        if (!bySource[src]) bySource[src] = { count: 0, totalQuality: 0 };
        bySource[src].count++;
        bySource[src].totalQuality += (c.quality_score ?? 0.5);
        totalChunks++;
      }

      const sourceStats: ChunkStats[] = Object.entries(bySource).map(([source_table, s]) => ({
        source_table,
        count: s.count,
        avg_quality: s.count > 0 ? s.totalQuality / s.count : 0,
      })).sort((a, b) => b.count - a.count);

      // Get feedback counts
      const { count: feedbackCount } = await supabase
        .from("rag_feedback")
        .select("*", { count: "exact", head: true });

      // Get last embedded timestamp
      const { data: lastEmbedded } = await supabase
        .from("knowledge_chunks")
        .select("embedded_at")
        .order("embedded_at", { ascending: false })
        .limit(1);

      return {
        totalChunks,
        sourceStats,
        feedbackCount: feedbackCount || 0,
        lastEmbedded: lastEmbedded?.[0]?.embedded_at,
      };
    },
    refetchInterval: 60000,
  });

  const sourceLabels: Record<string, string> = {
    copilot_training: "Training Data",
    agent_instructions: "Instructions",
    call_log: "Call Transcripts",
    sms_log: "SMS Threads",
  };

  const sourceColors: Record<string, string> = {
    copilot_training: "bg-blue-500",
    agent_instructions: "bg-purple-500",
    call_log: "bg-green-500",
    sms_log: "bg-amber-500",
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          RAG Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border/60 p-3 text-center">
            <Database className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xl font-bold">{stats?.totalChunks?.toLocaleString() || 0}</div>
            <div className="text-xs text-muted-foreground">Total Chunks</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3 text-center">
            <Brain className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xl font-bold">{stats?.sourceStats?.length || 0}</div>
            <div className="text-xs text-muted-foreground">Sources</div>
          </div>
          <div className="rounded-lg border border-border/60 p-3 text-center">
            <ThumbsDown className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xl font-bold">{stats?.feedbackCount || 0}</div>
            <div className="text-xs text-muted-foreground">Neg. Feedback</div>
          </div>
        </div>

        {/* Source breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Chunks by Source</p>
          {stats?.sourceStats?.map((s) => {
            const pct = stats.totalChunks > 0 ? (s.count / stats.totalChunks) * 100 : 0;
            return (
              <div key={s.source_table} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{sourceLabels[s.source_table] || s.source_table}</span>
                  <span className="text-muted-foreground">
                    {s.count} ({pct.toFixed(0)}%) · Q: {(s.avg_quality * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${sourceColors[s.source_table] || "bg-gray-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Last embedded */}
        {stats?.lastEmbedded && (
          <p className="text-xs text-muted-foreground">
            Last embedded: {new Date(stats.lastEmbedded).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
