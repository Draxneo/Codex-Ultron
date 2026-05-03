import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      error: "Email attachment refresh is retired. Customer-facing attachments now live on job, tech form, SMS/MMS, and subcontractor records.",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
