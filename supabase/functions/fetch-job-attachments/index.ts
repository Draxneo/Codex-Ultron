import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    let hcp_id: string | null = body.hcp_id || null;

    if (!hcp_id) {
      return new Response(JSON.stringify({ error: "hcp_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If a Supabase job UUID was passed instead of an HCP id, resolve it.
    if (UUID_RE.test(hcp_id)) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: job } = await supabase
        .from("jobs")
        .select("hcp_id")
        .eq("id", hcp_id)
        .maybeSingle();

      if (!job?.hcp_id) {
        // Native job — no HCP attachments to fetch
        return new Response(JSON.stringify({ attachments: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      hcp_id = job.hcp_id;
    }

    const apiKey = Deno.env.get("HCP_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "HCP_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.housecallpro.com/jobs/${hcp_id}?expand[]=attachments`;
    const resp = await fetch(url, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("HCP API error:", resp.status, text);
      // 404 = job not in HCP (native job) → return empty rather than error
      if (resp.status === 404) {
        return new Response(JSON.stringify({ attachments: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `HCP API returned ${resp.status}` }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const job = await resp.json();
    const attachments = (job.attachments || []).map((a: any) => ({
      id: a.id,
      file_name: a.file_name || a.filename || "attachment",
      url: a.url,
      file_type: a.file_type || a.content_type || "image/jpeg",
      created_at: a.created_at,
    }));

    return new Response(JSON.stringify({ attachments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fetch-job-attachments error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
