import { useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLast10 } from "@/lib/formatters";
import {
  addContactLookup,
  buildCustomerDisplayName,
  resolveContactFromLookup,
  type ContactLookupMap,
} from "@/lib/communications";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

function buildContactMap(
  employees: { name: string; phone: string | null; is_active: boolean | null }[] | null,
  customers: { first_name: string | null; last_name: string | null; phone: string | null; mobile_phone: string | null }[] | null
): ContactLookupMap {
  const map: ContactLookupMap = {};
  for (const emp of employees || []) {
    if (!emp.phone || !emp.is_active) continue;
    addContactLookup(map, emp.phone, { name: emp.name, type: "employee" }, { overwrite: true });
  }
  for (const cust of customers || []) {
    const custName = buildCustomerDisplayName(cust);
    if (!custName) continue;
    for (const ph of [cust.phone, cust.mobile_phone]) {
      addContactLookup(map, ph, { name: custName, type: "customer" });
    }
  }
  return map;
}

export type CallRow = {
  id: string;
  direction: "inbound" | "outbound";
  phone_number: string;
  duration_seconds: number | null;
  status: string;
  contact_name: string | null;
  contact_type: string;
  recording_url: string | null;
  created_at: string;
  is_read: boolean;
  transcription: string | null;
  ai_summary: string | null;
  stir_status: string | null;
  extracted_data: Record<string, any> | null;
  twilio_sid: string | null;
  ended_at: string | null;
  /** CT day key (YYYY-MM-DD) — server-computed, drift-proof. */
  day_ct: string | null;
  /** CT time label ("HH:MM AM") — server-computed. */
  time_ct: string | null;
};

export type CallConversation = {
  phoneNumber: string;
  contactName: string | null;
  contactType: string;
  calls: CallRow[];
  lastCall: CallRow;
  unreadCount: number;
};

export function useCallLog() {
  const queryClient = useQueryClient();
  const { data: contactMap = {} } = useQuery({
    queryKey: ["communication_contact_lookup", "calls"],
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const [{ data: employees }, { data: customers }] = await Promise.all([
        supabase.from("employees").select("name, phone, is_active"),
        supabase.from("customers").select("first_name, last_name, phone, mobile_phone"),
      ]);
      return buildContactMap(employees, customers);
    },
  });

  // Stale-call cleanup is now handled entirely server-side by the
  // `reconcile-stuck-calls` cron and the `enforce_terminal_call_status` DB
  // trigger — which makes the server the single source of truth for call
  // lifecycle. No client-side sweep runs here anymore.

  const { data: calls = [], isLoading: loading } = useQuery({
    queryKey: ["call_log"],
    staleTime: 15_000,
    queryFn: async () => {
      // Read from the CT-aware view so `day_ct` / `time_ct` are DB-validated
      // (no client-side timezone drift).
      const { data, error } = await (supabase as any)
        .from("v_call_log_with_day")
        .select("id, direction, phone_number, duration_seconds, status, contact_name, contact_type, recording_url, created_at, is_read, transcription, ai_summary, stir_status, extracted_data, twilio_sid, ended_at, day_ct, time_ct")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as CallRow[];
    },
  });

  useRealtimeInvalidation(
    [{ table: "call_log", queryKeys: [["call_log"]] }],
    "rt-call-log"
  );

  const conversations = useMemo<CallConversation[]>(() => {
    const map = new Map<string, CallRow[]>();
    for (const call of calls) {
      const key = normalizeLast10(call.phone_number);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(call);
    }

    return Array.from(map.entries())
      .map(([key, groupCalls]) => {
        const last = groupCalls[0];
        const dbName = groupCalls.find((c) => c.contact_name)?.contact_name || null;
        const dbType = groupCalls.find((c) => c.contact_type && c.contact_type !== "unknown")?.contact_type || last.contact_type;
        const mapMatch = contactMap[key];
        const resolved = resolveContactFromLookup(contactMap, last.phone_number, dbName, dbType);
        return {
          phoneNumber: last.phone_number,
          contactName: resolved.name || mapMatch?.name || null,
          contactType: resolved.type || mapMatch?.type || last.contact_type,
          calls: groupCalls,
          lastCall: last,
          unreadCount: groupCalls.filter((c) => !c.is_read && c.direction === "inbound").length,
        };
      })
      .sort((a, b) => new Date(b.lastCall.created_at).getTime() - new Date(a.lastCall.created_at).getTime());
  }, [calls, contactMap]);

  const resolveContactName = useCallback((phone: string): string | null => {
    const key = normalizeLast10(phone);
    return contactMap[key]?.name || null;
  }, [contactMap]);

  const markAsRead = async (phoneNumber: string) => {
    const normalized = normalizeLast10(phoneNumber);
    const ids = calls
      .filter((c) => normalizeLast10(c.phone_number) === normalized && !c.is_read)
      .map((c) => c.id);
    if (!ids.length) return;
    await supabase.from("call_log").update({ is_read: true }).in("id", ids);
    queryClient.setQueryData<CallRow[]>(["call_log"], (old) =>
      (old || []).map((c) => (ids.includes(c.id) ? { ...c, is_read: true } : c))
    );
  };

  return { calls, conversations, loading, markAsRead, resolveContactName };
}
