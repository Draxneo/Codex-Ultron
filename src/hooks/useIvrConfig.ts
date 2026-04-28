import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type IvrConfig = {
  id: string;
  greeting_text: string;
  hold_music_audio_url: string | null;
  after_hours_greeting: string;
  voicemail_greeting: string;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  timezone: string;
  voicemail_enabled: boolean;
  ring_timeout_seconds: number;
  greeting_audio_url: string | null;
  after_hours_audio_url: string | null;
  voicemail_audio_url: string | null;
  after_hours_forward_number: string | null;
  after_hours_caller_id_mode: string;
  // 24/7 Answering Service overflow
  answering_service_enabled: boolean;
  answering_service_number: string | null;
  answering_service_label: string | null;
  overflow_on_busy: boolean;
  overflow_on_no_answer: boolean;
  overflow_after_hours: boolean;
  overflow_ring_seconds_before_handoff: number;
  overflow_after_hours_skip_voicemail: boolean;
};

export type IvrMenuOption = {
  id: string;
  digit: string;
  label: string;
  action_type: string;
  forward_to: string;
  sort_order: number;
  is_active: boolean;
  dept_hours_start: string | null;
  dept_hours_end: string | null;
  dept_business_days: number[] | null;
  dept_sat_hours_start: string | null;
  dept_sat_hours_end: string | null;
  dept_after_hours_greeting: string | null;
  dept_after_hours_audio_url: string | null;
  dept_after_hours_sms: string | null;
  dept_after_hours_sms_template_key: string | null;
  dept_missed_call_sms: string | null;
  dept_missed_call_sms_template_key: string | null;
  dept_vm_greeting: string | null;
  dept_vm_audio_url: string | null;
  assigned_user_ids: string[] | null;
  dept_missed_call_sms_enabled: boolean;
  dept_after_hours_sms_enabled: boolean;
  dept_no_vm_missed_call_sms: string | null;
  dept_no_vm_missed_call_sms_enabled: boolean;
  dept_post_call_sms: string | null;
  dept_post_call_sms_enabled: boolean;
  inbound_route_mode?: string;
  ring_strategy?: string;
  ring_timeout_seconds?: number | null;
};

export function useIvrConfig() {
  const [config, setConfig] = useState<IvrConfig | null>(null);
  const [menuOptions, setMenuOptions] = useState<IvrMenuOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [configRes, menuRes] = await Promise.all([
      supabase.from("ivr_config").select("*").order("created_at").limit(1).single(),
      supabase.from("ivr_menu_options").select("*").order("digit"),
    ]);

    if (configRes.error) {
      console.error("IVR config fetch error:", configRes.error);
    }
    if (menuRes.error) {
      console.error("IVR menu fetch error:", menuRes.error);
    }

    if (configRes.data) setConfig(configRes.data as any);
    if (menuRes.data) setMenuOptions(menuRes.data as any[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateConfig = async (updates: Partial<IvrConfig>) => {
    if (!config) return;
    const { error } = await supabase
      .from("ivr_config")
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", config.id);
    if (error) {
      console.error("IVR config update error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setConfig((prev) => prev ? { ...prev, ...updates } : prev);
      toast({ title: "Saved", description: "IVR config updated" });
    }
  };

  const upsertMenuOption = async (option: Partial<IvrMenuOption> & { digit: string }, silent?: boolean) => {
    const existing = menuOptions.find((o) => o.digit === option.digit);
    if (existing) {
      const { digit, ...updateFields } = option;
      // Optimistic update first for instant UI
      setMenuOptions((prev) =>
        prev.map((o) => o.id === existing.id ? { ...o, ...updateFields } : o)
      );
      const { error } = await supabase
        .from("ivr_menu_options")
        .update({ ...updateFields, updated_at: new Date().toISOString() } as any)
        .eq("id", existing.id);
      if (error) {
        console.error("IVR menu option update error:", error);
        toast({ title: "Error updating department", description: error.message, variant: "destructive" });
        return;
      }
      if (!silent) toast({ title: "Saved", description: `Department "${existing.label}" updated` });
    } else {
      const { data, error } = await supabase
        .from("ivr_menu_options")
        .insert({
          digit: option.digit,
          label: option.label || "",
          action_type: option.action_type || "forward_client",
          forward_to: option.forward_to || "",
          sort_order: option.sort_order ?? menuOptions.length,
          is_active: option.is_active ?? true,
        } as any)
        .select()
        .single();

      if (error) {
        console.error("IVR menu option insert error:", error);
        if (error.code === "23505") {
          toast({ title: "Duplicate digit", description: `Key "${option.digit}" is already assigned.`, variant: "destructive" });
        } else {
          toast({ title: "Error adding department", description: error.message, variant: "destructive" });
        }
        return;
      }
      if (data) {
        setMenuOptions((prev) => [...prev, data as any]);
        toast({ title: "Added", description: `Department "${option.label}" added` });
      }
    }
  };

  const deleteMenuOption = async (id: string) => {
    const { error } = await supabase.from("ivr_menu_options").delete().eq("id", id);
    if (error) {
      console.error("IVR menu option delete error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setMenuOptions((prev) => prev.filter((o) => o.id !== id));
    toast({ title: "Deleted", description: "Department removed" });
  };

  return { config, menuOptions, loading, updateConfig, upsertMenuOption, deleteMenuOption, refetch: fetchAll };
}
