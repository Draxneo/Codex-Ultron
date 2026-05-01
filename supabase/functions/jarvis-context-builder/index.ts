/**
 * jarvis-context-builder
 *
 * Single-roundtrip builder for the JARVIS "click context" payload.
 * Replaces the old prose-prompt approach where every panel-open forced
 * the agent to redo search_customer / lookup_recent_jobs.
 *
 * Trigger types:
 *   - call      → { phone, contact_name?, call_sid? }
 *   - sms       → { phone, contact_name? }
 *   - email     → { subject, sender_email, sender_name?, body_summary? }
 *   - voicemail → { voicemail_id }   // call_log row with voicemail status
 *
 * Returns a JarvisContextPayload the frontend forwards to ai-task-agent
 * via body.jarvis_context, which the agent injects as a system message.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { resolveContact } from "../_shared/resolveContact.ts";
import { detectAddressDivergence } from "../_shared/verifyContact.ts";
import { describeActiveWork, lookupActiveWorkContext } from "../_shared/jarvisContactIntent.ts";

interface BuildRequest {
  trigger: "call" | "sms" | "email" | "voicemail";
  phone?: string;
  contact_name?: string;
  call_sid?: string;
  subject?: string;
  sender_email?: string;
  sender_name?: string;
  body_summary?: string;
  voicemail_id?: string;
}

const norm10 = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as BuildRequest;
    const sb = getSupabaseAdmin();

    const payload: any = {
      trigger: body.trigger,
      built_at: new Date().toISOString(),
      contact: null,
      artifact: null,
      recent_history: { jobs: [], calls: [], sms: [], emails: [] },
      suggested_actions: [],
      property_divergence: null, // Set when caller mentions a different address than their home record
      active_work: null,
    };

    // ── 1. Resolve the contact (phone-based triggers) ───────────────────────
    let phoneForLookup = body.phone;
    let resolvedFromVoicemail: any = null;

    if (body.trigger === "voicemail" && body.voicemail_id) {
      const { data: vm } = await sb
        .from("call_log")
        .select("id, phone_number, contact_name, contact_type, transcription, ai_summary, recording_url, duration_seconds, created_at, related_customer_id")
        .eq("id", body.voicemail_id)
        .maybeSingle();
      if (vm) {
        resolvedFromVoicemail = vm;
        phoneForLookup = vm.phone_number;
        payload.artifact = {
          kind: "voicemail",
          voicemail_id: vm.id,
          received_at: vm.created_at,
          duration_seconds: vm.duration_seconds,
          transcription: vm.transcription,
          ai_summary: vm.ai_summary,
          recording_url: vm.recording_url,
        };
      }
    }

    // ── 2. Customer / employee resolution ───────────────────────────────────
    if (phoneForLookup) {
      const resolved = await resolveContact(sb, phoneForLookup);
      const digits = norm10(phoneForLookup);

      // Look up full customer record if matched
      const { data: customerData } = await sb
        .rpc("find_customer_by_phone", { digits })
        .maybeSingle();
      const customer: any = customerData;

      let fullCustomer: any = null;
      if (customer?.id) {
        const { data: c } = await sb
          .from("customers")
          .select("id, first_name, last_name, email, phone, mobile_phone, address, city, state, zip, company, tags, notes")
          .eq("id", customer.id)
          .maybeSingle();
        fullCustomer = c;
      }

      // Customer enrichment (membership, last job, etc.)
      let enrichment: any = null;
      if (fullCustomer?.id) {
        const { data: enr } = await sb
          .rpc("get_customer_enrichment")
          .eq("customer_id", fullCustomer.id)
          .maybeSingle();
        enrichment = enr;
      }

      payload.contact = {
        type: resolved.contactType,
        name: resolved.contactName ?? body.contact_name ?? null,
        phone: phoneForLookup,
        phone_digits: digits,
        customer_id: fullCustomer?.id ?? null,
        employee_id: resolved.matchedEmployee?.id ?? null,
        customer: fullCustomer
          ? {
              id: fullCustomer.id,
              full_name: [fullCustomer.first_name, fullCustomer.last_name].filter(Boolean).join(" "),
              email: fullCustomer.email,
              address: [fullCustomer.address, fullCustomer.city, fullCustomer.state, fullCustomer.zip].filter(Boolean).join(", "),
              company: fullCustomer.company,
              tags: fullCustomer.tags,
              notes: fullCustomer.notes,
            }
          : null,
        enrichment: enrichment
          ? {
              job_count: enrichment.job_count,
              has_install: enrichment.has_install,
              last_job_date: enrichment.last_job_date,
              agreement_status: enrichment.agreement_status,
              agreement_plan_name: enrichment.agreement_plan_name,
              agreement_end_date: enrichment.agreement_end_date,
            }
          : null,
      };

      // ── 3. Recent history (parallel) ─────────────────────────────────────
      const customerId = fullCustomer?.id;
      const [jobsRes, unifiedRes, emailsRes] = await Promise.all([
        customerId
          ? sb.from("jobs")
              .select("id, hcp_job_number, job_type, status, scheduled_date, customer_name, address, assigned_to, total_amount")
              .eq("customer_id", customerId)
              .order("scheduled_date", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as any[] }),
        sb.rpc("get_unified_communications", {
          p_limit: 25,
          p_offset: 0,
          p_view: "all",
          p_search: phoneForLookup,
        }),
        customerId
          ? sb.from("emails")
              .select("id, subject, from_address, to_address, snippet, received_at, is_outbound")
              .eq("linked_customer_id", customerId)
              .order("received_at", { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      let unifiedRows = (unifiedRes as any).data || [];
      if ((unifiedRes as any).error) {
        console.warn("get_unified_communications failed; falling back to legacy call/SMS reads", (unifiedRes as any).error);
        const [callsFallback, smsFallback] = await Promise.all([
          sb.from("call_log")
            .select("id, direction, status, duration_seconds, ai_summary, transcription, recording_url, created_at")
            .eq(digits.length === 10 ? "phone_number" : "id", digits.length === 10 ? phoneForLookup : "")
            .order("created_at", { ascending: false })
            .limit(5),
          sb.from("sms_log")
            .select("id, direction, body, created_at, related_job_id")
            .eq("phone_number", phoneForLookup)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);
        unifiedRows = [
          ...((callsFallback.data || []) as any[]).map((row: any) => ({
            source_type: "call",
            source_id: row.id,
            direction: row.direction,
            status: row.status,
            ai_summary: row.ai_summary,
            transcription: row.transcription,
            recording_url: row.recording_url,
            event_at: row.created_at,
          })),
          ...((smsFallback.data || []) as any[]).map((row: any) => ({
            source_type: "sms",
            source_id: row.id,
            direction: row.direction,
            body: row.body,
            event_at: row.created_at,
            job_id: row.related_job_id,
          })),
        ].sort((a, b) => new Date(b.event_at || 0).getTime() - new Date(a.event_at || 0).getTime());
      }

      const recentCalls = unifiedRows
        .filter((row: any) => row.source_type === "call" || row.source_type === "voicemail")
        .slice(0, 5)
        .map((row: any) => ({
          id: row.source_id,
          direction: row.direction,
          status: row.status,
          ai_summary: row.ai_summary || row.summary_text,
          transcription: row.transcription,
          recording_url: row.recording_url,
          created_at: row.event_at,
          intake_status: row.intake_status,
          customer_id: row.customer_id,
          job_id: row.job_id,
          estimate_id: row.estimate_id,
        }));
      const recentSms = unifiedRows
        .filter((row: any) => row.source_type === "sms")
        .slice(0, 5)
        .map((row: any) => ({
          id: row.source_id,
          direction: row.direction,
          body: row.body || row.summary_text,
          created_at: row.event_at,
          related_job_id: row.job_id,
          intake_status: row.intake_status,
          customer_id: row.customer_id,
          estimate_id: row.estimate_id,
        }));

      payload.recent_history = {
        jobs: jobsRes.data || [],
        calls: recentCalls,
        sms: recentSms,
        emails: emailsRes.data || [],
      };

      const activeWork = await lookupActiveWorkContext(sb, {
        customerId,
        phone: phoneForLookup,
        pendingWindowHours: 6,
      });
      payload.active_work = {
        open_job: activeWork.activeJob,
        open_estimate: activeWork.activeEstimate,
        pending_booking: activeWork.pendingBooking,
        label: describeActiveWork(activeWork),
        should_create_new_work: !(activeWork.activeJob || activeWork.activeEstimate),
        rule: activeWork.activeJob || activeWork.activeEstimate
          ? "Treat ambiguous calls/SMS as updates to existing work unless the customer clearly asks for a separate new visit."
          : "No active work found; new booking may be appropriate if the customer intent supports it.",
      };

      // ── Address divergence detection (multi-property aware) ─────────────
      // Loads ALL known properties on this customer (primary billing + every
      // rental/secondary in customer_addresses) and matches the spoken address
      // against the FULL list. Outcomes:
      //   matched_primary   → silent, default behavior
      //   matched_secondary → use that rental as service_address (no new customer)
      //   divergent         → propose new linked-property customer
      if (fullCustomer?.id) {
        const { data: addrRows } = await sb
          .from("customer_addresses")
          .select("id, address_type, street, street_line_2, city, state, zip, is_primary")
          .eq("customer_id", fullCustomer.id);

        const known = (addrRows || []).map((r: any) => ({
          id: r.id,
          address_type: r.address_type,
          street: [r.street, r.street_line_2].filter(Boolean).join(" "),
          city: r.city,
          state: r.state,
          zip: r.zip,
          is_primary: r.is_primary,
          formatted: [r.street, r.street_line_2, r.city, r.state, r.zip].filter(Boolean).join(", "),
        }));

        // Fallback: include legacy billing address from customer row when
        // customer_addresses has no primary (older records).
        if (fullCustomer.address && !known.some((k: any) => k.is_primary || k.address_type === "billing")) {
          known.unshift({
            id: null as any,
            address_type: "billing",
            street: fullCustomer.address,
            city: fullCustomer.city,
            state: fullCustomer.state,
            zip: fullCustomer.zip,
            is_primary: true,
            formatted: [fullCustomer.address, fullCustomer.city, fullCustomer.state, fullCustomer.zip].filter(Boolean).join(", "),
          });
        }

        // Surface the property list on the contact so the agent can offer
        // a select_property card even when no spoken address is detected.
        if (payload.contact) {
          payload.contact.known_addresses = known.map((k: any) => ({
            id: k.id,
            label: k.address_type || (k.is_primary ? "primary" : "property"),
            formatted: k.formatted,
            is_primary: !!k.is_primary,
          }));
        }

        const textChunks: string[] = [];
        if (resolvedFromVoicemail?.transcription) textChunks.push(resolvedFromVoicemail.transcription);
        if (resolvedFromVoicemail?.ai_summary) textChunks.push(resolvedFromVoicemail.ai_summary);
        for (const c of recentCalls.slice(0, 3)) {
          if ((c as any).ai_summary) textChunks.push((c as any).ai_summary);
        }
        for (const s of recentSms.slice(0, 5)) {
          if ((s as any).body) textChunks.push((s as any).body);
        }
        const combined = textChunks.join("\n");
        if (combined) {
          const div = detectAddressDivergence(combined, fullCustomer, known);
          payload.property_divergence = div;
          if (div.outcome === "divergent") {
            payload.suggested_actions.unshift("Propose linked property contact");
          } else if (div.outcome === "matched_secondary") {
            payload.suggested_actions.unshift(`Service at ${div.matched_address?.address_type || "rental"} property`);
          }
        }
      }
    }

    // ── 4. Email-specific artifact ──────────────────────────────────────────
    if (body.trigger === "email") {
      payload.artifact = {
        kind: "email",
        subject: body.subject,
        sender_email: body.sender_email,
        sender_name: body.sender_name,
        body_excerpt: body.body_summary?.substring(0, 1500),
      };

      // Try to resolve sender by email if no phone-based contact was found
      if (!payload.contact && body.sender_email) {
        const { data: ec } = await sb
          .from("email_contacts")
          .select("customer_id, display_name")
          .eq("email_address", body.sender_email.toLowerCase())
          .maybeSingle();
        if (ec?.customer_id) {
          const { data: c } = await sb
            .from("customers")
            .select("id, first_name, last_name, phone, mobile_phone, address, city, state, email")
            .eq("id", ec.customer_id)
            .maybeSingle();
          if (c) {
            payload.contact = {
              type: "customer",
              name: ec.display_name ?? [c.first_name, c.last_name].filter(Boolean).join(" "),
              email: body.sender_email,
              customer_id: c.id,
              customer: {
                id: c.id,
                full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
                email: c.email,
                phone: c.mobile_phone || c.phone,
                address: [c.address, c.city, c.state].filter(Boolean).join(", "),
              },
            };
          }
        }
      }
    }

    // ── 5. Call/SMS artifact (for context completeness) ─────────────────────
    if (body.trigger === "call" && !payload.artifact) {
      payload.artifact = { kind: "call", call_sid: body.call_sid, phone: body.phone };
    }
    if (body.trigger === "sms" && !payload.artifact) {
      payload.artifact = { kind: "sms", phone: body.phone };
    }

    // ── 6. Suggested actions (lightweight heuristic) ────────────────────────
    const actions: string[] = [];
    if (payload.contact?.customer_id) {
      actions.push("Open customer record");
      if (payload.recent_history.jobs.length) actions.push("Review last job");
      if (payload.contact.enrichment?.agreement_status === "active") actions.push("Note: active membership");
      if (payload.contact.enrichment?.agreement_status === "expired") actions.push("Offer membership renewal");
    } else if (payload.contact?.phone || body.phone) {
      actions.push("Create new customer");
    }
    if (body.trigger === "voicemail") actions.push("Return call", "Send follow-up SMS");
    if (body.trigger === "email") actions.push("Draft reply");
    payload.suggested_actions = actions;

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("jarvis-context-builder error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
