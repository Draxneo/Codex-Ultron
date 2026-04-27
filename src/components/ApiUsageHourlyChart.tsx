import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useApiUsageHourly } from "@/hooks/useApiUsageHourly";

const SERVICE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  twilio_sms: "Twilio SMS",
  twilio_voice: "Twilio Voice",
  deepgram: "Deepgram",
  openai_ai: "OpenAI / JARVIS",
  lovable_ai: "OpenAI / JARVIS (legacy)",
  firecrawl: "Firecrawl",
};

const SERVICE_COLORS: Record<string, string> = {
  google_maps: "#4285F4",
  twilio_sms: "#F22F46",
  twilio_voice: "#E91E63",
  deepgram: "#13EF93",
  openai_ai: "#8B5CF6",
  lovable_ai: "#A78BFA",
  firecrawl: "#F97316",
};

const RETIRED_SERVICES = new Set(["sendgrid"]);

export function ApiUsageHourlyChart() {
  const { data, isLoading } = useApiUsageHourly();
  const [filter, setFilter] = useState<string>("all");

  const services = (data?.services || []).filter(s => !RETIRED_SERVICES.has(s));

  const visibleServices = useMemo(() => {
    if (filter === "all") return services;
    return services.filter(s => s === filter);
  }, [filter, services]);

  const totalToday = useMemo(() => {
    if (!data?.points) return 0;
    return data.points.reduce((sum, p) => {
      return sum + visibleServices.reduce((s2, srv) => s2 + ((p[srv] as number) || 0), 0);
    }, 0);
  }, [data, visibleServices]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Hourly API Calls (Today)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Watch this drop after a bug fix. Stacked = total volume per hour, broken down by service.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {totalToday.toLocaleString()} calls today
            </Badge>
          </div>
        </div>

        {/* Service filter */}
        {services.length > 0 && (
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={v => v && setFilter(v)}
            className="bg-muted rounded-lg p-0.5 mt-2 flex-wrap justify-start"
          >
            <ToggleGroupItem value="all" className="text-[11px] px-2.5 py-1 h-6 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              All
            </ToggleGroupItem>
            {services.map(s => (
              <ToggleGroupItem
                key={s}
                value={s}
                className="text-[11px] px-2.5 py-1 h-6 rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: SERVICE_COLORS[s] || "#999" }}
                />
                {SERVICE_LABELS[s] || s}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </CardHeader>

      <CardContent>
        {isLoading && <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>}

        {!isLoading && (data?.points?.length || 0) > 0 && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data!.points} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="hourLabel"
                  tick={{ fontSize: 10 }}
                  interval={1}
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: number, name: string) => [
                    `${value} calls`,
                    SERVICE_LABELS[name] || name,
                  ]}
                  labelFormatter={l => `Hour: ${l}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  formatter={v => SERVICE_LABELS[v] || v}
                />
                {visibleServices.map(s => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="services"
                    fill={SERVICE_COLORS[s] || "#999"}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
