import { useState, useMemo } from "react";
import { CloudRain, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface Props {
  /** ISO date strings (YYYY-MM-DD) currently visible in the calendar. */
  visibleDates: string[];
  /** Map of date → number of jobs scheduled that day (visible items). */
  jobCountByDate: Map<string, number>;
}

/**
 * Banner shown above the calendar when one or more visible days have a
 * business-hours rain forecast AND have jobs on the schedule. Each rain day
 * gets a "Draft reschedule texts" button that queues SMS through the HITL
 * pipeline for dispatcher review.
 */
export function RainDayAlertBar({ visibleDates, jobCountByDate }: Props) {
  const { data: forecastMap } = useWeatherForecast();
  const [drafting, setDrafting] = useState<string | null>(null);

  const rainDays = useMemo(() => {
    if (!forecastMap) return [];
    return visibleDates
      .map(d => ({ date: d, fc: forecastMap.get(d), jobs: jobCountByDate.get(d) || 0 }))
      .filter(x => x.fc?.business_hours_rain && x.jobs > 0);
  }, [forecastMap, visibleDates, jobCountByDate]);

  if (rainDays.length === 0) return null;

  async function handleDraft(date: string, jobCount: number) {
    setDrafting(date);
    try {
      const { data, error } = await supabase.functions.invoke("draft-rain-day-sms", {
        body: { date },
      });
      if (error) throw error;
      toast.success(
        `${data?.queued ?? jobCount} draft text${data?.queued === 1 ? "" : "s"} queued for review`,
        { description: `Code: ${data?.code} · Review in Outbox before sending` },
      );
    } catch (e: any) {
      toast.error("Failed to draft texts", { description: e?.message });
    } finally {
      setDrafting(null);
    }
  }

  return (
    <div className="space-y-1.5 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 shrink-0">
      {rainDays.map(({ date, fc, jobs }) => {
        const d = new Date(`${date}T12:00:00`);
        const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return (
          <div key={date} className="flex items-center gap-3 flex-wrap">
            <CloudRain className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="flex-1 min-w-0 text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                Rain forecast {label}
              </span>
              <span className="text-amber-800/80 dark:text-amber-300/80 ml-1.5">
                · {fc?.summary} · <strong>{jobs}</strong> job{jobs === 1 ? "" : "s"} may need rescheduling
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs gap-1.5"
              onClick={() => handleDraft(date, jobs)}
              disabled={drafting === date}
            >
              {drafting === date ? <Loader2 className="h-3 w-3 animate-spin" /> : <CloudRain className="h-3 w-3" />}
              Draft reschedule texts
            </Button>
            <Link to="/sms?tab=outbox" className="text-xs text-amber-900/80 dark:text-amber-200/80 hover:underline inline-flex items-center gap-1">
              Outbox <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
