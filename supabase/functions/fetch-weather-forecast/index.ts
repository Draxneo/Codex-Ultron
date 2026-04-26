// Fetches a 10-day forecast from Open-Meteo (free, no API key) and upserts
// into weather_forecast_cache. Scheduled every 6 hours via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// San Antonio service area (78258). Hardcoded here as a sane fallback only —
// company_settings ZIP is preferred when present.
const FALLBACK_LAT = 29.6310;
const FALLBACK_LNG = -98.4636;

function weatherCodeToCondition(code: number): string {
  // Open-Meteo WMO weather codes
  if (code === 0) return "clear";
  if (code <= 3) return "clouds";
  if (code >= 45 && code <= 48) return "clouds"; // fog
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 95 && code <= 99) return "storm";
  return "clear";
}

function summarize(
  maxPrecip: number,
  conditions: Set<string>,
  hourlyChances: number[],
  feelsLikeHigh: number,
  humidityMax: number,
): string {
  const parts: string[] = [];

  if (maxPrecip >= 30) {
    if (conditions.has("storm")) parts.push(`Thunderstorms (${maxPrecip}%)`);
    else if (conditions.has("snow")) parts.push(`Snow (${maxPrecip}%)`);
    else if (conditions.has("rain")) {
      // Find rain window in 8a-6p hours
      let start = -1, end = -1;
      for (let i = 0; i < hourlyChances.length; i++) {
        if (hourlyChances[i] >= 50) {
          if (start === -1) start = i + 8;
          end = i + 8;
        }
      }
      if (start !== -1) {
        const fmt = (h: number) => h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;
        parts.push(`Rain ${fmt(start)}–${fmt(end)} (${maxPrecip}%)`);
      } else {
        parts.push(`Rain likely (${maxPrecip}%)`);
      }
    }
  } else if (conditions.has("clouds")) {
    parts.push("Cloudy");
  } else {
    parts.push("Mostly clear");
  }

  // Heat warning context
  if (feelsLikeHigh >= 100) parts.push(`feels like ${feelsLikeHigh}°`);
  if (humidityMax >= 80 && maxPrecip < 30) parts.push(`humid ${humidityMax}%`);

  return parts.join(" · ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read threshold from company_settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", ["weather_forecast_enabled", "weather_rain_threshold", "weather_heat_warning_threshold"]);

    const settingsMap: Record<string, string> = {};
    for (const row of settings || []) settingsMap[row.key] = row.value;

    if (settingsMap.weather_forecast_enabled === "false") {
      return new Response(JSON.stringify({ skipped: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const threshold = parseInt(settingsMap.weather_rain_threshold || "60", 10);
    const heatThreshold = parseInt(settingsMap.weather_heat_warning_threshold || "100", 10);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${FALLBACK_LAT}&longitude=${FALLBACK_LNG}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max&hourly=precipitation_probability,precipitation,weathercode,relativehumidity_2m,apparent_temperature&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=America/Chicago&forecast_days=10`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();

    const dailyDates: string[] = data.daily.time;
    const hourlyTimes: string[] = data.hourly.time;
    const hourlyChances: number[] = data.hourly.precipitation_probability;
    const hourlyCodes: number[] = data.hourly.weathercode;
    const hourlyHumidity: number[] = data.hourly.relativehumidity_2m;
    const hourlyApparent: number[] = data.hourly.apparent_temperature;

    const rows = dailyDates.map((date, dayIdx) => {
      // Slice hourly window 8a-6p (10 hours) for this date
      const dayPrefix = date; // YYYY-MM-DD
      const businessChances: number[] = [];
      const businessHumidity: number[] = [];
      const businessApparent: number[] = [];
      const conditions = new Set<string>();
      for (let i = 0; i < hourlyTimes.length; i++) {
        const t = hourlyTimes[i];
        if (!t.startsWith(dayPrefix)) continue;
        const hour = parseInt(t.substring(11, 13), 10);
        if (hour < 8 || hour > 18) continue;
        businessChances.push(hourlyChances[i] || 0);
        businessHumidity.push(hourlyHumidity?.[i] ?? 0);
        businessApparent.push(hourlyApparent?.[i] ?? 0);
        conditions.add(weatherCodeToCondition(hourlyCodes[i] || 0));
      }
      const maxPrecip = businessChances.length ? Math.max(...businessChances) : 0;
      const dailyCode = data.daily.weathercode[dayIdx] || 0;
      const dailyCondition = weatherCodeToCondition(dailyCode);

      const humidityMax = businessHumidity.length ? Math.round(Math.max(...businessHumidity)) : 0;
      const humidityAvg = businessHumidity.length
        ? Math.round(businessHumidity.reduce((a, b) => a + b, 0) / businessHumidity.length)
        : 0;
      const feelsLikeHigh = Math.round(data.daily.apparent_temperature_max?.[dayIdx] ?? 0);
      const feelsLikeLow = Math.round(data.daily.apparent_temperature_min?.[dayIdx] ?? 0);
      const windMax = Math.round(data.daily.windspeed_10m_max?.[dayIdx] ?? 0);

      return {
        forecast_date: date,
        condition: dailyCondition,
        precip_chance: maxPrecip,
        precip_inches: data.daily.precipitation_sum[dayIdx] || 0,
        temp_high: Math.round(data.daily.temperature_2m_max[dayIdx] || 0),
        temp_low: Math.round(data.daily.temperature_2m_min[dayIdx] || 0),
        humidity_avg: humidityAvg,
        humidity_max: humidityMax,
        feels_like_high: feelsLikeHigh,
        feels_like_low: feelsLikeLow,
        wind_max_mph: windMax,
        heat_warning: feelsLikeHigh >= heatThreshold,
        summary: summarize(maxPrecip, conditions, businessChances, feelsLikeHigh, humidityMax),
        business_hours_rain: maxPrecip >= threshold && (conditions.has("rain") || conditions.has("storm")),
        raw: { daily_idx: dayIdx, code: dailyCode, business_chances: businessChances },
        fetched_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("weather_forecast_cache")
      .upsert(rows, { onConflict: "forecast_date" });

    if (error) throw error;

    return new Response(
      JSON.stringify({ ok: true, days: rows.length, threshold, heatThreshold }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[fetch-weather-forecast]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
