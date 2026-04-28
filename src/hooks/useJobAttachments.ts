import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HcpAttachment {
  id: string;
  file_name: string;
  url: string;
  file_type: string;
  created_at?: string;
  file_path?: string;
  path?: string;
  hidden_from_tech_share?: boolean;
}

/**
 * Fetches job attachments from our local job_attachments table and, when an
 * HCP id is available, merges in cached/imported HCP attachments.
 */
export function useJobAttachments(hcpId: string | undefined, jobId?: string) {
  return useQuery({
    queryKey: ["job-attachments", hcpId || null, jobId || null],
    queryFn: async () => {
      const normalize = (raw: any): HcpAttachment[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw as HcpAttachment[];
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      };

      const ensureUrl = (list: HcpAttachment[]): HcpAttachment[] =>
        list.map((attachment: any) => {
          if (attachment.url) return attachment;
          const path = attachment.file_path || attachment.path;
          if (!path) return attachment;
          const { data: publicUrl } = supabase.storage.from("job-photos").getPublicUrl(path);
          return { ...attachment, path, url: publicUrl.publicUrl };
        });

      const localResult = jobId
        ? await (supabase as any)
          .from("job_attachments")
          .select("id,file_name,file_path,file_type,created_at,hidden_from_tech_share")
          .eq("job_id", jobId)
          .order("created_at", { ascending: false })
        : { data: [], error: null };

      if (localResult.error) throw localResult.error;

      const localAttachments = ensureUrl((localResult.data || []).map((row: any) => ({
        ...row,
        path: row.file_path,
      })));

      if (!hcpId) return localAttachments;

      const mergeAttachments = (remoteAttachments: HcpAttachment[]) => {
        const seen = new Set<string>();
        return [...localAttachments, ...remoteAttachments].filter((attachment: any) => {
          const key = attachment.id || attachment.hcp_attachment_id || attachment.url || attachment.file_path || attachment.path;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const { data: cached } = await (supabase
        .from("job_attachment_cache" as any)
        .select("attachments")
        .eq("hcp_id", hcpId)
        .maybeSingle() as any);

      if ((cached as any)?.attachments) {
        return mergeAttachments(ensureUrl(normalize((cached as any).attachments)));
      }

      const { data, error } = await supabase.functions.invoke("fetch-job-attachments", {
        body: { hcp_id: hcpId },
      });
      if (error) throw error;

      const remoteAttachments = ensureUrl(normalize(data?.attachments));

      supabase
        .from("job_attachment_cache" as any)
        .upsert(
          { hcp_id: hcpId, attachments: remoteAttachments as any, fetched_at: new Date().toISOString() } as any,
          { onConflict: "hcp_id" },
        )
        .then(() => {});

      return mergeAttachments(remoteAttachments);
    },
    enabled: !!hcpId || !!jobId,
    staleTime: 30 * 60 * 1000,
  });
}
