import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTaskModel } from "../_shared/getTaskModel.ts";
import { resolveContact } from "../_shared/resolveContact.ts";
import { verifyAddress } from "../_shared/verifyContact.ts";

import { getCentralToday } from "../_shared/formatters.ts";import { corsHeaders } from "../_shared/cors.ts";

// ── Structured extraction tool for SMS contact info ──
const smsExtractTool = {
  type: "function",
  function: {
    name: "extract_sms_data",
    description: "Extract structured customer data and intent from an SMS conversation.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "Customer's first name if mentioned" },
        last_name: { type: "string", description: "Customer's last name if mentioned" },
        email: { type: "string", description: "Email address if provided" },
        phone: { type: "string", description: "Alternate phone if provided (not the texting number)" },
        address: { type: "string", description: "Street address if provided" },
        city: { type: "string", description: "City if provided" },
        state: { type: "string", description: "State if provided (2-letter)" },
        zip: { type: "string", description: "ZIP code if provided" },
        lockbox_code: { type: "string", description: "Lockbox or gate code if mentioned" },
        intent: {
          type: "string",
          enum: ["booking", "reschedule", "cancel", "question", "complaint", "confirmation", "info_reply", "other"],
          description: "Customer's primary intent. 'info_reply' = they are providing contact info in response to a prior call or request.",
        },
        service_type: {
          type: "string",
          enum: ["repair", "maintenance", "install", "estimate", "other"],
          description: "Type of service if identifiable",
        },
        scheduling_preference: { type: "string", description: "Any date/time preference mentioned" },
        summary: { type: "string", description: "One-line summary of what the customer wants" },
        urgency: { type: "string", enum: ["low", "medium", "high", "emergency"] },
        suggested_action: { type: "string", description: "What the dispatcher should do next" },
        suggested_reply: { type: "string", description: "A short, ready-to-send SMS reply (1-2 sentences, friendly, professional, no greeting needed). Empty string if no reply is appropriate." },
      },
      required: ["intent", "summary", "urgency"],
      additionalProperties: false,
    },
  },
};




/** Get workflow step context for an active job */
async function getWorkflowContext(supabase: any, jobId: string): Promise<string> {
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (!job) return "";

  // Simplified server-side workflow stage detection
  const stage = detectServerStage(job);
  return `\nJob is currently at workflow step: "${stage.label}" (owned by: ${stage.owner}). ${stage.hint}`;
}

