/**
 * SystemStatusIndicator — Top-nav health pulse for admins.
 *
 * Polls every 60s for unresolved critical/error rows in `system_error_log`
 * (last 30 min) and stale crons via `get_cron_health`. Renders a single
 * small dot in the header that turns red+pulse when something is wrong.
 *
 * Click → /system-log (Mission Control).
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

async function fetchHealth() {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const [errsRes, retryRes, pagesRes, cronRes] = await Promise.all([
    supabase
      .from("system_error_log")
      .select("id", { count: "exact", head: true })
      .in("severity", ["error", "critical"])
      .is("resolved_at", null)
      .gte("occurred_at", since),
    supabase
      .from("retry_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "dead_letter"),
    supabase
      .from("oncall_alerts")
      .select("id", { count: "exact", head: true })
      .is("acknowledged_at", null)
      .gte("triggered_at", since),
    supabase.rpc("get_cron_health"),
  ]);

  const stale =
    Array.isArray(cronRes.data)
      ? (cronRes.data as Array<{ is_stale: boolean }>).filter((r) => r.is_stale).length
      : 0;

  return {
    errors: errsRes.count ?? 0,
    deadLetter: retryRes.count ?? 0,
    pages: pagesRes.count ?? 0,
    staleCrons: stale,
  };
}

export function SystemStatusIndicator() {
  const { role } = useAuth();
  const { data } = useQuery({
    queryKey: ["system-status-indicator"],
    queryFn: fetchHealth,
    refetchInterval: 60_000,
    enabled: role === "admin",
  });

  if (role !== "admin") return null;

  const errors = data?.errors ?? 0;
  const dead = data?.deadLetter ?? 0;
  const pages = data?.pages ?? 0;
  const stale = data?.staleCrons ?? 0;
  const total = errors + dead + pages + stale;
  const critical = total > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/system-log">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 relative",
                critical
                  ? "text-destructive hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="System status"
            >
              {critical ? (
                <AlertTriangle className="h-4.5 w-4.5" />
              ) : (
                <Activity className="h-4.5 w-4.5" />
              )}
              {critical && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive animate-pulse" />
              )}
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {critical ? (
            <div className="space-y-0.5">
              <div className="font-semibold text-destructive">System needs attention</div>
              {errors > 0 && <div>{errors} unresolved error{errors === 1 ? "" : "s"} (30 min)</div>}
              {dead > 0 && <div>{dead} dead-letter retr{dead === 1 ? "y" : "ies"}</div>}
              {pages > 0 && <div>{pages} unacked page{pages === 1 ? "" : "s"}</div>}
              {stale > 0 && <div>{stale} stale cron job{stale === 1 ? "" : "s"}</div>}
            </div>
          ) : (
            <span>All systems nominal</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
