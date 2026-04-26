import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, job_id, employee_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sb = getSupabaseAdmin();

    // Look up employee role and permissions
    let employeeRole = "tech"; // default to most restrictive
    const allowedCategories = new Set<string>();

    if (employee_id) {
      const { data: emp } = await sb.from("employees").select("role").eq("id", employee_id).single();
      if (emp?.role) employeeRole = emp.role;
    }

    // Fetch permissions for this role
    const { data: perms } = await sb
      .from("copilot_permissions")
      .select("category, allowed")
      .eq("role", employeeRole);

    if (perms) {
      for (const p of perms) {
        if (p.allowed) allowedCategories.add(p.category);
      }
    } else {
      // Fallback: allow non-financial by default
      allowedCategories.add("job_details");
      allowedCategories.add("equipment_specs");
      allowedCategories.add("customer_contact");
      allowedCategories.add("company_procedures");
    }

    const canSeePricing = allowedCategories.has("pricing");
    const canSeeFinancial = allowedCategories.has("financial_data");

    // Build job-specific context
    let jobContext = "";
    if (job_id) {
      const { data: job } = await sb.from("jobs").select("*").eq("id", job_id).single();
      if (job) {
        jobContext += `\n## Current Job\n- Job #${job.hcp_job_number || "N/A"}\n- Customer: ${job.customer_name}\n- Type: ${job.job_type}\n- Address: ${job.address || "N/A"}\n- Scheduled: ${job.scheduled_date || "N/A"}\n- System: ${job.system_type || "N/A"}\n- Brand: ${job.brand || "N/A"}\n- Tonnage: ${job.tonnage || "N/A"}\n- AHRI: ${job.ahri_number || "N/A"}\n- Description: ${job.description || "N/A"}\n`;

        // Include phone only if allowed
        if (allowedCategories.has("customer_contact")) {
          jobContext += `- Phone: ${job.customer_phone || "N/A"}\n- Email: ${job.customer_email || "N/A"}\n`;
        }

        // Legacy job_tasks context removed — workflow engine handles progression

        // Equipment data
        const { data: equipment } = await sb.from("job_equipment").select("*").eq("job_id", job_id);
        if (equipment?.length) {
          jobContext += `\n## Extracted Equipment\n${equipment.map((e: any) => `- ${e.brand || "?"} ${e.model_number || "?"} S/N: ${e.serial_number || "?"} (${e.source}, ${e.confidence})`).join("\n")}\n`;
        }

        // Equipment matchups - only include pricing if allowed
        if (job.tonnage || job.brand || job.system_type) {
          const selectCols = canSeePricing
            ? "brand, condenser_model, coil_model, furnace_model, tonnage, seer2, ahri_number, tier, system_type, total_price"
            : "brand, condenser_model, coil_model, furnace_model, tonnage, seer2, ahri_number, tier, system_type";
          let query = sb.from("equipment_matchups").select(selectCols);
          if (job.tonnage) query = query.eq("tonnage", job.tonnage);
          if (job.system_type) query = query.eq("system_type", job.system_type);
          const { data: matchups } = await query.limit(10);
          if (matchups?.length) {
            jobContext += `\n## Available Equipment Matchups\n${matchups.map((m: any) => {
              let line = `- ${m.brand} ${m.condenser_model} / ${m.coil_model || "N/A"} | ${m.tonnage}T SEER2:${m.seer2 || "?"} ${m.tier || ""}`;
              if (canSeePricing) line += ` $${m.total_price || "?"}`;
              return line;
            }).join("\n")}\n`;
          }
        }
      }
    }

    // Company knowledge
    const { data: training } = await sb.from("copilot_training").select("category, content").eq("is_active", true);
    let knowledgeContext = "";
    if (training?.length) {
      // Filter training by category if it maps to a restricted permission
      const financialCategories = ["pricing", "pay_rates", "financial"];
      const filtered = training.filter((t: any) => {
        const catLower = t.category.toLowerCase();
        if (financialCategories.some(fc => catLower.includes(fc)) && !canSeeFinancial) return false;
        return true;
      });
      if (filtered.length) {
        knowledgeContext = `\n## Company Knowledge\n${filtered.map((t: any) => `### ${t.category}\n${t.content}`).join("\n\n")}\n`;
      }
    }

    // Build restriction instructions
    let restrictionInstructions = "";
    if (!canSeePricing) {
      restrictionInstructions += "\n- NEVER share equipment pricing, costs, or dollar amounts. If asked, say you don't have access to pricing information and suggest they contact the office.";
    }
    if (!canSeeFinancial) {
      restrictionInstructions += "\n- NEVER share pay rates, profit margins, invoice totals, or any financial data. If asked, say that information is restricted.";
    }
    if (!allowedCategories.has("customer_contact")) {
      restrictionInstructions += "\n- NEVER share customer phone numbers or email addresses. If asked, say you don't have access to contact information.";
    }

    const systemPrompt = `You are a helpful HVAC field assistant. You're embedded in a technician's job completion form. Answer questions about the current job, equipment specs, company procedures, part numbers, and troubleshooting. Keep answers concise and mobile-friendly — techs are reading on their phone.

${jobContext}
${knowledgeContext}

Guidelines:
- Be brief and direct — techs are in the field
- If asked about equipment specs, reference the job data and matchups above
- If asked about procedures, reference company knowledge
- For model/serial questions, reference extracted equipment data
- Always be helpful and practical${restrictionInstructions}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await getTaskModel(sb, "tech_form"),
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("tech-form-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
