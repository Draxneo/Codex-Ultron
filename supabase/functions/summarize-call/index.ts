import { getTaskModel } from "../_shared/getTaskModel.ts";
import { verifyAddress } from "../_shared/verifyContact.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { loadCompanyInfo } from "../_shared/companyInfo.ts";



const extractTool = {
  type: "function",
  function: {
    name: "extract_call_data",
    description:
      "Extract structured customer data and a short internal summary from a phone call transcript.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "The CALLER's first name (the person who placed or left the call/voicemail), title case. Do NOT extract the name of the person being addressed or greeted — only the caller's own name." },
        last_name: { type: "string", description: "The CALLER's last name, title case. Leave empty if not stated by the caller about themselves." },
        name_confidence: {
          type: "string",
          enum: ["high", "low"],
          description: "How confident you are about the name spelling. Set to 'low' if the audio/transcript is ambiguous, especially for Hispanic names common in San Antonio (e.g., Valles, García, Hernández, Rodríguez, González).",
        },
        phone: { type: "string", description: "Phone number mentioned, formatted (XXX) XXX-XXXX" },
        email: { type: "string", description: "Email if mentioned, empty string if not" },
        address: { type: "string", description: "Street address if mentioned" },
        city: { type: "string", description: "City if mentioned" },
        state: { type: "string", description: "State 2-letter code if mentioned" },
        zip: { type: "string", description: "ZIP code if mentioned" },
        address_confidence: {
          type: "string",
          enum: ["high", "low"],
          description: "How confident you are about the address. Set to 'low' if partial, unclear, or possibly misspelled.",
        },
        service_type: {
          type: "string",
          enum: ["repair", "maintenance", "install", "estimate", "other"],
          description: "Type of service requested",
        },
        problem_description: {
          type: "string",
          description: "Brief description of the problem or request",
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "emergency"],
          description: "Urgency level based on conversation tone",
        },
        scheduling_preference: {
          type: "string",
          description: "Any date/time preference the customer mentioned, e.g. 'Thursday morning', 'ASAP', 'next week'. Empty if none.",
        },
        scheduled_date: {
          type: "string",
          description: "If a specific day was discussed/agreed (e.g. 'Monday', 'tomorrow', 'April 22'), resolve it to an ISO date YYYY-MM-DD using TODAY as reference. Empty string if no specific day was committed to.",
        },
        scheduled_time: {
          type: "string",
          description: "If a specific time or arrival window was discussed (e.g. '10am', '10-12', 'morning'), return start time in 24h HH:MM format. For windows like '10-12' return '10:00'. For 'morning' return '09:00', 'afternoon' '13:00', 'evening' '16:00'. Empty if no time discussed.",
        },
        summary: {
          type: "string",
          description:
            "3-5 bullet point summary of the call for internal staff use. Use markdown bullets.",
        },
      },
      required: ["summary", "service_type", "problem_description", "urgency"],
      additionalProperties: false,
    },
  },
};

// (Todo extraction removed — JARVIS no longer manages a To-Do list.)

