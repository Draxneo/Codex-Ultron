import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WeatherForecast } from "@/hooks/useWeatherForecast";

/**
 * Historical weather snapshots.
 *
 * The `weather_forecast_cache` only retains today + future forecasts, so calendar
 * cells for past days lose their weather pill. Once the daily snapshot cron runs
 * each morning, every job/estimate scheduled that day gets `weather_*` columns
 * stamped on it. This hook reaches back into those rows so the calendar header
 * can keep showing the conditions that actually happened.
 *
 * Returns a Map<YYYY-MM-DD, WeatherForecast> keyed by `weather_source_date`.
 */
export function useHistoricalWeather(dateKeys: string[]) {
  const sortedKeys = [...new Set(dateKeys)].sort();
  const minDate = sortedKeys[0];
  const maxDate = sortedKeys[sortedKeys.length - 1];

  return useQuery({
    queryKey: ["historical-weather", minDate, maxDate],
    enabled: !!minDate && !!maxDate,
    staleTime: 30 * 60 * 1000, // 30 min — past weather doesn't change
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, WeatherForecast>> => {
      const map = new Map<string, WeatherForecast>();
      if (!minDate || !maxDate) return map;

      // Pull one representative weather snapshot per date from jobs.
      // Any job for a given day will have the same forecast (auto-snapshot uses
      // a single cached row), so DISTINCT ON keeps it cheap.
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "weather_source_date, weather_condition, weather_temp_high, weather_temp_low, " +
            "weather_feels_like_high, weather_humidity_max, weather_precip_chance, " +
            "weather_wind_max_mph, weather_summary, weather_captured_at",
        )
        .not("weather_source_date", "is", null)
        .gte("weather_source_date", minDate)
        .lte("weather_source_date", maxDate);

      if (error) throw error;

      for (const row of (data || []) as any[]) {
        const key: string | null = row.weather_source_date;
        if (!key || map.has(key)) continue;
        map.set(key, {
          forecast_date: key,
          condition: row.weather_condition || "clear",
          precip_chance: row.weather_precip_chance ?? 0,
          precip_inches: 0,
          temp_high: row.weather_temp_high ?? null,
          temp_low: row.weather_temp_low ?? null,
          humidity_avg: null,
          humidity_max: row.weather_humidity_max ?? null,
          feels_like_high: row.weather_feels_like_high ?? null,
          feels_like_low: null,
          wind_max_mph: row.weather_wind_max_mph ?? null,
          heat_warning: (row.weather_feels_like_high ?? row.weather_temp_high ?? 0) >= 100,
          summary: row.weather_summary || null,
          business_hours_rain: (row.weather_precip_chance ?? 0) >= 60,
          fetched_at: row.weather_captured_at || new Date().toISOString(),
        });
      }
      return map;
    },
  });
}
