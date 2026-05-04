import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DollarSign, Percent, Save, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";

const JOB_TYPES = [
  "complete_install", "service", "one_off_maintenance",
  "condenser_sale", "condenser_install",
  "coil_sale", "coil_install",
  "furnace_sale", "furnace_install",
  "air_handler_sale", "air_handler_install",
  "complete_system_sale",
  "plan_sale", "plan_visit",
  "diagnostic",
];
const TYPE_LABELS: Record<string, string> = {
  complete_install: "Complete Install",
  service: "Service / Repair",
  one_off_maintenance: "One-Off Maintenance",
  condenser_sale: "Condenser Sale",
  condenser_install: "Condenser Install",
  coil_sale: "Coil Sale",
  coil_install: "Coil Install",
  furnace_sale: "Furnace Sale",
  furnace_install: "Furnace Install",
  air_handler_sale: "Air Handler Sale",
  air_handler_install: "Air Handler Install",
  complete_system_sale: "Complete System Sale",
  plan_sale: "Service Plan Sale",
  plan_visit: "Service Plan Visit",
  diagnostic: "Diagnostic / No-Repair",
};
const typeLabel = (t: string) => TYPE_LABELS[t] || t.charAt(0).toUpperCase() + t.slice(1);

const PAY_MODELS = [
  { value: "commission", label: "Commission Only" },
  { value: "hourly_plus_commission", label: "Hourly + Commission" },
  { value: "hourly", label: "Hourly Only" },
];

interface EmpRate {
  id?: string;
  employee_id: string;
  job_type: string;
  rate: number;
  rate_type: "flat" | "percentage";
}

export function PayRatesCard() {
  const { data: employees } = useEmployees();
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [rates, setRates] = useState<EmpRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [payModel, setPayModel] = useState("commission");

  const activeEmps = (employees || []).filter((e: any) => e.is_active !== false);

  useEffect(() => {
    if (!selectedEmpId && activeEmps.length > 0) {
      setSelectedEmpId(activeEmps[0].id);
    }
  }, [activeEmps, selectedEmpId]);

  useEffect(() => {
    if (!selectedEmpId) return;
    setLoading(true);

    // Fetch employee hourly config
    supabase
      .from("employees")
      .select("hourly_rate, pay_model")
      .eq("id", selectedEmpId)
      .single()
      .then(({ data }) => {
        setHourlyRate((data as any)?.hourly_rate || 0);
        setPayModel((data as any)?.pay_model || "commission");
      });

    supabase
      .from("employee_pay_rates")
      .select("*")
      .eq("employee_id", selectedEmpId)
      .then(({ data }) => {
        const existing = (data || []) as EmpRate[];
        const full = JOB_TYPES.map(jt => {
          const found = existing.find(r => r.job_type === jt);
          return found || { employee_id: selectedEmpId, job_type: jt, rate: 0, rate_type: "flat" as const };
        });
        setRates(full);
        setLoading(false);
      });
  }, [selectedEmpId]);

  const updateRate = (jobType: string, value: string) => {
    setRates(prev => prev.map(r => r.job_type === jobType ? { ...r, rate: parseFloat(value) || 0 } : r));
  };

  const updateRateType = (jobType: string, rateType: "flat" | "percentage") => {
    setRates(prev => prev.map(r => r.job_type === jobType ? { ...r, rate_type: rateType } : r));
  };

  const handleSave = async () => {
    setSaving(true);

    // Save hourly config to employees table
    await supabase.from("employees").update({
      hourly_rate: hourlyRate,
      pay_model: payModel,
    } as any).eq("id", selectedEmpId);

    for (const rate of rates) {
      if (rate.id) {
        await supabase.from("employee_pay_rates").update({ rate: rate.rate, rate_type: rate.rate_type, updated_at: new Date().toISOString() }).eq("id", rate.id);
      } else {
        await supabase.from("employee_pay_rates").upsert({
          employee_id: rate.employee_id,
          job_type: rate.job_type,
          rate: rate.rate,
          rate_type: rate.rate_type,
        }, { onConflict: "employee_id,job_type" });
      }
    }
    const { data } = await supabase.from("employee_pay_rates").select("*").eq("employee_id", selectedEmpId);
    const existing = (data || []) as EmpRate[];
    const full = JOB_TYPES.map(jt => {
      const found = existing.find(r => r.job_type === jt);
      return found || { employee_id: selectedEmpId, job_type: jt, rate: 0, rate_type: "flat" as const };
    });
    setRates(full);
    setSaving(false);
    toast({ title: "Pay rates saved" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Pay Rates
        </CardTitle>
        <CardDescription className="text-xs">
          Set each employee's pay model, hourly rate, and commission per job type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
          <SelectTrigger>
            <SelectValue placeholder="Select employee" />
          </SelectTrigger>
          <SelectContent>
            {activeEmps.map((emp: any) => (
              <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.role})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
        ) : selectedEmpId ? (
          <div className="space-y-4">
            {/* Pay Model selector */}
            <div className="rounded-lg border p-3 space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Pay Model
              </Label>
              <RadioGroup value={payModel} onValueChange={setPayModel} className="flex flex-wrap gap-3">
                {PAY_MODELS.map(pm => (
                  <div key={pm.value} className="flex items-center gap-1.5">
                    <RadioGroupItem value={pm.value} id={`pm-${pm.value}`} />
                    <Label htmlFor={`pm-${pm.value}`} className="text-xs cursor-pointer">{pm.label}</Label>
                  </div>
                ))}
              </RadioGroup>

              {payModel !== "commission" && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Hourly Rate:</Label>
                  <div className="relative flex-1 max-w-[140px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={hourlyRate}
                      onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)}
                      className="pl-7"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">/ hr</span>
                </div>
              )}
            </div>

            {/* Commission rates per job type (hide if hourly only) */}
            {payModel !== "hourly" && (
              <>
                <Label className="text-sm font-semibold">Commission Rates by Job Type</Label>
                {rates.map(rate => (
                  <div key={rate.job_type} className="space-y-1.5">
                    <Label className="text-sm font-medium">{typeLabel(rate.job_type)}</Label>
                    <div className="flex items-center gap-3">
                      <RadioGroup
                        value={rate.rate_type}
                        onValueChange={(v) => updateRateType(rate.job_type, v as "flat" | "percentage")}
                        className="flex gap-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="flat" id={`${rate.job_type}-flat`} />
                          <Label htmlFor={`${rate.job_type}-flat`} className="text-xs cursor-pointer flex items-center gap-0.5">
                            <DollarSign className="h-3 w-3" /> Flat
                          </Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="percentage" id={`${rate.job_type}-pct`} />
                          <Label htmlFor={`${rate.job_type}-pct`} className="text-xs cursor-pointer flex items-center gap-0.5">
                            <Percent className="h-3 w-3" /> % of Job
                          </Label>
                        </div>
                      </RadioGroup>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          {rate.rate_type === "flat" ? "$" : "%"}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step={rate.rate_type === "flat" ? 5 : 0.5}
                          value={rate.rate}
                          onChange={e => updateRate(rate.job_type, e.target.value)}
                          className="pl-7"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Rates"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Add employees first</p>
        )}
      </CardContent>
    </Card>
  );
}
