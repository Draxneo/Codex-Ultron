import { useEffect, useCallback, useRef } from "react";
import { isElectron, isElectronPopout, showElectronToast } from "@/lib/electron";
import { toast } from "@/hooks/use-toast";
import { playSmsAlert } from "@/lib/softphoneAudio";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { supabase } from "@/integrations/supabase/client";
import { useIsOnCall } from "@/hooks/useIsOnCall";
import { isHostedBuilderPreview } from "@/lib/devPreview";

export function useDesktopNotifications() {
  const { isNative } = useCapacitor();
  const isOnCall = useIsOnCall();
  const isOnCallRef = useRef(isOnCall);
  useEffect(() => { isOnCallRef.current = isOnCall; }, [isOnCall]);

  // Request permission on mount (web only, non-Electron)
  useEffect(() => {
    if (!isNative && !isElectron() && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [isNative]);

  const notify = useCallback((title: string, body: string, tag?: string, opts?: { icon?: string; variant?: 'default' | 'destructive' | 'call' }) => {
    // Silence all toasts/native notifications on the hosted builder preview tab.
    if (isHostedBuilderPreview()) {
      if (typeof window !== "undefined" && !(window as any).__notifyDevMuteLogged) {
        (window as any).__notifyDevMuteLogged = true;
        console.info("[DevPreview] Desktop notifications muted on dev preview tab");
      }
      return;
    }
    // Electron pop-out already shows caller info inline — skip toasts entirely
    if (isElectronPopout()) return;

    // Electron main window: use custom toast on secondary monitor
    if (showElectronToast({ title, body, icon: opts?.icon, variant: opts?.variant })) {
      toast({
        title,
        description: body,
        variant: opts?.variant === "destructive" ? "destructive" : "default",
      });
      return;
    }

    // In-app toast — always show
    toast({
      title,
      description: body,
      variant: opts?.variant === "destructive" ? "destructive" : "default",
    });

    // Native local notification for foreground awareness
    if (isNative) {
      (async () => {
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: Math.floor(Math.random() * 100000),
                schedule: { at: new Date(Date.now() + 100) },
                sound: undefined,
                extra: { tag: tag || "" },
              },
            ],
          });
        } catch (e) {
          console.warn("[Notify] LocalNotification failed:", e);
        }
      })();
      return;
    }

    // Web fallback: native browser notification (when tab is hidden)
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      const n = new Notification(title, {
        body,
        tag: tag || undefined,
        icon: "/ultraoffice-icon.svg?v=20260502",
        requireInteraction: false,
      });
      setTimeout(() => n.close(), 8000);
    }
  }, [isNative]);

  // Load SMS alert sound preference once
  const smsAlertRef = useCallback(async () => {
    const { data } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "sms_alert_sound")
      .maybeSingle();
    return !((data as any)?.value === "false");
  }, []);

  // Use shared realtime for SMS and call notifications
  useRealtimeInvalidation(
    [
      {
        table: "sms_log",
        event: "INSERT",
        queryKeys: [], // No query invalidation needed — just the callback
        onEvent: async (payload: any) => {
          const msg = payload.new as any;
          if (msg.direction === "inbound") {
            // Suppress SMS popup while on a live call — message still arrives in inbox.
            if (isOnCallRef.current) {
              console.log("[Notify] SMS suppressed during call:", msg.id);
              return;
            }
            const sender = msg.contact_name || msg.phone_number || "Unknown";
            notify(`📱 New SMS from ${sender}`, msg.body?.slice(0, 120) || "New message", `sms-${msg.id}`, { icon: '📱' });
            const enabled = await smsAlertRef();
            if (enabled) {
              try { playSmsAlert(); } catch { /* noop */ }
            }
          }
        },
      },
      {
        table: "call_log",
        event: "INSERT",
        queryKeys: [], // No query invalidation needed — just the callback
        onEvent: async (payload: any) => {
          const call = payload.new as any;
          if (call.direction === "inbound" && call.status !== "completed") {
            let caller = call.contact_name;

            // If no name on the row yet, try a quick customer lookup
            if (!caller && call.phone_number) {
              try {
                const digits = call.phone_number.replace(/\D/g, "").slice(-10);
                const { data } = await supabase
                  .from("customers")
                  .select("first_name, last_name")
                  .or(`phone.ilike.%${digits},mobile.ilike.%${digits}`)
                  .limit(1)
                  .maybeSingle();
                if (data) {
                  caller = [data.first_name, data.last_name].filter(Boolean).join(" ");
                }
              } catch {
                // ignore lookup errors
              }
            }

            caller = caller || call.phone_number || "Unknown";
            notify(`📞 Incoming call from ${caller}`, "Tap to answer in the softphone", `call-${call.id}`, { icon: '📞', variant: 'call' });
          }
        },
      },
    ],
    "desktop-notifications"
  );

  return { notify };
}
