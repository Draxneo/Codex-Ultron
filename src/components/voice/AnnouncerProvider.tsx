/**
 * AnnouncerProvider — Mounts the JARVIS announcer at the app root and
 * wires it to real-time event sources:
 *
 *   • Incoming call → watches the softphone context (most reliable signal)
 *   • New customer SMS → realtime INSERT on sms_log (inbound only)
 *   • New voicemail → realtime UPDATE on call_log (transcription appears)
 *
 * Each event type respects its own toggle in useAnnouncerSettings.
 * Disabled by default per device; user opts in from Admin → Voice.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useAnnouncer } from "@/hooks/useAnnouncer";
import { useAnnouncerSettings } from "@/hooks/useAnnouncerSettings";
import { isOnCall as isOnCallNow } from "@/lib/callStateBus";
import { isLovableDevPreview } from "@/lib/devPreview";

// Statuses where the user is engaged on a call — suppress voice alerts so
// JARVIS doesn't talk over the live conversation. Incoming-call announcements
// (status === "ringing") are still allowed because that's the user's only
// audible cue someone is calling.
const ON_CALL_STATUSES = new Set(["connecting", "on-call"]);

function formatPhoneForSpeech(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return "an unknown number";
  // "210 555 1234" reads naturally
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Last-chance CRM lookup: if the realtime row arrived with a stale or empty
 * contact_name (e.g. customer/vendor was added AFTER the message landed, or
 * the SMS webhook lost the race with `resolveContact`), check the live CRM
 * before falling back to "unknown caller".
 */
