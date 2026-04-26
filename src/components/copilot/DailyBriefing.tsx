/**
 * DailyBriefing — Auto-generates an AI briefing on first visit of the day.
 * Caches the result in localStorage so it only fires once per day.
 */

import { useState, useEffect, useCallback } from "react";
import { Bot, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedModel } from "@/components/CopilotModelSelector";
import { MarkdownContent } from "@/components/chat/MarkdownContent";

const CACHE_KEY = "jarvis_daily_briefing";

interface CachedBriefing {
  text: string;
  date: string;
  timestamp: number;
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

export function DailyBriefing() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check cache on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedBriefing = JSON.parse(cached);
        if (parsed.date === getTodayKey()) {
          setBriefing(parsed.text);
          return;
        }
      }
    } catch { /* ignore */ }
    // No valid cache — auto-generate
    generateBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-task-agent", {
        body: {
          mode: "briefing",
          model: getSelectedModel(),
          page_context: "JARVIS dashboard briefing",
        },
      });
      if (fnError) throw fnError;
      const text = data?.briefing || "No briefing generated.";
      setBriefing(text);
      // Cache for the day
      const cache: CachedBriefing = { text, date: getTodayKey(), timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (err: any) {
      console.error("Briefing error:", err);
      setError(err.message || "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Generating your daily briefing…</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-sm text-destructive">{error}</span>
          <Button size="sm" variant="outline" onClick={generateBriefing}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Daily Briefing</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={generateBriefing}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
          <MarkdownContent content={briefing} />
        </div>
      </CardContent>
    </Card>
  );
}
