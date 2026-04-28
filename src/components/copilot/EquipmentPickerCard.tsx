import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Check, Loader2 } from "lucide-react";

type Step = "brand" | "tonnage" | "system_type" | "location" | "tier";

const STEP_ORDER: Step[] = ["brand", "tonnage", "system_type", "location", "tier"];

const STEP_LABELS: Record<Step, string> = {
  brand: "Brand",
  tonnage: "Tonnage",
  system_type: "System Type",
  location: "Install Location",
  tier: "Tier",
};

const STEP_QUESTIONS: Record<Step, string> = {
  brand: "Which brand?",
  tonnage: "What tonnage?",
  system_type: "What system type?",
  location: "Where is the install?",
  tier: "Which tier?",
};

const LOCATION_OPTIONS = [
  { label: "Attic", value: "Attic", orientation: "Horizontal" },
  { label: "Closet", value: "Closet", orientation: "Vertical" },
  { label: "Crawlspace", value: "Crawlspace", orientation: "Horizontal" },
];

const SYSTEM_TYPE_DISPLAY: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Electric",
  dual_fuel: "Dual Fuel",
};

interface EquipmentPickerCardProps {
  initialOptions?: string[];
  onComplete: (summary: string) => void;
  disabled?: boolean;
}

export function EquipmentPickerCard({ initialOptions, onComplete, disabled }: EquipmentPickerCardProps) {
  const [selections, setSelections] = useState<Partial<Record<Step, string>>>({});
  const [currentStep, setCurrentStep] = useState<Step>("brand");
  const [options, setOptions] = useState<string[]>(initialOptions || []);
  const [loading, setLoading] = useState(!initialOptions?.length);
  const [completed, setCompleted] = useState(false);

  // Load initial brand options if not provided
  useEffect(() => {
    if (initialOptions?.length) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("equipment_matchups" as any)
        .select("brand")
        .order("brand");
      const brands = [...new Set((data || []).map((d: any) => d.brand).filter(Boolean))] as string[];
      setOptions(brands);
      setLoading(false);
    })();
  }, [initialOptions?.length]);

  const handleSelect = async (value: string) => {
    if (disabled || completed) return;

    const newSelections = { ...selections, [currentStep]: value };
    setSelections(newSelections);

    const stepIdx = STEP_ORDER.indexOf(currentStep);
    if (stepIdx >= STEP_ORDER.length - 1) {
      // All done
      setCompleted(true);
      const loc = LOCATION_OPTIONS.find(l => l.value === newSelections.location);
      const orientationNote = loc ? ` (${loc.orientation})` : "";
      const sysDisplay = SYSTEM_TYPE_DISPLAY[newSelections.system_type || ""] || newSelections.system_type;
      const summary = `Equipment selection: ${newSelections.brand} / ${newSelections.tonnage} Ton / ${sysDisplay} / ${newSelections.location}${orientationNote} / ${newSelections.tier}`;
      onComplete(summary);
      return;
    }

    const nextStep = STEP_ORDER[stepIdx + 1];
    setCurrentStep(nextStep);
    setLoading(true);

    if (nextStep === "location") {
      setOptions(LOCATION_OPTIONS.map(l => l.label));
      setLoading(false);
      return;
    }

    // Query equipment_matchups for next step options
    let query = supabase
      .from("equipment_matchups" as any)
      .select(nextStep === "tonnage" ? "tonnage" : nextStep === "system_type" ? "system_type" : "tier");

    if (newSelections.brand) query = query.eq("brand", newSelections.brand);
    if (newSelections.tonnage) query = query.eq("tonnage", Number(newSelections.tonnage));
    if (newSelections.system_type) query = query.ilike("system_type", `%${newSelections.system_type}%`);

    const { data } = await query;

    const field = nextStep === "tonnage" ? "tonnage" : nextStep === "system_type" ? "system_type" : "tier";
    let vals = [...new Set((data || []).map((d: any) => d[field]).filter(Boolean))] as (string | number)[];

    if (nextStep === "tonnage") {
      vals = (vals as number[]).sort((a, b) => a - b);
      setOptions(vals.map(v => String(v)));
    } else if (nextStep === "system_type") {
      setOptions(vals.map(v => String(v)));
    } else if (nextStep === "tier") {
      const tierOrder = ["Value", "Value Plus", "Good", "Better", "Best", "Ultimate"];
      vals = (vals as string[]).sort((a, b) => tierOrder.indexOf(a) - tierOrder.indexOf(b));
      setOptions(vals as string[]);
    } else {
      setOptions(vals.map(v => String(v)));
    }

    setLoading(false);
  };

  return (
    <Card className="border-l-4 border-l-primary bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Wrench className="h-4 w-4 text-primary" />
        Equipment Setup
      </div>

      {/* Locked selections */}
      <div className="flex flex-wrap gap-2">
        {STEP_ORDER.map(step => {
          const val = selections[step];
          if (!val) return null;
          const display = step === "system_type" ? (SYSTEM_TYPE_DISPLAY[val] || val) : step === "tonnage" ? `${val} Ton` : val;
          return (
            <Badge key={step} variant="secondary" className="gap-1 text-xs">
              <Check className="h-3 w-3" />
              {STEP_LABELS[step]}: {display}
            </Badge>
          );
        })}
      </div>

      {/* Current step */}
      {!completed && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{STEP_QUESTIONS[currentStep]}</p>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="text-xs">Loading options...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {options.map(opt => {
                const display = currentStep === "system_type" ? (SYSTEM_TYPE_DISPLAY[opt] || opt) : currentStep === "tonnage" ? `${opt} Ton` : opt;
                return (
                  <Button
                    key={opt}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-primary/25 text-primary hover:bg-primary/10"
                    onClick={() => handleSelect(opt)}
                    disabled={disabled}
                  >
                    {display}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {completed && (
        <p className="text-xs text-muted-foreground">✓ Selection complete</p>
      )}
    </Card>
  );
}
