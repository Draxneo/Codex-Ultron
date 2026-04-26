import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HourlyServicePoint {
  hour: string;       // "00".."23"
  hourLabel: string;  // "12a", "1a", ..., "11p"
  [service: string]: number | string; // dynamic per-service call counts
}

async function fetchHourly() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Pull all today's rows (cap 50k as a safety net)
  const { data, error } = await supabase
    .from("api_usage_log")
    .select("service, created_at")
    .gte("created_at", todayStart.toISOString())
    .limit(50000);

  if (error) throw error;

  // Build 24-hour skeleton
  const services = new Set<string>();
  const buckets: Record<string, Record<string, number>> = {};
  for (let h = 0; h < 24; h++) {
    buckets[String(h).padStart(2, "0")] = {};
  }

  for (const row of (data || []) as Array<{ service: string; created_at: string }>) {
    services.add(row.service);
    const d = new Date(row.created_at);
    const h = String(d.getHours()).padStart(2, "0");
    buckets[h][row.service] = (buckets[h][row.service] || 0) + 1;
  }

  const formatHour = (h: number) => {
    if (h === 0) return "12a";
    if (h === 12) return "12p";
    return h < 12 ? `${h}a` : `${h - 12}p`;
  };

  const points: HourlyServicePoint[] = [];
  for (let h = 0; h < 24; h++) {
    const hKey = String(h).padStart(2, "0");
    const point: HourlyServicePoint = { hour: hKey, hourLabel: formatHour(h) };
    for (const s of services) {
      point[s] = buckets[hKey][s] || 0;
    }
    points.push(point);
  }

  return {
    points,
    services: Array.from(services).sort(),
  };
}

export function useApiUsageHourly() {
  return useQuery({
    queryKey: ["api-usage-hourly"],
    queryFn: fetchHourly,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
