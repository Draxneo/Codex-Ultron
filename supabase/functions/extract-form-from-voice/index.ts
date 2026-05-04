import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcript, ocr_results, job_context, fields } = await req.json();

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return new Response(JSON.stringify({ error: "No fields provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // Get model from config
    const sb = getSupabaseAdmin();

    let model = "gpt-5-mini";
    try {
      const { data } = await sb
        .from("ai_model_config")
        .select("model")
        .eq("task_key", "tech_form")
        .maybeSingle();
      if (data?.model) model = data.model;
    } catch { /* use default */ }

    // Build field descriptions for the AI
    const fieldDescriptions = fields.map((f: any) => {
      let desc = `- "${f.label}" (id: ${f.id}, type: ${f.field_type})`;
      if (f.options && f.options.length > 0) desc += ` options: [${f.options.join(", ")}]`;
      if (f.is_required) desc += " [REQUIRED]";
      return desc;
    }).join("\n");

    const systemPrompt = `You are JARVIS, an AI assistant for HVAC technicians. You extract structured form data from voice notes and photo OCR results.

Given a tech's voice description of a job and any OCR-extracted data from equipment photos, map the information to specific form fields.

Available form fields:
${fieldDescriptions}

Job context:
- Job type: ${job_context?.job_type || "unknown"}
- System type: ${job_context?.system_type || "unknown"}
- Brand: ${job_context?.brand || "unknown"}
- Description: ${job_context?.description || "none"}

FORMATTING (HARD RULE — NO EXCEPTIONS):
- Business is in San Antonio, Texas. Time zone is America/Chicago (Central Time, observes daylight saving).
- All dates in form entries MUST be in US format: "Tuesday, May 5, 2026" or "5/5/2026" — never DD/MM, never ISO 8601 in human-facing text.
- All times MUST be 12-hour with AM/PM and Central Time, e.g. "2:30 PM" or "2:30 PM CT". If the source data is in UTC or another zone, convert to Central before writing it. Never output "17:00" or "17:00 UTC".
- Date+time together: "Tuesday, May 5, 2026 at 2:30 PM" or "5/5/2026 at 2:30 PM CT".
- Today's date and "now" are always relative to America/Chicago, not UTC.

Rules:
1. Only populate fields where you have clear information from the transcript or OCR
2. For select/dropdown fields, use exact option values from the options list
3. For checkbox fields, use "true" or "false"
4. Be concise but accurate in text fields
5. If the tech mentions a diagnosis, put it in the diagnosis/findings field
6. If the tech mentions recommendations, put them in the recommendation field
7. For readings (pressures, temperatures, capacitance), extract exact numbers
8. Don't make up data — only extract what was explicitly mentioned`;

    const userContent = [];
    if (transcript) {
      userContent.push(`Tech's voice note:\n"${transcript}"`);
    }
    if (ocr_results && Object.keys(ocr_results).length > 0) {
      userContent.push(`\nOCR data from photos:\n${JSON.stringify(ocr_results, null, 2)}`);
    }

    // Use tool calling for structured output
    const toolDef = {
      type: "function",
      function: {
        name: "submit_form_data",
        description: "Submit the extracted form field values",
        parameters: {
          type: "object",
          properties: {
            fields: {
              type: "object",
              description: "Map of field_id to extracted value string",
              additionalProperties: { type: "string" },
            },
          },
          required: ["fields"],
          additionalProperties: false,
        },
      },
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent.join("\n") },
        ],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "submit_form_data" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", status, errText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ fields: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ fields: extracted.fields || {} }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-form-from-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
