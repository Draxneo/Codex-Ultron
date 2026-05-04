import { resolveContact } from "../_shared/resolveContact.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Fetch SMS records missing contact info
    const { data: rows, error } = await supabase
      .from("sms_log")
      .select("id, phone_number, contact_name, contact_type, related_job_id")
      .or("contact_name.is.null,contact_name.eq.,contact_type.eq.unknown")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0, message: "Nothing to backfill" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Backfilling ${rows.length} SMS records`);

    let updated = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const { contactName, contactType } = await resolveContact(supabase, row.phone_number);

        let finalName = contactName;
        let finalType = contactType;

        // Fallback: check job customer_name if resolveContact found nothing
        if (!finalName && row.related_job_id) {
          const { data: job } = await supabase
            .from("jobs")
            .select("customer_name")
            .eq("id", row.related_job_id)
            .maybeSingle();
          if (job?.customer_name) {
            finalName = job.customer_name;
            finalType = "customer";
          }
        }

        if (finalName) {
          const { error: upErr } = await supabase
            .from("sms_log")
            .update({ contact_name: finalName, contact_type: finalType })
            .eq("id", row.id);
          if (upErr) {
            console.log(`Update error ${row.id}:`, upErr.message);
            errors++;
          } else {
            updated++;
          }
        }
      } catch (e) {
        console.log(`Error processing ${row.id}:`, e.message);
        errors++;
      }
    }

    const summary = { ok: true, total: rows.length, updated, errors };
    console.log("Backfill complete:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backfill-sms-contacts error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
