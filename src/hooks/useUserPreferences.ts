import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserPreferences {
  preferred_model: string;
  jarvis_enabled: boolean;
  copilot_position: { x: number; y: number } | null;
  calendar_settings: Record<string, unknown> | null;
}

const DEFAULTS: UserPreferences = {
  preferred_model: "gpt-5-mini",
  jarvis_enabled: false,
  copilot_position: null,
  calendar_settings: null,
};

export function useUserPreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const { data: prefs = DEFAULTS } = useQuery({
    queryKey: ["user-preferences", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferred_model, jarvis_enabled, copilot_position, calendar_settings")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return {
        preferred_model: (data as any)?.preferred_model ?? DEFAULTS.preferred_model,
        jarvis_enabled: (data as any)?.jarvis_enabled ?? DEFAULTS.jarvis_enabled,
        copilot_position: (data as any)?.copilot_position ?? DEFAULTS.copilot_position,
        calendar_settings: (data as any)?.calendar_settings ?? DEFAULTS.calendar_settings,
      } as UserPreferences;
    },
  });

  const updatePref = useMutation({
    mutationFn: async (patch: Partial<UserPreferences>) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        .update(patch as any)
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-preferences", userId] }),
  });

  const setPreferredModel = (model: string) => updatePref.mutate({ preferred_model: model });
  const setJarvisEnabled = (enabled: boolean) => updatePref.mutate({ jarvis_enabled: enabled });
  const setCopilotPosition = (pos: { x: number; y: number }) => updatePref.mutate({ copilot_position: pos });
  const setCalendarSettings = (settings: Record<string, unknown>) => updatePref.mutate({ calendar_settings: settings });

  return {
    ...prefs,
    setPreferredModel,
    setJarvisEnabled,
    setCopilotPosition,
    setCalendarSettings,
    isUpdating: updatePref.isPending,
  };
}
