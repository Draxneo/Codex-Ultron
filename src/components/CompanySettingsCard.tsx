import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Building2, Gauge, Percent, Users } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export function CompanySettingsCard() {
  const { settings, isLoading, updateSettings } = useCompanySettings();
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(form);
  };

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const numberValue = (key: string, fallback: number) => {
    const parsed = Number((form as any)[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const setNumber = (key: string, value: number) => set(key, String(value));

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Company / Dealer Info
        </CardTitle>
        <CardDescription className="text-xs">
          Used by CPS Rebate, Warranty Registration, and other tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Company Name</Label>
            <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contact Name</Label>
            <Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Primary contact" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input value={form.company_phone} onChange={(e) => set("company_phone", e.target.value)} placeholder="(210) 555-1234" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input value={form.company_email} onChange={(e) => set("company_email", e.target.value)} type="email" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Street Address</Label>
          <AddressAutocomplete value={form.company_address} onChange={(v) => set("company_address", v)} placeholder="401 E Sonterra Blvd" />
          <p className="text-[10px] text-muted-foreground">Use abbreviated format (E, W, Blvd, St) to match warranty portals</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">City</Label>
            <Input value={form.company_city} onChange={(e) => set("company_city", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">State</Label>
            <Input value={form.company_state} onChange={(e) => set("company_state", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ZIP</Label>
            <Input value={form.company_zip} onChange={(e) => set("company_zip", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">TACLA License #</Label>
            <Input value={form.tacla_number} onChange={(e) => set("tacla_number", e.target.value)} placeholder="TACLA00123456C" className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">CPS CIN #</Label>
            <Input value={form.cps_cin} onChange={(e) => set("cps_cin", e.target.value)} placeholder="Carrier dealer CIN" className="font-mono" />
          </div>
        </div>

        {/* Operational Settings */}
        <div className="pt-3 border-t space-y-3">
          <div className="flex items-start gap-2">
            <Gauge className="mt-0.5 h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold">Operational Defaults</p>
              <p className="text-xs text-muted-foreground">Visual dials for the values dispatch and quoting use every day.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <VisualNumberDial
              icon={<Percent className="h-4 w-4" />}
              label="Tax Rate"
              value={numberValue("tax_rate", 8.25)}
              min={0}
              max={12}
              step={0.01}
              suffix="%"
              onChange={(value) => setNumber("tax_rate", value)}
            />
            <VisualNumberDial
              icon={<Users className="h-4 w-4" />}
              label="Service jobs per tech"
              value={numberValue("max_jobs_tech", 4)}
              min={1}
              max={10}
              step={1}
              suffix="/day"
              onChange={(value) => setNumber("max_jobs_tech", value)}
            />
            <VisualNumberDial
              icon={<Users className="h-4 w-4" />}
              label="Sales visits per day"
              value={numberValue("max_jobs_sales", 8)}
              min={1}
              max={14}
              step={1}
              suffix="/day"
              onChange={(value) => setNumber("max_jobs_sales", value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
          {updateSettings.isPending ? "Saving..." : "Save Company Info"}
        </Button>

      </CardContent>
    </Card>
  );
}

function VisualNumberDial({
  icon,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-muted-foreground">{icon}</div>
          <Label className="truncate text-xs font-semibold">{label}</Label>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono">
          {value}
          {suffix}
        </Badge>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>
          {min}
          {suffix}
        </span>
        <span>
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}
