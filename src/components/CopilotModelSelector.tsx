import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export type ModelOption = {
  id: string;
  label: string;
  description: string;
};

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "gpt-5-mini", label: "GPT-5 Mini", description: "Default: fast, strong, cost-aware" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", description: "Lowest-cost simple drafting" },
  { id: "gpt-5", label: "GPT-5", description: "Higher reasoning for complex tasks" },
  { id: "gpt-5.2", label: "GPT-5.2", description: "Premium reasoning for hard cases" },
];

const VALID_MODEL_IDS = new Set(MODEL_OPTIONS.map(m => m.id));

/** Get the selected copilot_chat model — used by CopilotChatPanel to pick the model for API calls */
export function getSelectedModel(): string {
  try {
    const cached = localStorage.getItem("copilot_model_cache");
    if (cached && VALID_MODEL_IDS.has(cached)) return cached;
    // Clear stale/invalid model from cache
    if (cached) localStorage.removeItem("copilot_model_cache");
  } catch {
    // localStorage may be unavailable in private or embedded contexts.
  }
  return "gpt-5-mini";
}

export function CopilotModelSelector() {
  const { preferred_model, setPreferredModel } = useUserPreferences();

  // Keep a localStorage cache for the synchronous getSelectedModel() getter
  useEffect(() => {
    try {
      localStorage.setItem("copilot_model_cache", preferred_model);
    } catch {
      // localStorage may be unavailable in private or embedded contexts.
    }
  }, [preferred_model]);

  const selected = MODEL_OPTIONS.find((m) => m.id === preferred_model);

  const handleChange = (value: string) => {
    setPreferredModel(value);
    const opt = MODEL_OPTIONS.find((m) => m.id === value);
    toast({
      title: "Model updated",
      description: `Copilot will now use ${opt?.label || value}`,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          Copilot AI Model
        </CardTitle>
        <CardDescription className="text-xs">
          Choose which AI model powers the copilot.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={preferred_model} onValueChange={handleChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span className="text-sm">{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <p className="text-xs text-muted-foreground">
            Currently using: <strong>{selected.label}</strong> — {selected.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
