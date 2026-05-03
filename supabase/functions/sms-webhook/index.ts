import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTaskModel } from "../_shared/getTaskModel.ts";
import { resolveContact } from "../_shared/resolveContact.ts";
import { verifyAddress } from "../_shared/verifyContact.ts";
import { validateTwilioSignature } from "../_shared/twilioSignature.ts";
import {
  buildJarvisIntentMetadata,
  classifyCustomerContactIntent,
  describeActiveWork,
  lookupActiveWorkContext,
} from "../_shared/jarvisContactIntent.ts";
import { upsertLiveActionItem } from "../_shared/actionItems.ts";
import { resolveSmsTemplateBody } from "../_shared/smsTemplates.ts";
import { getDefaultBusinessUnit, resolveBusinessUnitByPhone, type BusinessUnit } from "../_shared/businessUnits.ts";

import { getCentralNow, getCentralToday } from "../_shared/formatters.ts";
import { corsHeaders } from "../_shared/cors.ts";

function normalize10(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "").slice(-10);
}

function settingNumbers(value: string | null | undefined): string[] {
  return (value || "")
    .split(/[,;\n]/)
    .map((v) => normalize10(v))
    .filter((v) => v.length === 10);
}

function isGoogleRelayInbound(fromDigits: string, body: string, settings: Record<string, string>): boolean {
  const configured = [
    ...settingNumbers(settings["google_lsa_relay_numbers"]),
    ...settingNumbers(settings["google_ads_relay_numbers"]),
  ];
  if (configured.includes(fromDigits)) return true;

  const text = (body || "").toLowerCase();
  const hasGoogleSource =
    /\bgoogle\b/.test(text) ||
    text.includes("local services") ||
    text.includes("google screened") ||
    text.includes("google guarantee");
  const hasRelayLanguage =
    text.includes("respond to this thread") ||
    text.includes("reply to this thread") ||
    text.includes("respond to this message") ||
    text.includes("reply to this message") ||
    text.includes("customer's phone number") ||
    text.includes("customer phone number") ||
    text.includes("lead from google") ||
    text.includes("message from google");

  return hasGoogleSource && hasRelayLanguage;
}

type CustomerIdentityCandidate = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  confidence: "low" | "medium" | "high";
};

function titleCaseName(value: string | null): string | null {
  const cleaned = String(value || "")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .slice(0, 4)
    .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
    .join(" ");
}

