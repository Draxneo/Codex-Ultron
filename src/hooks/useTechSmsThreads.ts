/**
 * useTechSmsThreads — Fetches and groups SMS messages from/to active
 * technicians for the Tech Texts section in Team HQ.
 *
 * Returns threads sorted by most recent message, with unread counts per tech.
 * Uses realtime invalidation on sms_log changes.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLast10 } from "@/lib/formatters";

export type TechSmsThread = {
  employeeId: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  /** Optional: BU context for the tech (e.g. "FIX" or "Carnes") */
  businessUnitId?: string | null;
};

interface Employee {
  id: string;
  name: string;
  phone: string;
  is_active: boolean;
}

interface SmsLogRow {
  id: string;
  phone_number: string;
  direction: "inbound" | "outbound";
  body: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Fetch active employees with phone numbers, then group SMS by their phones.
 * Threads sorted by most recent message.
 */
async function fetchTechSmsThreads() {
  // 1. Fetch all active employees with phone numbers.
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("id, name, phone, is_active")
    .eq("is_active", true)
    .not("phone", "is", null);

  if (empError) throw empError;

  const empList = (employees || []) as Employee[];
  if (empList.length === 0) {
    return { threads: [], totalUnread: 0 };
  }

  // Build a map of normalized phone → employee for quick lookup.
  const phoneToEmployee = new Map<string, Employee>();
  for (const emp of empList) {
    const normalized = normalizeLast10(emp.phone);
    if (normalized) {
      phoneToEmployee.set(normalized, emp);
    }
  }

  // 2. Fetch all SMS messages where phone matches one of our techs.
  const phoneVariants = empList.flatMap((e) => {
    const norm = normalizeLast10(e.phone);
    return norm ? [`+1${norm}`, norm, `1${norm}`, e.phone] : [e.phone];
  });

  const { data: messages, error: smsError } = await supabase
    .from("v_sms_log_with_day")
    .select("id, phone_number, direction, body, is_read, created_at")
    .in("phone_number", phoneVariants)
    .order("created_at", { ascending: false });

  if (smsError) throw smsError;

  // 3. Group by tech phone, extract last message + unread count.
  const threadMap = new Map<string, TechSmsThread>();

  for (const msg of (messages || []) as SmsLogRow[]) {
    const normalized = normalizeLast10(msg.phone_number);
    const emp = normalized ? phoneToEmployee.get(normalized) : null;

    if (!emp) continue; // Not a tech we're tracking

    // Create thread key from employee ID for stable grouping.
    const threadKey = emp.id;

    // Get or create thread.
    let thread = threadMap.get(threadKey);
    if (!thread) {
      thread = {
        employeeId: emp.id,
        name: emp.name,
        phone: emp.phone,
        lastMessage: msg.body || "(no text)",
        lastMessageAt: msg.created_at,
        unreadCount: 0,
      };
      threadMap.set(threadKey, thread);
    }

    // Accumulate unread count (inbound messages that haven't been read).
    if (msg.direction === "inbound" && !msg.is_read) {
      thread.unreadCount += 1;
    }
  }

  // Convert to array and sort by most recent message.
  const threads = Array.from(threadMap.values()).sort((a, b) => {
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return { threads, totalUnread };
}

export function useTechSmsThreads() {
  const queryClient = useQueryClient();

  // Query the tech SMS threads with a 30s stale time.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tech-sms-threads"],
    queryFn: fetchTechSmsThreads,
    staleTime: 30_000,
  });

  // Subscribe to realtime SMS updates to invalidate the query.
  useEffect(() => {
    const channelName = `tech_sms_realtime_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_log" },
        () => {
          // Invalidate to refetch on any new SMS.
          void queryClient.invalidateQueries({ queryKey: ["tech-sms-threads"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sms_log" },
        () => {
          // Invalidate to refetch on SMS updates (e.g., is_read).
          void queryClient.invalidateQueries({ queryKey: ["tech-sms-threads"] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Tech SMS realtime channel error:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    threads: data?.threads || [],
    totalUnread: data?.totalUnread || 0,
    isLoading,
    isError,
    error,
  };
}
