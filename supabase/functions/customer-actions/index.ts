import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



// ==================== Customer SMS Parsing ====================

const customerTool = {
  type: "function",
  function: {
    name: "format_customer",
    description: "Extract and format customer information from raw text like an SMS message.",
    parameters: {
      type: "object",
      properties: {
        first_name: { type: "string", description: "First name, title case" },
        last_name: { type: "string", description: "Last name, title case" },
        mobile_number: { type: "string", description: "Phone formatted as (XXX) XXX-XXXX" },
        email: { type: "string", description: "Email if found, empty string if not" },
        street: { type: "string", description: "Street address, title case" },
        city: { type: "string", description: "City, title case" },
        state: { type: "string", description: "State, 2-letter abbreviation uppercase" },
        zip: { type: "string", description: "ZIP code" },
        notes: { type: "string", description: "Any service notes or issue description" },
        job_description: { type: "string", description: "Brief job/service description" },
      },
      required: ["first_name", "last_name", "mobile_number", "street", "city", "state", "zip"],
      additionalProperties: false,
    },
  },
};

async function parseCustomerSMS(text: string, lovableApiKey: string, model: string) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a data extraction assistant for an HVAC company. Extract customer info from messy SMS text. Format properly: title case names, format phone as (XXX) XXX-XXXX, proper address formatting, 2-letter state codes. If info is missing, use empty string. Any mention of HVAC issues goes in notes/job_description.`,
        },
        { role: "user", content: text },
      ],
      tools: [customerTool],
      tool_choice: { type: "function", function: { name: "format_customer" } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Parse error:", resp.status, errText);
    throw new Error(`AI parse error: ${resp.status}`);
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return structured data");
  return JSON.parse(toolCall.function.arguments);
}

// ==================== Local Customer Search ====================

async function searchLocalCustomers(query: string, sb: any) {
  const { data, error } = await sb
    .from("customers")
    .select("id, first_name, last_name, phone, mobile_phone, email, address, city, state, zip")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,mobile_phone.ilike.%${query}%,email.ilike.%${query}%,address.ilike.%${query}%`)
    .limit(5);
  if (error) {
    console.error("Local customer search error:", JSON.stringify(error));
    return [];
  }
  return (data || []).map((c: any) => ({
    id: c.id,
    first_name: c.first_name || "",
    last_name: c.last_name || "",
    mobile_number: c.phone || c.mobile_phone || "",
    email: c.email || "",
    address: [c.address, c.city, c.state, c.zip].filter(Boolean).join(", "),
    address_id: c.id,
  }));
}

// ==================== Phone Dedup Helper ====================

async function findExistingByPhone(phone: string | null, sb: any) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return null;

  const { data } = await sb
    .from("customers")
    .select("*")
    .or(`phone.ilike.%${digits}%,mobile_phone.ilike.%${digits}%`)
    .limit(1);

  return data?.[0] || null;
}

// ==================== Address Dedup Helper ====================

async function findExistingByAddress(street: string | null, zip: string | null, sb: any) {
  if (!street) return null;
  const normalized = street.trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
  if (normalized.length < 5) return null;

  // Try address+zip first (most reliable)
  if (zip) {
    const { data } = await sb
      .from("customers")
      .select("*")
      .ilike("address", `%${normalized}%`)
      .eq("zip", zip.trim())
      .limit(1);
    if (data?.[0]) return data[0];
  }

  return null;
}

async function findExistingByAddressCity(street: string | null, city: string | null, sb: any) {
  if (!street || !city) return null;
  const normalized = street.trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
  if (normalized.length < 5) return null;

  const { data } = await sb
    .from("customers")
    .select("*")
    .ilike("address", `%${normalized}%`)
    .ilike("city", city.trim())
    .limit(1);

  return data?.[0] || null;
}

async function findExistingByNameAndAddress(firstName: string | null, lastName: string | null, street: string | null, sb: any) {
  if (!firstName || !lastName || !street) return null;
  const normalized = street.trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
  if (normalized.length < 5) return null;

  const { data } = await sb
    .from("customers")
    .select("*")
    .ilike("first_name", firstName.trim())
    .ilike("last_name", lastName.trim())
    .ilike("address", `%${normalized}%`)
    .limit(1);

  return data?.[0] || null;
}

async function findExistingByNameAndPhone(firstName: string | null, lastName: string | null, phone: string | null, sb: any) {
  if (!firstName || !lastName || !phone) return null;
  const last7 = phone.replace(/\D/g, "").slice(-7);
  if (last7.length < 7) return null;

  const { data } = await sb
    .from("customers")
    .select("*")
    .ilike("first_name", firstName.trim())
    .ilike("last_name", lastName.trim())
    .or(`phone.ilike.%${last7}%,mobile_phone.ilike.%${last7}%`)
    .limit(1);

  return data?.[0] || null;
}

