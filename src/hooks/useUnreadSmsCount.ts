import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export function useUnreadSmsCount() {
  const { data: count = 0 } = useQuery({
    queryKey: ["unread_sms_count"],
    staleTime: 10_000,
    queryFn: async () => {
      const { count: c, error } = await supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .eq("is_read", false);
      if (error) throw error;
      return c ?? 0;
    },
  });

  useRealtimeInvalidation(
    [{ table: "sms_log", queryKeys: [["unread_sms_count"]] }],
    "rt-unread-sms"
  );

  return count;
}