/** Server-side lightweight stage detection (mirrors client useWorkflowStage logic) */
function detectServerStage(job: any): { label: string; owner: string; hint: string } {
  const jt = job.job_type || "service";

  // Check key timestamps in order for common workflows
  if (!job.scheduled_date) return { label: "Schedule", owner: "office", hint: "Job needs to be scheduled." };
  if (!job.confirmation_sent_at && jt !== "maintenance") return { label: "Send Confirmation", owner: "office", hint: "Confirmation text not sent yet." };
  if (!job.dispatch_sent_at) return { label: "Dispatch", owner: "office", hint: "Tech hasn't been dispatched yet." };
  if (!job.eta_sent_at) return { label: "Send ETA", owner: "tech", hint: "Tech needs to send ETA to customer." };
  if (job.status !== "in_progress" && job.status !== "done" && job.status !== "invoiced") return { label: "Mark In Progress", owner: "tech", hint: "Tech is on site, needs to mark in progress." };
  if (!job.completion_form_submitted_at) return { label: "Completion Form", owner: "tech", hint: "Tech needs to fill out the completion form." };
  if (!job.invoice_sent_at) return { label: "Send Invoice", owner: "office", hint: "Invoice needs to be sent to customer." };
  if (!job.payment_collected_at) return { label: "Collect Payment", owner: "customer", hint: "Waiting for customer payment." };
  if (!job.review_requested_at) return { label: "Request Review", owner: "office", hint: "Review request not sent yet." };
  return { label: "Complete", owner: "system", hint: "All steps done." };
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    const from = params.get("From") || "";
    const body = params.get("Body") || "";
    const messageSid = params.get("MessageSid") || "";

    // ── Capture Twilio metadata ──
    const fromCity = params.get("FromCity") || null;
    const fromState = params.get("FromState") || null;
    const fromZip = params.get("FromZip") || null;
    const numSegments = parseInt(params.get("NumSegments") || "0", 10) || null;
    const toNumber = params.get("To") || null;

    // ── Parse MMS media attachments & download to public storage ──
    const numMedia = parseInt(params.get("NumMedia") || "0", 10);
    const rawMedia: { url: string; content_type: string }[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = params.get(`MediaUrl${i}`);
      const contentType = params.get(`MediaContentType${i}`) || "application/octet-stream";
      if (url) rawMedia.push({ url, content_type: contentType });
    }

    // Download media from Twilio to public storage (Twilio URLs require auth)
    const supabaseUrlEarly = Deno.env.get("SUPABASE_URL")!;
    const supabaseKeyEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    let mediaUrls: { url: string; content_type: string }[] = [];

    if (rawMedia.length > 0) {
      const earlyClient = createClient(supabaseUrlEarly, supabaseKeyEarly);
      const extMap: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "video/mp4": ".mp4", "application/pdf": ".pdf" };

      mediaUrls = await Promise.all(rawMedia.map(async (m, i) => {
        try {
          // Twilio media URLs redirect to a temp CDN URL.
          // We must follow the redirect manually because:
          // 1) The initial URL requires Basic Auth
          // 2) The redirect target (twiliocdn.com) rejects the auth header
          const authHeader = "Basic " + btoa(`${accountSid}:${authToken}`);

          // Step 1: Request with auth, but don't auto-follow redirects
          const initialResp = await fetch(m.url, {
            headers: { Authorization: authHeader },
            redirect: "manual",
          });

          let mediaResp: Response;
          if (initialResp.status >= 300 && initialResp.status < 400) {
            // Step 2: Follow redirect WITHOUT auth header
            const cdnUrl = initialResp.headers.get("location");
            if (!cdnUrl) { console.error(`MMS redirect had no Location header for media ${i}`); return m; }
            mediaResp = await fetch(cdnUrl);
          } else if (initialResp.ok) {
            mediaResp = initialResp;
          } else {
            console.error(`Failed to download media ${i}: HTTP ${initialResp.status}`);
            return m;
          }

          if (!mediaResp.ok) { console.error(`Failed to fetch media ${i} from CDN: HTTP ${mediaResp.status}`); return m; }

          const blob = await mediaResp.arrayBuffer();
          const ext = extMap[m.content_type] || ".bin";
          const storagePath = `${messageSid || crypto.randomUUID()}/${i}${ext}`;

          const { error: upErr } = await earlyClient.storage.from("mms-media").upload(storagePath, blob, {
            contentType: m.content_type,
            upsert: true,
          });
          if (upErr) { console.error(`Storage upload failed for media ${i}:`, upErr); return m; }

          const { data: pubUrl } = earlyClient.storage.from("mms-media").getPublicUrl(storagePath);
          console.log(`MMS media ${i} migrated to storage: ${pubUrl.publicUrl}`);
          return { url: pubUrl.publicUrl, content_type: m.content_type };
        } catch (e) {
          console.error(`Media download error ${i}:`, e);
          return m; // fallback to Twilio URL
        }
      }));
    }

    // Append [Photo attached] to body so logs/AI see something meaningful
    const enrichedBody = mediaUrls.length > 0 && body
      ? `${body} [${mediaUrls.length} attachment${mediaUrls.length > 1 ? "s" : ""}]`
      : mediaUrls.length > 0
      ? `[${mediaUrls.length} attachment${mediaUrls.length > 1 ? "s" : ""}]`
      : body;

    if (!from || (!body && mediaUrls.length === 0)) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const normalizedFrom = from.replace(/\D/g, "").slice(-10);

    // Check if test mode (human_in_the_loop) is on
    const { data: testModeSetting } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "human_in_the_loop")
      .maybeSingle();
    const testModeOn = testModeSetting?.value === "true";

    const { data: jarvisSettings } = await supabase
      .from("company_settings")
      .select("key, value")
      .in("key", ["jarvis_alert_phone", "sms_alert_enabled", "answering_service_phone"]);

    const jarvisSettingsMap: Record<string, string> = {};
    for (const row of (jarvisSettings || []) as any[]) jarvisSettingsMap[row.key] = row.value;

    const smsAlertEnabled = jarvisSettingsMap["sms_alert_enabled"] !== "false"; // default true
    const jarvisPhone = smsAlertEnabled ? (jarvisSettingsMap["jarvis_alert_phone"]?.trim() || null) : null;

    // ── Answering Service Relay Guard ──
    // The answering service uses a single relay number to forward customer inquiries to us.
    // The SMS *body* contains the real customer (Caller / Phone), not the sender.
    // Never auto-create a customer for this number; never overwrite the contact label.
    const answeringServiceDigits = (jarvisSettingsMap["answering_service_phone"] || "").replace(/\D/g, "").slice(-10);
    const isAnsweringService = answeringServiceDigits.length === 10 && normalizedFrom === answeringServiceDigits;

    // Find recent outbound SMS to link reply to a job
    const { data: recentOutbound } = await supabase.from("sms_log")
      .select("related_job_id")
      .eq("direction", "outbound")
      .eq("phone_number", from)
      .not("related_job_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const threadedJobId = recentOutbound?.[0]?.related_job_id || null;

    let { contactName, contactType, matchedEmployee } = await resolveContact(supabase, from);
    let isEmployee = !!matchedEmployee;

    // Force contact label for answering service relay (group under Vendors in inbox)
    if (isAnsweringService) {
      contactName = "Answering Service";
      contactType = "vendor";
      isEmployee = false;
    }

    // ── Test Mode: no special employee override needed anymore ──

    // Check for reminder confirmation/reschedule replies (C or R from customers)
    const normalizedBody = body.trim().toUpperCase();

    // RESET command removed — use Intake Simulator instead

    if ((normalizedBody === "C" || normalizedBody === "R") && !isEmployee && !testModeOn) {
      console.log(`Processing confirmation reply "${normalizedBody}" from ${from}`);

      const { data: reminders } = await supabase.from("job_reminders")
        .select("id, job_id")
        .in("status", ["sent"])
        .is("customer_response", null)
        .order("scheduled_for", { ascending: false })
        .limit(50);

      let matchedReminder: any = null;
      for (const r of reminders || []) {
        const { data: job } = await supabase.from("jobs")
          .select("customer_phone")
          .eq("id", r.job_id)
          .single();
        if (job?.customer_phone && job.customer_phone.replace(/\D/g, "").slice(-10) === normalizedFrom) {
          matchedReminder = { ...r, customer_phone: job.customer_phone };
          break;
        }
      }

      if (matchedReminder) {
        const responseText = normalizedBody === "C" ? "confirmed" : "reschedule_requested";
        await supabase.from("job_reminders")
          .update({ customer_response: responseText })
          .eq("job_id", matchedReminder.job_id)
          .in("status", ["sent"])
          .is("customer_response", null);

        await supabase.from("sms_log").insert({
          direction: "inbound", phone_number: from, body, twilio_sid: messageSid,
          related_job_id: matchedReminder.job_id, contact_name: contactName, contact_type: contactType,
          from_city: fromCity, from_state: fromState, from_zip: fromZip, num_segments: numSegments,
          to_number: toNumber,
        } as any);

        // Surface to dispatcher instead of auto-replying
        const actionTitle = normalizedBody === "C"
          ? `${contactName || from} confirmed their appointment`
          : `${contactName || from} wants to reschedule`;
        await supabase.from("action_items").insert({
          title: actionTitle,
          description: normalizedBody === "C"
            ? "Customer replied C to confirm. Send them a confirmation text."
            : "Customer replied R to reschedule. Reach out to find a new time.",
          category: normalizedBody === "C" ? "confirmation" : "reschedule",
          priority: normalizedBody === "R" ? "high" : "medium",
          source: "jarvis",
          status: "pending",
          customer_phone: from,
          job_id: matchedReminder.job_id,
        });

        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }
    }

    // Vendor matching — check if this phone belongs to a vendor contact
    let relatedVendorId: string | null = null;
    if (!isEmployee) {
      try {
        const { data: vc } = await supabase.from("vendor_contacts").select("supply_house_id, phone").not("phone", "is", null);
        for (const c of vc || []) {
          if (c.phone && c.phone.replace(/\D/g, "").slice(-10) === normalizedFrom) {
            relatedVendorId = c.supply_house_id;
            break;
          }
        }
        if (!relatedVendorId) {
          const { data: houses } = await supabase.from("supply_houses").select("id, contact_phone, text_support_phone").eq("is_active", true);
          for (const h of houses || []) {
            const hp = h.contact_phone?.replace(/\D/g, "").slice(-10);
            const tp = h.text_support_phone?.replace(/\D/g, "").slice(-10);
            if ((hp && hp === normalizedFrom) || (tp && tp === normalizedFrom)) {
              relatedVendorId = h.id;
              break;
            }
          }
        }
      } catch (e) { console.error("vendor phone match failed:", e); }
    }

    // Log inbound message (with MMS media if present)
    const { data: logEntry } = await supabase.from("sms_log").insert({
      direction: "inbound",
      phone_number: from,
      body: enrichedBody,
      twilio_sid: messageSid,
      related_job_id: threadedJobId,
      contact_name: contactName,
      contact_type: contactType,
      from_city: fromCity,
      from_state: fromState,
      from_zip: fromZip,
      num_segments: numSegments,
      to_number: toNumber,
      ...(relatedVendorId ? { related_vendor_id: relatedVendorId } : {}),
      ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
    } as any).select("id").single();

    // ── Push notification to all mobile users for inbound SMS ──
    try {
      const { data: tokens } = await supabase.from("push_tokens").select("user_id");
      const uniqueUserIds = [...new Set((tokens || []).map((t: any) => t.user_id))];
      const senderLabel = contactName || from;
      const snippet = (enrichedBody || "").slice(0, 80);
      for (const uid of uniqueUserIds) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: uid,
            title: `📱 SMS from ${senderLabel}`,
            body: snippet || "New message",
            data: { type: "sms" },
          }),
        }).catch((e) => console.error("[Push] SMS push failed:", e));
      }
    } catch (pushErr) {
      console.error("[Push] SMS push error:", pushErr);
    }

    // ── SMS Alert Forwarding: forward inbound customer texts to owner's cell ──
    if (jarvisPhone && !isEmployee) {
      try {
        const senderLabel = contactName || from;
        const fwdBody = `📱 SMS from ${senderLabel}:\n${(enrichedBody || "").slice(0, 300)}`;
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            to: jarvisPhone,
            body: fwdBody,
            internal: true,
          }),
        });
        console.log(`[SMS Alert] Forwarded inbound SMS from ${from} to ${jarvisPhone}`);
      } catch (fwdErr) {
        console.error("[SMS Alert] Forward failed:", fwdErr);
      }
    }

    // Find a recent job linked to this customer phone — ONE SOURCE OF TRUTH: DB function
    let customerJob: any = null;
    let upcomingEstimate: any = null;
    if (!isEmployee) {
      const { data: job } = await supabase
        .rpc("find_job_by_phone", { digits: normalizedFrom })
        .maybeSingle();
      customerJob = job;

      // Also look up an upcoming/today estimate for this phone (HCP overlay surface
      // has both jobs and estimates; a "callback" SMS for a pending estimate should
      // get appended as a note, not spawn a new booking card).
      const todayCT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
      const todayStr = todayCT.toISOString().slice(0, 10);
      const { data: est } = await supabase
        .from("estimates")
        .select("id, hcp_id, customer_name, customer_phone, scheduled_date, status, assigned_to")
        .gte("scheduled_date", todayStr)
        .not("status", "in", "(canceled,lost,won,converted)")
        .order("scheduled_date", { ascending: true })
        .limit(20);
      if (est && est.length) {
        upcomingEstimate = est.find((e: any) =>
          (e.customer_phone || "").replace(/\D/g, "").slice(-10) === normalizedFrom
        ) || null;
      }
    }

    if (customerJob && logEntry?.id && !threadedJobId) {
      await supabase.from("sms_log").update({ related_job_id: customerJob.id }).eq("id", logEntry.id);
    }

    const linkedJobId = threadedJobId || customerJob?.id || null;

    // Employee SMS — log and return (no automated reply)
    if (isEmployee && matchedEmployee) {
      console.log(`Inbound SMS from employee ${matchedEmployee.name} — logged`);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // ── Answering Service Relay Handler ──
    // The body is a structured form: "Caller: <name>\nPhone: <digits>\nComments: <issue>"
    // Parse it, look up / hint at the real customer, and create a To-Do for the dispatcher to call back.
    // Then RETURN — never run auto-customer-creation on the 844 number itself.
    if (isAnsweringService && !testModeOn) {
      try {
        const txt = body || "";
        const grab = (label: string) => {
          const re = new RegExp(`${label}\\s*:?\\s*([^\\n\\r]+)`, "i");
          const m = txt.match(re);
          return m?.[1]?.trim() || null;
        };
        const callerName = grab("Caller") || grab("Name") || null;
        const callerPhoneRaw = grab("Phone") || null;
        const callerCompany = grab("Company");
        const urgency = (grab("Urgent") || "").toLowerCase();
        const callType = grab("Call Type") || grab("Type");
        const comments = grab("Comments") || grab("Message") || txt.slice(0, 300);

        const callerDigits = (callerPhoneRaw || "").replace(/\D/g, "").slice(-10);
        const isUrgent = urgency.includes("urgent") && !urgency.includes("non");

        // Check if the REAL caller already exists in our CRM
        let realCustomerId: string | null = null;
        let realCustomerName: string | null = null;
        if (callerDigits.length === 10) {
          const { data: realCust } = await supabase
            .rpc("find_customer_by_phone", { digits: callerDigits })
            .maybeSingle();
          if (realCust) {
            realCustomerId = (realCust as any).id;
            const fn = (realCust as any).first_name || "";
            const ln = (realCust as any).last_name || "";
            realCustomerName = `${fn} ${ln}`.trim() || null;
          }
        }

        const displayName = realCustomerName || callerName || "Unknown caller";
        const callbackPhone = callerPhoneRaw || "(no callback number provided)";

        // Surface to dispatcher
        await supabase.from("action_items").insert({
          title: `📞 Answering Service: ${displayName} — ${callType || "inquiry"}`,
          description: `Real caller: ${displayName}\nCallback: ${callbackPhone}${callerCompany && callerCompany !== "N/A" ? `\nCompany: ${callerCompany}` : ""}\n\n${comments}`,
          category: "new_lead",
          priority: isUrgent ? "high" : "medium",
          source: "answering_service",
          status: "pending",
          customer_phone: callerPhoneRaw || from,
          metadata: {
            customer_name: displayName,
            callback_phone: callerPhoneRaw,
            relay_phone: from,
            existing_customer_id: realCustomerId,
            urgency,
            call_type: callType,
          },
        });

        // (To-Do creation removed — answering-service relays now live solely on the action_items card.)


        console.log(`[Answering Service] Logged inquiry from ${displayName} (${callbackPhone}); existing customer: ${realCustomerId || "none"}`);
      } catch (e) {
        console.error("[Answering Service] Parse/insert failed:", e);
      }

      // Hard return — skip auto-customer-creation, AI extraction, all of it.
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }
    // Skip "new_lead" action items for known non-customer contacts (vendors, marketing, spam, etc.)
    const NON_LEAD_TYPES = ["vendor", "marketing", "answering_service", "spam", "tech_partner"];
    const isKnownNonLead = NON_LEAD_TYPES.includes(contactType);

    if (!isEmployee && !customerJob && !testModeOn && !isKnownNonLead) {
      // Suppression window: if we sent an outbound SMS to this number in the last 10 min,
      // a human (or AI) is already actively replying — skip the new card.
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentOutbound } = await supabase
        .from("sms_log")
        .select("id")
        .eq("direction", "outbound")
        .eq("phone_number", from)
        .gte("created_at", tenMinAgo)
        .limit(1)
        .maybeSingle();

      if (recentOutbound) {
        console.log(`Observer: SKIPPED new_lead for ${from} — recent outbound reply (<10 min)`);
      } else {
        await supabase.from("action_items").insert({
          title: `New SMS from ${contactName || from}`,
          description: `New lead or returning customer texted: "${body.slice(0, 200)}". No active job found — review and respond.`,
          category: "new_lead",
          priority: "high",
          source: "jarvis",
          status: "pending",
          customer_phone: from,
          metadata: { customer_name: contactName, message_preview: body.slice(0, 300) },
        });
        console.log(`Observer: created new_lead action_item for ${from}`);
      }
    } else if (isKnownNonLead) {
      console.log(`Observer: SKIPPED new_lead for ${from} — known ${contactType} (${contactName})`);
    }

    // ── Observer mode: structured extraction + call correlation + auto-customer creation ──
    // FIX #2: Extraction always runs for non-employee inbound SMS, regardless of auto-draft setting
    if (!isEmployee && !testModeOn) {
      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiApiKey) {
        try {
          // ── 1. Gather context: SMS thread + recent call_log for this phone ──
          const { data: recentThread } = await supabase.from("sms_log")
            .select("direction, body, created_at")
            .eq("phone_number", from)
            .order("created_at", { ascending: false })
            .limit(10);

          const threadContext = (recentThread || []).reverse()
            .map((m: any) => `[${m.direction === "outbound" ? "Us" : "Them"}] ${m.body.slice(0, 200)}`)
            .join("\n");

          // Cross-reference: check call_log for recent inbound call from same number (24h window)
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: recentCalls } = await supabase.from("call_log")
            .select("id, ai_summary, call_extraction, transcription, direction, status, created_at")
            .eq("phone_number", from)
            .eq("direction", "inbound")
            .gte("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: false })
            .limit(3);

          let callContext = "";
          let callExtraction: any = null;
          if (recentCalls && recentCalls.length > 0) {
            const latestCall = recentCalls[0];
            callExtraction = latestCall.call_extraction;
            const callSummary = latestCall.ai_summary || "";
            callContext = `\n\nRECENT CALL CONTEXT (${latestCall.created_at}):\n${callSummary}`;
            if (callExtraction) {
              callContext += `\nCall extraction data: service_type=${callExtraction.service_type || "?"}, scheduling=${callExtraction.scheduling_preference || "?"}, problem=${callExtraction.problem_description || "?"}`;
            }
          }

          const customerContext = customerJob
            ? `Phone matches job #${customerJob.hcp_job_number} for ${customerJob.customer_name} (${customerJob.job_type}, scheduled ${customerJob.scheduled_date}).`
            : "No active job found for this phone number.";

          // ── 2. RAG context for business rules ──
          let ragContext = "";
          try {
            const { ragSearch } = await import("../_shared/ragSearch.ts");
            ragContext = await ragSearch(supabase, body, { matchCount: 5 });
          } catch (ragErr) {
            console.error("SMS RAG search failed (non-fatal):", ragErr);
          }

          // ── 3. Structured AI extraction via tool calling ──
          const model = await getTaskModel(supabase, "sms_auto_reply");
          // FIX #3: Include MMS media context in extraction prompt
          const mediaHint = mediaUrls.length > 0
            ? `\n\nATTACHED MEDIA (${mediaUrls.length} file${mediaUrls.length > 1 ? "s" : ""}):\n${mediaUrls.map((m, i) => `${i + 1}. ${m.content_type} — ${m.url}`).join("\n")}\nNote: Customer sent photo/video attachments. Consider these as evidence of the issue when determining intent and urgency.`
            : "";

          const analysisPrompt = `Analyze this inbound SMS and extract ALL customer contact information and intent. This is for an HVAC company CRM.

Customer: ${contactName || from} (${from})
${customerContext}
${callContext}
${ragContext}${mediaHint}

SMS Thread:
${threadContext}

Latest message: "${body}"

IMPORTANT RULES:
- Extract ALL contact details: name, email, address, city, state, zip, lockbox/gate codes
- If the customer is REPLYING to a prior phone call with their info, set intent to "info_reply"
- If a recent call discussed scheduling/booking AND this SMS provides address or contact info, that's a BOOKING intent
- If our last outbound message asked for contact info or scheduling details, and this SMS provides that, classify as BOOKING intent
- Infer service_type from call context if not explicit in SMS
- Extract scheduling preferences from both SMS and call context
- For addresses in Texas, default state to "TX" if not specified`;

          const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: analysisPrompt }],
              tools: [smsExtractTool],
              tool_choice: { type: "function", function: { name: "extract_sms_data" } },
            }),
          });

          if (!aiResp.ok) {
            console.error(`SMS extraction AI error: ${aiResp.status}`, await aiResp.text());
            throw new Error("AI extraction failed");
          }

          const aiData = await aiResp.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall) throw new Error("No tool call in AI response");

          const extracted = JSON.parse(toolCall.function.arguments);
          console.log(`SMS extraction for ${from}:`, JSON.stringify(extracted).slice(0, 300));

          // ── 3. Auto-create or update customer from extracted data ──
          const hasContactInfo = extracted.first_name || extracted.last_name || extracted.email || extracted.address;
          let resolvedCustomerId: string | null = null;

          // GUARD: If this number is already labeled in known_contacts, the user has
          // explicitly told us who they are (e.g. "Robert Madden" saved under this #).
          // Do NOT auto-create a new customer from a name mentioned IN the SMS body —
          // the SMS author may be referring to a third party (e.g. "Tell Angel to call me").
          const { data: knownContact } = await supabase
            .from("known_contacts")
            .select("name, contact_type")
            .eq("phone_digits", normalizedFrom)
            .maybeSingle();

          if (hasContactInfo && knownContact) {
            console.log(`SMS: skipped auto-create — number is known_contact "${knownContact.name}" (${knownContact.contact_type})`);
          } else if (hasContactInfo) {
            // Check if customer exists
            const { data: existingCustData } = await supabase
              .rpc("find_customer_by_phone", { digits: normalizedFrom })
              .limit(1)
              .maybeSingle();
            const existingCust: any = existingCustData;

            if (existingCust) {
              resolvedCustomerId = existingCust.id;
              // Update empty fields only (safety rails — never overwrite)
              const { data: custFull } = await supabase.from("customers")
                .select("first_name, last_name, email, address, city, state, zip, notes")
                .eq("id", existingCust.id).single();

              if (custFull) {
                const updates: Record<string, string> = {};
                if (!custFull.first_name && extracted.first_name) updates.first_name = extracted.first_name;
                if (!custFull.last_name && extracted.last_name) updates.last_name = extracted.last_name;
                if (!custFull.email && extracted.email) updates.email = extracted.email;

                // Verify address via Google if provided
                let verifiedAddr: string | null = null;
                if (extracted.address && !custFull.address) {
                  const geo = await verifyAddress(extracted.address, extracted.city, extracted.state, extracted.zip);
                  verifiedAddr = geo?.confidence && geo.confidence >= 0.8 ? geo.standardized : null;
                  updates.address = verifiedAddr ? verifiedAddr.split(",")[0] : extracted.address;
                  if (!custFull.city && (extracted.city || geo?.city)) updates.city = extracted.city || geo?.city || "";
                  if (!custFull.state && (extracted.state || geo?.state)) updates.state = extracted.state || geo?.state || "";
                  if (!custFull.zip && (extracted.zip || geo?.zip)) updates.zip = extracted.zip || geo?.zip || "";
                }

                // Append lockbox code to notes
                if (extracted.lockbox_code) {
                  const lockNote = `Lockbox: ${extracted.lockbox_code}`;
                  updates.notes = custFull.notes ? `${custFull.notes}\n${lockNote}` : lockNote;
                }

                if (Object.keys(updates).length > 0) {
                  await supabase.from("customers").update(updates).eq("id", existingCust.id);
                  console.log(`SMS: updated customer ${existingCust.id} with`, Object.keys(updates));
                }
              }
            } else if (extracted.first_name || extracted.last_name) {
              // Auto-create new customer
              let verifiedAddr: string | null = null;
              if (extracted.address) {
                const geo = await verifyAddress(extracted.address, extracted.city, extracted.state, extracted.zip);
                verifiedAddr = geo?.confidence && geo.confidence >= 0.8 ? geo.standardized : null;
              }

              const noteParts: string[] = [];
              if (extracted.lockbox_code) noteParts.push(`Lockbox: ${extracted.lockbox_code}`);
              if (callExtraction?.problem_description) noteParts.push(`From call: ${callExtraction.problem_description}`);

              const { data: newCust } = await supabase.from("customers").insert({
                first_name: extracted.first_name || null,
                last_name: extracted.last_name || null,
                phone: from,
                email: extracted.email || null,
                address: verifiedAddr ? verifiedAddr.split(",")[0] : (extracted.address || null),
                city: extracted.city || null,
                state: extracted.state || "TX",
                zip: extracted.zip || null,
                notes: noteParts.length > 0 ? noteParts.join("\n") : `Auto-created from SMS intake`,
              }).select("id").single();

              if (newCust) {
                resolvedCustomerId = newCust.id;
                console.log(`SMS: auto-created customer ${newCust.id} for ${from}`);

                // Backfill call_log and sms_log with customer link
                await supabase.from("call_log")
                  .update({ related_customer_id: newCust.id, contact_name: `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim(), contact_type: "customer" })
                  .eq("phone_number", from)
                  .is("related_customer_id", null);

                await supabase.from("sms_log")
                  .update({ contact_name: `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim(), contact_type: "customer" })
                  .eq("phone_number", from)
                  .in("contact_type", ["unknown", "lead"]);
              }
            }
          }

          // ── 4. Determine booking intent (combined SMS + call context) ──
          // STRICT: only an explicit booking/reschedule from the SMS extractor counts.
          // info_reply (customer just sending name/email/address) is NOT a new booking —
          // it's CRM info that should merge into any existing pending card, never create a new one.
          const isExplicitBookingIntent =
            extracted.intent === "booking" || extracted.intent === "reschedule";
          const isInfoReply = extracted.intent === "info_reply";

          // Merge service_type from call if SMS didn't provide one
          const effectiveServiceType = (extracted.service_type && extracted.service_type !== "other")
            ? extracted.service_type
            : (callExtraction?.service_type || "service");

          const effectiveScheduling = extracted.scheduling_preference || callExtraction?.scheduling_preference || null;

          const customerName = extracted.first_name
            ? `${extracted.first_name} ${extracted.last_name || ""}`.trim()
            : (contactName || from);

          // Dedup window: any pending booking card for this phone in the last 2 hours
          // (covers extended back-and-forth SMS threads with the customer providing info piecemeal)
          const dedupWindow = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: existingBookings } = await supabase.from("action_items")
            .select("id, metadata, title")
            .eq("category", "new_appointment")
            .eq("customer_phone", from)
            .eq("status", "pending")
            .gte("created_at", dedupWindow)
            .order("created_at", { ascending: false })
            .limit(5);
          // Use array+[0] (NOT maybeSingle) — once 2+ pending cards exist, maybeSingle errors
          // out silently and we'd create yet another duplicate forever. This is the bug that
          // produced 4 stacked Justo/Jesus Lopez cards.
          const existingBooking = existingBookings?.[0] || null;

          // ACTIVE-WORK SUPPRESSION: if customer has an open job OR an upcoming/today
          // estimate, this SMS is a follow-up on existing work, NOT a new booking.
          // Append the SMS as a note on the HCP record (job or estimate) and create a
          // `follow_up` card — do not spawn a Book It Now.
          const hasActiveJob = !!customerJob;
          const hasUpcomingEstimate = !!upcomingEstimate;
          const shouldSuppressBooking =
            (isExplicitBookingIntent || isInfoReply) && (hasActiveJob || hasUpcomingEstimate);

          if (shouldSuppressBooking) {
            const target = hasActiveJob ? "job" : "estimate";
            const targetRecord = hasActiveJob ? customerJob : upcomingEstimate;
            const ref = hasActiveJob
              ? (customerJob.hcp_job_number ? `Job #${customerJob.hcp_job_number}` : "open job")
              : `upcoming estimate ${upcomingEstimate.scheduled_date || ""}`.trim();

            // Build the note from the SMS + AI extraction
            const noteParts: string[] = [`Customer SMS: "${body.slice(0, 400)}"`];
            if (extracted.summary) noteParts.push(`AI summary: ${extracted.summary}`);
            if (extracted.scheduling_preference) noteParts.push(`Scheduling pref: ${extracted.scheduling_preference}`);
            if (extracted.scheduled_date) noteParts.push(`Requested date: ${extracted.scheduled_date}${extracted.scheduled_time ? " " + extracted.scheduled_time : ""}`);
            if (extracted.lockbox_code) noteParts.push(`Lockbox: ${extracted.lockbox_code}`);
            if (extracted.address) noteParts.push(`Address provided: ${extracted.address}`);
            if (extracted.email) noteParts.push(`Email: ${extracted.email}`);
            const noteContent = noteParts.join("\n");

            // Push to HCP (best-effort)
            try {
              const noteBody: any = { note: noteContent, source: "SMS Inbound" };
              if (hasActiveJob) noteBody.job_id = customerJob.id;
              else noteBody.estimate_id = upcomingEstimate.id;
              const { error: noteErr } = await supabase.functions.invoke("push-job-note-hcp", { body: noteBody });
              if (noteErr) console.error("[sms-webhook] push-job-note-hcp failed:", noteErr);
              else console.log(`[sms-webhook] Pushed SMS as HCP note to ${target} ${targetRecord.id}`);
            } catch (e) {
              console.error("[sms-webhook] note push exception:", e);
            }

            // Create a low-key follow_up card for dispatcher visibility
            await supabase.from("action_items").insert({
              title: `${customerName} texted about ${ref}`,
              description: extracted.summary || `Follow-up SMS on existing ${target} — note added to HCP`,
              category: "follow_up",
              priority: "normal",
              source: "sms",
              status: "pending",
              customer_phone: from,
              job_id: hasActiveJob ? customerJob.id : null,
              suggested_action: `Review ${ref} — customer messaged with new info`,
              metadata: {
                customer_name: customerName,
                customer_id: resolvedCustomerId,
                phone: from,
                suppressed_booking: true,
                suppressed_reason: hasActiveJob ? "active_job_in_progress" : "upcoming_estimate",
                active_job_id: hasActiveJob ? customerJob.id : null,
                upcoming_estimate_id: hasUpcomingEstimate ? upcomingEstimate.id : null,
                sms_extraction: extracted,
                thread_snippet: body.slice(0, 200),
              },
            });
            console.log(`SMS: SUPPRESSED booking for ${from} — appended to ${target} ${targetRecord.id}`);
          } else if (isInfoReply && existingBooking) {
            // Customer is just providing more info (name/email/address) on a booking we already
            // queued — merge richer fields into the existing card; do NOT create a new one.
            const mergedMeta = {
              ...((existingBooking.metadata as any) || {}),
              customer_name: customerName,
              customer_id: resolvedCustomerId,
              email: extracted.email || (existingBooking.metadata as any)?.email || null,
              address: extracted.address || (existingBooking.metadata as any)?.address || null,
              lockbox_code: extracted.lockbox_code || (existingBooking.metadata as any)?.lockbox_code || null,
              sms_extraction: extracted,
            };
            await supabase.from("action_items")
              .update({ metadata: mergedMeta })
              .eq("id", existingBooking.id);
            console.log(`SMS: MERGED info_reply into existing booking card ${existingBooking.id} for ${from}`);
          } else if (isInfoReply) {
            // info_reply with no existing booking card — just CRM update, no card needed
            console.log(`SMS: info_reply for ${from} but no pending booking card — skipping card creation (CRM updated only)`);
          } else if (isExplicitBookingIntent) {
            // Remove generic new_lead if we just created one
            if (!customerJob) {
              await supabase.from("action_items")
                .delete()
                .eq("category", "new_lead")
                .eq("customer_phone", from)
                .eq("status", "pending")
                .gte("created_at", new Date(Date.now() - 60_000).toISOString());
            }

            const bookingMetadata = {
              customer_name: customerName,
              customer_id: resolvedCustomerId,
              customer_phone: from,
              phone: from,
              email: extracted.email || null,
              address: extracted.address || null,
              lockbox_code: extracted.lockbox_code || null,
              job_type: effectiveServiceType === "estimate" ? "estimate" : effectiveServiceType,
              service_type: effectiveServiceType,
              scheduling_preference: effectiveScheduling,
              scheduled_date: extracted.scheduled_date || callExtraction?.scheduled_date || null,
              scheduled_time: extracted.scheduled_time || callExtraction?.scheduled_time || null,
              description: extracted.summary || callExtraction?.problem_description || body.slice(0, 200),
              sms_extraction: extracted,
              call_extraction: callExtraction || null,
              correlated_call: recentCalls?.[0]?.id || null,
              // FIX #4: Include MMS media URLs in metadata
              ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
            };

            if (existingBooking) {
              // Merge richer data into existing action_item
              const mergedMeta = { ...((existingBooking.metadata as any) || {}), ...bookingMetadata };
              await supabase.from("action_items")
                .update({ metadata: mergedMeta, description: extracted.suggested_action || `Updated booking info from follow-up SMS.` })
                .eq("id", existingBooking.id);
              console.log(`Observer: UPDATED existing booking action_item ${existingBooking.id} for ${from} (dedup)`);
            } else {
              await supabase.from("action_items").insert({
                title: `📱 ${customerName} — ${effectiveServiceType} booking request`,
                description: extracted.suggested_action || `Customer provided contact info via SMS after a phone call. Ready to book ${effectiveServiceType}.`,
                category: "new_appointment",
                priority: "high",
                source: "sms",
                status: "pending",
                customer_phone: from,
                job_id: linkedJobId,
                suggested_action: `Book ${effectiveServiceType} for ${customerName}`,
                metadata: bookingMetadata,
              });
              console.log(`Observer: created BOOKING action_item for ${from} — correlated with call: ${!!callExtraction}`);
            }

            // ── Inject booking card into active copilot session ──
            try {
              const { data: sessions } = await supabase.from("copilot_sessions")
                .select("id, user_id")
                .is("ended_at", null)
                .order("created_at", { ascending: false })
                .limit(1);

              if (sessions?.[0]) {
                const actionCard = {
                  type: effectiveServiceType === "estimate" ? "book_estimate" : "book_job",
                  job_type: effectiveServiceType === "estimate" ? "estimate" : effectiveServiceType,
                  customer_name: customerName,
                  phone: from,
                  address: extracted.address || null,
                  email: extracted.email || null,
                  description: extracted.summary || callExtraction?.problem_description || "",
                };

                const parts: string[] = [];
                parts.push(`**Customer:** ${customerName}`);
                parts.push(`**Phone:** ${from}`);
                if (extracted.email) parts.push(`**Email:** ${extracted.email}`);
                if (extracted.address) parts.push(`**Address:** ${extracted.address}${extracted.city ? `, ${extracted.city}` : ""}${extracted.zip ? ` ${extracted.zip}` : ""}`);
                if (extracted.lockbox_code) parts.push(`**Lockbox:** ${extracted.lockbox_code}`);
                parts.push(`**Service:** ${effectiveServiceType}`);
                if (effectiveScheduling) parts.push(`**Preferred time:** ${effectiveScheduling}`);
                if (callExtraction?.problem_description) parts.push(`**From call:** ${callExtraction.problem_description}`);

                const cardContent = `📱 **SMS Booking Intent — ${customerName}**\n\n${parts.join("\n")}\n\n${callExtraction ? "✅ Correlated with recent phone call." : ""} Ready to book?`;

                await supabase.from("copilot_messages").insert({
                  user_id: sessions[0].user_id,
                  session_id: sessions[0].id,
                  role: "assistant",
                  content: cardContent,
                  metadata: { suggested_actions: [actionCard] },
                });
                console.log(`SMS: injected booking card into copilot for ${customerName}`);
              }
            } catch (cardErr) {
              console.error("SMS booking card injection error:", cardErr);
            }

            // (To-Do creation removed — lockbox codes / scheduling notes now flow through action_items + booking card only.)

          } else if (extracted.intent !== "other" && extracted.intent !== "confirmation") {
            // Non-booking but actionable intent
            if (customerJob) {
              const jobRef = customerJob.hcp_job_number ? `#${customerJob.hcp_job_number}` : null;
              const jobWhen = customerJob.scheduled_date
                ? new Date(customerJob.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" })
                : null;

              // Pull address from customer record for full context
              let jobAddr: string | null = null;
              if (resolvedCustomerId) {
                const { data: c } = await supabase.from("customers")
                  .select("address, city").eq("id", resolvedCustomerId).maybeSingle();
                if (c) jobAddr = [c.address, c.city].filter(Boolean).join(", ") || null;
              }

              // Rich title: WHO + WHAT
              const titleParts: string[] = [];
              titleParts.push(`📱 ${customerName}`);
              if (jobRef) titleParts.push(jobRef);
              if (customerJob.job_type) titleParts.push(`(${customerJob.job_type})`);
              const richTitle = `${titleParts.join(" ")} — ${extracted.summary || "sent a message"}`;

              // Description: WHEN + WHERE + WHY context
              const ctxParts: string[] = [];
              if (jobWhen) ctxParts.push(`📅 ${jobWhen}`);
              if (jobAddr) ctxParts.push(`📍 ${jobAddr}`);
              const ctxLine = ctxParts.length > 0 ? `${ctxParts.join("  •  ")}\n` : "";
              const richDescription = `${ctxLine}${extracted.suggested_action || `Review and respond`}`;

              await supabase.from("action_items").insert({
                title: richTitle,
                description: richDescription,
                category: "thread_attention",
                priority: extracted.urgency === "high" ? "high" : "medium",
                source: "jarvis",
                status: "pending",
                customer_phone: from,
                job_id: linkedJobId,
                metadata: {
                  sms_extraction: extracted,
                  customer_name: customerName,
                  customer_id: resolvedCustomerId,
                  phone: from,
                  thread_snippet: body.slice(0, 200),
                  inbound_message: body,
                  suggested_reply: extracted.suggested_reply || null,
                  job_ref: jobRef,
                  job_type: customerJob.job_type,
                  job_address: jobAddr,
                  job_scheduled: jobWhen,
                },
              });
              console.log(`Observer: created action_item for ${from} — intent: ${extracted.intent}`);
            }
          }
        } catch (obsErr) {
          console.error("Observer analysis error:", obsErr);
          // FIX #3: Fallback action_item on AI failure — never silently drop
          try {
            await supabase.from("action_items").insert({
              title: `📱 Review SMS from ${contactName || from}`,
              description: `AI extraction failed. Message: "${body.slice(0, 200)}". Please review and respond manually.`,
              category: "thread_attention",
              priority: "high",
              source: "sms",
              status: "pending",
              customer_phone: from,
              job_id: linkedJobId,
              metadata: { fallback: true, error: String(obsErr), message_preview: body.slice(0, 300), media_urls: mediaUrls.length > 0 ? mediaUrls : undefined },
            });
            console.log(`Observer: created FALLBACK action_item for ${from} after AI failure`);
          } catch (fallbackErr) {
            console.error("Fallback action_item insert also failed:", fallbackErr);
          }
        }
      }
    }



    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  } catch (error) {
    console.error("SMS webhook error:", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
    );
  }
});