// ==================== Local Customer Create ====================

function enrichAndReturn(existing: any, customerData: any) {
  const updates: any = {};
  if (!existing.email && customerData.email) updates.email = customerData.email;
  if (!existing.address && customerData.street) updates.address = customerData.street;
  if (!existing.city && customerData.city) updates.city = customerData.city;
  if (!existing.state && customerData.state) updates.state = customerData.state;
  if (!existing.zip && customerData.zip) updates.zip = customerData.zip;
  if (!existing.phone && customerData.mobile_number) updates.phone = customerData.mobile_number;
  if (!existing.mobile_phone && customerData.mobile_number && existing.phone) updates.mobile_phone = customerData.mobile_number;
  return { updates, merged: { ...existing, ...updates, _deduplicated: true } };
}

async function createLocalCustomer(customerData: any, sb: any) {
  // ── Dedup Step 1: Address+zip (PRIMARY — addresses don't change) ──
  const addrMatch = await findExistingByAddress(customerData.street, customerData.zip, sb);
  if (addrMatch) {
    console.log(`Dedup (address+zip): found existing customer ${addrMatch.id} at ${customerData.street}`);
    const { updates, merged } = enrichAndReturn(addrMatch, customerData);
    if (Object.keys(updates).length > 0) await sb.from("customers").update(updates).eq("id", addrMatch.id);
    return merged;
  }

  // ── Dedup Step 2: Address+city (fallback if no zip) ──
  const addrCityMatch = await findExistingByAddressCity(customerData.street, customerData.city, sb);
  if (addrCityMatch) {
    console.log(`Dedup (address+city): found existing customer ${addrCityMatch.id} at ${customerData.street}`);
    const { updates, merged } = enrichAndReturn(addrCityMatch, customerData);
    if (Object.keys(updates).length > 0) await sb.from("customers").update(updates).eq("id", addrCityMatch.id);
    return merged;
  }

  // ── Dedup Step 3: Phone ──
  const phoneMatch = await findExistingByPhone(customerData.mobile_number, sb);
  if (phoneMatch) {
    console.log(`Dedup (phone): found existing customer ${phoneMatch.id} for phone ${customerData.mobile_number}`);
    const { updates, merged } = enrichAndReturn(phoneMatch, customerData);
    if (Object.keys(updates).length > 0) await sb.from("customers").update(updates).eq("id", phoneMatch.id);
    return merged;
  }

  // ── Dedup Step 4: Name + partial address (no zip needed) ──
  const nameAddrMatch = await findExistingByNameAndAddress(customerData.first_name, customerData.last_name, customerData.street, sb);
  if (nameAddrMatch) {
    console.log(`Dedup (name+address): found existing customer ${nameAddrMatch.id}`);
    const { updates, merged } = enrichAndReturn(nameAddrMatch, customerData);
    if (Object.keys(updates).length > 0) await sb.from("customers").update(updates).eq("id", nameAddrMatch.id);
    return merged;
  }

  // ── Dedup Step 5: Name + phone partial (last 7 digits) ──
  const namePhoneMatch = await findExistingByNameAndPhone(customerData.first_name, customerData.last_name, customerData.mobile_number, sb);
  if (namePhoneMatch) {
    console.log(`Dedup (name+phone): found existing customer ${namePhoneMatch.id}`);
    const { updates, merged } = enrichAndReturn(namePhoneMatch, customerData);
    if (Object.keys(updates).length > 0) await sb.from("customers").update(updates).eq("id", namePhoneMatch.id);
    return merged;
  }

  const record: any = {
    first_name: customerData.first_name || null,
    last_name: customerData.last_name || null,
    phone: customerData.mobile_number || null,
    email: customerData.email || null,
    address: customerData.street || null,
    city: customerData.city || null,
    state: customerData.state || null,
    zip: customerData.zip || null,
    notes: customerData.notes || null,
  };

  const { data, error } = await sb
    .from("customers")
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error("Local customer create error:", JSON.stringify(error));
    throw new Error(`Customer create error: ${error.message}`);
  }

  return data;
}