function extractCustomerIdentityCandidate(text: string, senderPhone: string): CustomerIdentityCandidate | null {
  const bodyText = String(text || "").trim();
  if (!bodyText) return null;

  const email = bodyText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  const phoneMatch = bodyText.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const phone = phoneMatch?.[0] || senderPhone || null;
  const zip = bodyText.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;

  const namePatterns = [
    /\b(?:my name is|this is|name is|i am|i'm)\s+([a-z][a-z.'-]+(?:\s+[a-z][a-z.'-]+){0,3})\b/i,
    /\b(?:caller|customer|name)\s*:\s*([a-z][a-z.'-]+(?:\s+[a-z][a-z.'-]+){0,3})\b/i,
  ];
  let name: string | null = null;
  for (const pattern of namePatterns) {
    const match = bodyText.match(pattern);
    if (match?.[1]) {
      name = titleCaseName(match[1]);
      break;
    }
  }

  const addressPattern = /\b\d{2,6}\s+[a-z0-9.'# -]{2,80}\s+(?:st|street|rd|road|dr|drive|ave|avenue|blvd|boulevard|ln|lane|ct|court|cir|circle|trl|trail|trce|trace|way|pkwy|parkway|pl|place|cv|cove|loop|hwy|highway)\b(?:[^\n\r.]{0,80})?/i;
  const address = bodyText.match(addressPattern)?.[0]?.replace(/\s+/g, " ").trim() || null;
  const cityMatch = bodyText.match(/\b(?:in|city\s*:?)\s+([a-z][a-z .'-]{2,40})(?:,?\s+(?:tx|texas|\d{5})\b|$)/i);
  const city = titleCaseName(cityMatch?.[1] || null);
  const state = /\b(?:tx|texas)\b/i.test(bodyText) ? "TX" : null;

  const score =
    (name ? 2 : 0) +
    (address ? 3 : 0) +
    (email ? 1 : 0) +
    (phoneMatch ? 1 : 0) +
    (zip ? 1 : 0);

  if (score < 3) return null;
  return {
    name,
    phone,
    email,
    address,
    city,
    state,
    zip,
    confidence: score >= 6 ? "high" : score >= 4 ? "medium" : "low",
  };
}

function customerNameParts(name: string | null) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function fullNameFromParts(first?: string | null, last?: string | null, fallback?: string | null) {
  return [first, last].filter(Boolean).join(" ").trim() || fallback || null;
}

function composeAddress(street?: string | null, city?: string | null, state?: string | null, zip?: string | null) {
  return [street, city, state, zip].filter(Boolean).join(", ") || null;
}

function resolveThreadFollowUpDate(threadText: string, explicitDate?: string | null): string | null {
  const explicit = String(explicitDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;

  const text = String(threadText || "").toLowerCase();
  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const match = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (!match) return null;

  const now = getCentralNow();
  const currentDow = now.getUTCDay();
  const targetDow = weekdays[match[1]];
  let daysAhead = (targetDow - currentDow + 7) % 7;
  if (daysAhead === 0 && /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(text)) {
    daysAhead = 7;
  }
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysAhead,
    12,
    0,
    0,
  ));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

function quoteFollowUpLabel(threadText: string, fallback?: string | null): string | null {
  const text = String(threadText || "").toLowerCase();
  if (/\b(first thing|morning)\b/.test(text) && /\bmonday\b/.test(text)) return "Monday morning";
  if (/\bmonday\b/.test(text)) return "Monday";
  return fallback || null;
}

async function backfillCommunicationIdentity(
  supabase: any,
  args: {
    phone: string;
    businessUnitId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
  },
) {
  const name = args.customerName || null;
  const smsUpdates: Record<string, unknown> = {
    contact_type: "customer",
  };
  if (name) smsUpdates.contact_name = name;
  if (args.customerId) smsUpdates.related_customer_id = args.customerId;
  if (args.businessUnitId) smsUpdates.business_unit_id = args.businessUnitId;

  let smsBackfill = supabase.from("sms_log")
    .update(smsUpdates)
    .eq("phone_number", args.phone);
  if (args.businessUnitId) smsBackfill = smsBackfill.eq("business_unit_id", args.businessUnitId);
  await smsBackfill;

  const callUpdates: Record<string, unknown> = {
    contact_type: "customer",
  };
  if (name) callUpdates.contact_name = name;
  if (args.customerId) callUpdates.related_customer_id = args.customerId;
  if (args.businessUnitId) callUpdates.business_unit_id = args.businessUnitId;

  let callBackfill = supabase.from("call_log")
    .update(callUpdates)
    .eq("phone_number", args.phone);
  if (args.businessUnitId) callBackfill = callBackfill.eq("business_unit_id", args.businessUnitId);
  await callBackfill;
}

async function sendGoogleRelayCaptureSms(
  supabase: any,
  to: string,
  jobId: string | null,
  settings: Record<string, string>,
  businessUnit: BusinessUnit | null,
) {
  const companyPhone = businessUnit?.primary_phone_number || settings["company_phone"] || Deno.env.get("TWILIO_PHONE_NUMBER") || "";
  const companyName = businessUnit?.display_name || settings["company_name"] || "our company";
  const fallbackBody =
    `Thanks for reaching ${companyName}. We want to make sure we can reach you directly. Google may hide your phone number in this thread, so please reply with your best callback number or text/call us at ${companyPhone}.`;
  const resolved = await resolveSmsTemplateBody({
    supabase,
    templateKey: "google_lsa_relay_capture",
    fallbackBody,
    job: {},
    extraVars: { company_phone: companyPhone, company_name: companyName },
  });
  const result = await supabase.functions.invoke("send-sms", {
    body: {
      to,
      body: resolved.body,
      job_id: jobId,
      source: "google_lsa_relay_capture",
      template_key: resolved.templateKey,
      business_unit_id: businessUnit?.id || null,
    },
    headers: { "x-source-function": "google_lsa_relay_capture", "x-hitl-approved": "true" },
  });
  if (result.error) throw result.error;
  return result.data;
}

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
        callback_phone: { type: "string", description: "Phone number the customer asks us to call or text instead of the texting number" },
        access_code: { type: "string", description: "Gate, lockbox, garage, or door code if mentioned" },
        access_notes: { type: "string", description: "Other access instructions such as side gate, key location, parking, or entry instructions" },
        pet_warning: { type: "string", description: "Dog, cat, pet, backyard, or safety warning if mentioned" },
        requested_eta: { type: "string", description: "ETA or arrival timing question/request if mentioned" },
        requested_schedule_change: { type: "string", description: "Requested new date/time/window for an existing appointment" },
        cancel_reason: { type: "string", description: "Reason for canceling an existing appointment if provided" },
        intent: {
          type: "string",
          enum: ["booking", "quote_request", "quote_follow_up", "reschedule", "cancel", "eta_request", "access_instructions", "pet_warning", "callback_number_update", "question", "complaint", "confirmation", "info_reply", "other"],
          description: "Customer's primary intent. Use quote_request/quote_follow_up when the conversation is about preparing or sending a quote, bid, estimate, or proposal. 'info_reply' = they are only providing contact info in response to a prior call or request.",
        },
        service_type: {
          type: "string",
          enum: ["repair", "maintenance", "install", "estimate", "other"],
          description: "Type of service if identifiable",
        },
        scheduling_preference: { type: "string", description: "Any date/time preference mentioned" },
        scheduled_date: { type: "string", description: "YYYY-MM-DD if the conversation clearly names a date for the next action or appointment" },
        scheduled_time: { type: "string", description: "Time or time window if clearly mentioned" },
        follow_up_due: { type: "string", description: "Natural language follow-up promise, e.g. 'Monday morning' or 'tomorrow afternoon'" },
        quote_subject: { type: "string", description: "What the quote/bid/proposal is for, e.g. carport, flat roof option, equipment replacement" },
        quote_options_requested: { type: "string", description: "Options or variants the customer asked us to quote" },
        problem_description: { type: "string", description: "Issue, project, or work request described by the customer" },
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

async function loadKnownProperties(supabase: any, customerId: string | null) {
  if (!customerId) return [];
  const { data: customer } = await supabase
    .from("customers")
    .select("id, address, city, state, zip")
    .eq("id", customerId)
    .maybeSingle();
  const { data: rows } = await supabase
    .from("customer_addresses")
    .select("id, address_type, street, street_line_2, city, state, zip, is_primary")
    .eq("customer_id", customerId);
  const properties = (rows || []).map((r: any) => ({
    id: r.id,
    label: r.address_type || (r.is_primary ? "Primary" : "Property"),
    address: [r.street, r.street_line_2, r.city, r.state, r.zip].filter(Boolean).join(", "),
    street: [r.street, r.street_line_2].filter(Boolean).join(" "),
    city: r.city,
    state: r.state,
    zip: r.zip,
    is_primary: !!r.is_primary,
  }));
  if (customer?.address && !properties.some((p: any) => p.is_primary || p.street?.toLowerCase() === customer.address.toLowerCase())) {
    properties.unshift({
      id: null,
      label: "Primary",
      address: [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
      street: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      is_primary: true,
    });
  }
  return properties;
}

function streetSignature(raw: string | null | undefined): { num: string; word: string } {
  const s = (raw || "").trim();
  const num = (s.match(/\d+/) || [""])[0];
  const word = (s.replace(/^\d+\s*/, "").match(/[A-Za-z]+/) || [""])[0].toLowerCase();
  return { num, word };
}

function matchKnownProperty(address: string | null | undefined, properties: any[]) {
  if (!address || !properties?.length) return null;
  const wanted = streetSignature(address);
  if (!wanted.num || !wanted.word) return null;
  return properties.find((p: any) => {
    const sig = streetSignature(p.street || p.address);
    return sig.num === wanted.num && !!sig.word && wanted.word.startsWith(sig.word.slice(0, 4));
  }) || null;
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
    let sigValid = false;
    try {
      sigValid = await validateTwilioSignature(req, formData);
    } catch (sigErr) {
      console.error("SMS webhook Twilio signature validation error:", sigErr);
    }
    if (!sigValid) {
      console.warn("Rejecting SMS webhook: invalid Twilio signature");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 403 }
      );
    }

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
    const businessUnit = (await resolveBusinessUnitByPhone(supabase, toNumber)) ||
      (await getDefaultBusinessUnit(supabase));
    const messageCompanyMetadata = {
      business_unit_id: businessUnit?.id || null,
      business_unit_slug: businessUnit?.slug || null,
      company_name: businessUnit?.display_name || null,
      company_customer_tag: businessUnit?.customer_tag || null,
      company_phone_number: toNumber,
    };

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
      .in("key", [
        "jarvis_alert_phone",
        "sms_alert_enabled",
        "answering_service_phone",
        "google_lsa_relay_numbers",
        "google_ads_relay_numbers",
        "company_phone",
        "owner_input_phone",
      ]);

    const jarvisSettingsMap: Record<string, string> = {};
    for (const row of (jarvisSettings || []) as any[]) jarvisSettingsMap[row.key] = row.value;

    const smsAlertEnabled = jarvisSettingsMap["sms_alert_enabled"] !== "false"; // default true
    const jarvisPhone = smsAlertEnabled ? (jarvisSettingsMap["jarvis_alert_phone"]?.trim() || null) : null;
    const ownerInputDigits = (jarvisSettingsMap["owner_input_phone"] || "").replace(/\D/g, "").slice(-10);

    // ── Answering Service Relay Guard ──
    // The answering service uses a single relay number to forward customer inquiries to us.
    // The SMS *body* contains the real customer (Caller / Phone), not the sender.
    // Never auto-create a customer for this number; never overwrite the contact label.
    const answeringServiceDigits = (jarvisSettingsMap["answering_service_phone"] || "").replace(/\D/g, "").slice(-10);
    const isAnsweringService = answeringServiceDigits.length === 10 && normalizedFrom === answeringServiceDigits;
    const isGoogleRelay = isGoogleRelayInbound(normalizedFrom, body, jarvisSettingsMap);

    // Find recent outbound SMS to link reply to a job
    let recentOutboundQuery = supabase.from("sms_log")
      .select("related_job_id")
      .eq("direction", "outbound")
      .eq("phone_number", from)
      .eq("to_number", toNumber)
      .not("related_job_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (businessUnit?.id) {
      recentOutboundQuery = recentOutboundQuery.eq("business_unit_id", businessUnit.id);
    }
    const { data: recentOutbound } = await recentOutboundQuery;

    const threadedJobId = recentOutbound?.[0]?.related_job_id || null;

    const resolvedContact = await resolveContact(supabase, from);
    let { contactName, contactType } = resolvedContact;
    const { matchedEmployee } = resolvedContact;
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
          .select("customer_phone, business_unit_id")
          .eq("id", r.job_id)
          .single();
        if (businessUnit?.id && job?.business_unit_id && job.business_unit_id !== businessUnit.id) continue;
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
          business_unit_id: businessUnit?.id || null,
        } as any);

        // Surface to dispatcher instead of auto-replying
        const actionTitle = normalizedBody === "C"
          ? `${contactName || from} confirmed their appointment`
          : `${contactName || from} wants to reschedule`;
        await upsertLiveActionItem(supabase, {
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
          metadata: {
            ...messageCompanyMetadata,
            jarvis_intent: normalizedBody === "C" ? "appointment_confirmed" : "reschedule_requested",
            source_event_id: messageSid,
            inbound_message: body,
          },
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
    const { data: logEntry, error: logInsertError } = await supabase.from("sms_log").insert({
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
      business_unit_id: businessUnit?.id || null,
      ...(relatedVendorId ? { related_vendor_id: relatedVendorId } : {}),
      ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
    } as any).select("id").single();

    if (logInsertError || !logEntry) {
      const isDuplicate = (logInsertError as any)?.code === "23505" && messageSid;
      if (isDuplicate) {
        console.log(`[SMS] Duplicate webhook ignored for MessageSid=${messageSid}`);
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
        );
      }

      console.error("[SMS] Failed to persist inbound sms_log row:", logInsertError);
      return new Response(
        JSON.stringify({ error: "Failed to persist inbound SMS before side effects" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (ownerInputDigits.length === 10 && normalizedFrom === ownerInputDigits) {
      const cleanReply = (enrichedBody || body || "").trim();
      const { data: pendingRequest } = await supabase
        .from("owner_input_requests")
        .select("id, prompt, source_context")
        .eq("owner_phone_last10", ownerInputDigits)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let actionItemId: string | null = null;
      const { data: actionItem, error: actionError } = await supabase
        .from("action_items")
        .insert({
          source: "owner_sms_instruction",
          category: "owner_instruction",
          priority: "high",
          status: "pending",
          title: pendingRequest ? "Owner replied to Codex request" : "Owner sent an instruction by SMS",
          description: cleanReply || "Owner replied by SMS.",
          suggested_action: "Review this owner instruction. This does not execute automatically.",
          customer_phone: from,
          metadata: {
            ...messageCompanyMetadata,
            owner_input_request_id: pendingRequest?.id || null,
            owner_phone_last10: ownerInputDigits,
            prompt: pendingRequest?.prompt || null,
            inbound_sms_log_id: logEntry.id,
            remote_control_blocked: true,
            source_context: pendingRequest?.source_context || {},
          },
        })
        .select("id")
        .single();
      if (!actionError && actionItem?.id) actionItemId = actionItem.id;
      else console.error("[Owner input] Failed to create action item:", actionError);

      if (pendingRequest?.id) {
        await supabase
          .from("owner_input_requests")
          .update({
            status: "responded",
            response_text: cleanReply,
            responded_at: new Date().toISOString(),
            action_item_id: actionItemId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pendingRequest.id);
      } else {
        await supabase
          .from("owner_input_requests")
          .insert({
            owner_phone_last10: ownerInputDigits,
            prompt: "Unprompted owner SMS instruction",
            status: "responded",
            response_text: cleanReply,
            responded_at: new Date().toISOString(),
            action_item_id: actionItemId,
            source_context: { inbound_sms_log_id: logEntry.id, unprompted: true },
          });
      }

      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

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
        .select("id, hcp_id, customer_id, customer_name, customer_phone, scheduled_date, status, assigned_to")
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
    // Parse it, look up / hint at the real customer, and create a Now HQ action item for the dispatcher.
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
        await upsertLiveActionItem(supabase, {
          title: `📞 Answering Service: ${displayName} — ${callType || "inquiry"}`,
          description: `Real caller: ${displayName}\nCallback: ${callbackPhone}${callerCompany && callerCompany !== "N/A" ? `\nCompany: ${callerCompany}` : ""}\n\n${comments}`,
          category: "new_lead",
          priority: isUrgent ? "high" : "medium",
          source: "answering_service",
          status: "pending",
          customer_phone: callerPhoneRaw || from,
          metadata: {
            ...messageCompanyMetadata,
            customer_name: displayName,
            callback_phone: callerPhoneRaw,
            relay_phone: from,
            existing_customer_id: realCustomerId,
            urgency,
            call_type: callType,
            source_event_id: messageSid,
            inbound_message: body,
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

    // Google LSA / Ads SMS relays hide the customer's real phone number.
    // Reply to the relay asking for a direct callback number, then keep the
    // item on the dispatcher's board as a lead that needs identity capture.
    if (isGoogleRelay && !testModeOn) {
      try {
        const { data: recentCapture } = await supabase
          .from("sms_log")
          .select("id")
          .eq("direction", "outbound")
          .eq("phone_number", from)
          .eq("source_function", "google_lsa_relay_capture")
          .gte("created_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
          .limit(1)
          .maybeSingle();

        if (!recentCapture) {
          await sendGoogleRelayCaptureSms(supabase, from, linkedJobId, jarvisSettingsMap, businessUnit);
        }

        await upsertLiveActionItem(supabase, {
          title: "Google lead needs direct phone number",
          description: `Google relay text received. Ask the customer for their best callback number before creating a real customer thread.\n\n${body.slice(0, 300)}`,
          category: "new_lead",
          priority: "high",
          source: "google_lsa",
          status: "pending",
          customer_phone: from,
          job_id: linkedJobId,
          suggested_action: "Capture the customer's real phone number, then link or create the customer.",
          metadata: {
            ...messageCompanyMetadata,
            relay_phone: from,
            relay_source: "google",
            auto_capture_sms_sent: !recentCapture,
            message_preview: body.slice(0, 300),
            source_event_id: messageSid,
            inbound_message: body,
          },
        });
        console.log(`[Google Relay] Captured relay SMS from ${from}; requested direct callback number`);
      } catch (googleRelayErr) {
        console.error("[Google Relay] Handler failed:", googleRelayErr);
      }

      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" }, status: 200 }
      );
    }

    // Skip "new_lead" action items for known non-customer contacts (vendors, marketing, spam, etc.)
    const NON_LEAD_TYPES = ["vendor", "marketing", "answering_service", "spam", "tech_partner"];
    const isKnownNonLead = NON_LEAD_TYPES.includes(contactType);
    let surfacedCreateCustomerAction = false;

    // First step for an unknown texting contact: make a customer/link card.
    // This is deterministic and internal-only, so it still works when SMS safety mode
    // blocks AI side effects. The live action helper merges it into any existing
    // card for the same phone + company line instead of stacking duplicates.
    if (!isEmployee && !customerJob && !isKnownNonLead && contactType !== "customer") {
      const candidate = extractCustomerIdentityCandidate(enrichedBody || body, from);
      if (candidate) {
        const nameParts = customerNameParts(candidate.name);
        const companyLabel = businessUnit?.display_name || "the selected company";
        const displayName = candidate.name || contactName || candidate.phone || from;
        const detailLines = [
          candidate.name ? `Name: ${candidate.name}` : null,
          candidate.phone ? `Phone: ${candidate.phone}` : null,
          candidate.address ? `Address: ${candidate.address}` : null,
          candidate.email ? `Email: ${candidate.email}` : null,
          businessUnit?.customer_tag ? `Company tag: ${businessUnit.customer_tag}` : null,
        ].filter(Boolean).join("\n");

        await upsertLiveActionItem(supabase, {
          title: `Create customer: ${displayName}`,
          description: `Customer texted enough information to start a customer record for ${companyLabel}.\n\n${detailLines}`,
          category: "create_customer",
          priority: candidate.confidence === "high" ? "high" : "medium",
          source: "sms",
          status: "pending",
          customer_phone: from,
          job_id: linkedJobId,
          suggested_action: `Review and create/link this customer for ${companyLabel} before booking work.`,
          metadata: {
            ...messageCompanyMetadata,
            workflow_type: "intake",
            jarvis_intent: "create_customer",
            action_type: "create_customer",
            customer_name: candidate.name || contactName,
            phone: from,
            customer_phone: from,
            alternate_phone: candidate.phone && normalize10(candidate.phone) !== normalize10(from) ? candidate.phone : null,
            email: candidate.email,
            address: candidate.address,
            city: candidate.city,
            state: candidate.state || "TX",
            zip: candidate.zip,
            proposed_customer: {
              first_name: nameParts.first_name,
              last_name: nameParts.last_name,
              mobile_number: candidate.phone || from,
              email: candidate.email || "",
              street: candidate.address || "",
              city: candidate.city || "",
              state: candidate.state || "TX",
              zip: candidate.zip || "",
              notes: `Created from inbound SMS to ${companyLabel}.`,
            },
            identity_confidence: candidate.confidence,
            inbound_sms_log_id: logEntry.id,
            source_event_id: messageSid,
            inbound_message: body,
            thread_snippet: body.slice(0, 200),
          },
          merge_window_hours: 72,
        });
        surfacedCreateCustomerAction = true;
        console.log(`Observer: surfaced create_customer action_item for ${from} (${companyLabel})`);
      }
    }

    if (!isEmployee && !customerJob && !testModeOn && !isKnownNonLead && !surfacedCreateCustomerAction) {
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
          metadata: { ...messageCompanyMetadata, customer_name: contactName, message_preview: body.slice(0, 300) },
        });
        console.log(`Observer: created new_lead action_item for ${from}`);
      }
    } else if (isKnownNonLead) {
      console.log(`Observer: SKIPPED new_lead for ${from} — known ${contactType} (${contactName})`);
    }

    // ── Observer mode: structured extraction + call correlation + auto-customer creation ──
    // FIX #2: Extraction always runs for non-employee inbound SMS, regardless of auto-draft setting
    if (!isEmployee) {
      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (openaiApiKey) {
        try {
          // ── 1. Gather context: SMS thread + recent call_log for this phone ──
          const { data: recentThread } = await supabase.from("sms_log")
            .select("direction, body, created_at")
            .eq("phone_number", from)
            .order("created_at", { ascending: false })
            .limit(25);

          const threadContext = (recentThread || []).reverse()
            .map((m: any) => `[${m.direction === "outbound" ? "Us" : "Them"}] ${String(m.body || "").slice(0, 500)}`)
            .join("\n");
          const conversationText = `${threadContext}\n\nLatest message: "${body}"`;

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

          let promptCustomerId: string | null = null;
          try {
            const { data: promptCustomer } = await supabase
              .rpc("find_customer_by_phone", { digits: normalizedFrom })
              .maybeSingle();
            promptCustomerId = (promptCustomer as any)?.id || null;
          } catch {
            promptCustomerId = null;
          }
          const knownProperties = await loadKnownProperties(supabase, promptCustomerId);
          const propertyContext = knownProperties.length > 1
            ? `\nKnown properties for this customer:\n${knownProperties.map((p: any, i: number) => `${i + 1}. ${p.label}: ${p.address}`).join("\n")}\nIf this SMS does not clearly name one of these properties or provide a service address, do NOT assume the primary address. Mark the request as needing property selection.`
            : knownProperties.length === 1
              ? `\nKnown property: ${knownProperties[0].address}`
              : "";

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

          const analysisPrompt = `Analyze this inbound SMS and the recent thread. Extract ALL customer contact information and the current business intent. This is for a home services CRM with multiple companies, including HVAC and construction.

Customer: ${contactName || from} (${from})
${customerContext}
${propertyContext}
${callContext}
${ragContext}${mediaHint}

SMS Thread:
${threadContext}

Latest message: "${body}"

IMPORTANT RULES:
- Judge intent from the ENTIRE THREAD, not only the latest message. A late "thanks" or "who is this" does not erase a quote/bid/request discussed earlier.
- Extract ALL contact details: name, email, address, city, state, zip, lockbox/gate codes
- If the thread says the customer wants a quote, bid, proposal, estimate, price, or options, use intent "quote_request" or "quote_follow_up" even if the latest text only gives contact info or says thank you
- If our company said we would "work up a bid", "work on this Monday", "send a quote", or similar, extract follow_up_due and scheduled_date/scheduled_time if possible
- If the customer asked for multiple quote options, such as wood/shingles and flat roof, capture those in quote_options_requested
- If the message gives a gate/lockbox/door/garage code or access instructions, classify as "access_instructions"
- If the message warns about dogs, pets, backyard access, or animals, classify as "pet_warning"
- If the message asks when we will arrive, asks for ETA, or asks for a heads-up, classify as "eta_request"
- If the message gives a different callback/text number, classify as "callback_number_update"
- If the message asks to move an existing appointment, classify as "reschedule"
- If the message asks us not to come or says to cancel, classify as "cancel"
- If the customer is REPLYING to a prior phone call with their info, set intent to "info_reply"
- If a recent call discussed scheduling/booking AND this SMS provides address or contact info, that's a BOOKING intent
- If our last outbound message asked for contact info or scheduling details, and this SMS provides that, classify as BOOKING intent
- If the customer has an active job or upcoming estimate, treat replies as updates/follow-ups unless they clearly ask for a separate new visit
- If the customer has multiple properties and the message does not identify which property, do not assume their primary address
- If the customer has multiple properties and the message names an address that is not on file, require dispatcher/property review before booking
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
                .select("first_name, last_name, email, address, city, state, zip, notes, tags, primary_business_unit_id")
                .eq("id", existingCust.id).single();

              if (custFull) {
                const updates: Record<string, unknown> = {};
                if (!custFull.first_name && extracted.first_name) updates.first_name = extracted.first_name;
                if (!custFull.last_name && extracted.last_name) updates.last_name = extracted.last_name;
                if (!custFull.email && extracted.email) updates.email = extracted.email;
                if (businessUnit?.id && !custFull.primary_business_unit_id) updates.primary_business_unit_id = businessUnit.id;
                if (businessUnit?.customer_tag && !((custFull.tags || []) as string[]).includes(businessUnit.customer_tag)) {
                  updates.tags = Array.from(new Set([...(custFull.tags || []), businessUnit.customer_tag]));
                }

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

                const enrichedName = fullNameFromParts(
                  (updates.first_name as string | undefined) || custFull.first_name || extracted.first_name,
                  (updates.last_name as string | undefined) || custFull.last_name || extracted.last_name,
                  contactName || from,
                );
                const enrichedAddress = composeAddress(
                  (updates.address as string | undefined) || custFull.address || extracted.address,
                  (updates.city as string | undefined) || custFull.city || extracted.city,
                  (updates.state as string | undefined) || custFull.state || extracted.state || "TX",
                  (updates.zip as string | undefined) || custFull.zip || extracted.zip,
                );
                const enrichedEmail = (updates.email as string | undefined) || custFull.email || extracted.email || null;

                await backfillCommunicationIdentity(supabase, {
                  phone: from,
                  businessUnitId: businessUnit?.id || null,
                  customerId: existingCust.id,
                  customerName: enrichedName,
                });

                await upsertLiveActionItem(supabase, {
                  title: `${enrichedName || from} contact updated`,
                  description: `Jarvis enriched this customer record from the latest SMS.${enrichedAddress ? `\n\nAddress: ${enrichedAddress}` : ""}${enrichedEmail ? `\nEmail: ${enrichedEmail}` : ""}`,
                  category: "create_customer",
                  priority: Object.keys(updates).length > 0 ? "high" : "medium",
                  source: "sms",
                  status: "pending",
                  customer_phone: from,
                  job_id: linkedJobId,
                  suggested_action: Object.keys(updates).length > 0
                    ? "Review the updated customer details, then book or continue the workflow."
                    : "Customer info is already on file. Continue the intake workflow.",
                  metadata: {
                    ...messageCompanyMetadata,
                    workflow_type: "intake",
                    jarvis_intent: "create_customer",
                    action_type: "create_customer",
                    customer_name: enrichedName,
                    customer_id: existingCust.id,
                    phone: from,
                    alternate_phone: extracted.phone || extracted.callback_phone || null,
                    email: enrichedEmail,
                    address: enrichedAddress,
                    city: (updates.city as string | undefined) || custFull.city || extracted.city || null,
                    state: (updates.state as string | undefined) || custFull.state || extracted.state || "TX",
                    zip: (updates.zip as string | undefined) || custFull.zip || extracted.zip || null,
                    contact_fields_captured: {
                      name: !!enrichedName,
                      phone: true,
                      email: !!enrichedEmail,
                      address: !!enrichedAddress,
                    },
                    updated_fields: Object.keys(updates),
                    sms_extraction: extracted,
                    inbound_sms_log_id: logEntry.id,
                    source_event_id: messageSid,
                    inbound_message: body,
                    thread_snippet: body.slice(0, 200),
                  },
                  merge_window_hours: 72,
                });
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
                primary_business_unit_id: businessUnit?.id || null,
                tags: businessUnit?.customer_tag ? [businessUnit.customer_tag] : [],
                notes: noteParts.length > 0 ? noteParts.join("\n") : `Auto-created from SMS intake`,
              }).select("id").single();

              if (newCust) {
                resolvedCustomerId = newCust.id;
                const createdCustomerName = `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim() || contactName || from;
                console.log(`SMS: auto-created customer ${newCust.id} for ${from}`);

                await upsertLiveActionItem(supabase, {
                  title: `Customer created: ${createdCustomerName}`,
                  description: `Jarvis created this customer from the SMS details and tagged it for ${businessUnit?.display_name || "the selected company"}. Review the record, then book or follow up if needed.`,
                  category: "create_customer",
                  priority: "high",
                  source: "sms",
                  status: "pending",
                  customer_phone: from,
                  job_id: linkedJobId,
                  suggested_action: `Review ${createdCustomerName}'s customer record, then decide whether to book work.`,
                  metadata: {
                    ...messageCompanyMetadata,
                    workflow_type: "intake",
                    jarvis_intent: "create_customer",
                    action_type: "create_customer",
                    customer_name: createdCustomerName,
                    customer_id: newCust.id,
                    created_customer_id: newCust.id,
                    phone: from,
                    email: extracted.email || null,
                    address: verifiedAddr ? verifiedAddr.split(",")[0] : (extracted.address || null),
                    city: extracted.city || null,
                    state: extracted.state || "TX",
                    zip: extracted.zip || null,
                    sms_extraction: extracted,
                    inbound_sms_log_id: logEntry.id,
                    source_event_id: messageSid,
                    inbound_message: body,
                    thread_snippet: body.slice(0, 200),
                  },
                  merge_window_hours: 72,
                });

                // Backfill call_log and sms_log with customer link
                let callBackfill = supabase.from("call_log")
                  .update({ related_customer_id: newCust.id, contact_name: `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim(), contact_type: "customer", business_unit_id: businessUnit?.id || null })
                  .eq("phone_number", from)
                  .is("related_customer_id", null);
                if (businessUnit?.id) callBackfill = callBackfill.eq("business_unit_id", businessUnit.id);
                await callBackfill;

                let smsBackfill = supabase.from("sms_log")
                  .update({ related_customer_id: newCust.id, contact_name: `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim(), contact_type: "customer", business_unit_id: businessUnit?.id || null })
                  .eq("phone_number", from)
                  .in("contact_type", ["unknown", "lead"]);
                if (businessUnit?.id) smsBackfill = smsBackfill.eq("business_unit_id", businessUnit.id);
                await smsBackfill;
              }
            }
          }

          // ── 4. Determine booking intent (combined SMS + call context) ──
          // STRICT: only an explicit booking/reschedule from the SMS extractor counts.
          // info_reply (customer just sending name/email/address) is NOT a new booking —
          // it's CRM info that should merge into any existing pending card, never create a new one.
          // Merge service_type from call if SMS didn't provide one
          const effectiveServiceType = (extracted.service_type && extracted.service_type !== "other")
            ? extracted.service_type
            : (callExtraction?.service_type || "service");

          const effectiveScheduling = extracted.scheduling_preference || callExtraction?.scheduling_preference || null;

          const customerName = extracted.first_name
            ? `${extracted.first_name} ${extracted.last_name || ""}`.trim()
            : (contactName || from);

          // Dedup window: any pending intake card for this phone in the last 2 hours.
          // This lets a "follow up later" card become "customer approved, do the thing"
          // instead of stacking a second card for the same live conversation.
          const dedupWindow = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: existingBookings } = await supabase.from("action_items")
            .select("id, metadata, title")
            .in("category", ["new_appointment", "booking_confirm", "follow_up", "thread_attention", "new_lead", "create_customer"])
            .eq("customer_phone", from)
            .eq("status", "pending")
            .gte("created_at", dedupWindow)
            .order("created_at", { ascending: false })
            .limit(5);
          // Use array+[0] (NOT maybeSingle) — once 2+ pending cards exist, maybeSingle errors
          // out silently and we'd create yet another duplicate forever. This is the bug that
          // produced 4 stacked Justo/Jesus Lopez cards.
          const existingBooking = (existingBookings || []).find((row: any) => {
            const meta = row.metadata || {};
            if (!businessUnit?.id) return true;
            return !meta.business_unit_id || meta.business_unit_id === businessUnit.id;
          }) || null;
          const activeWorkLookup = await lookupActiveWorkContext(supabase, {
            customerId: resolvedCustomerId || promptCustomerId,
            phone: from,
            pendingWindowHours: 2,
          });
          const activeWorkContext = {
            activeJob: customerJob || activeWorkLookup.activeJob,
            activeEstimate: upcomingEstimate || activeWorkLookup.activeEstimate,
            pendingBooking: existingBooking || activeWorkLookup.pendingBooking,
          };
          const intentDecision = classifyCustomerContactIntent({
            text: conversationText,
            extracted,
            activeWork: activeWorkContext,
            channel: "sms",
          });
          console.log(`SMS intent for ${from}:`, JSON.stringify({
            intent: intentDecision.intent,
            category: intentDecision.actionCategory,
            confidence: intentDecision.confidence,
            active_work: describeActiveWork(activeWorkContext),
          }));
          const isExplicitBookingIntent =
            intentDecision.actionCategory === "new_appointment" && intentDecision.shouldCreateNewWork;
          const isPureInfoReply =
            extracted.intent === "info_reply" || intentDecision.intent === "customer_info_update";
          const isInfoReply =
            isPureInfoReply && !["quote_request", "quote_follow_up", "new_estimate_request", "new_service_booking"].includes(intentDecision.intent);

          // ACTIVE-WORK SUPPRESSION: if customer has an open job OR an upcoming/today
          // estimate, this SMS is a follow-up on existing work, NOT a new booking.
          // Append the SMS as a note on the HCP record (job or estimate) and create a
          // `follow_up` card — do not spawn a Book It Now.
          const hasActiveJob = !!activeWorkContext.activeJob;
          const hasUpcomingEstimate = !!activeWorkContext.activeEstimate;
          const shouldSuppressBooking =
            intentDecision.shouldAttachToExistingWork && (hasActiveJob || hasUpcomingEstimate);

          if (shouldSuppressBooking) {
            const target = hasActiveJob ? "job" : "estimate";
            const targetRecord = hasActiveJob ? activeWorkContext.activeJob : activeWorkContext.activeEstimate;
            const ref = hasActiveJob
              ? (activeWorkContext.activeJob.hcp_job_number ? `Job #${activeWorkContext.activeJob.hcp_job_number}` : "open job")
              : `upcoming estimate ${activeWorkContext.activeEstimate.scheduled_date || ""}`.trim();

            // Build the note from the SMS + AI extraction
            const noteParts: string[] = [`Customer SMS: "${body.slice(0, 400)}"`];
            if (extracted.summary) noteParts.push(`AI summary: ${extracted.summary}`);
            noteParts.push(`Jarvis intent: ${intentDecision.intent} (${intentDecision.confidence})`);
            if (extracted.scheduling_preference) noteParts.push(`Scheduling pref: ${extracted.scheduling_preference}`);
            if (extracted.requested_schedule_change) noteParts.push(`Requested schedule change: ${extracted.requested_schedule_change}`);
            if (extracted.requested_eta) noteParts.push(`ETA request: ${extracted.requested_eta}`);
            if (extracted.lockbox_code || extracted.access_code) noteParts.push(`Access code: ${extracted.access_code || extracted.lockbox_code}`);
            if (extracted.access_notes) noteParts.push(`Access notes: ${extracted.access_notes}`);
            if (extracted.pet_warning) noteParts.push(`Pet warning: ${extracted.pet_warning}`);
            if (extracted.callback_phone || extracted.phone) noteParts.push(`Callback phone: ${extracted.callback_phone || extracted.phone}`);
            if (extracted.address) noteParts.push(`Address provided: ${extracted.address}`);
            if (extracted.email) noteParts.push(`Email: ${extracted.email}`);
            const noteContent = noteParts.join("\n");

            // Local app is the source of truth. HCP note push below is only a bridge
            // while legacy records are still present.
            let noteCustomerId = resolvedCustomerId || null;
            if (!noteCustomerId && hasActiveJob) {
              const { data: jobCustomer } = await supabase
                .from("jobs")
                .select("customer_id")
                .eq("id", activeWorkContext.activeJob.id)
                .maybeSingle();
              noteCustomerId = (jobCustomer as any)?.customer_id || null;
            }
            if (!noteCustomerId && hasUpcomingEstimate) {
              noteCustomerId = (activeWorkContext.activeEstimate as any)?.customer_id || null;
            }
            if (noteCustomerId) {
              await supabase.from("customer_notes").insert({
                customer_id: noteCustomerId,
                scope: hasActiveJob ? "job" : "estimate",
                entity_id: targetRecord.id,
                author_name: "JARVIS",
                body: noteContent,
              });
            }
            if (hasActiveJob) {
              await supabase.from("activity_log").insert({
                job_id: activeWorkContext.activeJob.id,
                action: "sms_follow_up_note",
                performed_by: "JARVIS",
                details: noteContent,
              });
            }

            // Keep one live follow_up card for dispatcher visibility.
            await upsertLiveActionItem(supabase, {
              title: `${customerName} texted about ${ref}`,
              description: extracted.summary || `Follow-up SMS on existing ${target} — note added locally`,
              category: intentDecision.actionCategory === "new_appointment" ? "follow_up" : intentDecision.actionCategory,
              priority: ["schedule_change", "pet_warning", "eta_request"].includes(intentDecision.actionCategory) ? "high" : "normal",
              source: "sms",
              status: "pending",
              customer_phone: from,
              job_id: hasActiveJob ? activeWorkContext.activeJob.id : null,
              suggested_action: `Review ${ref} — customer messaged with new info`,
              metadata: buildJarvisIntentMetadata(intentDecision, {
                ...messageCompanyMetadata,
                customer_name: customerName,
                customer_id: resolvedCustomerId,
                phone: from,
                suppressed_booking: true,
                suppressed_reason: hasActiveJob ? "active_job_in_progress" : "upcoming_estimate",
                local_note_added: !!noteCustomerId,
                active_job_id: hasActiveJob ? activeWorkContext.activeJob.id : null,
                upcoming_estimate_id: hasUpcomingEstimate ? activeWorkContext.activeEstimate.id : null,
                sms_extraction: extracted,
                thread_snippet: body.slice(0, 200),
              }),
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
              access_code: extracted.access_code || (existingBooking.metadata as any)?.access_code || null,
              access_notes: extracted.access_notes || (existingBooking.metadata as any)?.access_notes || null,
              pet_warning: extracted.pet_warning || (existingBooking.metadata as any)?.pet_warning || null,
              callback_phone: extracted.callback_phone || extracted.phone || (existingBooking.metadata as any)?.callback_phone || null,
              sms_extraction: extracted,
              jarvis_intent: intentDecision.intent,
              jarvis_intent_confidence: intentDecision.confidence,
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
              ...messageCompanyMetadata,
              customer_name: customerName,
              customer_id: resolvedCustomerId,
              customer_phone: from,
              phone: from,
              email: extracted.email || null,
              address: extracted.address || null,
              lockbox_code: extracted.lockbox_code || null,
              access_code: extracted.access_code || extracted.lockbox_code || null,
              access_notes: extracted.access_notes || null,
              pet_warning: extracted.pet_warning || null,
              callback_phone: extracted.callback_phone || extracted.phone || null,
              job_type: effectiveServiceType === "estimate" ? "estimate" : effectiveServiceType,
              service_type: effectiveServiceType,
              scheduling_preference: effectiveScheduling,
              scheduled_date: extracted.scheduled_date || callExtraction?.scheduled_date || null,
              scheduled_time: extracted.scheduled_time || callExtraction?.scheduled_time || null,
              follow_up_due: extracted.follow_up_due || quoteFollowUpLabel(conversationText, effectiveScheduling) || null,
              follow_up_date: resolveThreadFollowUpDate(conversationText, extracted.scheduled_date || null),
              quote_subject: extracted.quote_subject || null,
              quote_options_requested: extracted.quote_options_requested || null,
              description: extracted.summary || callExtraction?.problem_description || body.slice(0, 200),
              sms_extraction: extracted,
              call_extraction: callExtraction || null,
              correlated_call: recentCalls?.[0]?.id || null,
              jarvis_intent: intentDecision.intent,
              jarvis_intent_confidence: intentDecision.confidence,
              jarvis_intent_reason: intentDecision.reason,
              // FIX #4: Include MMS media URLs in metadata
              ...(mediaUrls.length > 0 ? { media_urls: mediaUrls } : {}),
            };
            const matchedProperty = knownProperties.length > 0
              ? matchKnownProperty(extracted.address || null, knownProperties)
              : null;
            if (matchedProperty) {
              (bookingMetadata as any).address = matchedProperty.address;
              (bookingMetadata as any).address_id = matchedProperty.id;
              (bookingMetadata as any).address_match = {
                outcome: matchedProperty.is_primary ? "matched_primary" : "matched_secondary",
                label: matchedProperty.label,
                address: matchedProperty.address,
              };
            }
            const needsPropertySelection = knownProperties.length > 1 && (!extracted.address || !matchedProperty);
            if (needsPropertySelection) {
              (bookingMetadata as any).requires_property_selection = true;
              (bookingMetadata as any).property_options = knownProperties;
              (bookingMetadata as any).property_review_reason = extracted.address
                ? "customer_mentioned_address_not_on_file"
                : "customer_has_multiple_properties";
              if (extracted.address) (bookingMetadata as any).mentioned_address = extracted.address;
            }

            if (existingBooking) {
              // Merge richer data into the existing live action card and upgrade
              // the next step when the customer changes direction.
              const mergedMeta = { ...((existingBooking.metadata as any) || {}), ...bookingMetadata };
              await supabase.from("action_items")
                .update({
                  title: `SMS updated: ${customerName} wants to ${effectiveServiceType === "estimate" ? "book an estimate" : "book service"}`,
                  category: "new_appointment",
                  priority: "high",
                  suggested_action: needsPropertySelection ? `Choose property for ${customerName}` : `Book ${effectiveServiceType} for ${customerName}`,
                  metadata: {
                    ...mergedMeta,
                    living_card: true,
                    last_context_update_at: new Date().toISOString(),
                    context_updates: [
                      {
                        at: new Date().toISOString(),
                        source: "sms",
                        category: "new_appointment",
                        intent: intentDecision.intent,
                        summary: extracted.summary || body.slice(0, 200),
                      },
                      ...((((existingBooking.metadata as any) || {}).context_updates) || []),
                    ].slice(0, 12),
                  },
                  description: needsPropertySelection ? "Customer has multiple properties. Choose the service address before booking." : (extracted.suggested_action || `Updated booking info from follow-up SMS.`),
                })
                .eq("id", existingBooking.id);
              console.log(`Observer: UPDATED existing booking action_item ${existingBooking.id} for ${from} (dedup)`);
            } else {
              await upsertLiveActionItem(supabase, {
                title: `📱 ${customerName} — ${effectiveServiceType} booking request`,
                description: needsPropertySelection ? "Customer has multiple properties. Choose the service address before booking." : (extracted.suggested_action || `Customer provided contact info via SMS after a phone call. Ready to book ${effectiveServiceType}.`),
                category: "new_appointment",
                priority: "high",
                source: "sms",
                status: "pending",
                customer_phone: from,
                job_id: linkedJobId,
                suggested_action: needsPropertySelection ? `Choose property for ${customerName}` : `Book ${effectiveServiceType} for ${customerName}`,
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
                  type: needsPropertySelection ? "select_property" : (effectiveServiceType === "estimate" ? "book_estimate" : "book_job"),
                  job_type: effectiveServiceType === "estimate" ? "estimate" : effectiveServiceType,
                  customer_name: customerName,
                  phone: from,
                  address: extracted.address || null,
                  email: extracted.email || null,
                  description: extracted.summary || callExtraction?.problem_description || "",
                  parent_customer_id: resolvedCustomerId || undefined,
                  property_options: needsPropertySelection ? knownProperties : undefined,
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

          } else if (!isInfoReply && intentDecision.actionCategory !== "new_appointment" && intentDecision.intent !== "general_question") {
            const followUpDate = resolveThreadFollowUpDate(conversationText, extracted.scheduled_date || null);
            const followUpDue = extracted.follow_up_due || quoteFollowUpLabel(conversationText, effectiveScheduling) || null;
            let staleNewLeadDelete = supabase.from("action_items")
              .delete()
              .eq("category", "new_lead")
              .eq("customer_phone", from)
              .eq("status", "pending")
              .gte("created_at", new Date(Date.now() - 60_000).toISOString());
            if (businessUnit?.id) {
              staleNewLeadDelete = staleNewLeadDelete.eq("metadata->>business_unit_id", businessUnit.id);
            }
            await staleNewLeadDelete;
            await upsertLiveActionItem(supabase, {
              title: `${customerName} - ${intentDecision.intent.replaceAll("_", " ")}`,
              description: intentDecision.summary || extracted.summary || body.slice(0, 200),
              category: intentDecision.actionCategory,
              priority: ["schedule_change", "pet_warning", "eta_request"].includes(intentDecision.actionCategory) ? "high" : "normal",
              source: "sms",
              status: "pending",
              customer_phone: from,
              job_id: linkedJobId,
              suggested_action: intentDecision.intent === "quote_follow_up"
                ? `Prepare the quote/bid${followUpDue ? ` ${followUpDue}` : ""} and send it to ${customerName}.`
                : intentDecision.suggestedAction,
              metadata: buildJarvisIntentMetadata(intentDecision, {
                ...messageCompanyMetadata,
                customer_name: customerName,
                customer_id: resolvedCustomerId,
                phone: from,
                email: extracted.email || null,
                address: extracted.address || null,
                follow_up_due: followUpDue,
                follow_up_date: followUpDate,
                scheduled_date: followUpDate || extracted.scheduled_date || null,
                scheduled_time: extracted.scheduled_time || null,
                quote_subject: extracted.quote_subject || null,
                quote_options_requested: extracted.quote_options_requested || null,
                sms_extraction: extracted,
                inbound_message: body,
                thread_snippet: conversationText.slice(-500),
              }),
              merge_window_hours: 72,
            });
            console.log(`SMS: created ${intentDecision.actionCategory} action_item for ${from} (${intentDecision.intent})`);
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
                  ...messageCompanyMetadata,
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
              metadata: { ...messageCompanyMetadata, fallback: true, error: String(obsErr), message_preview: body.slice(0, 300), media_urls: mediaUrls.length > 0 ? mediaUrls : undefined },
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
