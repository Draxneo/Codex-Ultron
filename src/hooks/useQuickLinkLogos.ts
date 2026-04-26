import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useQuickLinkLogos() {
  const queryClient = useQueryClient();

  const { data: logos, isLoading } = useQuery({
    queryKey: ["quick-link-logos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_link_logos")
        .select("url, logo_url");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (row.logo_url) map[row.url] = row.logo_url;
      }
      return map;
    },
  });

  const fetchLogos = useMutation({
    mutationFn: async (urls: string[]) => {
      // Extract base domains for scraping (not full URLs with paths/params)
      const domainMap: Record<string, string> = {};
      for (const url of urls) {
        try {
          const u = new URL(url);
          const base = `${u.protocol}//${u.hostname}`;
          domainMap[base] = url; // map base domain back to original
        } catch {
          domainMap[url] = url;
        }
      }

      const uniqueDomains = Object.keys(domainMap);

      const { data, error } = await supabase.functions.invoke("fetch-site-logos", {
        body: { urls: uniqueDomains },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch logos");

      // Upsert results into DB
      const logoResults = data.logos as Record<string, string | null>;
      for (const [domain, logoUrl] of Object.entries(logoResults)) {
        if (!logoUrl) continue;
        // Store against the original full URL
        const originalUrl = domainMap[domain] || domain;
        await supabase
          .from("quick_link_logos")
          .upsert(
            { url: originalUrl, logo_url: logoUrl, fetched_at: new Date().toISOString() },
            { onConflict: "url" }
          );
      }

      return logoResults;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quick-link-logos"] });
      toast.success("Site logos updated");
    },
    onError: (err: Error) => {
      toast.error(`Failed to fetch logos: ${err.message}`);
    },
  });

  return { logos: logos || {}, isLoading, fetchLogos };
}