// verifyAddress imported from _shared/verifyContact.ts

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_id } = await req.json();
    if (!call_id) {
      return new Response(JSON.stringify({ error: "Missing call_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

            const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = getSupabaseAdmin();

    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the call
    const { data: call, error: callErr } = await supabase
      .from("call_log")
      .select("id, transcription, phone_number, direction, contact_name, contact_type, related_customer_id, related_job_id, twilio_sid, answered_by")
      .eq("id", call_id)
      .single();

    if (callErr || !call) {
      console.error("Call not found:", callErr);
      return new Response(JSON.stringify({ error: "Call not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!call.transcription || call.transcription.trim().length < 20) {
      console.log(`Call ${call_id}: transcript too short, skipping summarization`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get configured model
    const model = await getTaskModel(supabase, "customer_parsing") || "gpt-5-mini";

    // Load company info from settings (no hardcoding)
    const companyInfo = await loadCompanyInfo(supabase);
    const companyLabel = companyInfo.name || "the company";

    // Call JARVIS AI for extraction
    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are an AI assistant for ${companyLabel}, an HVAC company in ${companyInfo.city || "San Antonio"}, ${companyInfo.state || "TX"}, analyzing phone call transcripts. Extract customer info and create an internal summary. The call was ${call.direction} with phone number ${call.phone_number}${call.contact_name ? ` (known contact: ${call.contact_name})` : ""}${call.answered_by ? ` (answered_by=${call.answered_by})` : ""}. Extract any customer details mentioned. The summary should be concise bullet points for internal staff only.

CRITICAL — DIRECTION MATTERS:
- This call's direction is "${call.direction}".
- INBOUND = a customer/vendor called US. The "caller" is the external person.
- OUTBOUND = WE called THEM (one of our staff dialed out). The "caller" is our employee. The other party is the RECIPIENT.
- For OUTBOUND calls, the recipient's name is usually already known (see "known contact" above). Do NOT extract a new name from the transcript unless the recipient clearly self-identifies with a different name and there is no known contact.

CRITICAL — VOICEMAIL GREETINGS ARE NOT THE CALLER:
- If the transcript contains carrier/voicemail language like "You've reached…", "is not available", "at the tone please record your message", "leave a message after the beep", "the person you are trying to reach", "Google Voice", "automated voice messaging system" — this is a VOICEMAIL GREETING, not the caller speaking.
- Names spoken inside a voicemail greeting (e.g., "You've reached Parker") belong to the RECIPIENT'S phone owner, NOT the caller. NEVER extract these as first_name/last_name.
- For outbound calls that hit voicemail, leave first_name and last_name EMPTY — the recipient is already known via "known contact". Only extract details from what OUR EMPLOYEE actually said in their voicemail message.

CRITICAL — CALLER vs. ADDRESSEE (inbound only):
- The business owner's name is Clint Carnes. Inbound callers often address him by name ("Hey Clint", "Good morning Clint").
- NEVER extract the business owner's name as the customer. Only extract the CALLER's own name.
- For inbound voicemails: the caller usually introduces THEMSELVES (e.g., "This is Parker calling from..."). Extract THAT name, not the person being greeted.
- If only the addressee's name is mentioned (e.g., "Hi Clint") and the caller never states their own name, leave first_name and last_name EMPTY.
- For inbound calls from vendors/salespeople, extract the vendor rep's name, NOT "Clint".

IMPORTANT — NAME SPELLING:
This is San Antonio — many customers have Hispanic names. Pay close attention to Spanish name spellings:
- Valles (not Vales), García (not Garsia), Hernández (not Hernandes), Rodríguez (not Rodriges)
- González (not Gonzales unless clearly spelled), Gutiérrez, Martínez, López, Sánchez
- If the transcript audio is ambiguous on spelling, set name_confidence to "low"
- Title case all names

ADDRESS VERIFICATION:
- If the address is partial, unclear, or the customer seemed unsure, set address_confidence to "low"
- Include city/state/zip if mentioned

SCHEDULE EXTRACTION (CRITICAL for booking):
- Today's date is ${new Date().toISOString().split("T")[0]} (${new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Chicago" })}).
- If a specific day was committed to (e.g. "let's do Monday", "Thursday works", "tomorrow"), resolve it to an ISO YYYY-MM-DD date in scheduled_date.
- If a time or arrival window was discussed (e.g. "10am", "10 to 12", "morning"), set scheduled_time to the START time in HH:MM 24h format.
- DO NOT guess. Only fill these if the conversation actually committed to that day/time.`,
          },
          { role: "user", content: call.transcription },
        ],
        tools: [extractTool],
        tool_choice: { type: "function", function: { name: "extract_call_data" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI extraction error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in AI response");
      return new Response(JSON.stringify({ error: "No extraction result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log(`Call ${call_id}: extracted data →`, JSON.stringify(extracted).slice(0, 200));

    // ── Address verification via Google Geocoding ──
    let verifiedAddress: string | null = null;
    let addressConfident = extracted.address_confidence !== "low";

    if (extracted.address) {
      const geo = await verifyAddress(
        extracted.address,
        extracted.city,
        extracted.state,
        extracted.zip
      );

      if (geo) {
        if (geo.confidence >= 0.8) {
          verifiedAddress = geo.standardized;
          addressConfident = true;
          console.log(`Call ${call_id}: Google verified address → ${verifiedAddress}`);
        } else {
          verifiedAddress = geo.standardized;
          addressConfident = false;
          console.log(`Call ${call_id}: Google low confidence (${geo.confidence}) for address`);
        }
      } else {
        addressConfident = false;
        console.log(`Call ${call_id}: Google returned no results for address`);
      }
    }

    const nameConfident = extracted.name_confidence !== "low";

    // ── HARD GUARD: never let the AI attribute an employee's name to the caller ──
    // When a call is forwarded to an employee's cell, the employee usually answers
    // with "Hello, this is <name>" — the AI sometimes mistakes that for the caller's
    // self-introduction and pollutes the customer record. This scrub also fires when
    // the resolved DB contact name (truth) disagrees with the AI's extraction.
    try {
      const { data: activeEmployees } = await supabase
        .from("employees")
        .select("name")
        .eq("is_active", true);
      const employeeFirstNames = new Set(
        (activeEmployees || [])
          .map((e: any) => String(e.name || "").trim().split(/\s+/)[0]?.toLowerCase())
          .filter(Boolean)
      );
      const employeeFullNames = new Set(
        (activeEmployees || [])
          .map((e: any) => String(e.name || "").trim().toLowerCase())
          .filter(Boolean)
      );
      const extFirst = (extracted.first_name || "").trim().toLowerCase();
      const extFull = `${extracted.first_name || ""} ${extracted.last_name || ""}`.trim().toLowerCase();
      if (extFirst && (employeeFirstNames.has(extFirst) || employeeFullNames.has(extFull))) {
        console.warn(`Call ${call_id}: AI extracted employee name "${extracted.first_name} ${extracted.last_name || ""}" as caller — scrubbing.`);
        extracted.first_name = "";
        extracted.last_name = "";
      }

      // If the DB already knows who this caller is (via phone match), trust that
      // over the AI. Replace the extracted name with the DB truth so downstream
      // logic (HCP notes, action_items) uses the right person.
      if (call.contact_name && call.contact_type !== "employee") {
        const parts = String(call.contact_name).trim().split(/\s+/);
        const dbFirst = (parts[0] || "").toLowerCase();
        if (extFirst && extFirst !== dbFirst) {
          console.warn(`Call ${call_id}: AI name "${extracted.first_name}" ≠ DB contact "${call.contact_name}" — using DB truth.`);
          extracted.first_name = parts[0] || "";
          extracted.last_name = parts.slice(1).join(" ") || "";
        }
      }
    } catch (scrubErr) {
      console.error(`Call ${call_id}: name-scrub guard failed:`, scrubErr);
    }

    // Build the full extraction payload
    const extractionPayload = {
      ...extracted,
      verified_address: verifiedAddress,
      address_verified: addressConfident,
      name_verified: nameConfident,
    };

    // Update call_log with AI summary, extracted_data, AND call_extraction
    await supabase
      .from("call_log")
      .update({
        ai_summary: extracted.summary,
        extracted_data: extractionPayload,
        call_extraction: extractionPayload,
      })
      .eq("id", call_id);

    // ── Employee call detection ──
    const isEmployeeCall = call.contact_type === "employee";
    if (isEmployeeCall) {
      console.log(`Call ${call_id}: detected EMPLOYEE call — skipping booking/customer flows`);
    }

    // ── Smart job matching for employee calls ──
    // When a tech calls the owner about a job, auto-link the call to the relevant job
    if (isEmployeeCall && !call.related_job_id) {
      const normalizedPhone = call.phone_number?.replace(/\D/g, "").slice(-10);
      if (normalizedPhone && normalizedPhone.length === 10) {
        const today = new Date();
        const twoWeeksAgo = new Date(today);
        twoWeeksAgo.setDate(today.getDate() - 14);
        const oneWeekAhead = new Date(today);
        oneWeekAhead.setDate(today.getDate() + 7);
        const dateMin = twoWeeksAgo.toISOString().split("T")[0];
        const dateMax = oneWeekAhead.toISOString().split("T")[0];

        // Search jobs within the date window matching the other party's phone
        const { data: matchedJobs } = await supabase
          .from("jobs")
          .select("id, hcp_id, customer_phone, scheduled_date")
          .not("customer_phone", "is", null)
          .gte("scheduled_date", dateMin)
          .lte("scheduled_date", dateMax)
          .not("status", "in", "(canceled)")
          .limit(100);

        const jobMatch = (matchedJobs || [])
          .filter((j: any) => j.customer_phone?.replace(/\D/g, "").slice(-10) === normalizedPhone)
          .sort((a: any, b: any) => {
            const todayMs = today.getTime();
            const aDiff = Math.abs(new Date(a.scheduled_date).getTime() - todayMs);
            const bDiff = Math.abs(new Date(b.scheduled_date).getTime() - todayMs);
            return aDiff - bDiff;
          })[0];

        if (jobMatch) {
          call.related_job_id = jobMatch.id;
          await supabase.from("call_log").update({ related_job_id: jobMatch.id }).eq("id", call_id);
          await supabase.from("activity_log").insert({
            job_id: jobMatch.id,
            action: "call_summary",
            details: `📞 Internal call notes (employee → employee):\n${extracted.summary}`,
            performed_by: "Copilot",
          });
          console.log(`Call ${call_id}: auto-linked to job ${jobMatch.id} (date: ${jobMatch.scheduled_date})`);
        } else {
          // Try estimates with the same date window
          const { data: matchedEsts } = await supabase
            .from("estimates")
            .select("id, hcp_id, customer_phone, scheduled_date")
            .not("customer_phone", "is", null)
            .gte("scheduled_date", dateMin)
            .lte("scheduled_date", dateMax)
            .not("status", "in", "(canceled,lost)")
            .limit(100);

          const estMatch = (matchedEsts || [])
            .filter((e: any) => e.customer_phone?.replace(/\D/g, "").slice(-10) === normalizedPhone)
            .sort((a: any, b: any) => {
              const todayMs = today.getTime();
              const aDiff = Math.abs(new Date(a.scheduled_date).getTime() - todayMs);
              const bDiff = Math.abs(new Date(b.scheduled_date).getTime() - todayMs);
              return aDiff - bDiff;
            })[0];

          if (estMatch) {
            call.related_job_id = estMatch.id;
            await supabase.from("call_log").update({ related_job_id: estMatch.id }).eq("id", call_id);
            await supabase.from("activity_log").insert({
              job_id: estMatch.id,
              action: "call_summary",
              details: `📞 Internal call notes (employee → employee):\n${extracted.summary}`,
              performed_by: "Copilot",
            });
            console.log(`Call ${call_id}: auto-linked to estimate ${estMatch.id} (date: ${estMatch.scheduled_date})`);
          } else {
            console.log(`Call ${call_id}: employee call but no matching job/estimate found in ±2w/1w window`);
          }
        }
      }
    }

    // ── Push call summary as note to HCP (job or estimate) ──
    const hcpApiKey = Deno.env.get("HCP_API_KEY");
    let hcpNotePushed = false;

    if (hcpApiKey) {
      // Priority chain: related_job_id → customer jobs → customer estimates → phone fallback
      let hcpId: string | null = null;
      let hcpType = "job";

      // 1. Direct related_job_id
      if (call.related_job_id) {
        const { data: jobRec } = await supabase
          .from("jobs")
          .select("hcp_id")
          .eq("id", call.related_job_id)
          .maybeSingle();
        if (jobRec?.hcp_id) hcpId = jobRec.hcp_id;

        // Also log to activity_log
        await supabase.from("activity_log").insert({
          job_id: call.related_job_id,
          action: "call_summary",
          details: extracted.summary,
          performed_by: "Copilot",
        });
      }

      // 2. Customer → most recent job with hcp_id
      if (!hcpId && call.related_customer_id) {
        const { data: custJob } = await supabase
          .from("jobs")
          .select("id, hcp_id")
          .eq("customer_id", call.related_customer_id)
          .not("hcp_id", "is", null)
          .order("scheduled_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (custJob?.hcp_id) {
          hcpId = custJob.hcp_id;
          // Also log activity
          await supabase.from("activity_log").insert({
            job_id: custJob.id,
            action: "call_summary",
            details: extracted.summary,
            performed_by: "Copilot",
          });
        }
      }

      // 3. Customer → most recent estimate with hcp_id
      if (!hcpId && call.related_customer_id) {
        const { data: custEst } = await supabase
          .from("estimates")
          .select("id, hcp_id")
          .eq("customer_id", call.related_customer_id)
          .not("hcp_id", "is", null)
          .order("scheduled_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (custEst?.hcp_id) {
          hcpId = custEst.hcp_id;
          hcpType = "estimate";
        }
      }

      // 4. Phone fallback — search jobs by customer_phone
      if (!hcpId) {
        const normalizedPhone = call.phone_number?.replace(/\D/g, "").slice(-10);
        if (normalizedPhone && normalizedPhone.length === 10) {
          // Try active jobs first via DB function
          const { data: phoneJob } = await supabase
            .rpc("find_job_by_phone", { digits: normalizedPhone })
            .limit(1)
            .maybeSingle();
          if (phoneJob?.id) {
            const { data: jRec } = await supabase.from("jobs").select("hcp_id").eq("id", phoneJob.id).maybeSingle();
            if (jRec?.hcp_id) hcpId = jRec.hcp_id;
          }

          // 5. Phone fallback — search all jobs
          if (!hcpId) {
            const { data: allJobs } = await supabase
              .from("jobs")
              .select("id, hcp_id, customer_phone")
              .not("hcp_id", "is", null)
              .not("customer_phone", "is", null)
              .order("scheduled_date", { ascending: false })
              .limit(200);
            const matched = (allJobs || []).find((j: any) =>
              j.customer_phone?.replace(/\D/g, "").slice(-10) === normalizedPhone
            );
            if (matched?.hcp_id) hcpId = matched.hcp_id;
          }

          // 6. Phone fallback — search estimates
          if (!hcpId) {
            const { data: allEsts } = await supabase
              .from("estimates")
              .select("id, hcp_id, customer_phone")
              .not("hcp_id", "is", null)
              .not("customer_phone", "is", null)
              .order("scheduled_date", { ascending: false })
              .limit(200);
            const matched = (allEsts || []).find((e: any) =>
              e.customer_phone?.replace(/\D/g, "").slice(-10) === normalizedPhone
            );
            if (matched?.hcp_id) {
              hcpId = matched.hcp_id;
              hcpType = "estimate";
            }
          }
        }
      }

      // 7. Address fallback — use extracted address from transcript
      if (!hcpId && extracted.address && extracted.address.length > 5) {
        const normAddr = extracted.address
          .toLowerCase()
          .replace(/[.,#\-]/g, " ")
          .replace(/\b(apt|suite|ste|unit|bldg|building|fl|floor)\b.*$/i, "")
          .replace(/\s+/g, " ")
          .trim();
        const addrPrefix = normAddr.slice(0, 15);
        console.log(`Call ${call_id}: trying address match → "${normAddr}"`);

        // Search jobs by address
        const { data: addrJobs } = await supabase
          .from("jobs")
          .select("id, hcp_id, address")
          .not("hcp_id", "is", null)
          .not("address", "is", null)
          .order("scheduled_date", { ascending: false })
          .limit(300);

        const addrJobMatch = (addrJobs || []).find((j: any) =>
          j.address && j.address.toLowerCase().replace(/[.,#\-]/g, " ").replace(/\s+/g, " ").trim().includes(addrPrefix)
        );
        if (addrJobMatch?.hcp_id) {
          hcpId = addrJobMatch.hcp_id;
          console.log(`Call ${call_id}: address matched job → "${addrJobMatch.address}"`);
        }

        // Search estimates by address
        if (!hcpId) {
          const { data: addrEsts } = await supabase
            .from("estimates")
            .select("id, hcp_id, address")
            .not("hcp_id", "is", null)
            .not("address", "is", null)
            .order("scheduled_date", { ascending: false })
            .limit(300);

          const addrEstMatch = (addrEsts || []).find((e: any) =>
            e.address && e.address.toLowerCase().replace(/[.,#\-]/g, " ").replace(/\s+/g, " ").trim().includes(addrPrefix)
          );
          if (addrEstMatch?.hcp_id) {
            hcpId = addrEstMatch.hcp_id;
            hcpType = "estimate";
            console.log(`Call ${call_id}: address matched estimate → "${addrEstMatch.address}"`);
          }
        }
      }

      // Push note to HCP if we found a target
      if (hcpId) {
        try {
          // Prefer the resolved contact name (DB truth) over AI-extracted names which
          // can be polluted by voicemail greetings ("You've reached Parker…").
          const knownContact = call.contact_name || null;
          const extractedName = extracted.first_name
            ? `${extracted.first_name} ${extracted.last_name || ""}`.trim()
            : null;
          const otherParty = knownContact || extractedName || call.phone_number;
          // Direction-aware framing: outbound = WE called THEM, inbound = THEY called US
          const partyLabel = call.direction === "outbound"
            ? `Called ${otherParty}`
            : `Caller: ${otherParty}`;
          const noteBody = `📞 Call Notes (${partyLabel}):\n${extracted.summary}${extracted.problem_description ? `\n\nIssue: ${extracted.problem_description}` : ""}`;

          const noteRes = await fetch(
            `https://api.housecallpro.com/jobs/${hcpId}/notes`,
            {
              method: "POST",
              headers: {
                "Authorization": `Token ${hcpApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ content: noteBody }),
            },
          );
          if (noteRes.ok) {
            hcpNotePushed = true;
            await supabase.from("call_log").update({ hcp_note_synced: true }).eq("id", call_id);
            console.log(`Call ${call_id}: pushed note to HCP ${hcpType} ${hcpId}`);
          } else {
            console.error(`Call ${call_id}: HCP note push failed (${noteRes.status}):`, await noteRes.text());
          }
        } catch (noteErr) {
          console.error(`Call ${call_id}: HCP note push error:`, noteErr);
        }
      } else {
        console.log(`Call ${call_id}: no HCP job/estimate found for note push`);
      }
    }

    // Try to match/create customer if not already linked — ONE SOURCE OF TRUTH: DB function
    // SKIP for employee calls — we don't want to create/update customer records from tech-to-owner convos
    // IMPORTANT: Customer lookup runs BEFORE verification so we can skip
    // verification SMS for customers whose data is already in the CRM.
    let customerAlreadyHasAddress = false;
    let customerAlreadyHasName = false;
    let isNewCustomer = false;

    let resolvedCustomerId: string | null = call.related_customer_id || null;

   if (!isEmployeeCall && !call.related_customer_id) {
      const normalized = call.phone_number.replace(/\D/g, "").slice(-10);
      if (normalized.length === 10) {
        const { data: matchResult } = await supabase
          .rpc("find_customer_by_phone", { digits: normalized })
          .limit(1)
          .maybeSingle();

        if (matchResult) {
          resolvedCustomerId = matchResult.id;
          const { data: existing } = await supabase
            .from("customers")
            .select("id, first_name, last_name, address, city, state, zip, email")
            .eq("id", matchResult.id)
            .limit(1);

          if (existing && existing.length > 0) {
            const cust = existing[0];

            // Track what the CRM already knows — used to skip redundant verification
            customerAlreadyHasAddress = !!cust.address;
            customerAlreadyHasName = !!(cust.first_name && cust.last_name);

            const updates: Record<string, string> = {};
            // SAFETY RAILS:
            //  1) Only fill truly EMPTY fields. NEVER overwrite existing name/address.
            //  2) For OUTBOUND calls, do NOT trust AI-extracted names — they are very
            //     likely from a carrier voicemail greeting ("You've reached Parker…")
            //     rather than the actual recipient. We already know who we called.
            const trustExtractedName = call.direction !== "outbound";
            if (trustExtractedName && !cust.first_name && extracted.first_name) updates.first_name = extracted.first_name;
            if (trustExtractedName && !cust.last_name && extracted.last_name) updates.last_name = extracted.last_name;

            // Log name conflicts instead of overwriting (inbound only — outbound names are unreliable)
            if (trustExtractedName && cust.first_name && extracted.first_name && cust.first_name.toLowerCase() !== extracted.first_name.toLowerCase()) {
              console.warn(`Call ${call_id}: Name conflict — DB="${cust.first_name}" vs transcript="${extracted.first_name}" — NOT overwriting`);
              await supabase.from("activity_log").insert({
                action: "customer_data_conflict",
                details: `⚠️ Call transcript name mismatch for customer ${cust.id}: DB has "${cust.first_name} ${cust.last_name || ""}" but caller identified as "${extracted.first_name} ${extracted.last_name || ""}". Phone: ${call.phone_number}. Existing data preserved — please verify manually.`,
                performed_by: "System",
              });
            }

            if (!cust.address && (verifiedAddress && addressConfident ? true : extracted.address)) {
              updates.address = addressConfident && verifiedAddress
                ? verifiedAddress.split(",")[0]
                : extracted.address;
            }
            // Log address conflicts instead of overwriting
            if (cust.address && extracted.address && cust.address.toLowerCase() !== extracted.address.toLowerCase()) {
              console.warn(`Call ${call_id}: Address conflict — DB="${cust.address}" vs transcript="${extracted.address}" — NOT overwriting`);
            }

            if (!cust.city && extracted.city) updates.city = extracted.city;
            if (!cust.state && extracted.state) updates.state = extracted.state;
            if (!cust.zip && extracted.zip) updates.zip = extracted.zip;
            if (!cust.email && extracted.email) updates.email = extracted.email;

            if (Object.keys(updates).length > 0) {
              await supabase.from("customers").update(updates).eq("id", cust.id);
              console.log(`Call ${call_id}: updated customer ${cust.id} with`, Object.keys(updates));
            }
          }
        } else if ((extracted.first_name || extracted.last_name) && call.direction !== "outbound") {
          // Only auto-create customers from INBOUND calls. Outbound names are usually
          // from carrier voicemail greetings ("You've reached Parker…") and would
          // pollute the CRM with phantom contacts.
          isNewCustomer = true;
          const customerAddress = addressConfident && verifiedAddress
            ? verifiedAddress.split(",")[0]
            : extracted.address;

          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              first_name: extracted.first_name || null,
              last_name: extracted.last_name || null,
              phone: call.phone_number,
              address: customerAddress || null,
              city: extracted.city || null,
              state: extracted.state || null,
              zip: extracted.zip || null,
              email: extracted.email || null,
              notes: `Auto-created from call transcript: ${extracted.problem_description || ""}`,
            })
            .select("id")
            .single();

          if (newCust) {
            resolvedCustomerId = newCust.id;
            await supabase
              .from("call_log")
              .update({ related_customer_id: newCust.id })
              .eq("id", call_id);
            console.log(`Call ${call_id}: created new customer ${newCust.id}`);
          }
        }
      }
    }


    // ── Post-call booking flow: queue slot-finding if this looks like a booking request ──
    // Respect ai_sms_auto_draft kill-switch
    const { data: autoDraftRow } = await supabase
      .from("company_settings")
      .select("value")
      .eq("key", "ai_sms_auto_draft")
      .maybeSingle();
    const aiDraftOn = autoDraftRow?.value !== "false";

    // Disabled for JARVIS 2.0: post-call booking drafts were too eager and could
    // fire before existing-job/estimate and multi-property checks ran.
    if (
      false &&
      !isEmployeeCall &&
      aiDraftOn &&
      extracted.service_type &&
      extracted.service_type !== "other" &&
      call.phone_number
    ) {
      try {
        await supabase.from("outbound_drafts").insert({
          channel: "sms",
          recipient: call.phone_number,
          body: "", // Will be filled after slot-finding
          status: "auto_pending",
          source: "post-call-booking",
          metadata: {
            call_id,
            phase: "find_slots",
            extracted_data: extracted,
            scheduling_preference: extracted.scheduling_preference || null,
            verified_address: verifiedAddress,
          },
        });
        console.log(`Call ${call_id}: queued post-call booking flow`);
      } catch (draftErr) {
        console.error(`Call ${call_id}: failed to queue outbound_draft:`, draftErr);
      }
    }

    // Resolve customer name early — used by the booking action card AND todo extraction below.
    // Prefer the resolved DB contact name (truth) over AI-extracted names which can
    // be polluted by carrier voicemail greetings on outbound calls.
    const extractedFullName = extracted.first_name
      ? `${extracted.first_name} ${extracted.last_name || ""}`.trim()
      : null;
    const customerName = call.contact_name
      || (call.direction === "outbound" ? null : extractedFullName)
      || extractedFullName;

    // ── CRITICAL: create the booking action_item FIRST, before any slow AI work ──
    // This guarantees the "Book It Now" card appears in the Now tab even if the
    // todo-extraction AI call below times out or hangs.
    let shouldInjectBookingCard = true;
    if (!isEmployeeCall && extracted.service_type && extracted.service_type !== "other") {
      try {
        let activeJob: { id: string; hcp_job_number: string | null } | null = null;
        if (resolvedCustomerId) {
          const { data: openJob } = await supabase
            .from("jobs")
            .select("id, hcp_job_number")
            .eq("customer_id", resolvedCustomerId)
            .not("status", "in", '("done","invoiced","canceled")')
            .order("scheduled_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          activeJob = openJob || null;
        }
        if (!activeJob && call.phone_number) {
          const digits = String(call.phone_number).replace(/\D/g, "").slice(-10);
          if (digits.length === 10) {
            const { data: jobByPhone } = await supabase
              .rpc("find_job_by_phone", { digits })
              .maybeSingle();
            if (jobByPhone) activeJob = { id: (jobByPhone as any).id, hcp_job_number: (jobByPhone as any).hcp_job_number };
          }
        }

        let activeEstimate: { id: string; estimate_number?: string | null; scheduled_date?: string | null } | null = null;
        if (resolvedCustomerId) {
          const { data: estByCustomer } = await supabase
            .from("estimates")
            .select("id, estimate_number, scheduled_date")
            .eq("customer_id", resolvedCustomerId)
            .not("status", "in", '("lost","canceled","done")')
            .not("work_status", "in", '("won","lost")')
            .order("scheduled_date", { ascending: true, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          activeEstimate = estByCustomer || null;
        }
        if (!activeEstimate && call.phone_number) {
          const digits = String(call.phone_number).replace(/\D/g, "").slice(-10);
          if (digits.length === 10) {
            const { data: estimates } = await supabase
              .from("estimates")
              .select("id, estimate_number, scheduled_date, customer_phone")
              .not("customer_phone", "is", null)
              .not("status", "in", '("lost","canceled","done")')
              .not("work_status", "in", '("won","lost")')
              .limit(50);
            activeEstimate = (estimates || []).find((e: any) => String(e.customer_phone || "").replace(/\D/g, "").slice(-10) === digits) || null;
          }
        }

        const knownProperties = await loadKnownProperties(supabase, resolvedCustomerId);
        const needsPropertySelection = knownProperties.length > 1 && !(verifiedAddress || extracted.address);

        if (activeJob) {
          const jobRef = activeJob.hcp_job_number ? `#${activeJob.hcp_job_number}` : "in progress";
          await supabase.from("action_items").insert({
            title: customerName
              ? `${customerName} called about active job ${jobRef}`
              : `Caller has active job ${jobRef} — review notes`,
            description: extracted.problem_description || extracted.summary || "Follow-up call on existing job",
            category: "follow_up",
            priority: "normal",
            source: "jarvis",
            status: "pending",
            customer_phone: call.phone_number || null,
            job_id: activeJob.id,
            suggested_action: `Review job ${jobRef} notes — caller has work in progress`,
            metadata: {
              customer_name: customerName || null,
              customer_id: resolvedCustomerId || null,
              phone: call.phone_number || null,
              call_id,
              suppressed_booking: true,
              suppressed_reason: "active_job_in_progress",
              active_job_id: activeJob.id,
            },
          });
          shouldInjectBookingCard = false;
          console.log(`Call ${call_id}: SUPPRESSED booking — active job ${activeJob.id}; created follow_up instead`);
        } else if (activeEstimate) {
          const estimateRef = activeEstimate.estimate_number ? `#${activeEstimate.estimate_number}` : "upcoming estimate";
          await supabase.from("action_items").insert({
            title: customerName
              ? `${customerName} called about estimate ${estimateRef}`
              : `Caller has estimate ${estimateRef} - review notes`,
            description: extracted.problem_description || extracted.summary || "Follow-up call on existing estimate",
            category: "follow_up",
            priority: "normal",
            source: "jarvis",
            status: "pending",
            customer_phone: call.phone_number || null,
            suggested_action: `Review estimate ${estimateRef} - caller likely has an update or question`,
            metadata: {
              customer_name: customerName || null,
              customer_id: resolvedCustomerId || null,
              phone: call.phone_number || null,
              call_id,
              suppressed_booking: true,
              suppressed_reason: "active_estimate_in_progress",
              active_estimate_id: activeEstimate.id,
            },
          });
          shouldInjectBookingCard = false;
          console.log(`Call ${call_id}: SUPPRESSED booking - active estimate ${activeEstimate.id}; created follow_up instead`);
        } else if (needsPropertySelection) {
          await supabase.from("action_items").insert({
            title: customerName
              ? `${customerName} called - choose service property`
              : `Caller has multiple properties - choose service property`,
            description: extracted.problem_description || extracted.summary || "New request detected, but customer has multiple properties and no address was confirmed.",
            category: "new_appointment",
            priority: "high",
            source: "jarvis",
            status: "pending",
            customer_phone: call.phone_number || null,
            suggested_action: "Choose the correct property before booking",
            metadata: {
              customer_name: customerName || null,
              customer_id: resolvedCustomerId || null,
              phone: call.phone_number || null,
              call_id,
              requires_property_selection: true,
              property_options: knownProperties,
              service_type: extracted.service_type || null,
              job_type: extracted.service_type === "estimate" ? "estimate" : (extracted.service_type || "service"),
              scheduling_preference: extracted.scheduling_preference || null,
              scheduled_date: extracted.scheduled_date || null,
              scheduled_time: extracted.scheduled_time || null,
              description: extracted.problem_description || null,
            },
          });
          shouldInjectBookingCard = false;
          console.log(`Call ${call_id}: booking held for property selection (${knownProperties.length} properties)`);
        } else {
          const aiTitle = customerName
            ? `New ${extracted.service_type || "service"} request from ${customerName}`
            : `New ${extracted.service_type || "service"} request from ${call.phone_number}`;
          await supabase.from("action_items").insert({
            title: aiTitle,
            description: extracted.problem_description || "Booking detected from phone call",
            category: "new_appointment",
            priority: "high",
            source: "jarvis",
            status: "pending",
            customer_phone: call.phone_number || null,
            suggested_action: `Book ${extracted.service_type || "service call"} for ${customerName || call.phone_number}`,
            metadata: {
              customer_name: customerName || null,
              customer_id: resolvedCustomerId || null,
              phone: call.phone_number || null,
              address: verifiedAddress || extracted.address || null,
              service_type: extracted.service_type || null,
              job_type: extracted.service_type === "estimate" ? "estimate" : (extracted.service_type || "service"),
              scheduling_preference: extracted.scheduling_preference || null,
              // ── Carry resolved schedule + default tech so HCP job is dispatched, not "needs scheduling" ──
              scheduled_date: extracted.scheduled_date || null,
              scheduled_time: extracted.scheduled_time || null,
              assigned_to: "Jonathan Carnes",
              call_id: call_id,
              description: extracted.problem_description || null,
            },
          });
          console.log(`Call ${call_id}: action_item created for booking (early path) — date=${extracted.scheduled_date || "none"}, time=${extracted.scheduled_time || "none"}, tech=Jonathan Carnes`);
        }
      } catch (aiErr) {
        console.error(`Call ${call_id}: failed to create early booking action_item:`, aiErr);
      }
    }

    // (Todo extraction removed — JARVIS no longer manages a To-Do list.)

    // ── Inject booking action card into copilot session (skip for employee calls) ──
    if (shouldInjectBookingCard && !isEmployeeCall && extracted.service_type && extracted.service_type !== "other") {
      try {
        // Find the active copilot session for this call (by call_sid or phone)
        let sessionQuery = supabase
          .from("copilot_sessions")
          .select("id, user_id")
          .is("ended_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (call.twilio_sid) {
          sessionQuery = sessionQuery.eq("call_sid", call.twilio_sid);
        } else {
          sessionQuery = sessionQuery.eq("phone_number", call.phone_number);
        }

        const { data: session } = await sessionQuery.maybeSingle();

        // Fallback: if no call-specific session, find the most recent active session for any user
        let targetSession = session;
        if (!targetSession) {
          const { data: fallback } = await supabase
            .from("copilot_sessions")
            .select("id, user_id")
            .is("ended_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetSession = fallback;
        }

        if (targetSession) {
          // Map service_type to action type
          const actionType = extracted.service_type === "estimate" ? "book_estimate"
            : extracted.service_type === "maintenance" ? "book_maintenance"
            : "book_job";

          const actionCard = {
            type: actionType,
            job_type: extracted.service_type === "estimate" ? "estimate" : extracted.service_type,
            customer_name: customerName || undefined,
            phone: call.phone_number || undefined,
            address: verifiedAddress || extracted.address || undefined,
            description: extracted.problem_description || undefined,
          };

          // Build a human-readable summary
          const parts: string[] = [];
          if (customerName) parts.push(`**Customer:** ${customerName}`);
          if (call.phone_number) parts.push(`**Phone:** ${call.phone_number}`);
          if (verifiedAddress || extracted.address) parts.push(`**Address:** ${verifiedAddress || extracted.address}`);
          if (extracted.service_type) parts.push(`**Service:** ${extracted.service_type}`);
          if (extracted.problem_description) parts.push(`**Issue:** ${extracted.problem_description}`);
          if (extracted.scheduling_preference) parts.push(`**Preferred time:** ${extracted.scheduling_preference}`);

          const cardContent = `📞 **Call complete — booking detected**\n\n${parts.join("\n")}\n\nReady to book? Use the action button below.`;

          await supabase.from("copilot_messages").insert({
            user_id: targetSession.user_id,
            session_id: targetSession.id,
            role: "assistant",
            content: cardContent,
            metadata: { suggested_actions: [actionCard] },
          });

          console.log(`Call ${call_id}: injected booking action card into session ${targetSession.id}`);
        } else {
          console.log(`Call ${call_id}: no active copilot session found for booking card`);
        }

        // NOTE: action_items insert was moved earlier in the function (before the slow
        // todo-extraction AI call) to guarantee the "Book It Now" card always appears in
        // the Now tab even if downstream operations time out. Do not duplicate here.
      } catch (cardErr) {
        console.error(`Call ${call_id}: failed to inject booking card:`, cardErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, extracted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("summarize-call error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
