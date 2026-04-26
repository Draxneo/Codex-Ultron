/**
 * create-hcp-job — HCP-first job/estimate creation.
 * 
 * Creates the job/estimate directly in Housecall Pro without inserting locally.
 * The HCP webhook will handle local record creation when HCP fires the event.
 * 
 * This is the single gateway for all "Book It" actions (JARVIS, CSR intake, etc.)
 */
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = getSupabaseAdmin();

  try {
    const body = await req.json();
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_id,        // local UUID — used to look up hcp_customer_id
      address,
      description,
      job_type = "service",
      scheduled_date,
      scheduled_time,
      arrival_start,
      arrival_end,
      assigned_to,
      action_item_id,     // optional — mark as accepted after success
      created_by,
      is_estimate = false,
    } = body;

    const HCP_API_KEY = Deno.env.get("HCP_API_KEY");
    if (!HCP_API_KEY) throw new Error("HCP_API_KEY not configured");

    const results: Record<string, any> = {};

    // ── 1. Resolve or create HCP customer ──
    let hcpCustomerId: string | null = null;

    // Try from local customer record
    if (customer_id) {
      const { data: cust } = await sb.from("customers").select("hcp_customer_id").eq("id", customer_id).maybeSingle();
      hcpCustomerId = cust?.hcp_customer_id || null;
    }

    // Try phone lookup
    if (!hcpCustomerId && customer_phone) {
      const digits = String(customer_phone).replace(/\D/g, "").slice(-10);
      if (digits.length === 10) {
        const { data: phoneCust } = await sb
          .from("customers")
          .select("hcp_customer_id")
          .or(`phone.ilike.%${digits}%,mobile_phone.ilike.%${digits}%`)
          .not("hcp_customer_id", "is", null)
          .limit(1);
        if (phoneCust?.[0]?.hcp_customer_id) hcpCustomerId = phoneCust[0].hcp_customer_id;
      }
    }

    // Try address lookup locally (spouse/work phone won't match, but address will)
    if (!hcpCustomerId && address) {
      const streetPart = address.split(",")[0].trim().toLowerCase();
      if (streetPart.length >= 5) {
        const { data: addrCust } = await sb
          .from("customers")
          .select("hcp_customer_id")
          .ilike("address", `%${streetPart}%`)
          .not("hcp_customer_id", "is", null)
          .limit(1);
        if (addrCust?.[0]?.hcp_customer_id) {
          hcpCustomerId = addrCust[0].hcp_customer_id;
          results.hcp_customer_matched_by = "address_local";
          console.log("Matched existing customer by address:", hcpCustomerId);
        }

        // Also check customer_addresses table
        if (!hcpCustomerId) {
          const { data: addrRows } = await sb
            .from("customer_addresses")
            .select("customer_id, customers!inner(hcp_customer_id)")
            .ilike("street", `%${streetPart}%`)
            .not("customers.hcp_customer_id", "is", null)
            .limit(1);
          const match = addrRows?.[0] as any;
          if (match?.customers?.hcp_customer_id) {
            hcpCustomerId = match.customers.hcp_customer_id;
            results.hcp_customer_matched_by = "address_table";
            console.log("Matched existing customer by customer_addresses:", hcpCustomerId);
          }
        }
      }
    }

    // Search HCP by name and address as fallback before creating
    if (!hcpCustomerId && customer_name) {
      const nameParts = customer_name.trim().split(/\s+/);
      const searchName = customer_name.trim();

      // Also try to get phone from local customer record if we have customer_id but no phone in request
      let resolvedPhone = customer_phone || null;
      if (!resolvedPhone && customer_id) {
        const { data: localCust } = await sb.from("customers").select("phone, mobile_phone").eq("id", customer_id).maybeSingle();
        resolvedPhone = localCust?.mobile_phone || localCust?.phone || null;
      }

      // Try HCP search by name first, then by address
      const searchQueries = [searchName];
      if (address) {
        const streetPart = address.split(",")[0].trim();
        if (streetPart && !searchQueries.includes(streetPart)) searchQueries.push(streetPart);
      }

      for (const query of searchQueries) {
        if (hcpCustomerId) break;
        try {
          const searchRes = await fetch(`https://api.housecallpro.com/customers?q=${encodeURIComponent(query)}&page_size=10`, {
            headers: { "Authorization": `Token ${HCP_API_KEY}` },
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const candidates = searchData.customers || [];
            
            // Exact name match
            const nameMatch = candidates.find((c: any) => {
              const fn = (c.first_name || "").toLowerCase().trim();
              const ln = (c.last_name || "").toLowerCase().trim();
              return fn === (nameParts[0] || "").toLowerCase() && ln === (nameParts.slice(1).join(" ") || "").toLowerCase();
            });
            if (nameMatch) {
              hcpCustomerId = nameMatch.id;
              results.hcp_customer_matched_by = `hcp_search_name`;
              console.log("Matched existing HCP customer by name:", hcpCustomerId);
              break;
            }

            // Address match — if we searched by address, match any customer at that address
            if (query !== searchName && address) {
              const streetNorm = address.split(",")[0].trim().toLowerCase().replace(/\./g, "");
              const addrMatch = candidates.find((c: any) => {
                return (c.addresses || []).some((a: any) => {
                  const s = (a.street || "").toLowerCase().replace(/\./g, "");
                  return s && streetNorm.includes(s.split(" ").slice(0, 3).join(" "));
                });
              });
              if (addrMatch) {
                hcpCustomerId = addrMatch.id;
                results.hcp_customer_matched_by = "hcp_search_address";
                console.log("Matched existing HCP customer by address:", hcpCustomerId);
                break;
              }
            }
          }
        } catch (e) {
          console.error("HCP customer search failed:", e);
        }
      }

      // Create if still not found
      if (!hcpCustomerId) {
        const createBody: any = {
          first_name: nameParts[0] || "",
          last_name: nameParts.slice(1).join(" ") || "",
        };
        // Always include phone when available
        if (resolvedPhone) createBody.mobile_number = resolvedPhone;
        if (customer_email) createBody.email = customer_email;
        if (address) {
          const parts = address.split(",").map((s: string) => s.trim());
          const street = parts[0] || "";
          const city = parts[1] || "";
          const stateZipMatch = (parts[2] || "").match(/([A-Z]{2})\s*(\d{5})/);
          const state = stateZipMatch?.[1] || (parts[2] || "").trim();
          const zip = stateZipMatch?.[2] || (parts[3] || "").trim();
          createBody.addresses = [{ street, city, state, zip }];
        }

        const custRes = await fetch("https://api.housecallpro.com/customers", {
          method: "POST",
          headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });

        if (custRes.ok) {
          const hcpCust = await custRes.json();
          hcpCustomerId = hcpCust.id;
          results.hcp_customer_created = hcpCustomerId;
        } else {
          const errText = await custRes.text();
          console.error("HCP customer create failed:", custRes.status, errText);
          results.hcp_customer_error = `${custRes.status}: ${errText}`;
        }
      }
    }

    if (!hcpCustomerId) {
      throw new Error("Could not resolve or create HCP customer");
    }

    // ── 2. Resolve HCP address ──
    let addressId: string | null = null;
    if (address) {
      addressId = await resolveHcpAddressId(hcpCustomerId, address, HCP_API_KEY);
    }

    // ── 3. Resolve HCP employee (exact match first, then prefix fallback) ──
    let hcpEmployeeId: string | null = null;
    if (assigned_to) {
      const { data: emp } = await sb.from("employees").select("hcp_employee_id, name").eq("name", assigned_to).maybeSingle();
      if (emp?.hcp_employee_id) {
        hcpEmployeeId = emp.hcp_employee_id;
      } else {
        // Fallback: tolerate first-name-only ("Jonathan" → "Jonathan Carnes")
        const { data: empPrefix } = await sb
          .from("employees")
          .select("hcp_employee_id, name")
          .ilike("name", `${assigned_to}%`)
          .eq("is_active", true)
          .not("hcp_employee_id", "is", null)
          .limit(1);
        if (empPrefix?.[0]?.hcp_employee_id) {
          hcpEmployeeId = empPrefix[0].hcp_employee_id;
          console.log(`Employee prefix-matched "${assigned_to}" → "${empPrefix[0].name}"`);
        } else {
          console.warn(`No HCP employee match for assigned_to="${assigned_to}" — job will be created undispatched`);
        }
      }
    }

    // ── 4. Build arrival window ──
    let startTime = arrival_start || null;
    let endTime = arrival_end || null;
    if (!startTime && scheduled_date) {
      const dateStr = String(scheduled_date).split("T")[0];
      const timeStr = scheduled_time ? String(scheduled_time).padEnd(5, "0") : "09:00";
      // Use Central time offset
      const offsetStr = detectCentralOffset(dateStr);
      startTime = `${dateStr}T${timeStr}:00${offsetStr}`;
      const windowMinutes = job_type === "phone_call" ? 30 : 120;
      const [sh, smin] = timeStr.split(":").map(Number);
      const totalMin = sh * 60 + smin + windowMinutes;
      const eh = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
      const emin = String(totalMin % 60).padStart(2, "0");
      endTime = `${dateStr}T${eh}:${emin}:00${offsetStr}`;
    }

    // ── 5. Create in HCP ──
    if (is_estimate || job_type === "estimate") {
      // Create estimate
      const estBody: any = {
        customer_id: hcpCustomerId,
        options: [{ name: "Option 1" }],
      };
      if (addressId) estBody.address_id = addressId;
      if (description) estBody.note = description;

      if (startTime && endTime && hcpEmployeeId) {
        const s = new Date(startTime);
        const e = new Date(endTime);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && s < e) {
          estBody.schedule = { start_time: startTime, end_time: endTime };
          estBody.assigned_employee_ids = [hcpEmployeeId];
        }
      } else if (hcpEmployeeId) {
        estBody.assigned_employee_ids = [hcpEmployeeId];
      }

      const hcpRes = await fetch("https://api.housecallpro.com/estimates", {
        method: "POST",
        headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(estBody),
      });

      if (!hcpRes.ok) {
        const errText = await hcpRes.text();
        throw new Error(`HCP estimate create failed: ${hcpRes.status} ${errText}`);
      }

      const hcpEst = await hcpRes.json();
      results.hcp_id = hcpEst.id;
      results.hcp_estimate_number = hcpEst.estimate_number || null;
      results.type = "estimate";

      // Fallback: if inline schedule didn't apply, call the explicit schedule endpoint
      if (startTime && endTime && hcpEst.id) {
        const estScheduled = hcpEst.schedule?.scheduled_start;
        if (!estScheduled) {
          const optionId = hcpEst.options?.[0]?.id;
          if (optionId) {
            console.log("Estimate inline schedule not applied, using explicit schedule endpoint");
            const schedRes = await fetch(
              `https://api.housecallpro.com/estimates/${hcpEst.id}/options/${optionId}/schedule`,
              {
                method: "PUT",
                headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ start_time: startTime, end_time: endTime }),
              }
            );
            if (schedRes.ok) {
              results.estimate_scheduled_fallback = true;
            } else {
              console.error("Estimate schedule fallback failed:", await schedRes.text());
            }
          }
        }
      }

    } else {
      // Create job
      const jobBody: any = {
        customer_id: hcpCustomerId,
        description: description || `${job_type || "service"} job`,
      };
      if (addressId) {
        jobBody.address_id = addressId;
        results.hcp_address_id = addressId;
      }

      const hcpRes = await fetch("https://api.housecallpro.com/jobs", {
        method: "POST",
        headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(jobBody),
      });

      if (!hcpRes.ok) {
        const errText = await hcpRes.text();
        throw new Error(`HCP job create failed: ${hcpRes.status} ${errText}`);
      }

      const hcpJob = await hcpRes.json();
      const hcpId = hcpJob.id;
      results.hcp_id = hcpId;
      results.hcp_job_number = hcpJob.invoice_number || hcpJob.job_number || null;
      results.type = "job";

      // Set schedule
      if (startTime && endTime) {
        const schedRes = await fetch(`https://api.housecallpro.com/jobs/${hcpId}/schedule`, {
          method: "PUT",
          headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ start_time: startTime, end_time: endTime }),
        });
        if (!schedRes.ok) {
          console.error("HCP schedule failed:", await schedRes.text());
        } else {
          results.scheduled = true;
        }
      }

      // Dispatch to employee
      if (hcpEmployeeId) {
        const dispRes = await fetch(`https://api.housecallpro.com/jobs/${hcpId}/dispatch`, {
          method: "PUT",
          headers: { "Authorization": `Token ${HCP_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ employee_ids: [hcpEmployeeId] }),
        });
        if (dispRes.ok) results.dispatched = true;
        else console.error("HCP dispatch failed:", await dispRes.text());
      }

      // Push AI-summarized context note
      await pushContextNote(sb, hcpId, HCP_API_KEY, {
        customer_name, customer_phone, description,
      });
    }

    // ── 6. Mark action item as accepted ──
    if (action_item_id) {
      await sb.from("action_items").update({
        status: "accepted",
        resolved_at: new Date().toISOString(),
        resolved_by: created_by || null,
      }).eq("id", action_item_id);
    }

    console.log(`create-hcp-job: Created ${results.type} in HCP:`, results.hcp_id);

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("create-hcp-job error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helpers ──

function detectCentralOffset(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const jan = new Date(d.getFullYear(), 0, 1);
  const jul = new Date(d.getFullYear(), 6, 1);
  // If month is between March and November, assume CDT
  const month = d.getMonth();
  return (month >= 2 && month <= 10) ? "-05:00" : "-06:00";
}

async function resolveHcpAddressId(
  hcpCustomerId: string,
  jobAddress: string,
  hcpApiKey: string,
): Promise<string | null> {
  const parts = jobAddress.split(",").map((s: string) => s.trim());
  const street = parts[0] || "";
  if (!street) return null;

  try {
    const addrRes = await fetch(`https://api.housecallpro.com/customers/${hcpCustomerId}`, {
      headers: { "Authorization": `Token ${hcpApiKey}` },
    });
    if (addrRes.ok) {
      const custData = await addrRes.json();
      const addresses = custData.addresses || [];
      const streetNorm = street.toLowerCase().replace(/\b(st|ave|dr|rd|ln|ct|blvd|way|cir|pl)\b\.?/g, (m: string) => m.replace(".", "")).trim();
      for (const addr of addresses) {
        const existingStreet = (addr.street || addr.address || "").toLowerCase().replace(/\b(st|ave|dr|rd|ln|ct|blvd|way|cir|pl)\b\.?/g, (m: string) => m.replace(".", "")).trim();
        if (existingStreet && streetNorm.includes(existingStreet.split(" ").slice(0, 3).join(" "))) {
          return addr.id;
        }
      }
    }
  } catch (e) {
    console.error("Failed to fetch HCP customer addresses:", e);
  }

  // Add new address
  const city = parts[1] || "";
  const stateZipMatch = (parts[2] || "").match(/([A-Z]{2})\s*(\d{5})/);
  const state = stateZipMatch?.[1] || (parts[2] || "").trim();
  const zip = stateZipMatch?.[2] || (parts[3] || "").trim();

  try {
    const addRes = await fetch(`https://api.housecallpro.com/customers/${hcpCustomerId}/addresses`, {
      method: "POST",
      headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ street, city, state, zip, type: "service" }),
    });
    if (addRes.ok) {
      const newAddr = await addRes.json();
      return newAddr.id;
    }
  } catch (e) {
    console.error("Failed to create HCP address:", e);
  }

  return null;
}

