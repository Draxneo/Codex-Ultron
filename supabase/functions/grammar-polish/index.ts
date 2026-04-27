import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";
import { estimateCostCents } from "../_shared/aiPricing.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, context } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 3) {
      return new Response(JSON.stringify({ polished: text || "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not set, returning original text");
      return new Response(JSON.stringify({ polished: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a professional grammar and spelling corrector for a home services (HVAC) company.
Fix grammar, spelling, punctuation, and capitalization errors in the text below.
Keep the tone, meaning, and length the same — do NOT rewrite or add content.
Industry terms like HVAC, SEER2, HSPF2, AFUE, BTU, tonnage, etc. should be properly capitalized.
Proper nouns and names should keep their capitalization.
If the text is already correct, return it unchanged.
Return ONLY the corrected text — no explanations, quotes, or markdown.`;

    const contextNote = context === "email" 
      ? "\nThis is an email body. Preserve HTML tags if present — only fix the text content." 
      : context === "sms"
      ? "\nThis is an SMS message. Keep it concise."
      : "";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt + contextNote },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return new Response(JSON.stringify({ polished: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const polished = data.choices?.[0]?.message?.content?.trim() || text;
    const inT = data.usage?.prompt_tokens || 0;
    const outT = data.usage?.completion_tokens || 0;
    const tokens = inT + outT;
    const sb = getSupabaseAdmin();
    logApiUsage(sb, {
      service: "openai_ai",
      function_name: "grammar-polish",
      endpoint: "chat/completions",
      tokens_used: tokens,
      input_tokens: inT,
      output_tokens: outT,
      estimated_cost_cents: estimateCostCents({ model: "gpt-5-mini", inputTokens: inT, outputTokens: outT }),
      metadata: { model: "gpt-5-mini" },
    });

    return new Response(JSON.stringify({ polished }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("grammar-polish error:", e);
    return new Response(JSON.stringify({ polished: "" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
