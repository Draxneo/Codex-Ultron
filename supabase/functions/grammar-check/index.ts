import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ corrected: text || "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      // Fallback: just capitalize
      let t = text.trim();
      if (t.length > 0 && /[a-z]/.test(t[0])) t = t[0].toUpperCase() + t.slice(1);
      t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
      return new Response(
        JSON.stringify({ corrected: t }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to fix spelling, grammar, and punctuation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: `You are a spellcheck and grammar correction tool for SMS messages in an HVAC business.
Fix spelling errors, grammar issues, and punctuation. Keep the tone casual/professional (it's SMS).
RULES:
- Return ONLY the corrected text, nothing else
- Do NOT change the meaning or add new content
- Do NOT add greetings or sign-offs
- Keep HVAC acronyms (SEER, BTU, HVAC, etc.) uppercase
- Keep brand names properly capitalized (Goodman, Trane, Carrier, etc.)
- If the text is already correct, return it as-is
- Preserve emojis and special characters`
            },
            { role: "user", content: text }
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!aiResp.ok) {
        // AI failed, fall back to simple capitalization
        console.error("AI grammar check failed:", aiResp.status);
        let t = text.trim();
        if (t.length > 0 && /[a-z]/.test(t[0])) t = t[0].toUpperCase() + t.slice(1);
        t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
        return new Response(
          JSON.stringify({ corrected: t }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await aiResp.json();
      const corrected = result.choices?.[0]?.message?.content?.trim() || text;

      return new Response(
        JSON.stringify({ corrected }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (abortErr) {
      clearTimeout(timeout);
      // Timeout or network error - fall back
      console.error("AI grammar check timeout/error:", abortErr);
      let t = text.trim();
      if (t.length > 0 && /[a-z]/.test(t[0])) t = t[0].toUpperCase() + t.slice(1);
      t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
      return new Response(
        JSON.stringify({ corrected: t }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("grammar-check error:", err);
    return new Response(
      JSON.stringify({ corrected: "" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
