import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Building2, Mic, ShieldAlert, ShieldCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
          <p className="text-xs font-medium text-muted-foreground">Operational Defaults</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tax Rate (%)</Label>
              <Input value={form.tax_rate} onChange={(e) => set("tax_rate", e.target.value)} placeholder="8.25" type="number" step="0.01" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Jobs / Tech / Day</Label>
              <Input value={form.max_jobs_tech} onChange={(e) => set("max_jobs_tech", e.target.value)} placeholder="4" type="number" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Jobs / Sales / Day</Label>
              <Input value={form.max_jobs_sales} onChange={(e) => set("max_jobs_sales", e.target.value)} placeholder="8" type="number" className="font-mono" />
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
          {updateSettings.isPending ? "Saving..." : "Save Company Info"}
        </Button>

      </CardContent>
    </Card>
  );
}
