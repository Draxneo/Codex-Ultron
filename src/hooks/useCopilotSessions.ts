import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CopilotSession {
  id: string;
  user_id: string;
  employee_id: string | null;
  label: string;
  call_sid: string | null;
  phone_number: string | null;
  created_at: string;
  ended_at: string | null;
}

export function useCopilotSessions(employeeId?: string | null) {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load recent sessions
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      let query = supabase
        .from("copilot_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      } else {
        query = query.is("employee_id", null);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        setSessions(data as CopilotSession[]);
        // Don't auto-set activeSessionId here — let the route-change effect
        // in CopilotChatPanel create a fresh session with the correct context.
        // This prevents briefly loading stale messages from an old session.
      }
      setLoading(false);
    };
    load();
  }, [employeeId]);

  // Create a new general session
  const createSession = useCallback(async (label = "General"): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("copilot_sessions")
      .insert({
        user_id: user.id,
        label,
        ...(employeeId ? { employee_id: employeeId } : {}),
      })
      .select()
      .single();

    if (error || !data) return null;
    const session = data as CopilotSession;
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    return session.id;
  }, [employeeId]);

  // Create a call-scoped session
  const createCallSession = useCallback(async (phone: string, contactName?: string, callSid?: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const label = contactName ? `Call — ${contactName}` : `Call — ${phone}`;
    const { data, error } = await supabase
      .from("copilot_sessions")
      .insert({
        user_id: user.id,
        label,
        phone_number: phone,
        call_sid: callSid || null,
        ...(employeeId ? { employee_id: employeeId } : {}),
      })
      .select()
      .single();

    if (error || !data) return null;
    const session = data as CopilotSession;
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    return session.id;
  }, [employeeId]);

  // End (archive) a session
  const endSession = useCallback(async (sessionId: string) => {
    await supabase
      .from("copilot_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ended_at: new Date().toISOString() } : s));
  }, []);

  // Ensure there's an active session (create one if none)
  const ensureActiveSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const id = await createSession("General");
    return id!;
  }, [activeSessionId, createSession]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    createCallSession,
    endSession,
    ensureActiveSession,
    loading,
  };
}
