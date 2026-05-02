import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { normalizeLast10 } from "@/lib/formatters";
import {
  addContactLookup,
  buildCustomerDisplayName,
  resolveContactFromLookup,
  toE164Key,
  type ContactLookupMap,
} from "@/lib/communications";
import { appendSmsSignature } from "@/lib/smsSignature";

export type SmsMediaItem = {
  url: string;
  content_type: string;
};

export type SmsConversationStatus = "needs_reply" | "waiting" | "done";

export const SMS_CONVERSATION_STATUS_LABELS: Record<SmsConversationStatus, string> = {
  needs_reply: "Needs Reply",
  waiting: "Waiting",
  done: "Done",
};

export type SmsMessage = {
  id: string;
  direction: "inbound" | "outbound";
  phone_number: string;
  body: string;
  twilio_sid: string | null;
  related_job_id: string | null;
  is_read: boolean;
  contact_name: string | null;
  contact_type: string;
  created_at: string;
  delivery_status?: string | null;
  media_urls?: SmsMediaItem[] | null;
  to_number?: string | null;
  business_unit_id?: string | null;
  client_id?: string | null;
  /** CT day key (YYYY-MM-DD) — server-computed. */
  day_ct?: string | null;
  /** CT time label ("HH:MM AM") — server-computed. */
  time_ct?: string | null;
};

export type SmsConversation = {
  threadKey: string;
  phoneNumber: string;
  contactName: string | null;
  contactType: string;
  status: SmsConversationStatus;
  lastMessage: SmsMessage;
  unreadCount: number;
  messages: SmsMessage[];
  latestJobId: string | null;
  jobContext: SmsJobContext | null;
  estimateContext: SmsEstimateContext | null;
  toNumber?: string | null;
  businessUnitId?: string | null;
};

type SmsThreadSetting = {
  phone_last10: string;
  business_unit_id?: string | null;
  company_phone_number?: string | null;
  company_phone_last10?: string | null;
  thread_key?: string | null;
  conversation_status: SmsConversationStatus | null;
  updated_at: string | null;
};

type IntakeThreadStatus = {
  phone_last10: string;
  business_unit_id?: string | null;
  company_phone_number?: string | null;
  company_phone_last10?: string | null;
  thread_key?: string | null;
  status: "open" | "handled" | string | null;
  handled_at: string | null;
  updated_at: string | null;
};

export type SmsJobContext = {
  id: string;
  label: string;
  customerName: string | null;
  scheduledDate: string | null;
  status: string | null;
};

export type SmsEstimateContext = {
  id: string;
  label: string;
  customerName: string | null;
  scheduledDate: string | null;
  status: string | null;
};

function compareByCreatedAt(a: SmsMessage, b: SmsMessage): number {
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  if (at !== bt) return at - bt;
  return a.id.localeCompare(b.id);
}

function sortMessagesChrono(list: SmsMessage[]): SmsMessage[] {
  return [...list].sort(compareByCreatedAt);
}

function mergeMessagesChrono(existing: SmsMessage[], incoming: SmsMessage[]): SmsMessage[] {
  const byId = new Map<string, SmsMessage>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return sortMessagesChrono(Array.from(byId.values()));
}

const UNKNOWN_LINE_KEY = "unknown-line";

function companyLineKeyFromParts(toNumber?: string | null, businessUnitId?: string | null): string {
  const toLast10 = normalizeLast10(toNumber || "");
  if (toLast10) return `line:${toLast10}`;
  if (businessUnitId) return `bu:${businessUnitId}`;
  return UNKNOWN_LINE_KEY;
}

export function getSmsThreadKey(phoneNumber: string, toNumber?: string | null, businessUnitId?: string | null): string {
  const phoneLast10 = normalizeLast10(phoneNumber) || toE164Key(phoneNumber) || phoneNumber;
  return `${phoneLast10}|${companyLineKeyFromParts(toNumber, businessUnitId)}`;
}

