/**
 * useCompanySettings.ts — Global company settings (key-value store)
 * 
 * The company_settings table is a simple key-value store where each row
 * has a `key` and `value`. This hook loads all settings into a typed object
 * and provides a mutation to update any subset of them.
 * 
 * WHAT'S STORED HERE:
 * - Company info: name, phone, email, address, TACLA license number
 * - CPS Energy CIN (for rebate submissions)
 * - Testing mode: human_in_the_loop flag (when "true", all outbound messages queue for approval)
 * - SMS whitelist: sms_test_numbers (optional safety net during testing)
 * - Live transcription toggle: live_transcription_enabled
 * - System prompt: The entire AI Copilot system prompt (stored as a single large value)
 * 
 * USED BY:
 * - CompanySettingsCard (settings page)
 * - HumanInTheLoopCard (testing mode toggle)
 * - ai-task-agent (reads system_prompt at runtime)
 * - CpsRebateForm (reads company info for rebate forms)
 * - Various edge functions that need company phone/email
 */

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_COMPANY_NAME, DEFAULT_COMPANY_TAGLINE } from "@/lib/companyDefaults";

export interface CompanySettings {
  company_name: string;
  contact_name: string;
  company_phone: string;
  company_email: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  tacla_number: string;
  cps_cin: string;
  live_transcription_enabled: string;
  sms_test_numbers: string;
  /** "true" = testing mode (all outbound messages queue for approval) */
  human_in_the_loop: string;
  /** Emergency service call-out fee display text */
  emergency_fee: string;
  /** Default tax rate for invoicing (e.g. "8.25") */
  tax_rate: string;
  /** Max jobs per tech per day */
  max_jobs_tech: string;
  /** Max jobs per sales rep per day */
  max_jobs_sales: string;
  /** IVR test mode — bypass greeting, ring direct to softphone */
  ivr_test_mode: string;
  /** Post-call auto SMS enabled */
  post_call_sms_enabled: string;
  /** Post-call SMS template for existing customers */
  post_call_sms_customer: string;
  post_call_sms_customer_template_key: string;
  /** Post-call SMS template for unknown/new callers */
  post_call_sms_unknown: string;
  post_call_sms_unknown_template_key: string;
  /** Phone number for JARVIS approval alerts */
  jarvis_alert_phone: string;
  /** SMS alert forwarding enabled flag */
  sms_alert_enabled: string;
  /** SMS response delay in seconds (simulates human typing speed) */
  sms_response_delay_seconds: string;
  /** Stall detection thresholds (hours) */
  stall_threshold_tech_hours: string;
  stall_threshold_office_hours: string;
  stall_threshold_customer_hours: string;
  /** Owner name for warm handoff messages */
  owner_name: string;
  /** SMS test mode — employees go through intake flow like customers */
  sms_test_mode: string;
  /** Email domain for employee aliases (e.g. "carnesandsons.com") */
  email_domain: string;
  /** Company tagline for brochures/presentations */
  company_tagline: string;
  /** AI SMS auto-draft — when "false", JARVIS won't draft replies to customer texts */
  ai_sms_auto_draft: string;
  /** Max daily JARVIS SMS alerts before auto-capping (default 50) */
  jarvis_max_daily_alerts: string;
  /** Universal missed-call SMS — master toggle ("true"/"false") */
  missed_call_sms_enabled: string;
  /** Missed-call template used during business hours */
  missed_call_sms_during_hours: string;
  missed_call_sms_during_hours_template_key: string;
  /** Missed-call template used outside business hours */
  missed_call_sms_after_hours: string;
  missed_call_sms_after_hours_template_key: string;
}

/** Default values — used when a key doesn't exist in the database yet */
const DEFAULTS: CompanySettings = {
  company_name: DEFAULT_COMPANY_NAME,
  contact_name: "",
  company_phone: "",
  company_email: "",
  company_address: "",
  company_city: "San Antonio",
  company_state: "TX",
  company_zip: "",
  tacla_number: "",
  cps_cin: "",
  live_transcription_enabled: "false",
  sms_test_numbers: "",
  human_in_the_loop: "true", // Default ON for safety during rollout
  emergency_fee: "$99",
  tax_rate: "8.25",
  max_jobs_tech: "4",
  max_jobs_sales: "8",
  ivr_test_mode: "false",
  post_call_sms_enabled: "false",
  post_call_sms_customer: "",
  post_call_sms_customer_template_key: "",
  post_call_sms_unknown: "",
  post_call_sms_unknown_template_key: "",
  jarvis_alert_phone: "",
  sms_alert_enabled: "true",
  sms_response_delay_seconds: "8",
  stall_threshold_tech_hours: "3",
  stall_threshold_office_hours: "24",
  stall_threshold_customer_hours: "48",
  owner_name: "",
  sms_test_mode: "false",
  email_domain: "",
  company_tagline: DEFAULT_COMPANY_TAGLINE,
  ai_sms_auto_draft: "true",
  jarvis_max_daily_alerts: "50",
  missed_call_sms_enabled: "true",
  missed_call_sms_during_hours: "Hi, sorry we missed you. This is {{company_name}}, and we'll call you back as soon as we can. Need us sooner? Text us here with your name, service address, and what is going on.",
  missed_call_sms_during_hours_template_key: "",
  missed_call_sms_after_hours: "Hi, thanks for calling {{company_name}}. Our office is closed right now, but you can text us here with your name, service address, and what is going on. For emergencies, text EMERGENCY and our team will follow up as quickly as we can.",
  missed_call_sms_after_hours_template_key: "",
};

export function useCompanySettings() {
  const queryClient = useQueryClient();

  // Fetch all settings rows and merge into a single typed object
  const query = useQuery({
    queryKey: ["company_settings"],
    staleTime: 30 * 60 * 1000, // 30 min — settings change rarely
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings" as any)
        .select("key, value");
      if (error) throw error;
      // Start with defaults, overlay with any DB values
      const settings = { ...DEFAULTS };
      for (const row of (data as any[]) || []) {
        if (row.key in settings) {
          (settings as any)[row.key] = row.value;
        }
      }
      return settings;
    },
  });

  useEffect(() => {
    const channelName = `company_settings_sync_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "company_settings" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["company_settings"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Upsert one or more settings at once
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<CompanySettings>) => {
      const entries = Object.entries(updates);
      for (const [key, value] of entries) {
        const { error } = await supabase
          .from("company_settings" as any)
          .upsert(
            { key, value: value || "", updated_at: new Date().toISOString() } as any,
            { onConflict: "key" }
          );
        if (error) throw error;
      }
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["company_settings"] });
      const previous = queryClient.getQueryData<CompanySettings>(["company_settings"]);
      queryClient.setQueryData<CompanySettings>(["company_settings"], (old) => ({
        ...(old || DEFAULTS),
        ...updates,
      }));
      return { previous };
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["company_settings"], context.previous);
      }
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Company settings saved" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    },
  });

  return {
    settings: query.data || DEFAULTS,
    isLoading: query.isLoading,
    updateSettings,
  };
}
