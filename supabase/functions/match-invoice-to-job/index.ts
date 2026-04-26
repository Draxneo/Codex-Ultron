import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
            const sb = getSupabaseAdmin();

    const {
      source,
      source_ref_id,
      job_id: providedJobId,
      supply_house,
      items,
      total_cost,
      invoice_number,
      invoice_date,
      po_number, // NEW: when caller has extracted PO from invoice OCR
    } = await req.json();

    if (!source || !source_ref_id) {
      return new Response(JSON.stringify({ error: "source and source_ref_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: check if already bridged
    if (source === "photo") {
      const { data: existing } = await sb
        .from("tech_form_photos")
        .select("job_invoice_id")
        .eq("id", source_ref_id)
        .single();
      if (existing?.job_invoice_id) {
        return new Response(JSON.stringify({ success: true, existing: true, job_invoice_id: existing.job_invoice_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (source === "email") {
      const { data: existing } = await sb
        .from("emails")
        .select("job_invoice_id")
        .eq("id", source_ref_id)
        .single();
      if (existing?.job_invoice_id) {
        return new Response(JSON.stringify({ success: true, existing: true, job_invoice_id: existing.job_invoice_id }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Matching logic ──
    let matchedJobId: string | null = providedJobId || null;
    let matchConfidence: string = "manual";
    let matchStatus: string = "confirmed";
    let matchReason: string | null = null;

    // TIER 1 — photo → tech_form → job (highest confidence)
    if (source === "photo" && !matchedJobId) {
      const { data: photo } = await sb
        .from("tech_form_photos")
        .select("tech_form_id")
        .eq("id", source_ref_id)
        .single();
      if (photo?.tech_form_id) {
        const { data: form } = await sb
          .from("tech_forms")
          .select("job_id")
          .eq("id", photo.tech_form_id)
          .single();
        if (form?.job_id) {
          matchedJobId = form.job_id;
          matchConfidence = "high";
          matchStatus = "confirmed";
          matchReason = "Photo taken on job via tech form";
        }
      }
    }

    // TIER 1 — email with provided job_id
    if (source === "email" && matchedJobId) {
      matchConfidence = "high";
      matchStatus = "confirmed";
      matchReason = "Job ID provided with email";
    }

    // TIER 1 — PO number match (highest confidence: our team uses job # as PO)
    if (!matchedJobId && po_number) {
      const poDigits = String(po_number).replace(/[^0-9]/g, "");
      if (poDigits.length >= 3) {
        const { data: poJob } = await sb
          .from("jobs")
          .select("id, job_number, hcp_job_number")
          .or(`job_number.eq.${poDigits},hcp_job_number.eq.${poDigits}`)
          .maybeSingle();
        if (poJob?.id) {
          matchedJobId = poJob.id;
          matchConfidence = "high";
          matchStatus = "confirmed";
          matchReason = `PO #${poDigits} matched job ${poJob.job_number || poJob.hcp_job_number}`;
        }
      }
    }

    // TIER 2 — email: scan subject for job number
    if (source === "email" && !matchedJobId) {
      const { data: emailRow } = await sb
        .from("emails")
        .select("subject, from_address, body_text")
        .eq("id", source_ref_id)
        .single();

      if (emailRow) {
        const jobNumMatch = (emailRow.subject || "").match(/#?(\d{3,})/);
        if (jobNumMatch) {
          const { data: job } = await sb
            .from("jobs")
            .select("id")
            .eq("job_number", jobNumMatch[1])
            .maybeSingle();
          if (job) {
            matchedJobId = job.id;
            matchConfidence = "medium";
            matchStatus = "confirmed";
            matchReason = `Job #${jobNumMatch[1]} found in email subject`;
          }
        }

        // TIER 2 — match by sender email to customer's open jobs today
        if (!matchedJobId && emailRow.from_address) {
          const { data: customer } = await sb
            .from("customers")
            .select("id")
            .ilike("email", emailRow.from_address)
            .maybeSingle();

          if (customer) {
            const today = new Date().toISOString().split("T")[0];
            const { data: openJobs } = await sb
              .from("jobs")
              .select("id")
              .eq("customer_id", customer.id)
              .eq("scheduled_date", today)
              .not("status", "in", '("completed","cancelled","invoiced","done")')
              .limit(2);

            if (openJobs && openJobs.length === 1) {
              matchedJobId = openJobs[0].id;
              matchConfidence = "medium";
              matchStatus = "confirmed";
              matchReason = `Matched to customer's only open job today`;
            } else if (openJobs && openJobs.length > 1) {
              matchConfidence = "low";
              matchStatus = "pending_review";
              matchReason = `Customer has ${openJobs.length} open jobs today — needs manual match`;
            }
          }
        }

        // TIER 3 — no match
        if (!matchedJobId && matchStatus !== "pending_review") {
          matchConfidence = "low";
          matchStatus = "pending_review";
          matchReason = "No job match found — needs manual assignment";
        }
      }
    }

    // Resolve supply_house_id from name
    let supplyHouseId: string | null = null;
    if (supply_house) {
      const { data: sh } = await sb
        .from("supply_houses")
        .select("id")
        .ilike("name", `%${supply_house}%`)
        .maybeSingle();
      if (sh) supplyHouseId = sh.id;
    }

    // Create job_invoices record
    const insertPayload: Record<string, unknown> = {
      source,
      source_ref_id,
      match_confidence: matchConfidence,
      match_status: matchStatus,
      match_reason: matchReason,
      extraction_status: "done",
      extracted_items: items || [],
      total_amount: total_cost || null,
      invoice_number: invoice_number || null,
      invoice_date: invoice_date || null,
      po_number: po_number ? String(po_number).replace(/[^0-9]/g, "") || null : null,
      uploaded_by: source === "photo" ? "Tech (photo)" : "Email bridge",
    };

    if (matchedJobId) insertPayload.job_id = matchedJobId;
    if (supplyHouseId) insertPayload.supply_house_id = supplyHouseId;

    // job_id is required on the table — if no match, we need to handle this.
    // For pending_review with no job, we'll set a placeholder and rely on review.
    if (!matchedJobId) {
      // Cannot insert without job_id if it's required — check if nullable
      // If not nullable, we skip insert and just log for review
      // For safety, let's try the insert and handle the error
    }

    const { data: invoice, error: insertErr } = await sb
      .from("job_invoices")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertErr) {
      console.error("Failed to insert job_invoice:", insertErr);
      // If job_id is required and we don't have one, log to activity_log only
      if (insertErr.message?.includes("job_id") || insertErr.code === "23502") {
        await sb.from("activity_log").insert({
          action: "invoice_match_needed",
          details: `Supply ticket needs job assignment: ${supply_house || "Unknown"} $${(total_cost || 0).toFixed(2)}`,
        });
        return new Response(JSON.stringify({ success: true, pending_review: true, no_job_match: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertErr;
    }

    const jobInvoiceId = invoice.id;

    // Update source record with job_invoice_id
    if (source === "photo") {
      await sb.from("tech_form_photos").update({ job_invoice_id: jobInvoiceId }).eq("id", source_ref_id);
    } else if (source === "email") {
      await sb.from("emails").update({ job_invoice_id: jobInvoiceId } as any).eq("id", source_ref_id);
    }

    // If pending_review, log to activity_log
    if (matchStatus === "pending_review") {
      await sb.from("activity_log").insert({
        action: "invoice_match_needed",
        job_id: matchedJobId || null,
        details: `Supply ticket needs job assignment: ${supply_house || "Unknown"} $${(total_cost || 0).toFixed(2)}`,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      job_invoice_id: jobInvoiceId,
      match_confidence: matchConfidence,
      match_status: matchStatus,
      match_reason: matchReason,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("match-invoice-to-job error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
