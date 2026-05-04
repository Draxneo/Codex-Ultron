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
  hcp_attachment_id?: string | null;
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

      const isHttpUrl = (value?: string | null) => /^https?:\/\//i.test(value || "");

      const ensureUrl = (list: HcpAttachment[]): HcpAttachment[] =>
        list.map((attachment: any) => {
          if (attachment.url) return attachment;
          const path = attachment.file_path || attachment.path;
          if (!path) return attachment;
          if (isHttpUrl(path)) return { ...attachment, path, url: path };
          const { data: publicUrl } = supabase.storage.from("job-photos").getPublicUrl(path);
          return { ...attachment, path, url: publicUrl.publicUrl };
        });

      const localResult = jobId
        ? await (supabase as any)
          .from("job_attachments")
          .select("id,file_name,file_path,file_type,created_at,hcp_attachment_id,hidden_from_tech_share")
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
          const attachmentId = attachment.hcp_attachment_id || attachment.id;
          const urlOrPath = attachment.url || attachment.file_path || attachment.path || "";
          const key = attachmentId
            ? `id:${attachmentId}`
            : urlOrPath
              ? `url:${String(urlOrPath).split("?")[0]}`
              : `name:${attachment.file_name || ""}:${attachment.created_at || ""}`;
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const { data, error } = await supabase.functions.invoke("fetch-job-attachments", {
        body: { hcp_id: hcpId, job_id: jobId || null },
      });
      if (error) {
        console.warn("fetch-job-attachments failed; showing local attachments only", error);
        return localAttachments;
      }

      const remoteAttachments = ensureUrl(normalize(data?.attachments));

      return mergeAttachments(remoteAttachments);
    },
    enabled: !!hcpId || !!jobId,
    staleTime: 30 * 60 * 1000,
  });
}
