/**
 * useIncomingCallNotification — Fires a native local notification on Android
 * when an incoming call is detected. This ensures the user sees/hears the call
 * even if the app is in the background or the screen is off.
 *
 * Also exports cancelCallNotification() for imperative cleanup of stale
 * notifications (e.g. after force-stop / cold-start reconciliation).
 */

import { useEffect, useRef } from "react";
import { useCapacitor } from "./useCapacitor";

const CALL_NOTIFICATION_ID = 9999;

/** Cancel the incoming-call notification imperatively. Safe to call anytime. */
export async function cancelCallNotification() {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: CALL_NOTIFICATION_ID }] });
  } catch {}
}

export function useIncomingCallNotification(
  isRinging: boolean,
  callerName?: string,
  callerNumber?: string
) {
  const { isNative } = useCapacitor();
  const notifiedRef = useRef(false);

  // On mount: clear any lingering notification from a previous session
  useEffect(() => {
    if (!isNative) return;
    if (!isRinging) {
      cancelCallNotification();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isNative) return;

    if (isRinging && !notifiedRef.current) {
      notifiedRef.current = true;

      (async () => {
        try {
          const { LocalNotifications } = await import("@capacitor/local-notifications");

          // Ensure permission
          const perm = await LocalNotifications.requestPermissions();
          if (perm.display !== "granted") return;

          await LocalNotifications.schedule({
            notifications: [
              {
                id: CALL_NOTIFICATION_ID,
                title: "Incoming Call",
                body: callerName
                  ? `${callerName} (${callerNumber || ""})`
                  : callerNumber || "Unknown caller",
                sound: "ringtone.wav",
                channelId: "incoming_calls",
                ongoing: true,
                autoCancel: false,
              },
            ],
          });
        } catch (err) {
          console.warn("[IncomingCallNotification] Failed:", err);
        }
      })();
    }

    // Clear notification when ringing stops
    if (!isRinging && notifiedRef.current) {
      notifiedRef.current = false;
      cancelCallNotification();
    }
  }, [isRinging, callerName, callerNumber, isNative]);
}
