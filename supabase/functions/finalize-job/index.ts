/**
 * finalize-job — Centralized post-creation side effects for ALL job AND estimate creation pathways.
 *
 * After inserting a job or estimate record, call this function to:
 * 1. Format data (Title Case names, standardize address/phone)
 * 2. Create chat channel
 * 3. Auto-stamp line items from templates (jobs only)
 * 4. Legacy HCP push only when explicitly requested
 * 5. Log activity
 *
 * This is the ONE SOURCE OF TRUTH for post-creation logic.
 * Every pathway (UI, HITL, estimate conversion, customer-actions) calls this.
 *
 * Accepts either { job_id } or { estimate_id }.
 * If skip_hcp is false and job_id is provided with job_type === 'estimate', pushes to HCP /estimates.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { formatPhone, formatEmail, formatName } from "../_shared/formatters.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";


// ── Formatting helpers ── (titleCase kept for backward compat, delegates to shared)
const titleCase = formatName;
const fmtPhone = formatPhone;
const fmtEmail = formatEmail;

// ── HCP customer resolution (shared by jobs + estimates) ──

async function resolveHcpCustomerId(
  sb: any,
  record: any,
  hcpApiKey: string,
  results: Record<string, any>,
): Promise<string | null> {
  let hcpCustomerId = record.hcp_customer_id || null;

  // Look up from customers table
  if (!hcpCustomerId && record.customer_id) {
    const { data: cust } = await sb.from("customers").select("hcp_customer_id").eq("id", record.customer_id).single();
    hcpCustomerId = cust?.hcp_customer_id || null;
  }

  // Try phone lookup
  if (!hcpCustomerId && record.customer_phone) {
    const normalized = record.customer_phone.replace(/\D/g, "").slice(-10);
    const { data: phoneCust } = await sb
      .from("customers")
      .select("hcp_customer_id")
      .or(`phone.ilike.%${normalized}%,mobile_phone.ilike.%${normalized}%`)
      .not("hcp_customer_id", "is", null)
      .limit(1);
    if (phoneCust?.[0]?.hcp_customer_id) hcpCustomerId = phoneCust[0].hcp_customer_id;
  }

  // Create HCP customer if none found
  if (!hcpCustomerId && record.customer_name) {
    const nameParts = record.customer_name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const createCustBody: any = { first_name: firstName, last_name: lastName };
    if (record.customer_phone) createCustBody.mobile_number = record.customer_phone;
    if (record.customer_email) createCustBody.email = record.customer_email;
    if (record.address) createCustBody.addresses = [{ street: record.address, type: "service" }];

    const custRes = await fetch("https://api.housecallpro.com/customers", {
      method: "POST",
      headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(createCustBody),
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

  return hcpCustomerId;
}

// ── HCP push for ESTIMATE-type records ──

async function pushEstimateToHcp(
  sb: any,
  record: any,
  recordTable: string,
  recordId: string,
  hcpApiKey: string,
  hcpCustomerId: string,
  results: Record<string, any>,
) {
  // Resolve the correct address on the HCP customer
  const addressId = await resolveHcpAddressId(hcpCustomerId, record.address, hcpApiKey);

  const hcpBody: any = {
    customer_id: hcpCustomerId,
    options: [{ name: "Option 1" }],
  };

  if (addressId) {
    hcpBody.address_id = addressId;
  }

  if (record.description) hcpBody.note = record.description;

  // Resolve employee first — HCP requires assigned pros when schedule is present
  let hcpEmployeeId: string | null = null;
  if (record.assigned_to) {
    const { data: emp } = await sb.from("employees").select("hcp_employee_id").eq("name", record.assigned_to).maybeSingle();
    if (emp?.hcp_employee_id) hcpEmployeeId = emp.hcp_employee_id;
  }

  if (record.scheduled_date) {
    const startTime = record.arrival_start || `${record.scheduled_date}T09:00:00`;
    const endTime = record.arrival_end || `${record.scheduled_date}T11:00:00`;

    // Validate start < end to prevent HCP 400 errors
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate < endDate) {
      // HCP requires assigned_employee_ids when schedule is present
      if (hcpEmployeeId) {
        hcpBody.schedule = { start_time: startTime, end_time: endTime };
        hcpBody.assigned_employee_ids = [hcpEmployeeId];
      } else {
        // Skip schedule — HCP rejects schedules without assigned pros
        console.warn("Skipping HCP schedule: no assigned employee with HCP ID");
      }
    } else {
      console.warn("Skipping HCP schedule: invalid times", { startTime, endTime });
    }
  }

  // Even without a schedule, still attach the assigned pro if available
  if (hcpEmployeeId && !hcpBody.assigned_employee_ids) {
    hcpBody.assigned_employee_ids = [hcpEmployeeId];
  }

  const hcpRes = await fetch("https://api.housecallpro.com/estimates", {
    method: "POST",
    headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(hcpBody),
  });

  if (hcpRes.ok) {
    const hcpEst = await hcpRes.json();
    const hcpId = hcpEst.id;
    const hcpEstNum = hcpEst.estimate_number || null;

    const updateData: any = { hcp_id: hcpId };
    if (recordTable === "estimates") {
      if (hcpEstNum) updateData.estimate_number = hcpEstNum;
      updateData.synced_at = new Date().toISOString();
    }

    await sb.from(recordTable).update(updateData).eq("id", recordId);
    results.hcp_created = hcpId;
    results.hcp_estimate_number = hcpEstNum;
  } else {
    const errText = await hcpRes.text();
    console.error("HCP estimate create failed:", hcpRes.status, errText);
    results.hcp_error = `${hcpRes.status}: ${errText}`;
  }
}

// ── HCP push for JOB-type records ──

async function resolveHcpAddressId(
  hcpCustomerId: string,
  jobAddress: string | null,
  hcpApiKey: string,
): Promise<string | null> {
  if (!jobAddress) return null;

  // Parse the job address into components
  const parts = jobAddress.split(",").map((s: string) => s.trim());
  const street = parts[0] || "";
  if (!street) return null;

  // Fetch existing addresses for this HCP customer
  try {
    const addrRes = await fetch(`https://api.housecallpro.com/customers/${hcpCustomerId}`, {
      headers: { "Authorization": `Token ${hcpApiKey}` },
    });
    if (addrRes.ok) {
      const custData = await addrRes.json();
      const addresses = custData.addresses || [];
      // Check if any existing address matches the street
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

  // No matching address found — add a new one
  const city = parts[1] || "";
  // Parse state and zip from "TX 78228" format
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
      console.log(`Added new HCP address for customer ${hcpCustomerId}: ${street} → ${newAddr.id}`);
      return newAddr.id;
    } else {
      const errText = await addRes.text();
      console.error("HCP address create failed:", addRes.status, errText);
    }
  } catch (e) {
    console.error("Failed to create HCP address:", e);
  }

  return null;
}

async function pushJobToHcp(
  sb: any,
  job: any,
  jobId: string,
  hcpApiKey: string,
  hcpCustomerId: string,
  results: Record<string, any>,
): Promise<{ hcpId?: string; invoiceNumber?: string } | null> {
  // Resolve the correct address on the HCP customer
  const addressId = await resolveHcpAddressId(hcpCustomerId, job.address, hcpApiKey);

  const hcpBody: any = {
    customer_id: hcpCustomerId,
    description: job.description || `${job.job_type || "service"} job`,
  };

  if (addressId) {
    hcpBody.address_id = addressId;
    results.hcp_address_id = addressId;
  }

  const hcpRes = await fetch("https://api.housecallpro.com/jobs", {
    method: "POST",
    headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(hcpBody),
  });

  if (hcpRes.ok) {
    const hcpJob = await hcpRes.json();
    const hcpId = hcpJob.id;
    const invoiceNumber = hcpJob.invoice_number || hcpJob.job_number || hcpJob.number || null;

    // Stamp HCP id AND job number back to local record
    const stampUpdate: any = { hcp_id: hcpId };
    if (invoiceNumber) {
      stampUpdate.hcp_job_number = invoiceNumber;
      stampUpdate.job_number = invoiceNumber;
    }
    await sb.from("jobs").update(stampUpdate).eq("id", jobId);
    results.hcp_created = hcpId;
    results.hcp_job_number = invoiceNumber;

    // Sync schedule
    if (job.arrival_start && job.arrival_end) {
      await fetch(`https://api.housecallpro.com/jobs/${hcpId}/schedule`, {
        method: "PUT",
        headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: job.arrival_start, end_time: job.arrival_end }),
      }).then(r => r.text());
    }

    // Sync dispatch
    if (job.assigned_to) {
      const { data: emp } = await sb.from("employees").select("hcp_employee_id").eq("name", job.assigned_to).maybeSingle();
      if (emp?.hcp_employee_id) {
        await fetch(`https://api.housecallpro.com/jobs/${hcpId}/dispatch`, {
          method: "PUT",
          headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ dispatched_employees: [{ employee_id: emp.hcp_employee_id }] }),
        }).then(r => r.text());
        results.hcp_dispatched = true;
      }
    }

    // Push AI-summarized context note to HCP
    {
      try {
        const rawContext: string[] = [];

        // Job description
        if (job.description) rawContext.push(`Job Description: ${job.description}`);

        // Gather recent communication context (last 24h)
        const phoneDigits = (job.customer_phone || "").replace(/\D/g, "").slice(-10);
        if (phoneDigits.length === 10) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const e164 = `+1${phoneDigits}`;

          // Calls & voicemails
          const { data: recentCalls } = await sb
            .from("call_log")
            .select("ai_summary, call_extraction, direction, status, transcription")
            .eq("phone_number", e164)
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(5);

          if (recentCalls?.length) {
            for (const call of recentCalls) {
              const isVoicemail = call.status === "voicemail" || call.transcription;
              if (isVoicemail && call.transcription) {
                rawContext.push(`Voicemail: ${call.transcription}`);
              }
              if (call.ai_summary) {
                rawContext.push(`Call Summary (${call.direction}): ${call.ai_summary}`);
              }
              const ext = call.call_extraction as Record<string, unknown> | null;
              if (ext) {
                const d: string[] = [];
                if (ext.service_type) d.push(`Service: ${ext.service_type}`);
                if (ext.issue_description) d.push(`Issue: ${ext.issue_description}`);
                if (ext.urgency) d.push(`Urgency: ${ext.urgency}`);
                if (ext.equipment_type) d.push(`Equipment: ${ext.equipment_type}`);
                if (ext.preferred_time) d.push(`Preferred Time: ${ext.preferred_time}`);
                if (d.length) rawContext.push(d.join(", "));
              }
            }
          }

          // SMS thread
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

        // If we have communication context beyond just the description, use AI to summarize
        let noteBody = "";
        if (rawContext.length > 1) {
          // Use AI to condense everything into a concise private note
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
                    {
                      role: "system",
                      content: "You are writing a concise private job note for an HVAC company's field management system. Summarize all the communication context (calls, voicemails, texts) into 3-6 bullet points covering: what the customer needs, any details about equipment/issue, urgency, and scheduling preferences. Be brief and actionable — this is for a technician glancing at notes before arriving. No headers or emojis. Plain text bullets only."
                    },
                    {
                      role: "user",
                      content: `Customer: ${job.customer_name || "Unknown"}\nPhone: ${job.customer_phone || "N/A"}\n\nRecent communications:\n${rawContext.join("\n\n")}`
                    }
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
          } catch (aiErr) {
            console.error("finalize-job: AI summary failed, falling back to raw:", aiErr);
          }

          // Fallback if AI failed
          if (!noteBody) {
            noteBody = rawContext.join("\n");
          }
        } else if (rawContext.length === 1) {
          noteBody = rawContext[0];
        }

        if (job.customer_phone) {
          noteBody = `Customer Phone: ${job.customer_phone}\n\n${noteBody}`;
        }

        if (noteBody.trim()) {
          const noteRes = await fetch(`https://api.housecallpro.com/jobs/${hcpId}/notes`, {
            method: "POST",
            headers: { "Authorization": `Token ${hcpApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: noteBody.trim() }),
          });
          if (noteRes.ok) {
            console.log(`finalize-job: pushed summarized note to HCP job ${hcpId}`);
          } else {
            console.error(`finalize-job: HCP note push failed (${noteRes.status}):`, await noteRes.text());
          }
        }
      } catch (noteErr) {
        console.error("finalize-job: HCP note push error:", noteErr);
      }
    }

    return { hcpId, invoiceNumber: invoiceNumber || undefined };
  } else {
    const errText = await hcpRes.text();
    console.error("HCP job create failed:", hcpRes.status, errText);
    results.hcp_error = `${hcpRes.status}: ${errText}`;
    return null;
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const sb = getSupabaseAdmin();

  try {
    const { job_id, estimate_id, created_by, skip_hcp = true } = await req.json();
    if (!job_id && !estimate_id) throw new Error("job_id or estimate_id required");

    // Determine source table and fetch record
    const isEstimateTable = !!estimate_id && !job_id;
    const tableName = isEstimateTable ? "estimates" : "jobs";
    const recordId = isEstimateTable ? estimate_id : job_id;

    const { data: record, error: recErr } = await sb.from(tableName as any).select("*").eq("id", recordId).single();
    if (recErr || !record) throw new Error(`Record not found in ${tableName}: ${recordId}`);

    const isEstimateType = isEstimateTable || record.job_type === "estimate";
    const results: Record<string, any> = { [isEstimateTable ? "estimate_id" : "job_id"]: recordId };

    // ─── 1. FORMAT DATA ───
    const updates: Record<string, any> = {};
    const fName = titleCase(record.customer_name);
    if (fName && fName !== record.customer_name) updates.customer_name = fName;
    const fPhone = fmtPhone(record.customer_phone);
    if (fPhone && fPhone !== record.customer_phone) updates.customer_phone = fPhone;
    const fEmail = fmtEmail(record.customer_email);
    if (fEmail && fEmail !== record.customer_email) updates.customer_email = fEmail;

    // Hydrate customer_phone from customer record if missing
    if (!record.customer_phone && record.customer_id) {
      const { data: cust } = await sb.from("customers").select("phone, mobile_phone").eq("id", record.customer_id).single();
      if (cust) {
        const phone = fmtPhone(cust.phone || cust.mobile_phone);
        if (phone) updates.customer_phone = phone;
      }
    }

    if (Object.keys(updates).length > 0) {
      await sb.from(tableName as any).update(updates).eq("id", recordId);
      results.formatted = true;
    }

    const custName = updates.customer_name || record.customer_name || "Customer";
    const jobType = record.job_type || "service";

    // ─── 1.5. PUSH TO HCP FIRST (get canonical job/estimate number) ───
    if (!skip_hcp) {
      const hcpApiKey = Deno.env.get("HCP_API_KEY");
      if (hcpApiKey && !record.hcp_id) {
        try {
          const hcpCustomerId = await resolveHcpCustomerId(sb, record, hcpApiKey, results);

          if (hcpCustomerId) {
            if (!record.hcp_customer_id && hcpCustomerId) {
              await sb.from(tableName as any).update({ hcp_customer_id: hcpCustomerId }).eq("id", recordId);
            }

            if (isEstimateType) {
              await pushEstimateToHcp(sb, record, tableName, recordId, hcpApiKey, hcpCustomerId, results);
            } else {
              await pushJobToHcp(sb, record, recordId, hcpApiKey, hcpCustomerId, results);
            }
          } else {
            results.hcp_skipped = "could not resolve hcp_customer_id";
          }
        } catch (e) {
          console.error("HCP sync error:", e);
          results.hcp_error = String(e);
        }
      }
    }

    // Team/customer context now comes from Team HQ, activity_log, action_items,
    // and the shared read models. Do not create new legacy chat_channels here.

    // 3. AUTO-STAMP LINE ITEMS (jobs table only, non-estimate types) ───
    if (!isEstimateTable && !isEstimateType) {
      try {
        const { data: existingItems } = await sb.from("job_line_items").select("id").eq("job_id", recordId).limit(1);
        if (!existingItems || existingItems.length === 0) {
          const { data: templates } = await sb
            .from("line_item_templates" as any)
            .select("*")
            .eq("is_active", true)
            .contains("auto_add_for", [jobType]);

          if (templates && templates.length > 0) {
            let planAnnualPrice: number | undefined;
            if (record.is_service_agreement && record.customer_id) {
              const { data: sa } = await sb
                .from("service_agreements")
                .select("price")
                .eq("customer_id", record.customer_id)
                .eq("status", "active")
                .order("end_date", { ascending: false })
                .limit(1)
                .maybeSingle();
              planAnnualPrice = sa?.price ?? undefined;
            }

            const items = (templates as any[]).map((t: any) => {
              let price = Number(t.base_price);
              const rules = t.rules || {};
              if (record.is_service_agreement) {
                if (typeof rules.plan_member_price === "number") price = rules.plan_member_price;
                else if (typeof rules.plan_pct_of_annual === "number" && planAnnualPrice) {
                  price = planAnnualPrice * (rules.plan_pct_of_annual / 100);
                }
              }
              const qty = rules.qty_default || 1;
              return {
                job_id: recordId,
                name: t.name,
                description: rules.customer_facing_note || t.description || null,
                kind: t.kind,
                quantity: qty,
                unit_price: price,
                total_price: price * qty,
                template_id: t.id,
              };
            });
            if (items.length > 0) {
              await sb.from("job_line_items").insert(items);
              results.line_items_stamped = items.length;
            }
          }
        }
      } catch (e) {
        console.error("Line item auto-stamp error:", e);
      }
    }

    // ─── 5. LOG ACTIVITY ───
    const actionType = isEstimateType ? "estimate_created" : "job_created";
    const logEntry: any = {
      action: actionType,
      performed_by: created_by || "System",
      details: `${isEstimateType ? "Estimate" : jobType + " job"} created for ${custName}${record.scheduled_date ? ` on ${record.scheduled_date}` : ""}`,
    };
    if (!isEstimateTable) logEntry.job_id = recordId;
    await sb.from("activity_log").insert(logEntry);
    results.activity_logged = true;

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("finalize-job error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
