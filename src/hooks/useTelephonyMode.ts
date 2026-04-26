/**
 * useTelephonyMode — Single source of truth for the phone/SMS handoff switch.
 *
 * When `telephony_handoff_enabled === "true"`, every phone & SMS surface in this
 * app should defer to Ultraphone (a.k.a. Office Connect). This hook returns the
 * current mode plus helpers that build the right Ultraphone native deep links.
 *
 * The actual "do the handoff" call sites live in ClickToCall, SmsButton,
 * SoftphoneProvider, copilot actions, push notification handlers, etc.
 *
 * Reads from `company_settings`:
 *   - telephony_handoff_enabled  ("true" | "false")
 *   - telephony_handoff_url      (kept for admin config compatibility)
 *
 * Realtime invalidation comes for free via useCompanySettings.
 */
import { useCallback, useMemo } from "react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toE164 } from "@/lib/formatters";
import { isElectron, sendToMain } from "@/lib/electron";
import { useCapacitor } from "@/hooks/useCapacitor";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_WEB_URL = "https://ultraphone.lovable.app";
const DEFAULT_APP_URL = "ultraphone://";
const TELEPHONY_ROUTES = {
  calls: "/calls",
  sms: "/sms",
  phone: "/calls",
  voicemail: "/calls?tab=voicemail",
  home: "/calls",
} as const;

export type TelephonyMode = "in-app" | "office-connect";
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

