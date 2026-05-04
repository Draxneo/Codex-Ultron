/**
 * TechWeatherCard.tsx — At-a-glance weather for the job's scheduled day,
 * with a one-tap "Save to job" button so techs can record the conditions
 * they charged the unit under.
 *
 * Tech-only: rendered inside TechJobDetail.
 */

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudSun, Check, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useWeatherForecast } from "@/hooks/useWeatherForecast";
import { WeatherBadge } from "@/components/weather/WeatherBadge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SavedSnapshot {
  weather_captured_at: string | null;
  weather_captured_by: string | null;
  weather_condition: string | null;
  weather_temp_high: number | null;
  weather_temp_low: number | null;
  weather_feels_like_high: number | null;
  weather_humidity_max: number | null;
  weather_precip_chance: number | null;
  weather_wind_max_mph: number | null;
  weather_summary: string | null;
  weather_source_date: string | null;
}

interface Props {
  jobId: string;
  scheduledDate: string | null;
  techName: string | null;
  saved: SavedSnapshot;
  bare?: boolean;
  allowSave?: boolean;
}

export function TechWeatherCard({ jobId, scheduledDate, techName, saved, bare, allowSave = false }: Props) {
  const qc = useQueryClient();
  const { data: forecastMap, isLoading } = useWeatherForecast();

  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);
  const targetDate = scheduledDate || today;
  const forecast = forecastMap?.get(targetDate) || forecastMap?.get(today);
  const hasSaved = !!saved.weather_captured_at;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!forecast) throw new Error("No forecast available");
      const payload = {
        weather_captured_at: new Date().toISOString(),
        weather_captured_by: techName || "Technician",
        weather_condition: forecast.condition,
        weather_temp_high: forecast.temp_high,
        weather_temp_low: forecast.temp_low,
        weather_feels_like_high: forecast.feels_like_high,
        weather_humidity_max: forecast.humidity_max,
        weather_precip_chance: forecast.precip_chance,
        weather_wind_max_mph: forecast.wind_max_mph,
        weather_summary: forecast.summary,
        weather_source_date: forecast.forecast_date,
      };
      const { error } = await supabase.from("jobs").update(payload).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Weather saved to job");
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (e: any) => toast.error(e.message || "Could not save weather"),
  });

  const Wrapper = bare ? "div" : "div";
  const wrapperClass = bare ? "" : "rounded-lg border border-border bg-card p-3";

  if (isLoading) {
    return (
      <Wrapper className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading weather…
        </div>
      </Wrapper>
    );
  }

  if (!forecast && !hasSaved) {
    return (
      <Wrapper className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CloudSun className="h-3.5 w-3.5" /> No forecast available for this date.
        </div>
      </Wrapper>
    );
  }

  const savedDateLabel = saved.weather_captured_at
    ? format(parseISO(saved.weather_captured_at), "MMM d, h:mm a")
    : null;
  const dayLabel = scheduledDate
    ? format(parseISO(scheduledDate), "EEE MMM d")
    : "Today";

  return (
    <Wrapper className={wrapperClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            {dayLabel}
          </div>
          {forecast ? (
            <WeatherBadge forecast={forecast} className="!px-0 !py-0" />
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CloudSun className="h-4 w-4 text-primary" />
              Saved visit weather
            </div>
          )}
          {forecast?.summary && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{forecast.summary}</p>
          )}
        </div>
        {allowSave ? (
          <Button
            size="sm"
            variant={hasSaved ? "outline" : "default"}
            className="h-8 shrink-0 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !forecast}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : hasSaved ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1" /> Update
              </>
            ) : (
              "Save to job"
            )}
          </Button>
        ) : null}
      </div>

      {hasSaved && (
        <div className="mt-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground">Recorded:</span>
            <span>
              {saved.weather_temp_high != null && `${saved.weather_temp_high}°`}
              {saved.weather_temp_low != null && `/${saved.weather_temp_low}°`}
              {saved.weather_humidity_max != null && ` · ${saved.weather_humidity_max}% RH`}
              {saved.weather_condition && ` · ${saved.weather_condition}`}
            </span>
          </div>
          <div className="mt-0.5">
            By {saved.weather_captured_by || "tech"} · {savedDateLabel}
          </div>
        </div>
      )}
    </Wrapper>
  );
}
