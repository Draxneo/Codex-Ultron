import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HcpAttachment {
  id: string;
  file_name: string;
  url: string;
  file_type: string;
  created_at?: string;
}

/**
 * Fetches job attachments with DB-level caching.
 * First checks job_attachment_cache table; if miss, calls HCP API
 * via edge function and stores result for future instant loads.
 */
export function useJobAttachments(hcpId: string | undefined) {
  return useQuery({
    queryKey: ["job-attachments", hcpId],
    queryFn: async () => {
      // 1. Check DB cache first
      const { data: cached } = await (supabase
        .from("job_attachment_cache" as any)
        .select("attachments")
        .eq("hcp_id", hcpId!)
        .maybeSingle() as any);

      const normalize = (raw: any): HcpAttachment[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw as HcpAttachment[];
        if (typeof raw === "string") {
          try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
        }
        return [];
      };

      // Ensure every attachment has a usable .url — fall back to public URL
      // for fresh tech-uploaded photos that only have a file_path.
      const ensureUrl = (list: HcpAttachment[]): HcpAttachment[] =>
        list.map((a: any) => {
          if (a.url) return a;
          const path = a.file_path || a.path;
          if (!path) return a;
          const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
          return { ...a, url: pub.publicUrl };
        });

      if ((cached as any)?.attachments) {
        return ensureUrl(normalize((cached as any).attachments));
      }

      // 2. Cache miss — fetch from HCP API via edge function
      const { data, error } = await supabase.functions.invoke("fetch-job-attachments", {
        body: { hcp_id: hcpId },
      });
      if (error) throw error;
      const attachments = ensureUrl(normalize(data?.attachments));

      // 3. Store in DB cache for next time (fire-and-forget) — store as JSONB object, not stringified
      supabase
        .from("job_attachment_cache" as any)
        .upsert(
          { hcp_id: hcpId, attachments: attachments as any, fetched_at: new Date().toISOString() } as any,
          { onConflict: "hcp_id" }
        )
        .then(() => {});

      return attachments;
    },
    enabled: !!hcpId,
    staleTime: 30 * 60 * 1000, // 30 min — attachments don't change
  });
}
