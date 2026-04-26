import { scrape, interact, stopInteract, getKey } from "../_shared/firecrawl-v2.ts";import { corsHeaders } from "../_shared/cors.ts";



const DEFAULT_URL = "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUrl = body.url || DEFAULT_URL;
    const apiKey = getKey();

    console.log("Scouting warranty portal:", targetUrl);

    // v2 Scrape with screenshot + HTML
    const res = await scrape(targetUrl, {
      formats: ["screenshot", "html", "markdown"],
      waitFor: 5000,
      profile: { name: "warranty-scout", saveChanges: false },
    }, apiKey);

    if (!res.success) {
      return new Response(
        JSON.stringify({ success: false, error: "Scrape failed", details: res.raw }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const screenshot = res.screenshot;
    let fields: Array<Record<string, unknown>> = [];
    let labels: Array<{ forId: string; text: string }> = [];

    // Use interact to dynamically extract form fields via AI prompt
    if (res.scrapeId) {
      try {
        const extraction = await interact(res.scrapeId, {
          prompt: `Analyze this page and list all form fields. For each field return: tag (input/select/textarea), type, name, id, placeholder, label text, whether it's required, and options (for select fields). Return as a JSON array.`,
          timeout: 30,
        }, apiKey);

        if (extraction.success && extraction.output) {
          // Try to parse JSON from the AI output
          const jsonMatch = extraction.output.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            try {
              fields = JSON.parse(jsonMatch[0]);
            } catch {
              console.log("Could not parse AI field extraction, falling back to HTML parsing");
            }
          }
        }

        await stopInteract(res.scrapeId, apiKey);
      } catch (e) {
        console.error("Interact extraction error:", e);
      }
    }

    // Fallback: parse form fields from HTML if interact didn't work
    if (fields.length === 0 && res.html) {
      const html = res.html;
      const inputRegex = /<input\s([^>]*)>/gi;
      let match;
      while ((match = inputRegex.exec(html)) !== null) {
        const attrs = match[1];
        fields.push({
          tag: "input",
          type: extractAttr(attrs, "type") || "text",
          name: extractAttr(attrs, "name"),
          id: extractAttr(attrs, "id"),
          placeholder: extractAttr(attrs, "placeholder"),
          required: /required/i.test(attrs),
          value: extractAttr(attrs, "value"),
          className: extractAttr(attrs, "class"),
        });
      }

      const selectRegex = /<select\s([^>]*)>([\s\S]*?)<\/select>/gi;
      while ((match = selectRegex.exec(html)) !== null) {
        const attrs = match[1];
        const inner = match[2];
        const options: Array<{ value: string; text: string }> = [];
        const optRegex = /<option\s*([^>]*)>(.*?)<\/option>/gi;
        let optMatch;
        while ((optMatch = optRegex.exec(inner)) !== null) {
          options.push({
            value: extractAttr(optMatch[1], "value") || "",
            text: optMatch[2].replace(/<[^>]*>/g, "").trim(),
          });
        }
        fields.push({ tag: "select", name: extractAttr(attrs, "name"), id: extractAttr(attrs, "id"), required: /required/i.test(attrs), className: extractAttr(attrs, "class"), options });
      }

      const textareaRegex = /<textarea\s([^>]*)>/gi;
      while ((match = textareaRegex.exec(html)) !== null) {
        const attrs = match[1];
        fields.push({ tag: "textarea", name: extractAttr(attrs, "name"), id: extractAttr(attrs, "id"), placeholder: extractAttr(attrs, "placeholder"), required: /required/i.test(attrs), className: extractAttr(attrs, "class") });
      }

      // Labels
      const labelRegex = /<label\s([^>]*)>([\s\S]*?)<\/label>/gi;
      while ((match = labelRegex.exec(html)) !== null) {
        const forId = extractAttr(match[1], "for") || "";
        const text = match[2].replace(/<[^>]*>/g, "").trim();
        if (forId || text) labels.push({ forId, text });
      }

      for (const field of fields) {
        if (field.id) {
          const label = labels.find((l) => l.forId === field.id);
          if (label) field.label = label.text;
        }
      }
    }

    const visibleFields = fields.filter(
      (f) => f.type !== "hidden" && f.name !== "__RequestVerificationToken"
    );

    console.log(`Total fields: ${fields.length}, Visible: ${visibleFields.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        screenshot,
        fields: visibleFields,
        allFields: fields,
        labels,
        url: targetUrl,
        htmlLength: res.html.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Scout error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractAttr(attrString: string, attrName: string): string {
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = attrString.match(regex);
  return match ? match[1] : "";
}
