/**
 * useTelephonyMode
 *
 * Legacy external telephony handoff has been retired. UltraOffice owns live
 * calls, SMS, voicemail, IVR, and call history directly.
 */
import { useCallback, useMemo } from "react";
import { toE164 } from "@/lib/formatters";

const TELEPHONY_ROUTES = {
  calls: "/phone",
  sms: "/sms",
  phone: "/phone",
  voicemail: "/phone?tab=voicemail",
  home: "/phone",
} as const;

export type TelephonyMode = "in-app";
export type TelephonySurface = keyof typeof TELEPHONY_ROUTES;

export interface LaunchTargets {
  appUrl: string;
  webUrl: string;
  prefersWebOnBrowser: boolean;
}

export interface OpenCallOptions {
  contactName?: string;
  jobId?: string;
  customerId?: string;
}

export interface OpenSmsOptions {
  draft?: string;
}

function toAppUrl(path: string) {
  return `${window.location.origin}${path}`;
}

export function useTelephonyMode() {
  const enabled = false;
  const mode: TelephonyMode = "in-app";
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const getLaunchTargets = useCallback((path: string): LaunchTargets => {
    const url = toAppUrl(path);
    return { appUrl: url, webUrl: url, prefersWebOnBrowser: true };
  }, []);

  const getSurfaceLaunchTargets = useCallback((surface: TelephonySurface): LaunchTargets => {
    return getLaunchTargets(TELEPHONY_ROUTES[surface]);
  }, [getLaunchTargets]);

  const launchTarget = useCallback(async (path: string) => {
    window.location.assign(path);
  }, []);

  const openCall = useCallback(
    async (phone: string, opts: OpenCallOptions = {}) => {
      const e164 = toE164(phone) || phone;
      const params = new URLSearchParams({ to: e164, autodial: "1" });
      if (opts.jobId) params.set("job", opts.jobId);
      if (opts.customerId) params.set("customer", opts.customerId);
      await launchTarget(`/phone?${params.toString()}`);
    },
    [launchTarget],
  );

  const openSms = useCallback(
    async (phone: string, opts: OpenSmsOptions = {}) => {
      const e164 = toE164(phone) || phone;
      const params = new URLSearchParams({ phone: e164 });
      if (opts.draft) params.set("draft", opts.draft);
      await launchTarget(`/sms?${params.toString()}`);
    },
    [launchTarget],
  );

  const openNewSms = useCallback(
    async (phone?: string) => {
      const params = new URLSearchParams();
      if (phone) params.set("phone", toE164(phone) || phone);
      const qs = params.toString();
      await launchTarget(`/sms${qs ? `?${qs}` : ""}`);
    },
    [launchTarget],
  );

  const openMessages = useCallback(() => {
    void launchTarget("/sms");
  }, [launchTarget]);

  const openVoicemail = useCallback(() => {
    void launchTarget("/phone?tab=voicemail");
  }, [launchTarget]);

  const openCallHistory = useCallback(() => {
    void launchTarget("/phone");
  }, [launchTarget]);

  const openHome = useCallback(() => {
    void launchTarget("/phone");
  }, [launchTarget]);

  return useMemo(
    () => ({
      mode,
      enabled,
      url: baseUrl,
      isHandoff: false,
      routes: TELEPHONY_ROUTES,
      getLaunchTargets,
      getSurfaceLaunchTargets,
      openCall,
      openSms,
      openNewSms,
      openMessages,
      openVoicemail,
      openCallHistory,
      openHome,
    }),
    [baseUrl, getLaunchTargets, getSurfaceLaunchTargets, openCall, openSms, openNewSms, openMessages, openVoicemail, openCallHistory, openHome],
  );
}