async function lookupContactName(phone: string): Promise<string | null> {
  const digits = (phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;
  try {
    // Customers
    const { data: cust } = await supabase
      .rpc("find_customer_by_phone", { digits })
      .limit(1)
      .maybeSingle();
    if (cust) {
      const c = cust as any;
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.company;
      if (name) return name;
    }
    // Vendors (supply houses) — match last-10
    const { data: vendors } = await supabase
      .from("supply_houses")
      .select("name, contact_phone")
      .not("contact_phone", "is", null)
      .limit(200);
    const vMatch = (vendors || []).find((v: any) =>
      (v.contact_phone || "").replace(/\D/g, "").slice(-10) === digits
    );
    if (vMatch?.name) return vMatch.name;
    // Employees
    const { data: emps } = await supabase
      .from("employees")
      .select("name, phone")
      .limit(200);
    const eMatch = (emps || []).find((e: any) => {
      const ep = (e?.phone || "").replace(/\D/g, "").slice(-10);
      return ep === digits;
    });
    if (eMatch && (eMatch as any).name) return (eMatch as any).name as string;
  } catch (err) {
    console.warn("[AnnouncerProvider] CRM lookup failed:", err);
  }
  return null;
}

async function describeContactAsync(name: string | null | undefined, phone: string): Promise<string> {
  const n = (name || "").trim();
  if (n && n.toLowerCase() !== "unknown") return n;
  const resolved = await lookupContactName(phone);
  if (resolved) return resolved;
  return `an unknown caller at ${formatPhoneForSpeech(phone)}`;
}

function describeContact(name: string | null | undefined, phone: string): string {
  const n = (name || "").trim();
  if (n && n.toLowerCase() !== "unknown") return n;
  return `an unknown caller at ${formatPhoneForSpeech(phone)}`;
}

function AnnouncerProviderInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings } = useAnnouncerSettings();
  const { announce } = useAnnouncer();
  const { incomingCall, callerInfo, status } = useSoftphoneContext();

  // Track which incoming-call SIDs we've already announced this session.
  const announcedCallSids = useRef<Set<string>>(new Set());
  // Skip events that existed before the provider mounted.
  const mountTime = useRef<number>(Date.now());

  // Suppression: while the user is on a live call, swallow alerts and just
  // count them. When the call ends, fire a single "Pardon me sir, you missed
  // N alerts" message instead of replaying every individual one.
  const onCallRef = useRef<boolean>(false);
  const missedDuringCallRef = useRef<number>(0);

  // Gated announce: respects on-call suppression. Returns true if spoken.
  // Reads the synchronous callStateBus in addition to the React-effect ref
  // so we don't miss a status change that hasn't flushed to the ref yet.
  const speak = useCallback(
    (text: string) => {
      if (isOnCallNow() || onCallRef.current) {
        missedDuringCallRef.current += 1;
        return false;
      }
      announce(text);
      return true;
    },
    [announce],
  );

  // Watch call status: enter/exit suppression and emit summary on exit.
  useEffect(() => {
    const nowOnCall = ON_CALL_STATUSES.has(status);
    const wasOnCall = onCallRef.current;
    onCallRef.current = nowOnCall;

    if (wasOnCall && !nowOnCall) {
      // Just hung up — flush a single summary if anything was suppressed.
      const n = missedDuringCallRef.current;
      missedDuringCallRef.current = 0;
      if (n > 0 && settings.enabled) {
        const noun = n === 1 ? "alert" : "alerts";
        // Tiny delay so the call audio has time to fully release.
        setTimeout(() => {
          announce(`pardon me sir, you missed ${n} ${noun} while on the call`);
        }, 600);
      }
    }
  }, [status, settings.enabled, announce]);

  // ─── 1) Incoming call from local softphone ───
  useEffect(() => {
    if (!settings.enabled || !settings.events.incomingCall) return;
    if (status !== "ringing" || !incomingCall) return;

    const sid = (incomingCall.parameters as any)?.CallSid || "no-sid";
    if (announcedCallSids.current.has(sid)) return;
    announcedCallSids.current.add(sid);

    const phone = (incomingCall.parameters as any)?.From || callerInfo?.number || "";
    const who = describeContact(callerInfo?.name, phone);
    // Use the gated speak() so a 2nd-call ring during a live call is silently
    // counted toward the post-call summary instead of talking over the user.
    // Cold incoming calls (status "ringing" with no active call) still fire
    // because the speak() gate only blocks while connecting/on-call.
    speak(`incoming call from ${who}`);
  }, [status, incomingCall, callerInfo, settings, speak]);

  // ─── 2) New inbound SMS (realtime) ───
  useEffect(() => {
    if (!user) return;
    if (!settings.enabled || !settings.events.newSms) return;

    const channel = supabase
      .channel("announcer-sms")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_log" },
        async (payload) => {
          const msg = payload.new as any;
          if (!msg) return;
          // Inbound only — don't announce outgoing texts
          if (msg.direction !== "inbound") return;
          // Skip historical events (in case realtime backfills)
          const created = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();
          if (created < mountTime.current - 5000) return;

          const who = await describeContactAsync(msg.contact_name, msg.phone_number || "");
          speak(`new message from ${who}`);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, settings.enabled, settings.events.newSms, speak]);

  // ─── 3) New voicemail — listen to the real voicemails table ───
  // Earlier version watched call_log for any recording_url, which fired on
  // missed calls / hangups too (no actual message left). The voicemails
  // table is the authoritative source: a row is inserted only when Twilio
  // captures a real voicemail recording. We also require duration > 2s to
  // suppress hang-up "blip" recordings.
  useEffect(() => {
    if (!user) return;
    if (!settings.enabled || !settings.events.voicemail) return;

    const channel = supabase
      .channel("announcer-voicemail")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voicemails" as any },
        async (payload) => {
          const vm = payload.new as any;
          if (!vm) return;
          // Skip backfilled / historical events
          const created = vm.created_at ? new Date(vm.created_at).getTime() : Date.now();
          if (created < mountTime.current - 5000) return;
          // Suppress accidental short-blip recordings (no real message)
          if (typeof vm.duration_seconds === "number" && vm.duration_seconds < 3) return;

          const who = await describeContactAsync(vm.contact_name, vm.phone_number || "");
          speak(`you have a new voicemail from ${who}`);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, settings.enabled, settings.events.voicemail, speak]);

  // ─── 4) JARVIS approval needed (outbound_drafts pending) ───
  useEffect(() => {
    if (!user) return;
    if (!settings.enabled || !settings.events.jarvisAlert) return;

    const channel = supabase
      .channel("announcer-jarvis")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "outbound_drafts" as any },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (row.status && row.status !== "pending") return;
          const created = row.created_at ? new Date(row.created_at).getTime() : Date.now();
          if (created < mountTime.current - 5000) return;
          speak("JARVIS needs your attention");
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, settings.enabled, settings.events.jarvisAlert, speak]);

  return <>{children}</>;
}

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  // Silence event-driven announcements on the Lovable dev preview tab so it
  // doesn't race the Electron app / dispatcher's prod tab. Manual "Test" in
  // Admin still works since that's not gated through this provider.
  if (isLovableDevPreview()) {
    if (typeof window !== "undefined" && !(window as any).__announcerDevMuteLogged) {
      (window as any).__announcerDevMuteLogged = true;
      console.info("[DevPreview] Announcer muted on dev preview tab");
    }
    return <>{children}</>;
  }
  return <AnnouncerProviderInner>{children}</AnnouncerProviderInner>;
}

