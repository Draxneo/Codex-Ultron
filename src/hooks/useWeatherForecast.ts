import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WeatherForecast {
  forecast_date: string;
  condition: "clear" | "clouds" | "rain" | "storm" | "snow" | string;
  precip_chance: number;
  precip_inches: number;
  temp_high: number | null;
  temp_low: number | null;
  humidity_avg: number | null;
  humidity_max: number | null;
  feels_like_high: number | null;
  feels_like_low: number | null;
  wind_max_mph: number | null;
  heat_warning: boolean;
  summary: string | null;
  business_hours_rain: boolean;
  fetched_at: string;
}

/**
 * Reads the cached 10-day forecast. Server refresh runs every 6h via cron,
 * so a 10-min client stale time is plenty.
 */
export function useWeatherForecast() {
  return useQuery({
    queryKey: ["weather-forecast"],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Map<string, WeatherForecast>> => {
      const today = new Date().toISOString().substring(0, 10);
      const { data, error } = await supabase
        .from("weather_forecast_cache")
        .select("*")
        .gte("forecast_date", today)
        .order("forecast_date", { ascending: true });
      if (error) throw error;
      const map = new Map<string, WeatherForecast>();
      for (const row of (data || []) as WeatherForecast[]) {
        map.set(row.forecast_date, row);
      }
      return map;
    },
  });
}
