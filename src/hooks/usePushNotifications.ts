/**
 * usePushNotifications — Register for native push notifications on Capacitor.
 * No-op on web. Stores FCM/APNs tokens in `push_tokens` table.
 * Handles notification taps → navigates to correct page.
 */
import { useEffect } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

export function usePushNotifications() {
  const { isNative, platform } = useCapacitor();
  const { toast } = useToast();
  const navigate = useNavigate();
  const telephony = useTelephonyMode();

  useEffect(() => {
    if (!isNative) return;

    let cleanup = false;

    const setup = async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Request permission
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== "granted") {
          console.warn("[Push] Permission denied");
          return;
        }

        // Register with APNs/FCM
        await PushNotifications.register();

        // Listen for the token
        const tokenListener = await PushNotifications.addListener("registration", async (tokenData) => {
          if (cleanup) return;
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Upsert token
          const { error } = await supabase.from("push_tokens").upsert(
            { user_id: user.id, token: tokenData.value, platform: platform === "ios" ? "ios" : "android" },
            { onConflict: "user_id,token" }
          );
          if (error) console.error("[Push] Token save error:", error.message);
        });

        // Registration error
        const errorListener = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[Push] Registration error:", err);
        });

        // Foreground notification received — show toast
        const foregroundListener = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          if (cleanup) return;
          toast({
            title: notification.title || "Notification",
            description: notification.body || "",
          });
        });

        // Notification tapped — navigate to correct page
        const tapListener = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          if (cleanup) return;
          const data = action.notification.data;
          console.log("[Push] Notification tapped:", data);

          const type = data?.type;
          if (telephony.isHandoff && (type === "sms" || type === "call")) {
            if (type === "sms" && data?.phone) void telephony.openSms(String(data.phone));
            else if (type === "call" && data?.phone) void telephony.openCall(String(data.phone));
            else if (type === "sms") void telephony.openMessages();
            else void telephony.openCallHistory();
            return;
          }
          if (type === "sms") {
            navigate(telephony.routes.sms);
          } else if (type === "call") {
            navigate(telephony.routes.phone);
          } else if (type === "chat") {
            navigate("/inbox");
          }
        });

        // Store listeners for cleanup
        return () => {
          cleanup = true;
          tokenListener.remove();
          errorListener.remove();
          foregroundListener.remove();
          tapListener.remove();
        };
      } catch (err) {
        console.warn("[Push] Setup failed:", err);
      }
    };

    let cleanupFn: (() => void) | undefined;
    setup().then(fn => { cleanupFn = fn; });

    return () => {
      cleanup = true;
      cleanupFn?.();
    };
  }, [isNative, platform, toast, navigate, telephony]);
}
