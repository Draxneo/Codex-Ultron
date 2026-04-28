import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, customer_id, action } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    if (!customer_id) throw new Error("customer_id required");

    const sb = getSupabaseAdmin();

    // Handle service request action from tool call
    if (action === "create_request") {
      const { request_type, details } = await Promise.resolve({ request_type: messages?.request_type || "service_request", details: messages?.details || "" });
      // This is handled via tool calling below, not directly
    }

    // Load permissions for customer role
    const { data: permRows } = await sb
      .from("copilot_permissions")
      .select("category, allowed")
      .eq("role", "customer");

    const perms: Record<string, boolean> = {};
    if (permRows) {
      for (const p of permRows) perms[p.category] = p.allowed;
    }
    const allowed = (cat: string) => perms[cat] !== false;

    // Load customer info
    const { data: customer } = await sb.from("customers").select("*").eq("id", customer_id).single();
    if (!customer) throw new Error("Customer not found");

    const displayName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer";

    let context = `## Customer: ${displayName}\n`;
    if (customer.address) context += `- Address: ${customer.address}, ${customer.city || ""} ${customer.state || ""} ${customer.zip || ""}\n`;
    if (customer.phone) context += `- Phone: ${customer.phone}\n`;
    if (customer.email) context += `- Email: ${customer.email}\n`;

    // Load jobs
    let allJobs: any[] = [];
    if (allowed("job_details") || allowed("upcoming_appointments") || allowed("invoices") || allowed("payment_balances")) {
      const { data: jobs } = await sb
        .from("jobs")
        .select("job_number, hcp_job_number, job_type, status, scheduled_date, description, customer_invoices(id, total, status, paid_at, stripe_checkout_url)")
        .eq("customer_id", customer_id)
        .order("scheduled_date", { ascending: false })
        .limit(30);
      allJobs = jobs || [];
    }

    // Job history
    if (allowed("job_details") && allJobs.length) {
      context += `\n## Job History (${allJobs.length} jobs)\n`;
      for (const j of allJobs) {
        context += `- Job #${j.job_number || j.hcp_job_number || "N/A"}: ${j.job_type} — ${j.status} (${j.scheduled_date || "unscheduled"})${j.description ? " — " + j.description : ""}\n`;
      }
    }

    // Upcoming appointments
    if (allowed("upcoming_appointments")) {
      const { getCentralToday } = await import("../_shared/formatters.ts");
      const today = getCentralToday();
      const upcoming = allJobs.filter(j => j.scheduled_date && j.scheduled_date >= today && j.status !== "completed" && j.status !== "cancelled");
      if (upcoming.length) {
        context += `\n## Upcoming Appointments\n`;
        for (const j of upcoming) {
          context += `- Job #${j.job_number || j.hcp_job_number}: ${j.job_type} on ${j.scheduled_date} — ${j.status}\n`;
        }
      } else {
        context += `\n## Upcoming Appointments\nNo upcoming appointments scheduled.\n`;
      }
    }

    // Invoices & payment balances
    if (allowed("invoices") || allowed("payment_balances")) {
      const allInvoices = allJobs.flatMap((j: any) =>
        (j.customer_invoices || []).map((inv: any) => ({ ...inv, job_number: j.job_number }))
      );
      
      if (allowed("invoices") && allInvoices.length) {
        context += `\n## Invoices\n`;
        for (const inv of allInvoices) {
          context += `- Job #${inv.job_number}: $${Number(inv.total).toFixed(2)} — ${inv.status}${inv.paid_at ? ` (paid ${inv.paid_at.split("T")[0]})` : ""}${inv.stripe_checkout_url ? " [payment link available]" : ""}\n`;
        }
      }

      if (allowed("payment_balances")) {
        const outstanding = allInvoices.filter((inv: any) => inv.status === "sent" || inv.status === "draft");
        const totalOwed = outstanding.reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
        const paid = allInvoices.filter((inv: any) => inv.status === "paid");
        const totalPaid = paid.reduce((sum: number, inv: any) => sum + Number(inv.total), 0);
        context += `\n## Payment Summary\n`;
        context += `- Total paid: $${totalPaid.toFixed(2)}\n`;
        context += `- Outstanding balance: $${totalOwed.toFixed(2)}\n`;
        if (outstanding.length) {
          context += `- ${outstanding.length} unpaid invoice(s)\n`;
          const withLinks = outstanding.filter((inv: any) => inv.stripe_checkout_url);
          if (withLinks.length) {
            context += `- Payment links available for ${withLinks.length} invoice(s)\n`;
          }
        }
      }
    }

    // Equipment & warranty
    if (allowed("equipment_specs") || allowed("warranty_info")) {
      const { data: equipment } = await sb
        .from("customer_equipment")
        .select("equipment_type, brand, model_number, serial_number, install_date")
        .eq("customer_id", customer_id);

      if (equipment?.length) {
        if (allowed("equipment_specs")) {
          context += `\n## Equipment on File\n`;
          for (const e of equipment) {
            context += `- ${e.equipment_type.replace(/_/g, " ")}: ${e.brand || "?"} ${e.model_number || ""} S/N: ${e.serial_number || "N/A"}${e.install_date ? ` (installed ${e.install_date})` : ""}\n`;
          }
        }

        if (allowed("warranty_info")) {
          context += `\n## Warranty Estimates\n`;
          context += `Note: Standard manufacturer warranties are typically 5 years parts, 10 years compressor from install date. Extended warranties vary.\n`;
          for (const e of equipment) {
            if (e.install_date) {
              const installDate = new Date(e.install_date);
              const now = new Date();
              const ageYears = ((now.getTime() - installDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1);
              const partsExpiry = new Date(installDate);
              partsExpiry.setFullYear(partsExpiry.getFullYear() + 5);
              const compressorExpiry = new Date(installDate);
              compressorExpiry.setFullYear(compressorExpiry.getFullYear() + 10);
              context += `- ${e.equipment_type.replace(/_/g, " ")} (${e.brand || "?"}): ${ageYears} years old\n`;
              context += `  Parts warranty est. expires: ${partsExpiry.toISOString().split("T")[0]} (${partsExpiry > now ? "ACTIVE" : "EXPIRED"})\n`;
              context += `  Compressor warranty est. expires: ${compressorExpiry.toISOString().split("T")[0]} (${compressorExpiry > now ? "ACTIVE" : "EXPIRED"})\n`;
            }
          }
        }
      }
    }

    // Maintenance plans
    if (allowed("maintenance_plans")) {
      const { data: agreements } = await sb
        .from("service_agreements")
        .select("*")
        .eq("customer_id", customer_id)
        .order("end_date", { ascending: false });

      const visitsByAgreement: Record<string, number> = {};
      const hasActivePlan = agreements?.some(a => a.status === "active");

      if (agreements?.length) {
        const activeIds = agreements.filter(a => a.status === "active").map(a => a.id);
        if (activeIds.length) {
          const { data: visits } = await sb
            .from("agreement_visits")
            .select("agreement_id")
            .in("agreement_id", activeIds);
          if (visits) {
            for (const v of visits) {
              visitsByAgreement[v.agreement_id] = (visitsByAgreement[v.agreement_id] || 0) + 1;
            }
          }
        }

        const frequencyToVisits: Record<string, number> = {
          annual: 1, biannual: 2, quarterly: 4, monthly: 12,
        };
        context += `\n## Maintenance Plans\n`;
        for (const a of agreements) {
          const totalVisits = frequencyToVisits[a.frequency] || 2;
          const completedVisits = visitsByAgreement[a.id] || 0;
          const remaining = Math.max(0, totalVisits - completedVisits);
          context += `- ${a.plan_name} (${a.plan_type}) — Status: ${a.status}\n`;
          context += `  Period: ${a.start_date} to ${a.end_date} | Frequency: ${a.frequency}\n`;
          context += `  Visits: ${completedVisits}/${totalVisits} completed, ${remaining} remaining\n`;
          if (a.notes) context += `  Notes: ${a.notes}\n`;
        }
      }

      // Load perk usage for active plans
      if (agreements?.length) {
        const { data: perkUsage } = await sb
          .from("plan_perk_usage")
          .select("perk_type, description, applied_discount, created_at")
          .eq("customer_id", customer_id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (perkUsage?.length) {
          const totalSavings = perkUsage.reduce((sum: number, p: any) => sum + Number(p.applied_discount || 0), 0);
          const tuneUps = perkUsage.filter((p: any) => p.perk_type === "seasonal_tuneup").length;
          const discounts = perkUsage.filter((p: any) => p.perk_type === "discount").length;
          context += `\n## Plan Benefits Used\n`;
          context += `- Total savings from plan: $${totalSavings.toFixed(2)}\n`;
          context += `- Tune-ups completed: ${tuneUps}\n`;
          context += `- Repair discounts applied: ${discounts}\n`;
          context += `- Recent perks:\n`;
          for (const p of perkUsage.slice(0, 10)) {
            context += `  - ${p.description || p.perk_type}: ${p.applied_discount > 0 ? "$" + Number(p.applied_discount).toFixed(2) + " saved" : "used"} (${p.created_at.split("T")[0]})\n`;
          }
        }
      }

      if (!hasActivePlan) {
        // Load available plan templates for upsell
        const { data: planTemplates } = await sb
          .from("maintenance_plan_templates")
          .select("name, tier, plan_type, frequency, price, perks")
          .eq("is_active", true)
          .order("sort_order");

        if (planTemplates?.length) {
          context += `\n## Available Maintenance Plans (for upsell)\n`;
          for (const t of planTemplates) {
            const perks = Array.isArray(t.perks) ? t.perks.map((p: any) => p.name).join(", ") : "";
            context += `- ${t.name} (${t.tier}) — $${Number(t.price).toLocaleString()}/${t.plan_type}, ${t.frequency} visits${perks ? ". Includes: " + perks : ""}\n`;
          }
        }

        context += `\n## No Active Maintenance Plan\nThis customer does NOT currently have an active maintenance plan.\n`;
      }
    }

    // Referral status
    if (allowed("referral_status")) {
      const { data: refCode } = await sb
        .from("referral_codes")
        .select("code, bonus_type")
        .eq("customer_id", customer_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (refCode) {
        const { data: referrals } = await sb
          .from("referrals")
          .select("referred_name, status, bonus_awarded, created_at")
          .eq("referrer_code", refCode.code)
          .order("created_at", { ascending: false });

        context += `\n## Referral Program\n`;
        context += `- Referral code: ${refCode.code}\n`;
        context += `- Bonus type: ${refCode.bonus_type}\n`;
        if (referrals?.length) {
          const awarded = referrals.filter(r => r.bonus_awarded).length;
          context += `- Total referrals: ${referrals.length}, Bonuses earned: ${awarded}\n`;
          for (const r of referrals) {
            context += `  - ${r.referred_name}: ${r.status}${r.bonus_awarded ? " ✅ bonus awarded" : ""}\n`;
          }
        } else {
          context += `- No referrals submitted yet\n`;
        }
      }
    }

    // Load company knowledge
    let knowledgeContext = "";
    if (allowed("company_info")) {
      const { data: training } = await sb
        .from("copilot_training")
        .select("category, content")
        .eq("is_active", true);

      if (training?.length) {
        const customerSafe = training.filter(t => {
          const cat = t.category.toLowerCase();
          return !cat.includes("pricing") && !cat.includes("pay_rate") && !cat.includes("financial") && !cat.includes("internal");
        });
        if (customerSafe.length) {
          knowledgeContext = `\n## Company Info\n${customerSafe.map(t => `### ${t.category}\n${t.content}`).join("\n\n")}\n`;
        }
      }
    }

    // Load office hours from company settings
    const { data: settings } = await sb
      .from("company_settings")
      .select("key, value")
      .in("key", ["office_phone", "office_hours", "office_email", "company_name"]);

    let officeInfo = "\n## Office Contact\n";
    if (settings?.length) {
      for (const s of settings) {
        officeInfo += `- ${s.key.replace(/_/g, " ")}: ${s.value}\n`;
      }
    }
    officeInfo += `- If no office hours listed above, default hours are Monday-Friday 7:00 AM - 5:00 PM\n`;

    // Check for pending requests
    let requestContext = "";
    if (allowed("service_requests")) {
      const { data: requests } = await sb
        .from("portal_requests")
        .select("request_type, details, status, created_at")
        .eq("customer_id", customer_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (requests?.length) {
        requestContext = `\n## Recent Requests\n`;
        for (const r of requests) {
          requestContext += `- ${r.request_type}: ${r.details.substring(0, 100)} — ${r.status} (${r.created_at.split("T")[0]})\n`;
        }
      }
    }

    const hasActivePlan = context.includes("Status: active");
    const companyNameVal = (settings || []).find((s: any) => s.key === "company_name")?.value || "our company";

    const systemPrompt = `You are the customer support assistant for ${companyNameVal}, chatting with ${displayName} through their customer portal.

## Your Voice & Personality
- Be personal, neighborly, and empathetic — like a helpful neighbor who happens to be an HVAC expert
- Use first-person language ("we", "I") — never sound corporate or robotic
- Be straightforward and transparent — no jargon, no high-pressure sales talk
- Keep it warm and conversational, like you're talking to a friend over the fence
- Use simple, clear language — explain technical things in plain English when needed

${context}
${knowledgeContext}
${officeInfo}
${requestContext}

## Capabilities
- Answer questions about their jobs, equipment, invoices, maintenance plans, warranty status, referrals, and upcoming appointments
- For maintenance plans, tell them how many visits they have remaining and what's included
- If they have plan perks/benefits used, share their total savings and remaining benefits proactively when relevant
- When they ask about warranty, use the estimated warranty dates from install_date (5yr parts, 10yr compressor standard — note these are estimates and actual coverage may vary)
- If they ask about payments, mention outstanding balances and let them know they can pay through the portal
- When they ask about referrals, share their code, referral count, and bonuses earned
- If they ask "when is my next appointment", check upcoming appointments section
${!hasActivePlan ? `- If appropriate and natural, mention that we offer maintenance plans with benefits like priority scheduling, discounts on repairs, and regular tune-ups. Share specific plan tiers and pricing from the Available Maintenance Plans section if the customer seems interested. Don't be pushy — just mention it naturally if relevant.` : `- When discussing their plan, proactively mention their savings and benefits used so far. Remind them of remaining benefits they haven't used yet.`}

## Service Requests & Reschedules
- If a customer wants to REQUEST SERVICE, collect what they need (type of problem, urgency, preferred timing) and let them know we'll get back to them to schedule
- If a customer wants to RESCHEDULE an existing appointment, note which job and their preferred new time, and let them know the office will follow up to confirm
- Be clear that you're noting the request and the office team will reach out to confirm — don't promise specific times

## Rules
- NEVER share internal pricing, costs, margins, pay rates, or employee information
- NEVER share other customers' information
- If they have billing questions you can't resolve, suggest they give us a call at the office
- Keep answers concise and friendly
- If they ask about their equipment age, calculate from install_date
- You can explain what different job statuses mean (scheduled, in_progress, completed, etc.)
- Sign off warmly — we treat every customer like family
- For seasonal tips: recommend filter changes every 1-3 months, annual tune-ups before summer/winter, and keeping outdoor units clear of debris`;

    // Build tools for actionable requests
    const tools = [];
    if (allowed("service_requests")) {
      tools.push({
        type: "function",
        function: {
          name: "submit_service_request",
          description: "Submit a service request or reschedule request on behalf of the customer. Use when the customer wants to request new service or reschedule an existing appointment.",
          parameters: {
            type: "object",
            properties: {
              request_type: {
                type: "string",
                enum: ["service_request", "reschedule", "phone_call"],
                description: "Type of request"
              },
              details: {
                type: "string",
                description: "Details about what the customer needs, including any job numbers for reschedules, preferred timing, urgency, etc."
              }
            },
            required: ["request_type", "details"],
            additionalProperties: false
          }
        }
      });
    }

    const aiBody: any = {
      model: await getTaskModel(sb, "portal_chat"),
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    };
    if (tools.length) {
      aiBody.tools = tools;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "We're a bit busy right now. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process the stream - check for tool calls
    const contentType = response.headers.get("content-type") || "";

    // For streaming, we need to intercept tool calls
    // We'll use a TransformStream to handle tool calls mid-stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    (async () => {
      let buffer = "";
      let toolCallBuffer: any = null;
      let toolCallArgs = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);

            if (line.startsWith(":") || line.trim() === "") {
              await writer.write(encoder.encode(line + "\n"));
              continue;
            }
            if (!line.startsWith("data: ")) {
              await writer.write(encoder.encode(line + "\n"));
              continue;
            }

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              // Before finishing, handle any pending tool call
              if (toolCallBuffer) {
                try {
                  const args = JSON.parse(toolCallArgs);
                  // Execute the tool call
                  await sb.from("portal_requests").insert({
                    customer_id,
                    request_type: args.request_type || "service_request",
                    details: args.details || "",
                  });
                  // Send a confirmation message
                  const confirmMsg = `I've noted your ${args.request_type === "reschedule" ? "reschedule request" : "service request"}. Our office team will reach out to you shortly to confirm the details. 👍`;
                  const confirmChunk = JSON.stringify({
                    choices: [{ delta: { content: confirmMsg }, finish_reason: null }]
                  });
                  await writer.write(encoder.encode(`data: ${confirmChunk}\n\n`));
                } catch (toolErr) {
                  console.error("Tool call error:", toolErr);
                }
              }
              await writer.write(encoder.encode("data: [DONE]\n\n"));
              continue;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta;

              // Check for tool calls
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.function?.name) {
                    toolCallBuffer = tc.function.name;
                    toolCallArgs = tc.function.arguments || "";
                  } else if (tc.function?.arguments) {
                    toolCallArgs += tc.function.arguments;
                  }
                }
                continue; // Don't forward tool call chunks
              }

              // Regular content - forward it
              if (delta?.content) {
                await writer.write(encoder.encode(line + "\n"));
              }
            } catch {
              await writer.write(encoder.encode(line + "\n"));
            }
          }
        }
      } catch (e) {
        console.error("Stream processing error:", e);
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("portal-customer-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