function getSmsMessageThreadKey(message: SmsMessage): string {
  return getSmsThreadKey(message.phone_number, message.to_number, message.business_unit_id);
}

function parseSmsThreadKey(threadKeyOrPhone: string): { phoneLast10: string; lineKey: string } {
  const [phonePart, linePart] = threadKeyOrPhone.split("|");
  return {
    phoneLast10: normalizeLast10(phonePart) || phonePart,
    lineKey: linePart || UNKNOWN_LINE_KEY,
  };
}

function legacySmsThreadKey(phoneLast10: string): string {
  return `${phoneLast10}|${UNKNOWN_LINE_KEY}`;
}

function e164FromLast10(last10: string): string | null {
  const digits = normalizeLast10(last10);
  return digits ? `+1${digits}` : null;
}

function smsThreadIdentityPayload(threadKey: string): {
  business_unit_id?: string | null;
  company_phone_number?: string | null;
  company_phone_last10?: string | null;
  thread_key: string;
} {
  const { lineKey } = parseSmsThreadKey(threadKey);
  if (lineKey.startsWith("bu:")) {
    return { business_unit_id: lineKey.slice(3), thread_key: threadKey };
  }
  if (lineKey.startsWith("line:")) {
    const companyPhoneLast10 = normalizeLast10(lineKey.slice(5));
    return {
      company_phone_number: e164FromLast10(companyPhoneLast10),
      company_phone_last10: companyPhoneLast10 || null,
      thread_key: threadKey,
    };
  }
  return { thread_key: threadKey };
}

function smsThreadKeyFromRow(row: { phone_last10: string; thread_key?: string | null; company_phone_number?: string | null; business_unit_id?: string | null }) {
  return getSmsThreadKey(row.phone_last10, row.company_phone_number, row.business_unit_id);
}

const PAGE_SIZE = 150;
const CURRENT_WORK_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function currentWorkCutoffDate() {
  return new Date(Date.now() - CURRENT_WORK_LOOKBACK_MS).toISOString().split("T")[0];
}

function isOpenWorkStatus(status?: string | null) {
  const text = String(status || "").toLowerCase();
  if (!text) return false;
  return !/\b(done|complete|completed|closed|cancel|canceled|cancelled|lost|won|paid|invoiced|archived)\b/.test(text);
}

function hasCurrentWorkDate(value?: string | null) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - CURRENT_WORK_LOOKBACK_MS;
}

interface UseSmsLogOptions {
  role?: string | null;
  employeeId?: string | null;
  userId?: string | null;
  /** When true, skip all fetches and realtime subscriptions. Useful when a
   *  parent provider already owns the SMS state. */
  disabled?: boolean;
}

