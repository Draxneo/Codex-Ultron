/**
 * useChatNotifications — Listen for new chat messages and show alerts.
 * On Electron: uses custom toast overlay on secondary monitor.
 * On native: triggers a local notification so it shows even when backgrounded.
 * On web: shows a toast (desktop notifications handled by useDesktopNotifications).
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showElectronToast, isElectronPopout } from "@/lib/electron";
import { useIsOnCall } from "@/hooks/useIsOnCall";

export function useChatNotifications() {
  const { isNative } = useCapacitor();
  const { user } = useAuth();
  const { toast } = useToast();
  const isOnCall = useIsOnCall();
  const isOnCallRef = useRef(isOnCall);
  useEffect(() => { isOnCallRef.current = isOnCall; }, [isOnCall]);

  useEffect(() => {
    if (!user) return;
    if (isElectronPopout()) return;

    const channel = supabase
      .channel("chat_notif_global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.user_id === user.id) return;
          // Suppress chat notifications while on a live call.
          if (isOnCallRef.current) {
            console.log("[ChatNotif] Suppressed during call:", msg.id);
            return;
          }

          const sender = msg.sender_name || "Someone";
          const preview = (msg.content || "").slice(0, 80);

          let channelName = "";
          try {
            const { data: ch } = await supabase
              .from("chat_channels")
              .select("name, job_id")
              .eq("id", msg.channel_id)
              .single();
            if (ch) {
              channelName = ch.name;
              if (ch.job_id) {
                const title = `🔀 ${sender} in #${ch.name}`;
                showNotification(title, preview);
                return;
              }
            }
          } catch { /* ignore */ }

          const title = `💬 ${sender}${channelName ? ` in #${channelName}` : ""}`;
          showNotification(title, preview);
        }
      )
      .subscribe();

    async function showNotification(title: string, body: string) {
      // Electron custom toast (ONE source of notifications)
      if (showElectronToast({ title, body, icon: '💬' })) {
        // Also show in-app toast for visibility if the window is focused
        toast({ title, description: body });
        return;
      }

      // In-app toast always
      toast({ title, description: body });

      // Native local notification for background awareness
      if (isNative) {
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
                smallIcon: "ic_notification",
              },
            ],
          });
        } catch (err) {
          console.warn("[ChatNotif] Local notification failed:", err);
        }
      }
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isNative, toast]);
}
