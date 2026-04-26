import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sbAuth = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await sbAuth.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email_id } = await req.json();
    if (!email_id) {
      return new Response(JSON.stringify({ error: "Missing email_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: email, error: emailErr } = await sb
      .from("emails")
      .select("attachments")
      .eq("id", email_id)
      .single();

    if (emailErr || !email) {
      return new Response(JSON.stringify({ error: "Email not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attachments = (email.attachments || []) as Array<{
      filename: string;
      content_type: string;
      size: number;
      path?: string;
      url?: string | null;
    }>;

    if (attachments.length === 0) {
      return new Response(JSON.stringify({ attachments: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate fresh signed URLs (30 days) for all attachments that have a storage path
    const refreshed = await Promise.all(
      attachments.map(async (att) => {
        if (!att.path) return att;
        const { data: signed } = await sb.storage
          .from("email-attachments")
          .createSignedUrl(att.path, 60 * 60 * 24 * 30);
        return { ...att, url: signed?.signedUrl || att.url };
      })
    );

    // Update the email record with fresh URLs
    await sb.from("emails").update({ attachments: refreshed as any }).eq("id", email_id);

    return new Response(JSON.stringify({ attachments: refreshed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refresh-attachment-url error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
