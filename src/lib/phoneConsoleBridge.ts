import { isElectronMain, sendDialToPopout, sendToMain } from "@/lib/electron";

const PHONE_CHANNEL_NAME = "ultraoffice-phone-console";
export const PHONE_CONSOLE_OPEN_EVENT = "ultraoffice:open-phone-console";
export const NATIVE_PHONE_DIAL_EVENT = "ultraoffice:native-phone-dial";

export type PhoneConsoleOpenDetail = {
  url: string;
  number?: string;
  context?: { contactName?: string; jobId?: string; customerId?: string; autoDial?: boolean };
};

export type PhoneConsoleMessage =
  | { type: "dial"; number: string; contactName?: string; jobId?: string; customerId?: string; autoDial?: boolean }
  | {
      type: "status";
      status: string;
      error?: string | null;
      callerInfo?: { number?: string | null; name?: string | null } | null;
      callDuration?: number;
      isMuted?: boolean;
    }
  | { type: "command"; command: "accept" | "reject" | "hangUp" | "toggleMute" | "sendDigit"; digit?: string };

export function createPhoneConsoleChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return null;
  return new BroadcastChannel(PHONE_CHANNEL_NAME);
}

function isNativeCapacitorShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean((window as any).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function openPhoneConsole(
  number?: string,
  context?: { contactName?: string; jobId?: string; customerId?: string; autoDial?: boolean }
) {
  if (isElectronMain()) {
    if (number) {
      sendDialToPopout(number, context?.contactName, context?.jobId, context?.customerId);
      return;
    }

    sendToMain("ensure-phone-window");
    return;
  }

  if (isNativeCapacitorShell()) {
    // CAPACITOR DIAL FIX (2026-05-03):
    // The previous implementation navigated to `/phone?phone=...` after dispatching
    // the dial event. That caused two problems:
    //  1) The MobileShell listener only staged the number into the input field
    //     (setDialNumber) — it never actually invoked softphone.dial(). So tapping
    //     the call button bounced the number through the URL and back into the
    //     dialpad without ever placing the call. Both Clint and Jonathan reported
    //     this as "Twilio is not working on the capacitor."
    //  2) The route hop (/communications → /phone) was disorienting since the
    //     active-call banner is rendered globally by MobileShell anyway.
    // Fix: dispatch the dial event ONLY. The MobileShell listener now calls
    // softphone.dial() directly with full context. No navigation needed because
    // the in-progress UI is in MobileShell's global banner.
    if (number) {
      window.dispatchEvent(new CustomEvent(NATIVE_PHONE_DIAL_EVENT, {
        detail: { number, context },
      }));
      return;
    }

    // No number provided — caller just wants the phone screen open. Navigate to
    // /phone (CallsPage) so the dialpad is visible. Skip if already on a phone
    // surface to avoid pointless re-renders.
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path !== "/phone" && path !== "/communications") {
        window.location.assign("/phone");
      }
    }
    return;
  }

  const params = new URLSearchParams();
  params.set("view", "softphone");
  if (number) params.set("dial", number);
  if (context?.contactName) params.set("name", context.contactName);
  if (context?.jobId) params.set("jobId", context.jobId);
  if (context?.customerId) params.set("customerId", context.customerId);
  if (number && context?.autoDial === true) params.set("autoDial", "1");
  const url = `/?${params.toString()}`;

  const openEvent = new CustomEvent<PhoneConsoleOpenDetail>(PHONE_CONSOLE_OPEN_EVENT, {
    cancelable: true,
    detail: { url, number, context },
  });

  const sendDial = () => {
    if (!number) return;
    const channel = createPhoneConsoleChannel();
    channel?.postMessage({
      type: "dial",
      number,
      contactName: context?.contactName,
      jobId: context?.jobId,
      customerId: context?.customerId,
      autoDial: context?.autoDial === true,
    } satisfies PhoneConsoleMessage);
    channel?.close();
  };

  const shouldFallbackToWindow = window.dispatchEvent(openEvent);
  if (number) {
    window.setTimeout(sendDial, 400);
    window.setTimeout(sendDial, 1200);
  }
  if (!shouldFallbackToWindow) return;

  const win = window.open(url, "UltraOfficePhone", "width=420,height=720");
  if (win) {
    win.focus();
  } else {
    window.location.assign(url);
  }
}