// ==================== Main Handler ====================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
            const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = getSupabaseAdmin();

    const body = await req.json();
    const mode = body.mode;

    // ========== PARSE CUSTOMER MODE ==========
    if (mode === "parse_customer") {
      if (!lovableApiKey) {
        return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const requestedModel = body.model || await getTaskModel(sb, "customer_parsing");
      const parsed = await parseCustomerSMS(body.text, lovableApiKey, requestedModel);

      let existingMatches: any[] = [];
      const addressSearch = `${parsed.street}`.trim();
      if (addressSearch) {
        const addrResults = await searchLocalCustomers(addressSearch, sb);
        for (const r of addrResults) {
          r.match_reason = "address";
          existingMatches.push(r);
        }
      }

      const secondaryTerms = [`${parsed.first_name} ${parsed.last_name}`];
      if (parsed.mobile_number) {
        const digits = parsed.mobile_number.replace(/\D/g, "");
        if (digits.length >= 7) secondaryTerms.push(digits);
      }
      for (const q of secondaryTerms) {
        const results = await searchLocalCustomers(q, sb);
        for (const r of results) {
          if (!existingMatches.find((e: any) => e.id === r.id)) {
            r.match_reason = "name/phone";
            existingMatches.push(r);
          }
        }
      }

      return new Response(JSON.stringify({ customer: parsed, existingMatches }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== CREATE CUSTOMER MODE ==========
    if (mode === "create_customer") {
      const result = await createLocalCustomer(body.customer, sb);
      return new Response(JSON.stringify({ success: true, customer: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== CREATE JOB MODE ==========
    if (mode === "create_job") {
      // Look up customer phone for the job record
      let customerPhone: string | null = null;
      if (body.customer_id) {
        const { data: cust } = await sb
          .from("customers")
          .select("phone, mobile_phone")
          .eq("id", body.customer_id)
          .single();
        customerPhone = cust?.phone || cust?.mobile_phone || null;
      }

      const effectiveJobType = body.job_type || "service";
      // Default tech to Jonathan Carnes for service calls unless explicitly specified
      const defaultTech = (!body.assigned_to && effectiveJobType === "service") ? "Jonathan Carnes" : (body.assigned_to || null);

      const jobRecord: any = {
        customer_id: body.customer_id,
        customer_name: body.customer_name || "Unknown",
        customer_phone: body.customer_phone || customerPhone,
        description: body.description || "Service call",
        job_type: effectiveJobType,
        status: "new",
        address: body.address || null,
        assigned_to: defaultTech,
      };
      if (body.scheduled_start) {
        jobRecord.scheduled_date = body.scheduled_start.split("T")[0];
        jobRecord.arrival_start = body.scheduled_start;
      }

      const { data: jobData, error: jobError } = await sb
        .from("jobs")
        .insert(jobRecord)
        .select()
        .single();

      if (jobError) {
        console.error("Local job create error:", JSON.stringify(jobError));
        throw new Error(`Job create error: ${jobError.message}`);
      }

      // Centralized post-creation: format, chat, line items, workflow, HCP, activity log
      try {
        await sb.functions.invoke("finalize-job", {
          body: { job_id: jobData.id, created_by: "customer-actions" },
        });
      } catch (e) {
        console.error("finalize-job failed after job create:", e);
      }

      return new Response(JSON.stringify({ success: true, job: jobData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== SEND INTAKE LINK MODE ==========
    if (mode === "send_intake_link") {
      const phone = body.phone;
      if (!phone) {
        return new Response(JSON.stringify({ error: "Phone number required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create token
      const { data: tokenData, error: tokenError } = await sb
        .from("customer_intake_tokens")
        .insert({ phone })
        .select("token")
        .single();

      if (tokenError) {
        console.error("Token create error:", JSON.stringify(tokenError));
        throw new Error(`Token create error: ${tokenError.message}`);
      }

      const intakeUrl = `https://csultramode.lovable.app/intake/${tokenData.token}`;

      // Send SMS with intake link
      const smsResp = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          body: `Hi! Please fill out this quick form so we can get you set up:\n${intakeUrl}\n\nIt only takes a minute!`,
        }),
      });

      const smsData = await smsResp.json();
      return new Response(JSON.stringify({ success: true, token: tokenData.token, sms_status: smsResp.ok ? "sent" : "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== COMPLETE INTAKE MODE ==========
    if (mode === "complete_intake") {
      const token = body.token;
      if (!token) {
        return new Response(JSON.stringify({ error: "Token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate token
      const { data: tokenRow, error: tokenErr } = await sb
        .from("customer_intake_tokens")
        .select("id, completed_at")
        .eq("token", token)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (tokenRow.completed_at) {
        return new Response(JSON.stringify({ error: "Form already submitted" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create customer
      const customer = await createLocalCustomer(body.customer, sb);

      // Mark token as completed
      await sb
        .from("customer_intake_tokens")
        .update({ completed_at: new Date().toISOString(), customer_id: customer.id })
        .eq("id", tokenRow.id);

      return new Response(JSON.stringify({ success: true, customer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown mode: ${mode}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("customer-actions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