function openNativeLink(url: string) {
  try {
    window.location.assign(url);
  } catch {
    window.location.href = url;
  }
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function isCustomSchemeUrl(url: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !isHttpUrl(url);
}

function joinWebUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function joinAppUrl(baseUrl: string, path: string) {
  const normalizedPath = path.replace(/^\//, "");
  if (baseUrl.endsWith("://")) return `${baseUrl}${normalizedPath}`;
  return `${baseUrl.replace(/\/$/, "")}/${normalizedPath}`;
}

function resolveLaunchTargets(configuredBaseUrl: string, path: string) {
  const trimmedBaseUrl = configuredBaseUrl.trim();
  const webBaseUrl = isHttpUrl(trimmedBaseUrl) ? trimmedBaseUrl : DEFAULT_WEB_URL;
  const appBaseUrl = isCustomSchemeUrl(trimmedBaseUrl) ? trimmedBaseUrl : DEFAULT_APP_URL;
  return {
    webUrl: joinWebUrl(webBaseUrl, path),
    appUrl: joinAppUrl(appBaseUrl, path),
    prefersWebOnBrowser: isHttpUrl(trimmedBaseUrl),
  };
}

async function traceTelephonyEvent(event_kind: string, summary: string, reason?: string, metadata: Record<string, unknown> = {}) {
  try {
    await supabase.rpc("log_system_trace", {
      p_source_type: "voice",
      p_source_name: "telephony_handoff",
      p_event_kind: event_kind,
      p_summary: summary,
      p_reason: reason ?? null,
      p_severity: "info",
      p_trace_group: "telephony_handoff",
      p_metadata: metadata,
    } as any);
  } catch {
    // tracing must never block user actions
  }
}

export function useTelephonyMode() {
  const { isNative, platform } = useCapacitor();
  // useCompanySettings types `telephony_handoff_*` loosely — read defensively.
  const { settings } = useCompanySettings();
  const enabledRaw = (settings as any)?.telephony_handoff_enabled;
  const urlRaw = (settings as any)?.telephony_handoff_url;

  const enabled = enabledRaw === "true" || enabledRaw === true;
  const baseUrl = (typeof urlRaw === "string" && urlRaw.trim()) || DEFAULT_WEB_URL;
  const mode: TelephonyMode = enabled ? "office-connect" : "in-app";

  const getLaunchTargets = useCallback((path: string): LaunchTargets => {
    return resolveLaunchTargets(baseUrl, path);
  }, [baseUrl]);

  const getSurfaceLaunchTargets = useCallback((surface: TelephonySurface): LaunchTargets => {
    return getLaunchTargets(TELEPHONY_ROUTES[surface]);
  }, [getLaunchTargets]);

  const launchTarget = useCallback(async (path: string, metadata: Record<string, unknown>) => {
    const { appUrl, webUrl, prefersWebOnBrowser } = getLaunchTargets(path);
    const targetPlatform = isElectron() ? "electron" : isNative ? platform : "web";

    await traceTelephonyEvent(
      "handoff_launch_requested",
      `Launching Ultraphone on ${targetPlatform}`,
      "Handoff enabled",
      { ...metadata, platform: targetPlatform, appUrl, webUrl, configuredBaseUrl: baseUrl }
    );

    if (isElectron()) {
      sendToMain("launch-ultraphone", { appUrl, webUrl, metadata: { ...metadata, platform: targetPlatform } });
      await traceTelephonyEvent(
        "handoff_launch_sent",
        "Sent launch request to Electron",
        "Native deep link",
        { ...metadata, platform: targetPlatform, target: "electron-main", appUrl, webUrl }
      );
      return;
    }

    if (isNative) {
      window.location.href = appUrl;
      await traceTelephonyEvent(
        "handoff_launch_sent",
        `Sent launch request to ${platform}`,
        "Native app deep link",
        { ...metadata, platform: targetPlatform, target: "native-deeplink", appUrl, webUrl }
      );
      return;
    }

    if (prefersWebOnBrowser) openNativeLink(webUrl);
    else openNativeLink(appUrl);
    await traceTelephonyEvent(
      "handoff_launch_sent",
      prefersWebOnBrowser ? "Opened Ultraphone web experience from browser" : "Sent launch request to native app from browser",
      prefersWebOnBrowser ? "Configured web handoff URL" : "Native deep link",
      { ...metadata, platform: targetPlatform, target: prefersWebOnBrowser ? "web-handoff" : "native-deeplink", appUrl, webUrl }
    );
  }, [baseUrl, getLaunchTargets, isNative, platform]);

  const openCall = useCallback(
    async (phone: string, opts: OpenCallOptions = {}) => {
      const e164 = toE164(phone) || phone;
      const params = new URLSearchParams({ to: e164, autodial: "1" });
      if (opts.jobId) params.set("job", opts.jobId);
      if (opts.customerId) params.set("customer", opts.customerId);
      const path = `/dial?${params.toString()}`;
      await launchTarget(path, { action: "call", phone: e164, ...opts });
    },
    [launchTarget]
  );

  const openSms = useCallback(
    async (phone: string, opts: OpenSmsOptions = {}) => {
      const e164 = toE164(phone) || phone;
      const search = opts.draft ? `?draft=${encodeURIComponent(opts.draft)}` : "";
      const path = `/messages/${encodeURIComponent(e164)}${search}`;
      await launchTarget(path, { action: "sms", phone: e164, draft: opts.draft ?? null });
    },
    [launchTarget]
  );

  const openNewSms = useCallback(
    async (phone?: string) => {
      const params = new URLSearchParams();
      if (phone) {
        const e164 = toE164(phone) || phone;
        params.set("phone", e164);
      }
      const qs = params.toString();
      const path = `/messages/new${qs ? `?${qs}` : ""}`;
      await launchTarget(path, { action: "new_sms", phone: phone ?? null });
    },
    [launchTarget]
  );

  const openMessages = useCallback(() => {
    void launchTarget("/messages", { action: "messages" });
  }, [launchTarget]);

  const openVoicemail = useCallback(() => {
    void launchTarget("/voicemail", { action: "voicemail" });
  }, [launchTarget]);

  const openCallHistory = useCallback(() => {
    void launchTarget("/calls", { action: "call_history" });
  }, [launchTarget]);

  const openHome = useCallback(() => {
    void launchTarget("/home", { action: "home" });
  }, [launchTarget]);

  return useMemo(
    () => ({
      mode,
      enabled,
      url: baseUrl,
      isHandoff: enabled,
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
    [mode, enabled, baseUrl, getLaunchTargets, getSurfaceLaunchTargets, openCall, openSms, openNewSms, openMessages, openVoicemail, openCallHistory, openHome]
  );
}
