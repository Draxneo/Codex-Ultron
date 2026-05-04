/**
 * useTelephonyMode
 *
 * Legacy external telephony handoff has been retired. UltraOffice owns live
 * calls, SMS, voicemail, IVR, and call history directly.
 */
import { useCallback, useMemo } from "react";
import { toE164 } from "@/lib/formatters";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { openSmsComposer } from "@/lib/smsComposerBridge";

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
      openPhoneConsole(e164, {
        contactName: opts.contactName,
        jobId: opts.jobId,
        customerId: opts.customerId,
        autoDial: false,
      });
    },
    [],
  );

  const openSms = useCallback(
    async (phone: string, opts: OpenSmsOptions = {}) => {
      const e164 = toE164(phone) || phone;
      openSmsComposer(e164, { draft: opts.draft });
    },
    [],
  );

  const openNewSms = useCallback(
    async (phone?: string) => {
      openSmsComposer(phone ? toE164(phone) || phone : undefined);
    },
    [],
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
    [baseUrl, enabled, getLaunchTargets, getSurfaceLaunchTargets, openCall, openSms, openNewSms, openMessages, openVoicemail, openCallHistory, openHome],
  );
}
