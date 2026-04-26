/**
 * TelephonyHandoffRedirect — Friendly placeholder shown on /calls, /sms, /phone,
 * and the inbox phone/SMS sections when the handoff toggle is ON.
 *
 * The route stays mounted (so flipping the toggle OFF is instant) but the
 * in-app phone/SMS UI is replaced with a single "Open Ultraphone" button.
 */
import { ExternalLink, PhoneForwarded } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTelephonyMode } from "@/hooks/useTelephonyMode";

interface Props {
  surface?: "calls" | "sms" | "voicemail" | "phone";
}

const COPY: Record<string, { title: string; body: string; cta: string; action: keyof ReturnType<typeof useTelephonyMode> }> = {
  calls: {
    title: "Calls open in Ultraphone",
    body: "Use Ultraphone for live calling. IVR setup, routing, queues, and answering service rules still live here in this app.",
    cta: "Open Ultraphone Calls",
    action: "openCallHistory",
  },
  sms: {
    title: "SMS opens in Ultraphone",
    body: "Use Ultraphone for texting. IVR and inbound call routing are still managed here in this app.",
    cta: "Open Ultraphone Messages",
    action: "openMessages",
  },
  voicemail: {
    title: "Voicemail opens in Ultraphone",
    body: "Listen to and manage voicemails in Ultraphone while keeping IVR, queue, and overflow setup here.",
    cta: "Open Ultraphone Voicemail",
    action: "openVoicemail",
  },
  phone: {
    title: "Calling opens in Ultraphone",
    body: "Use Ultraphone for dialing and active calls. This app remains the source of truth for IVR, department routing, queues, and answering service handoff.",
    cta: "Open Ultraphone",
    action: "openCallHistory",
  },
};

export function TelephonyHandoffRedirect({ surface = "phone" }: Props) {
  const tel = useTelephonyMode();
  const copy = COPY[surface] || COPY.phone;

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <PhoneForwarded className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <Button
          className="mt-5"
          onClick={() => {
            const fn = tel[copy.action] as () => void;
            fn?.();
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          {copy.cta}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          IVR and department routing are still configured here. Admins can switch user calling tools in Admin → Config → Voice &amp; Phone.
        </p>
      </div>
    </div>
  );
}