async function pushContextNote(
  sb: any,
  hcpJobId: string,
  hcpApiKey: string,
  meta: { customer_name?: string; customer_phone?: string; description?: string },
) {
  try {
    const rawContext: string[] = [];
    if (meta.description) rawContext.push(`Job Description: ${meta.description}`);

    const phoneDigits = (meta.customer_phone || "").replace(/\D/g, "").slice(-10);
    if (phoneDigits.length === 10) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const e164 = `+1${phoneDigits}`;

      const { data: recentCalls } = await sb
        .from("call_log")
        .select("ai_summary, call_extraction, direction, status, transcription")
        .eq("phone_number", e164)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentCalls?.length) {
        for (const call of recentCalls) {
          if (call.status === "voicemail" && call.transcription) {
            rawContext.push(`Voicemail: ${call.transcription}`);
          }
          if (call.ai_summary) rawContext.push(`Call Summary (${call.direction}): ${call.ai_summary}`);
        }
      }

      const { data: recentSms } = await sb
        .from("sms_log")
        .select("body, direction")
        .eq("phone_number", e164)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(20);

      if (recentSms?.length) {
        const smsLines = recentSms
          .filter((s: any) => s.body?.trim())
          .map((s: any) => `${s.direction === "inbound" ? "Customer" : "Us"}: ${s.body.trim()}`)
          .join("\n");
        if (smsLines) rawContext.push(`SMS Thread:\n${smsLines}`);
      }
    }

    let noteBody = "";
    if (rawContext.length > 1) {
      try {
        const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
        if (OPENAI_API_KEY) {
          const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: "You are writing a concise private job note for an HVAC company. Summarize communications into 3-6 bullet points: what customer needs, equipment/issue details, urgency, scheduling preferences. Brief and actionable. Plain text bullets only." },
                { role: "user", content: `Customer: ${meta.customer_name || "Unknown"}\nPhone: ${meta.customer_phone || "N/A"}\n\n${rawContext.join("\n\n")}` },
              ],
              max_tokens: 300,
              temperature: 0.3,
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            noteBody = aiData.choices?.[0]?.message?.content?.trim() || "";
          }
        }
      } catch (e) {
        console.error("AI summary failed:", e);
      }
      if (!noteBody) noteBody = rawContext.join("\n");
    } else if (rawContext.length === 1) {
      noteBody = rawContext[0];
    }

    if (meta.customer_phone) noteBody = `Customer Phone: ${meta.customer_phone}\n\n${noteBody}`;

    if (noteBody.trim()) {
      await fetch(`https://api.housecallpro.com/jobs/${hcpJobId}/notes`, {
        method: "POST",
        headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: noteBody.trim() }),
      });
    }
  } catch (e) {
    console.error("pushContextNote error:", e);
  }
}
