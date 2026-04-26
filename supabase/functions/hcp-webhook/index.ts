import { formatName, formatAddress, formatCity, formatState, formatEmail, formatPhone, toCentralDate } from "../_shared/formatters.ts";
import {
  mapHcpJobToFields,
  mapHcpEstimateToFields,
  mapHcpJobStatus,
  mapHcpEstimateStatus,
  extractAssignedTo,
  parseBrand,
  parseTonnage,
  parseSystemType,
  parseAhriNumber,
} from "../_shared/hcp-mapper.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { logSystemError, pageOnCall } from "../_shared/resilience.ts";

/**
 * Fire-and-forget property data lookup for a newly-created job/estimate.
 * Cost-controlled: lookup-property has a daily cap and permanent cache,
 * so calling this on every new record is safe and idempotent.
 */
function triggerPropertyLookup(address: string | null, source: string) {
  if (!address || address.trim().length < 5) return;
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/lookup-property`;
    // Don't await — fire-and-forget so webhook returns fast
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
      },
      body: JSON.stringify({ address: address.trim() }),
    }).then(() => {
      console.log(`🏠 Property lookup queued for ${source}: ${address}`);
    }).catch((e) => {
      console.warn(`🏠 Property lookup failed for ${source}: ${e.message}`);
    });
  } catch (e) {
    console.warn("triggerPropertyLookup error:", e);
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("HCP_WEBHOOK_SECRET");

    // Verify webhook secret — require on every request when configured
    const url = new URL(req.url);
    const providedSecret = url.searchParams.get("secret") 
      || req.headers.get("x-webhook-secret")
      || req.headers.get("x-housecallpro-secret");
    
    if (webhookSecret) {
      if (!providedSecret || providedSecret !== webhookSecret) {
        console.log("Webhook auth failed — missing or invalid secret");
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const event = body.event || body.type || "unknown";
    const eventData = body.data || body.job || body.estimate || body;

    console.log("Webhook received:", event);
    console.log("Data ID:", eventData?.id, "| invoice_number:", eventData?.invoice_number);
    
    // Log assigned_employees structure for debugging
    if (eventData?.assigned_employees) {
      console.log("assigned_employees payload:", JSON.stringify(eventData.assigned_employees).substring(0, 500));
    }
    if (eventData?.dispatched_employees) {
      console.log("dispatched_employees payload:", JSON.stringify(eventData.dispatched_employees).substring(0, 500));
    }

    if (eventData?.id && String(eventData.id).startsWith("csr_")) {
      console.log("CSR PAYLOAD KEYS:", Object.keys(eventData).join(", "));
    }

    const supabase = getSupabaseAdmin();

    const isEstimateEvent = event.startsWith("estimate.");
    const isJobEvent = event.startsWith("job.");
    const isInvoiceEvent = event.startsWith("invoice.");
    const isCustomerEvent = event.startsWith("customer.");

    if (!isEstimateEvent && !isJobEvent && !isInvoiceEvent && !isCustomerEvent) {
      console.log("Skipping unrecognized event type:", event);
      return new Response(JSON.stringify({ ok: true, skipped: true, event, reason: "unrecognized_event_type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Invoice events ---
    if (isInvoiceEvent) {
      console.log("Routing to invoice handler for event:", event);
      const inv = eventData;
      const jobId = inv.job_id || inv.job?.id || null;

      // Resolve local job once for all invoice events
      let localJob: any = null;
      if (jobId) {
        const { data } = await supabase
          .from("jobs")
          .select("id, payment_collected_at, invoice_sent_at, status")
          .eq("hcp_id", jobId)
          .maybeSingle();
        localJob = data;
      }

      if (event === "invoice.paid" || event === "invoice.payment.succeeded") {
        if (localJob) {
          const patches: Record<string, any> = {};
          if (!localJob.invoice_sent_at) patches.invoice_sent_at = new Date().toISOString();
          if (!localJob.payment_collected_at) patches.payment_collected_at = new Date().toISOString();
          patches.status = "invoiced";
          patches.last_payment_error = null;
          patches.last_payment_error_at = null;
          await supabase.from("jobs").update(patches).eq("id", localJob.id);

          await supabase.from("activity_log").insert({
            job_id: localJob.id,
            action: "payment_received_hcp",
            performed_by: "HCP Webhook",
            details: `Payment received via HousecallPro (invoice ${inv.id || "unknown"}, event: ${event})`,
          });
          console.log(`${event} processed for job:`, localJob.id);
        } else {
          console.log(`${event} received but no local job found for HCP job_id:`, jobId);
        }
      } else if (event === "invoice.payment.failed") {
        if (localJob) {
          await supabase.from("jobs").update({
            last_payment_error: `Payment failed at ${new Date().toISOString()}`,
            last_payment_error_at: new Date().toISOString(),
          }).eq("id", localJob.id);
          await supabase.from("activity_log").insert({
            job_id: localJob.id,
            action: "payment_failed_hcp",
            performed_by: "HCP Webhook",
            details: `Payment failed for invoice ${inv.id || "unknown"}`,
          });
          console.log("invoice.payment.failed logged for job:", localJob.id);
        }
      } else if (event === "invoice.created" || event === "invoice.sent") {
        if (localJob && !localJob.invoice_sent_at) {
          await supabase.from("jobs").update({
            invoice_sent_at: new Date().toISOString(),
          }).eq("id", localJob.id);
          console.log(`${event}: stamped invoice_sent_at for job:`, localJob.id);
        }
      } else if (event === "invoice.canceled" || event === "invoice.voided") {
        if (localJob) {
          await supabase.from("activity_log").insert({
            job_id: localJob.id,
            action: `invoice_${event.split(".")[1]}_hcp`,
            performed_by: "HCP Webhook",
            details: `Invoice ${inv.id || "unknown"} ${event.split(".")[1]} in HousecallPro`,
          });
          console.log(`${event} logged for job:`, localJob.id);
        }
      } else if (event === "invoice.refund.succeeded") {
        if (localJob) {
          await supabase.from("activity_log").insert({
            job_id: localJob.id,
            action: "refund_processed_hcp",
            performed_by: "HCP Webhook",
            details: `Refund processed for invoice ${inv.id || "unknown"}`,
          });
          // Reset payment status if fully refunded
          await supabase.from("jobs").update({
            payment_collected_at: null,
          }).eq("id", localJob.id);
          console.log("invoice.refund.succeeded processed for job:", localJob.id);
        }
      } else {
        console.log(`Invoice event ${event} acknowledged (no specific handler)`);
      }

      return new Response(JSON.stringify({ ok: true, event, hcp_id: inv.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Customer events ---
    if (isCustomerEvent) {
      console.log("Routing to customer handler for event:", event);
      const cust = eventData;

      if (event === "customer.deleted" && cust.id) {
        // Soft-handle: tag the customer as deleted but don't remove data
        const { data: existing } = await supabase
          .from("customers")
          .select("id, tags")
          .eq("hcp_customer_id", cust.id)
          .maybeSingle();
        if (existing) {
          const currentTags = existing.tags || [];
          if (!currentTags.includes("hcp-deleted")) {
            await supabase.from("customers").update({
              tags: [...currentTags, "hcp-deleted"],
            }).eq("id", existing.id);
          }
          console.log("Customer tagged as hcp-deleted:", cust.id);
        }
      } else if (cust.id && (event === "customer.created" || event === "customer.updated")) {
        const custFields: Record<string, any> = {
          hcp_customer_id: cust.id,
          first_name: formatName(cust.first_name || null),
          last_name: formatName(cust.last_name || null),
        email: formatEmail(cust.email || null),
          phone: formatPhone(cust.mobile_number || cust.home_number || cust.work_number || cust.phone_number || null),
          mobile_phone: formatPhone(cust.mobile_number || null),
        };
        // Use first address if available
        const addr = Array.isArray(cust.addresses) && cust.addresses.length > 0 ? cust.addresses[0] : cust.address;
        if (addr) {
          custFields.address = formatAddress(addr.street || null);
          custFields.city = formatCity(addr.city || null);
          custFields.state = formatState(addr.state || null);
          custFields.zip = addr.zip || null;
        }
        if (cust.company) custFields.company = cust.company;

        const { data: existing } = await supabase
          .from("customers")
          .select("id")
          .eq("hcp_customer_id", cust.id)
          .maybeSingle();

        if (existing) {
          await supabase.from("customers").update(custFields).eq("id", existing.id);
          console.log("Customer updated:", cust.id);
        } else {
          // Before creating, check if a local customer already matches by phone or name+email
          let localMatch: any = null;

          // Try phone match
          const hcpPhone = formatPhone(cust.mobile_number || cust.home_number || cust.work_number || null);
          if (hcpPhone) {
            const digits = hcpPhone.replace(/\D/g, "").slice(-10);
            if (digits.length === 10) {
              const { data: phoneCust } = await supabase
                .rpc("find_customer_by_phone", { digits })
                .maybeSingle();
              if (phoneCust) localMatch = phoneCust;
            }
          }

          // Try address match
          if (!localMatch) {
            const addr = Array.isArray(cust.addresses) && cust.addresses.length > 0 ? cust.addresses[0] : null;
            const street = (addr?.street || "").trim().toLowerCase();
            if (street.length >= 5) {
              const { data: addrCusts } = await supabase
                .from("customers")
                .select("id")
                .ilike("address", `%${street}%`)
                .limit(1);
              if (addrCusts?.[0]) localMatch = addrCusts[0];

              // Also check customer_addresses table
              if (!localMatch) {
                const { data: addrRows } = await supabase
                  .from("customer_addresses")
                  .select("customer_id")
                  .ilike("street", `%${street}%`)
                  .limit(1);
                if (addrRows?.[0]) localMatch = { id: addrRows[0].customer_id };
              }
            }
          }

          // Try name match as last resort
          if (!localMatch && (cust.first_name || cust.last_name)) {
            const fn = (cust.first_name || "").toLowerCase().trim();
            const ln = (cust.last_name || "").toLowerCase().trim();
            if (fn && ln) {
              let q = supabase.from("customers").select("id");
              q = q.ilike("first_name", fn).ilike("last_name", ln);
              const { data: nameCusts } = await q.limit(1);
              if (nameCusts?.[0]) localMatch = nameCusts[0];
            }
          }

          if (localMatch) {
            // Link existing customer to HCP ID instead of creating duplicate
            await supabase.from("customers").update({
              ...custFields,
              hcp_customer_id: cust.id,
            }).eq("id", localMatch.id);
            console.log("Customer webhook linked to existing local record:", localMatch.id, "->", cust.id);
          } else {
            await supabase.from("customers").insert(custFields);
            console.log("Customer created:", cust.id);
          }
        }
      } else {
        console.log(`Customer event ${event} acknowledged`);
      }

      return new Response(JSON.stringify({ ok: true, event, hcp_id: cust.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Estimate events ---
    if (isEstimateEvent) {
      console.log("Routing to estimate handler for event:", event);
      const est = eventData;

      const estFields = mapHcpEstimateToFields(est);
      const mappedStatus = event === "estimate.approved" ? "won" : mapHcpEstimateStatus(est.work_status);

      console.log("Extracted assigned_to for estimate:", estFields.assigned_to);

      // Check if exists in estimates table and protect won/lost
      const { data: existing } = await supabase
        .from("estimates")
        .select("id, work_status")
        .eq("hcp_id", est.id)
        .maybeSingle();

      const protectedStatuses = ["won", "lost"];
      const shouldProtectStatus = existing && protectedStatuses.includes(existing.work_status);

      if (!shouldProtectStatus) {
        estFields.work_status = mappedStatus;
      }

      // --- Upsert customer for estimate ---
      const cust = est.customer || {};
      let resolvedCustomerId: string | null = null;
      if (cust.id) {
        const custName = estFields.customer_name;
        const nameParts = custName ? custName.split(" ") : [];
        const custFields: Record<string, any> = {
          hcp_customer_id: cust.id,
          first_name: formatName(cust.first_name || nameParts[0] || null),
          last_name: formatName(cust.last_name || nameParts.slice(1).join(" ") || null),
          email: formatEmail(cust.email || null),
          phone: formatPhone(cust.mobile_number || cust.home_number || cust.work_number || cust.phone_number || null),
          mobile_phone: formatPhone(cust.mobile_number || null),
        };
        if (est.address) {
          custFields.address = formatAddress(est.address.street || null);
          custFields.city = formatCity(est.address.city || null);
          custFields.state = formatState(est.address.state || null);
          custFields.zip = est.address.zip || null;
        }
        const { data: existingCust } = await supabase
          .from("customers")
          .select("id")
          .eq("hcp_customer_id", cust.id)
          .maybeSingle();
        if (existingCust) {
          resolvedCustomerId = existingCust.id;
          await supabase.from("customers").update(custFields).eq("id", existingCust.id);
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert(custFields)
            .select("id")
            .single();
          if (newCust) resolvedCustomerId = newCust.id;
        }
      }
      if (resolvedCustomerId) {
        estFields.customer_id = resolvedCustomerId;
      }

      // Check if this estimate was previously stuck in the jobs table
      const { data: jobsMatch } = await supabase
        .from("jobs")
        .select("id")
        .eq("hcp_id", est.id)
        .eq("job_type", "estimate")
        .maybeSingle();

      if (jobsMatch) {
        console.log("Found ghost estimate in jobs table, cleaning up:", jobsMatch.id);
        await supabase.from("sms_log").update({ related_job_id: null }).eq("related_job_id", jobsMatch.id);
        await supabase.from("call_log").update({ related_job_id: null }).eq("related_job_id", jobsMatch.id);
        await supabase.from("chat_channels").update({ job_id: null }).eq("job_id", jobsMatch.id);
        await supabase.from("activity_log").update({ job_id: null }).eq("job_id", jobsMatch.id);
        // (todos table removed)
        await supabase.from("tech_location_events").delete().eq("job_id", jobsMatch.id);
        await supabase.from("workflow_alerts").delete().eq("job_id", jobsMatch.id);
        await supabase.from("job_line_items").delete().eq("job_id", jobsMatch.id);
        await supabase.from("job_reminders").delete().eq("job_id", jobsMatch.id);
        await supabase.from("jobs").delete().eq("id", jobsMatch.id);
        console.log("Deleted ghost job record");
      }

      let action = "updated";
      if (existing) {
        await supabase.from("estimates").update(estFields).eq("id", existing.id);
      } else {
        estFields.work_status = mappedStatus;
        await supabase.from("estimates").insert(estFields).select("id").single();
        action = "created";
        // Trigger property data lookup for the new estimate's address (cost-controlled, cached forever)
        triggerPropertyLookup(estFields.address, `estimate ${est.id}`);
      }

      console.log(`Estimate ${action}:`, est.id);
      return new Response(JSON.stringify({ ok: true, action, event, hcp_id: est.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Job events ---
    console.log("Routing to job handler for event:", event);

    // --- job.appointment.* events have a different payload shape ---
    if (event.startsWith("job.appointment.")) {
      const appointment = eventData;
      // The job ID may be at appointment.job_id, appointment.job?.id, or top-level id
      const hcpJobId = appointment.job_id || appointment.job?.id || appointment.id;
      
      if (!hcpJobId) {
        console.log("job.appointment event with no job ID, skipping");
        return new Response(JSON.stringify({ ok: true, skipped: true, event }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: localJob } = await supabase
        .from("jobs")
        .select("id, assigned_to, scheduled_date")
        .eq("hcp_id", hcpJobId)
        .maybeSingle();

      if (localJob) {
        const patches: Record<string, any> = {};

        // Update schedule if appointment has new times.
        // IMPORTANT: scheduled_date must be the Central-Time date, not UTC,
        // so late-evening jobs don't roll forward a day on tech dashboards.
        if (appointment.scheduled_start || appointment.start_time) {
          const startTime = appointment.scheduled_start || appointment.start_time;
          const d = new Date(startTime);
          if (!isNaN(d.getTime())) {
            patches.scheduled_date = toCentralDate(startTime);
            patches.arrival_start = d.toISOString();
          }
        }
        if (appointment.scheduled_end || appointment.end_time) {
          const endTime = appointment.scheduled_end || appointment.end_time;
          const d = new Date(endTime);
          if (!isNaN(d.getTime())) {
            patches.arrival_end = d.toISOString();
          }
        }

        // Update assigned tech if pros_assigned/unassigned
        if (event === "job.appointment.appointment_pros_assigned" && appointment.assigned_employees) {
          const assignedTo = extractAssignedTo(appointment);
          if (assignedTo) patches.assigned_to = assignedTo;
        }
        if (event === "job.appointment.appointment_pros_unassigned") {
          patches.assigned_to = null;
        }
        if (event === "job.appointment.appointment_discarded") {
          patches.status = "canceled";
        }

        if (Object.keys(patches).length > 0) {
          await supabase.from("jobs").update(patches).eq("id", localJob.id);
        }

        await supabase.from("activity_log").insert({
          job_id: localJob.id,
          action: event.replace(/\./g, "_"),
          performed_by: "HCP Webhook",
          details: `Appointment event: ${event}`,
        });

        console.log(`${event} processed for job:`, localJob.id, patches);
      } else {
        console.log(`${event} received but no local job for HCP ID:`, hcpJobId);
      }

      return new Response(JSON.stringify({ ok: true, event, hcp_job_id: hcpJobId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hcpJob = eventData;

    // Guard: never create a job without a valid HCP id
    if (!hcpJob.id) {
      console.log("Skipping job event with no HCP id");
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_hcp_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(hcpJob.id).startsWith("csr_")) {
      console.log("Skipping csr_ job event:", hcpJob.id);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "csr_id", hcp_id: hcpJob.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle deletion — cascade FK cleanup first
    if (event === "job.deleted") {
      if (hcpJob.id) {
        const { data: delJob } = await supabase.from("jobs").select("id").eq("hcp_id", hcpJob.id).maybeSingle();
        if (delJob) {
          await supabase.from("sms_log").update({ related_job_id: null }).eq("related_job_id", delJob.id);
          await supabase.from("call_log").update({ related_job_id: null }).eq("related_job_id", delJob.id);
          await supabase.from("chat_channels").update({ job_id: null }).eq("job_id", delJob.id);
          await supabase.from("activity_log").update({ job_id: null }).eq("job_id", delJob.id);
          // (todos table removed)
          await supabase.from("tech_location_events").delete().eq("job_id", delJob.id);
          await supabase.from("workflow_alerts").delete().eq("job_id", delJob.id);
          await supabase.from("job_line_items").delete().eq("job_id", delJob.id);
          await supabase.from("job_reminders").delete().eq("job_id", delJob.id);
          await supabase.from("jobs").delete().eq("id", delJob.id);
          console.log("Deleted job with FK cleanup:", hcpJob.id);
        }
      }
      return new Response(JSON.stringify({ ok: true, action: "deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use shared mapper
    const jobFields = mapHcpJobToFields(hcpJob);
    
    // Also set rebate_eligible for installs
    if (jobFields.job_type === "install") {
      jobFields.rebate_eligible = true;
    }

    console.log("Extracted assigned_to:", jobFields.assigned_to);

    // --- Upsert customer for job ---
    const hcpCustomerId = jobFields.hcp_customer_id;
    let resolvedJobCustomerId: string | null = null;
    if (hcpCustomerId) {
      const nameParts = (jobFields.customer_name || "").split(" ");
      const custFields: Record<string, any> = {
        hcp_customer_id: hcpCustomerId,
        first_name: formatName(hcpJob.customer?.first_name || nameParts[0] || null),
        last_name: formatName(hcpJob.customer?.last_name || nameParts.slice(1).join(" ") || null),
        email: jobFields.customer_email,
        phone: formatPhone(hcpJob.customer?.mobile_number || hcpJob.customer?.home_number || hcpJob.customer?.work_number || hcpJob.customer?.phone_number || null),
        mobile_phone: formatPhone(hcpJob.customer?.mobile_number || null),
      };
      if (hcpJob.address) {
        custFields.address = formatAddress(hcpJob.address.street || null);
        custFields.city = formatCity(hcpJob.address.city || null);
        custFields.state = formatState(hcpJob.address.state || null);
        custFields.zip = hcpJob.address.zip || null;
      }
      const { data: existingCust } = await supabase
        .from("customers")
        .select("id")
        .eq("hcp_customer_id", hcpCustomerId)
        .maybeSingle();
      if (existingCust) {
        resolvedJobCustomerId = existingCust.id;
        await supabase.from("customers").update(custFields).eq("id", existingCust.id);
      } else {
        const { data: newCust } = await supabase
          .from("customers")
          .insert(custFields)
          .select("id")
          .single();
        if (newCust) resolvedJobCustomerId = newCust.id;
      }
    }
    if (resolvedJobCustomerId) {
      jobFields.customer_id = resolvedJobCustomerId;
    }

    // Check if job exists
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("hcp_id", hcpJob.id)
      .maybeSingle();

    let action = "updated";

    if (existingJob) {
      // Auto-map HCP status to local status for lifecycle events
      const ws = (hcpJob.work_status || "").toLowerCase();
      if (ws.includes("cancel") || ws.includes("pro canceled")) {
        jobFields.status = "canceled";
      }
      await supabase.from("jobs").update(jobFields).eq("id", existingJob.id);

      // ── Bridge: HCP job.completed → stamp workflow timestamps ──
      if (event === "job.completed" || ws.includes("complete")) {
        const { data: currentJob } = await supabase.from("jobs")
          .select("completion_form_sent_at, photos_uploaded_at, status")
          .eq("id", existingJob.id).single();
        if (currentJob) {
          const patches: Record<string, any> = {};
          if (!currentJob.completion_form_sent_at) patches.completion_form_sent_at = new Date().toISOString();
          if (!currentJob.photos_uploaded_at) patches.photos_uploaded_at = new Date().toISOString();
          if (currentJob.status !== "done" && currentJob.status !== "invoiced" && currentJob.status !== "canceled") {
            patches.status = "done";
          }
          if (Object.keys(patches).length > 0) {
            await supabase.from("jobs").update(patches).eq("id", existingJob.id);
          }
        }
        await supabase.from("activity_log").insert({
          job_id: existingJob.id,
          action: "job_completed_hcp",
          performed_by: "HCP Webhook",
          details: `Job marked complete in HousecallPro`,
        });
      }

      // ── Log work_timestamps for on_my_way / started events ──
      if (event === "job.on_my_way" || event === "job.started") {
        const ts = hcpJob.work_timestamps || {};
        const timestamp = event === "job.on_my_way" ? ts.on_my_way_at : ts.started_at;
        await supabase.from("activity_log").insert({
          job_id: existingJob.id,
          action: event === "job.on_my_way" ? "tech_on_my_way" : "tech_started_work",
          performed_by: jobFields.assigned_to || "HCP Webhook",
          details: timestamp ? `Timestamp: ${timestamp}` : `Event received from HCP`,
        });
      }
    } else {
      // Insert new job — set initial status
      jobFields.status = mapHcpJobStatus(hcpJob.work_status, jobFields.scheduled_date);

      const { data: newJob } = await supabase
        .from("jobs")
        .insert(jobFields)
        .select("id")
        .single();

      action = "created";

      // Trigger property data lookup for the new job's address (cost-controlled, cached forever)
      triggerPropertyLookup(jobFields.address, `job ${hcpJob.id}`);

      // Run finalize-job for side effects (chat, line items, workflow) — skip HCP push since it already exists there
      if (newJob) {
        try {
          await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/finalize-job`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              },
              body: JSON.stringify({
                job_id: newJob.id,
                created_by: "HCP Webhook",
                skip_hcp: true,
              }),
            }
          );
          console.log("finalize-job invoked for new webhook job:", newJob.id);
        } catch (finErr) {
          console.error("finalize-job invocation failed:", finErr);
        }
      }
    }

    // Backfill customer_phone from local customers table if still null
    const upsertedJobId = existingJob?.id || (action === "created" ? (await supabase.from("jobs").select("id").eq("hcp_id", hcpJob.id).maybeSingle())?.data?.id : null);
    if (upsertedJobId && !jobFields.customer_phone && jobFields.customer_id) {
      const { data: custRecord } = await supabase
        .from("customers")
        .select("phone, mobile_phone")
        .eq("id", jobFields.customer_id)
        .maybeSingle();
      const fallbackPh = custRecord?.mobile_phone || custRecord?.phone;
      if (fallbackPh) {
        await supabase.from("jobs").update({ customer_phone: fallbackPh }).eq("id", upsertedJobId);
        console.log("Backfilled customer_phone from customers table:", fallbackPh);
      }
    }

    console.log(`Job ${action}:`, hcpJob.id, "| assigned_to:", jobFields.assigned_to);

    return new Response(JSON.stringify({ ok: true, action, event, hcp_id: hcpJob.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    // Critical: HCP sync drift breaks the source of truth. Page admin.
    try {
      const supabase = getSupabaseAdmin();
      const errId = await (async () => {
        try {
          const { data } = await supabase.rpc("log_system_error", {
            p_source_type: "edge_function",
            p_source_name: "hcp-webhook",
            p_error_message: err.message ?? String(err),
            p_severity: "critical",
            p_stack_trace: err.stack ?? null,
            p_context: {},
            p_http_status: 500,
          });
          return data as string | null;
        } catch { return null; }
      })();
      await pageOnCall(supabase, {
        service: "hcp-webhook",
        summary: "HCP webhook 500",
        body: (err.message ?? String(err)).slice(0, 200),
        severity: "critical",
        related_error_id: errId,
      });
    } catch (e) {
      console.error("pageOnCall failed:", e);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
