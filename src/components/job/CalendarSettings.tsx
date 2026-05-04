import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUserPreferences } from "@/hooks/useUserPreferences";

const SETTINGS_KEY = "calendar_settings";

export type CardDensity = "compact" | "comfortable" | "expanded";
export type CalendarVisibleFields = CalendarSettingsData["visibleFields"];

export interface CalendarSettingsData {
  businessHoursOnly: boolean;
  showHolidays: boolean;
  cardDensity: CardDensity;
  visibleFields: {
    amount: boolean;
    arrivalWindow: boolean;
    customer: boolean;
    description: boolean;
    jobNumber: boolean;
    phone: boolean;
    street: boolean;
    team: boolean;
    travelTime: boolean;
    customerTags: boolean;
    zip: boolean;
  };
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettingsData = {
  businessHoursOnly: false,
  showHolidays: false,
  cardDensity: "comfortable",
  visibleFields: {
    amount: false,
    arrivalWindow: true,
    customer: true,
    description: true,
    jobNumber: true,
    phone: false,
    street: true,
    team: true,
    travelTime: true,
    customerTags: true,
    zip: false,
  },
};

function mergeCalendarSettings(value: unknown): CalendarSettingsData {
  if (!value || typeof value !== "object") return DEFAULT_CALENDAR_SETTINGS;
  const parsed = value as Partial<CalendarSettingsData>;
  return {
    ...DEFAULT_CALENDAR_SETTINGS,
    ...parsed,
    visibleFields: {
      ...DEFAULT_CALENDAR_SETTINGS.visibleFields,
      ...(parsed.visibleFields || {}),
    },
  };
}

export function useCalendarSettings() {
  const { calendar_settings, setCalendarSettings } = useUserPreferences();
  const [settings, setSettings] = useState<CalendarSettingsData>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return DEFAULT_CALENDAR_SETTINGS;
      return mergeCalendarSettings(JSON.parse(stored));
    } catch {
      return DEFAULT_CALENDAR_SETTINGS;
    }
  });

  useEffect(() => {
    if (!calendar_settings) return;
    const merged = mergeCalendarSettings(calendar_settings);
    setSettings(merged);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  }, [calendar_settings]);

  const update = (next: CalendarSettingsData) => {
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setCalendarSettings(next as unknown as Record<string, unknown>);
  };

  return { settings, update };
}

const FIELD_LABELS: { key: keyof CalendarSettingsData["visibleFields"]; label: string }[] = [
  { key: "amount", label: "Amount" },
  { key: "arrivalWindow", label: "Arrival window" },
  { key: "customer", label: "Customer" },
  { key: "description", label: "Description" },
  { key: "jobNumber", label: "Job number" },
  { key: "phone", label: "Phone number" },
  { key: "street", label: "Street" },
  { key: "team", label: "Team" },
  { key: "travelTime", label: "Travel time" },
  { key: "customerTags", label: "Customer tags (Install/Agreement)" },
  { key: "zip", label: "Zip code" },
];

interface Props {
  settings: CalendarSettingsData;
  onChange: (s: CalendarSettingsData) => void;
}

export function CalendarSettings({ settings, onChange }: Props) {
  const toggle = (key: keyof CalendarSettingsData, value: boolean) => {
    onChange({ ...settings, [key]: value });
  };

  const toggleField = (key: keyof CalendarSettingsData["visibleFields"], value: boolean) => {
    onChange({
      ...settings,
      visibleFields: { ...settings.visibleFields, [key]: value },
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Calendar settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Calendar Settings</p>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="biz-hours" className="text-xs">Business hours only</Label>
            <Switch id="biz-hours" checked={settings.businessHoursOnly} onCheckedChange={v => toggle("businessHoursOnly", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="holidays" className="text-xs">Show US holidays</Label>
            <Switch id="holidays" checked={settings.showHolidays} onCheckedChange={v => toggle("showHolidays", v)} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Time zone</Label>
            <span className="text-xs font-medium">Central Time</span>
          </div>
        </div>

        <Separator className="my-3" />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Card Density</p>
        <RadioGroup
          value={settings.cardDensity}
          onValueChange={(v) => onChange({ ...settings, cardDensity: v as CalendarSettingsData["cardDensity"] })}
          className="mb-3 space-y-1"
        >
          {([
            { value: "compact", label: "Compact", desc: "Minimal — badge + name + time" },
            { value: "comfortable", label: "Comfortable", desc: "Default — + phone, stage, travel" },
            { value: "expanded", label: "Expanded", desc: "Full — + address, description" },
          ] as const).map((opt) => (
            <div key={opt.value} className="flex items-start gap-2">
              <RadioGroupItem value={opt.value} id={`density-${opt.value}`} className="mt-0.5" />
              <Label htmlFor={`density-${opt.value}`} className="text-xs leading-tight cursor-pointer">
                <span className="font-semibold">{opt.label}</span>
                <span className="text-muted-foreground ml-1">— {opt.desc}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <Separator className="my-3" />
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Calendar Items</p>
        <div className="space-y-2">
          {FIELD_LABELS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`field-${key}`} className="text-xs">{label}</Label>
              <Switch id={`field-${key}`} checked={settings.visibleFields[key]} onCheckedChange={v => toggleField(key, v)} />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