export function useSmsLog(options: UseSmsLogOptions = {}) {
  const { role, employeeId, userId, disabled = false } = options;
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contactMap, setContactMap] = useState<ContactLookupMap>({});
  const [jobContextMap, setJobContextMap] = useState<Record<string, SmsJobContext>>({});
  const [estimateContextMap, setEstimateContextMap] = useState<Record<string, SmsEstimateContext>>({});
  const [threadSettings, setThreadSettings] = useState<Record<string, SmsThreadSetting>>({});
  const [sharedThreadStatuses, setSharedThreadStatuses] = useState<Record<string, IntakeThreadStatus>>({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [techPhoneFilter, setTechPhoneFilter] = useState<Set<string> | null>(null);
  const [reconnectSeq, setReconnectSeq] = useState(0);

  // Fetch employees + customers to build a phone→contact lookup
  useEffect(() => {
    if (disabled) return;
    const buildContactMap = async () => {
      const map: ContactLookupMap = {};
      const currentCutoff = currentWorkCutoffDate();

      const [{ data: employees }, { data: customers }, { data: estimates }, { data: jobs }, { data: supplyHouses }, { data: vendorContacts }] = await Promise.all([
        supabase.from("employees").select("name, phone, is_active"),
        supabase.from("customers").select("first_name, last_name, phone, mobile_phone"),
        supabase
          .from("estimates")
          .select("id, estimate_number, customer_name, customer_phone, scheduled_date, status, work_status")
          .not("customer_phone", "is", null)
          .not("customer_name", "is", null)
          .gte("scheduled_date", currentCutoff),
        supabase
          .from("jobs")
          .select("id, customer_name, customer_phone, hcp_job_number, job_type, scheduled_date, status")
          .not("customer_phone", "is", null)
          .not("customer_name", "is", null)
          .gte("scheduled_date", currentCutoff),
        supabase.from("supply_houses").select("name, contact_phone, text_support_phone").not("contact_phone", "is", null),
        supabase.from("vendor_contacts").select("name, phone, supply_house_id, supply_houses(name)").not("phone", "is", null),
      ]);

      // Priority 1: employees
      for (const emp of employees || []) {
        if (!emp.phone || !emp.is_active) continue;
        addContactLookup(map, emp.phone, { name: emp.name, type: "employee" }, { overwrite: true });
      }

      // Priority 2: customers
      for (const cust of customers || []) {
        const custName = buildCustomerDisplayName(cust);
        if (!custName) continue;
        for (const ph of [cust.phone, cust.mobile_phone]) {
          addContactLookup(map, ph, { name: custName, type: "customer" });
        }
      }

      // Priority 3: supply houses (vendor main phones)
      for (const sh of supplyHouses || []) {
        for (const ph of [sh.contact_phone, sh.text_support_phone]) {
          addContactLookup(map, ph, { name: sh.name, type: "vendor" });
        }
      }

      // Priority 4: vendor contacts (individual reps)
      for (const vc of (vendorContacts || []) as any[]) {
        const vcName = vc.supply_houses?.name ? `${vc.name} (${vc.supply_houses.name})` : vc.name;
        addContactLookup(map, vc.phone, { name: vcName, type: "vendor" });
      }

      // Priority 5: jobs (customer_name from job records)
      const jobsByPhone: Record<string, SmsJobContext> = {};
      for (const job of jobs || []) {
        if (!job.customer_name || !job.customer_phone) continue;
        addContactLookup(map, job.customer_phone, { name: job.customer_name, type: "customer" });
        if (!isOpenWorkStatus(job.status) || !hasCurrentWorkDate(job.scheduled_date)) continue;
        const key = normalizeLast10(job.customer_phone);
        if (!key || jobsByPhone[key]) continue;
        jobsByPhone[key] = {
          id: job.id,
          label: job.hcp_job_number ? `Job #${job.hcp_job_number}` : job.job_type || "Job",
          customerName: job.customer_name,
          scheduledDate: job.scheduled_date,
          status: job.status,
        };
      }

      // Priority 6: estimates (leads not yet converted to customers)
      const estimatesByPhone: Record<string, SmsEstimateContext> = {};
      for (const est of estimates || []) {
        if (!est.customer_name || !est.customer_phone) continue;
        const estimateStatus = String(est.work_status || est.status || "").toLowerCase();
        addContactLookup(map, est.customer_phone, { name: est.customer_name, type: "customer" });
        if (!isOpenWorkStatus(estimateStatus) || !hasCurrentWorkDate(est.scheduled_date)) continue;
        const key = normalizeLast10(est.customer_phone);
        if (!key || estimatesByPhone[key]) continue;
        estimatesByPhone[key] = {
          id: est.id,
          label: est.estimate_number ? `Estimate #${est.estimate_number}` : "Estimate",
          customerName: est.customer_name,
          scheduledDate: est.scheduled_date,
          status: est.work_status || est.status || null,
        };
      }

      setContactMap(map);
      setJobContextMap(jobsByPhone);
      setEstimateContextMap(estimatesByPhone);
    };

    buildContactMap();
  }, [disabled]);

  useEffect(() => {
    if (disabled || !userId) return;

    const fetchThreadSettings = async () => {
      let { data, error } = await (supabase as any)
        .from("sms_thread_settings")
        .select("phone_last10, conversation_status, updated_at, business_unit_id, company_phone_number, company_phone_last10, thread_key")
        .eq("user_id", userId);

      if (error) {
        const legacy = await (supabase as any)
          .from("sms_thread_settings")
          .select("phone_last10, conversation_status, updated_at")
          .eq("user_id", userId);
        data = legacy.data;
        error = legacy.error;
      }

      if (error) {
        console.warn("Failed to fetch SMS thread settings:", error);
        return;
      }

      const next: Record<string, SmsThreadSetting> = {};
      for (const row of (data || []) as SmsThreadSetting[]) {
        next[smsThreadKeyFromRow(row)] = row;
      }
      setThreadSettings(next);
    };

    fetchThreadSettings();
  }, [disabled, userId]);

  useEffect(() => {
    if (disabled) return;

    const fetchSharedStatuses = async () => {
      let { data, error } = await (supabase as any)
        .from("intake_thread_status")
        .select("phone_last10, status, handled_at, updated_at, business_unit_id, company_phone_number, company_phone_last10, thread_key")
        .eq("channel", "sms");

      if (error) {
        const legacy = await (supabase as any)
          .from("intake_thread_status")
          .select("phone_last10, status, handled_at, updated_at")
          .eq("channel", "sms");
        data = legacy.data;
        error = legacy.error;
      }

      if (error) {
        console.warn("Failed to fetch shared SMS thread statuses:", error);
        return;
      }

      const next: Record<string, IntakeThreadStatus> = {};
      for (const row of (data || []) as IntakeThreadStatus[]) {
        next[smsThreadKeyFromRow(row)] = row;
      }
      setSharedThreadStatuses(next);
    };

    fetchSharedStatuses();

    const channelName = `sms_thread_status_realtime_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "intake_thread_status", filter: "channel=eq.sms" },
        (payload: any) => {
          const row = payload.new as IntakeThreadStatus | undefined;
          const oldRow = payload.old as IntakeThreadStatus | undefined;
          const phoneKey = row?.phone_last10 || oldRow?.phone_last10;
          if (!phoneKey) return;
          const key = row ? smsThreadKeyFromRow(row) : oldRow ? smsThreadKeyFromRow(oldRow) : legacySmsThreadKey(phoneKey);
          setSharedThreadStatuses((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") delete next[key];
            else if (row) next[key] = row;
            return next;
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Shared SMS thread status realtime error:", status);
          fetchSharedStatuses();
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [disabled]);

  const setThreadStatus = useCallback(async (threadKeyOrPhone: string, status: SmsConversationStatus) => {
    const { phoneLast10, lineKey } = parseSmsThreadKey(threadKeyOrPhone);
    const threadKey = `${phoneLast10}|${lineKey}`;
    if (!phoneLast10) throw new Error("Missing phone number for SMS thread status.");
    if (!userId) throw new Error("Sign in before marking an SMS thread handled.");

    const updatedAt = new Date().toISOString();
    setThreadSettings((prev) => ({
      ...prev,
      [threadKey]: {
        phone_last10: phoneLast10,
        ...smsThreadIdentityPayload(threadKey),
        conversation_status: status,
        updated_at: updatedAt,
      },
    }));

    const { error } = await (supabase as any)
      .from("sms_thread_settings")
      .upsert({
        user_id: userId,
        phone_last10: phoneLast10,
        ...smsThreadIdentityPayload(threadKey),
        conversation_status: status,
        updated_at: updatedAt,
      }, { onConflict: "user_id,thread_key" });

    if (error) {
      console.error("Failed to update SMS thread status:", error);
      throw error;
    }

    const sharedStatus: IntakeThreadStatus = {
      phone_last10: phoneLast10,
      ...smsThreadIdentityPayload(threadKey),
      status: status === "done" ? "handled" : "open",
      handled_at: status === "done" ? updatedAt : null,
      updated_at: updatedAt,
    };
    setSharedThreadStatuses((prev) => ({ ...prev, [threadKey]: sharedStatus }));

    const { error: sharedError } = await (supabase as any)
      .from("intake_thread_status")
      .upsert({
        channel: "sms",
        phone_last10: phoneLast10,
        ...smsThreadIdentityPayload(threadKey),
        status: sharedStatus.status,
        handled_by_user_id: status === "done" ? userId : null,
        handled_at: sharedStatus.handled_at,
        updated_at: updatedAt,
      }, { onConflict: "thread_key" });

    if (sharedError) {
      console.error("Failed to update shared SMS thread status:", sharedError);
      throw sharedError;
    }
  }, [userId]);

  // For tech role: build a set of phone numbers they're allowed to see
  useEffect(() => {
    if (disabled) return;
    if (role !== "tech" || !employeeId) {
      setTechPhoneFilter(null);
      return;
    }

    const buildFilter = async () => {
      // Get employee name
      const { data: emp } = await supabase
        .from("employees")
        .select("name")
        .eq("id", employeeId)
        .single();

      if (!emp?.name) {
        setTechPhoneFilter(new Set());
        return;
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cutoff = ninetyDaysAgo.toISOString().split("T")[0];

      // Fetch assigned job phones and estimate phones in parallel
      const [jobsRes, estimatesRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("customer_phone")
          .eq("assigned_to", emp.name)
          .gte("scheduled_date", cutoff)
          .not("customer_phone", "is", null),
        supabase
          .from("estimates")
          .select("customer_phone")
          .eq("assigned_to", emp.name)
          .gte("scheduled_date", cutoff)
          .not("customer_phone", "is", null),
      ]);

      const phones = new Set<string>();
      for (const row of jobsRes.data || []) {
        if (row.customer_phone) phones.add(toE164Key(row.customer_phone));
      }
      for (const row of estimatesRes.data || []) {
        if (row.customer_phone) phones.add(toE164Key(row.customer_phone));
      }

      // Also include any phones the tech has directly sent SMS to
      const { data: sentMsgs } = await supabase
        .from("sms_log")
        .select("phone_number")
        .eq("direction", "outbound");
      
      for (const row of sentMsgs || []) {
        if (row.phone_number) phones.add(toE164Key(row.phone_number));
      }

      setTechPhoneFilter(phones);
    };

    buildFilter();
  }, [role, employeeId, disabled]);

  const fetchMessages = useCallback(async (offset = 0, append = false) => {
    if (disabled) return;
    // For tech role, wait until filter is ready
    if (role === "tech" && techPhoneFilter === null) return;

    if (!append) setLoading(true);
    else setLoadingMore(true);

    let query = (supabase as any)
      .from("v_sms_log_with_day")
      .select("*")
      .order("created_at", { ascending: false });

    // Tech role: filter to only their assigned phone numbers
    if (role === "tech" && techPhoneFilter) {
      const phoneArray = Array.from(techPhoneFilter);
      if (phoneArray.length === 0) {
        // No assigned phones, return empty
        setMessages([]);
        setHasMore(false);
        if (!append) setLoading(false);
        else setLoadingMore(false);
        return;
      }
      query = query.in("phone_number", phoneArray);
    }

    query = query.range(offset, offset + PAGE_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch SMS log:", error);
      if (!append) setLoading(false);
      else setLoadingMore(false);
      return;
    }

    const fetched = (data as unknown as SmsMessage[]) || [];

    // PINNED TEAM THREADS: Always include the most recent SMS per active employee,
    // even if their thread is older than the current page. This guarantees team
    // members never disappear from the conversation list as overall SMS volume grows.
    // Only run on initial load (offset=0, !append) and skip for tech role (already scoped).
    let pinnedTeam: SmsMessage[] = [];
    if (!append && offset === 0 && role !== "tech") {
      const { data: employees } = await supabase
        .from("employees")
        .select("phone")
        .eq("is_active", true)
        .not("phone", "is", null);

      const empPhoneKeys = (employees || [])
        .map((e: any) => normalizeLast10(e.phone))
        .filter(Boolean) as string[];

      if (empPhoneKeys.length > 0) {
        // Build all possible E.164 / formatted variants for the IN clause
        const phoneVariants = empPhoneKeys.flatMap((d) => [`+1${d}`, d, `1${d}`]);
        const { data: teamMsgs } = await (supabase as any)
          .from("v_sms_log_with_day")
          .select("*")
          .in("phone_number", phoneVariants)
          .order("created_at", { ascending: false })
          .limit(120); // enough to keep team threads pinned without slowing every inbox open
        pinnedTeam = (teamMsgs as unknown as SmsMessage[]) || [];
      }
    }

    const combined = pinnedTeam.length > 0
      ? mergeMessagesChrono(fetched, pinnedTeam)
      : fetched;

    if (append) {
      setMessages((prev) => mergeMessagesChrono(prev, combined));
    } else {
      setMessages(sortMessagesChrono(combined));
    }
    setHasMore(fetched.length === PAGE_SIZE);

    if (!append) setLoading(false);
    else setLoadingMore(false);
  }, [role, techPhoneFilter, disabled]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchMessages(messages.length, true);
  }, [fetchMessages, messages.length, loadingMore, hasMore]);

  // Refetch SMS when app resumes from background (Android WebView kills WS)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchMessages();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchMessages]);

  useEffect(() => {
    if (disabled) return;
    fetchMessages();
    const channelName = `sms_log_realtime_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_log" },
        (payload) => {
          const msg = payload.new as SmsMessage & { client_id?: string | null };
          if (role === "tech" && techPhoneFilter && !techPhoneFilter.has(toE164Key(msg.phone_number))) {
            return;
          }
          // Prefer exact client_id match for instant optimistic→real swap;
          // fall back to phone+direction match for older flows.
          setMessages((prev) => {
            const withoutOptimistic = prev.filter((m) => {
              if (!m.id.startsWith("optimistic-")) return true;
              if (msg.client_id && (m as any).client_id === msg.client_id) return false;
              if (
                m.direction === "outbound" &&
                toE164Key(m.phone_number) === toE164Key(msg.phone_number) &&
                companyLineKeyFromParts(m.to_number, m.business_unit_id) === companyLineKeyFromParts(msg.to_number, msg.business_unit_id)
              ) return false;
              return true;
            });
            return mergeMessagesChrono(withoutOptimistic, [msg]);
          });
          if (msg.direction === "inbound" && userId) {
            void setThreadStatus(getSmsMessageThreadKey(msg), "needs_reply").catch((error) => {
              console.error("Failed to mark inbound SMS thread as needing reply:", error);
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sms_log" },
        (payload) => {
          setMessages((prev) => {
            const next = prev.map((m) => (m.id === payload.new.id ? (payload.new as SmsMessage) : m));
            return sortMessagesChrono(next);
          });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("SMS realtime channel error, reconnecting...", status);
          supabase.removeChannel(channel);
          fetchMessages();
          setReconnectSeq((value) => value + 1);
        }
      });

    // Heartbeat: check channel health every 30s
    const heartbeat = setInterval(() => {
      if ((channel as any).state !== "joined") {
        console.warn("SMS realtime channel not joined, triggering reconnect");
        supabase.removeChannel(channel);
        fetchMessages();
        setReconnectSeq((value) => value + 1);
      }
    }, 30_000);

    return () => {
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
    };
  }, [fetchMessages, role, setThreadStatus, techPhoneFilter, disabled, userId, reconnectSeq]);

  // Resolve a phone number to a contact via DB fields first, then client-side lookup
  const resolveContact = useCallback(
    (phone: string, dbName: string | null, dbType: string): { name: string | null; type: string } => {
      return resolveContactFromLookup(contactMap, phone, dbName, dbType);
    },
    [contactMap]
  );

  const conversations = useMemo(() => {
    const grouped: Record<string, SmsMessage[]> = {};
    for (const msg of sortMessagesChrono(messages)) {
      const key = getSmsMessageThreadKey(msg);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(msg);
    }
    const threadCountByPhone = Object.keys(grouped).reduce<Record<string, number>>((acc, threadKey) => {
      const { phoneLast10 } = parseSmsThreadKey(threadKey);
      acc[phoneLast10] = (acc[phoneLast10] || 0) + 1;
      return acc;
    }, {});

    const convos: SmsConversation[] = Object.entries(grouped).map(([threadKey, msgs]) => {
      const convoMsgs = sortMessagesChrono(msgs);
      const lastMsg = convoMsgs[convoMsgs.length - 1];
      const phone = toE164Key(lastMsg.phone_number) || lastMsg.phone_number;
      const unread = convoMsgs.filter((m) => m.direction === "inbound" && !m.is_read).length;
      const latestJob = [...convoMsgs].reverse().find((m) => m.related_job_id)?.related_job_id || null;
      const latestInbound = [...convoMsgs].reverse().find((m) => m.direction === "inbound") || null;

      // Try DB-stored contact info from most recent message first
      const withContact = [...convoMsgs].reverse().find((m) => m.contact_name);
      const withType = [...convoMsgs].reverse().find((m) => m.contact_type !== "unknown");

      // Fall back to client-side phone matching
      const resolved = resolveContact(
        phone,
        withContact?.contact_name || null,
        withType?.contact_type || "unknown"
      );

      // Get the most recent to_number for this conversation
      const latestToNumber = [...convoMsgs].reverse().find((m) => m.to_number)?.to_number || null;
      const latestBusinessUnitId = [...convoMsgs].reverse().find((m) => m.business_unit_id)?.business_unit_id || null;
      const phoneLast10 = normalizeLast10(phone);
      const legacyKey = phoneLast10 ? legacySmsThreadKey(phoneLast10) : "";
      const canUseLegacyStatus = !!phoneLast10 && threadCountByPhone[phoneLast10] === 1;
      const setting = threadSettings[threadKey] || (canUseLegacyStatus ? threadSettings[legacyKey] : undefined);
      const sharedStatus = sharedThreadStatuses[threadKey] || (canUseLegacyStatus ? sharedThreadStatuses[legacyKey] : undefined);
      const sharedHandledAt = sharedStatus?.handled_at || sharedStatus?.updated_at || null;
      const sharedDoneIsFresh = !!(
        sharedStatus?.status === "handled" &&
        sharedHandledAt &&
        (!latestInbound || new Date(sharedHandledAt).getTime() >= new Date(latestInbound.created_at).getTime())
      );
      const manualIsFresh = !!(
        setting?.conversation_status &&
        setting.updated_at &&
        (!latestInbound || new Date(setting.updated_at).getTime() >= new Date(latestInbound.created_at).getTime())
      );
      const derivedStatus: SmsConversationStatus = unread > 0 ? "needs_reply" : "waiting";
      const status = sharedDoneIsFresh ? "done" : manualIsFresh ? setting!.conversation_status! : derivedStatus;
      const matchedJob = phoneLast10 ? jobContextMap[phoneLast10] || null : null;
      const matchedEstimate = phoneLast10 ? estimateContextMap[phoneLast10] || null : null;

      return {
        threadKey,
        phoneNumber: phone,
        contactName: resolved.name,
        contactType: resolved.type,
        status,
        lastMessage: lastMsg,
        unreadCount: unread,
        messages: convoMsgs,
        latestJobId: latestJob || matchedJob?.id || null,
        jobContext: matchedJob,
        estimateContext: matchedEstimate,
        toNumber: latestToNumber,
        businessUnitId: latestBusinessUnitId,
      };
    });

    // Sort: unread first, then by most recent
    convos.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      if (a.status === "needs_reply" && b.status !== "needs_reply") return -1;
      if (a.status !== "needs_reply" && b.status === "needs_reply") return 1;
      return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime();
    });

    return convos;
  }, [messages, resolveContact, threadSettings, sharedThreadStatuses, jobContextMap, estimateContextMap]);

  const queryClient = useQueryClient();

  const markAsRead = useCallback(async (threadKeyOrPhone: string) => {
    const { phoneLast10, lineKey } = parseSmsThreadKey(threadKeyOrPhone);
    const unreadIds = messages
      .filter((m) => {
        if (normalizeLast10(m.phone_number) !== phoneLast10 || m.direction !== "inbound" || m.is_read) return false;
        if (!threadKeyOrPhone.includes("|")) return true;
        return companyLineKeyFromParts(m.to_number, m.business_unit_id) === lineKey;
      })
      .map((m) => m.id);

    if (unreadIds.length === 0) return;

    setMessages((prev) =>
      prev.map((m) =>
        unreadIds.includes(m.id) ? { ...m, is_read: true } : m
      )
    );

    const { error } = await supabase
      .from("sms_log")
      .update({ is_read: true })
      .in("id", unreadIds);

    if (error) console.error("Failed to mark SMS as read:", error);

    // Immediately update the header badge count
    queryClient.invalidateQueries({ queryKey: ["unread_sms_count"] });
  }, [messages, queryClient]);

  const sendSms = async (
    to: string,
    body: string,
    jobId?: string,
    contactName?: string,
    mediaUrls?: string[],
    options: { fromNumber?: string | null; businessUnitId?: string | null; threadKey?: string | null } = {}
  ) => {
    setSending(true);
    const signedBody = appendSmsSignature(body);

    // Optimistic placeholder — shows instantly in the thread.
    // We tag it with a client_id (UUID) so the server-inserted row can
    // swap it cleanly via realtime (no body fuzzy matching, no flicker).
    const clientId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimisticId = "optimistic-" + clientId;
    const optimisticMsg: SmsMessage = {
      id: optimisticId,
      direction: "outbound",
      phone_number: to,
      body: signedBody,
      twilio_sid: null,
      related_job_id: jobId || null,
      is_read: true,
      contact_name: contactName || null,
      contact_type: "unknown",
      created_at: new Date().toISOString(),
      delivery_status: "sending",
      media_urls: null,
      to_number: options.fromNumber || null,
      business_unit_id: options.businessUnitId || null,
      client_id: clientId,
    };
    setMessages((prev) => mergeMessagesChrono(prev, [optimisticMsg]));

    try {
      // Route through the universal sender so all the request-shape and
      // toast-error logic lives in ONE place. We pass `silent: true` because
      // the SMS panel renders its own optimistic UI + success state.
      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const result = await sendSmsImpl({
        to,
        body: signedBody,
        jobId,
        mediaUrls,
        contactName,
        clientId,
        fromNumber: options.fromNumber,
        businessUnitId: options.businessUnitId,
        silent: true,
      });
      if (!result.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId ? { ...m, delivery_status: "failed" } : m
          )
        );
        const msg = result.error || "Send failed";
        const isBlocked = msg.includes("testing mode") || msg.includes("Safety Lock") || msg.includes("test mode");
        toast({ title: isBlocked ? "SMS Blocked" : "SMS Failed", description: msg, variant: "destructive" });
        return false;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? {
                ...m,
                id: result.sms_log_id || m.id,
                twilio_sid: result.twilio_sid || m.twilio_sid,
                delivery_status: result.queued ? "queued_retry" : "sent",
              }
            : m
        )
      );
      toast({ title: "SMS Sent", description: `Message sent to ${contactName || to}` });
      if (userId) {
        void setThreadStatus(options.threadKey || getSmsThreadKey(to, options.fromNumber, options.businessUnitId), "waiting").catch((error) => {
          console.error("Failed to mark outbound SMS thread as waiting:", error);
        });
      }
      return true;
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, delivery_status: "failed" } : m
        )
      );
      toast({ title: "SMS Failed", description: e.message || "Check the connection and try again.", variant: "destructive" });
      return false;
    } finally {
      setSending(false);
    }
  };

  return { messages, conversations, loading, sending, sendSms, markAsRead, setThreadStatus, refetch: fetchMessages, hasMore, loadMore, loadingMore };
}
