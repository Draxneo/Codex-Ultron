/**
 * classify-attachment — Vision classifier for tech-uploaded job attachments.
 *
 * Input: { attachment_id: string, image_url: string }
 *
 * Uses OpenAI/JARVIS with vision + tool calling to categorize
 * the photo into one of: supply_invoice, equipment_data_plate, site_photo,
 * document, other.
 *
 * Side effects when category === 'supply_invoice' (confidence >= 0.7):
 *   1. Updates the attachment row with category + hidden_from_tech_share=true
 *   2. Creates a job_invoices row pointing at the same storage path
 *   3. Invokes extract-invoice to pull line items / totals
 *
 * For all other categories: just stamps category + confidence on the row.
 */

import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = getSupabaseAdmin();

    const { attachment_id, image_url } = await req.json();
    if (!attachment_id || !image_url) {
      return new Response(JSON.stringify({ error: "attachment_id and image_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a vision classifier for an HVAC technician's job-site photo uploads.
Categorize each image into ONE of:
- "supply_invoice": A printed receipt, packing slip, or invoice from an HVAC supply house (Carrier Enterprise, Johnstone, Ferguson, Goodman Distribution, etc.). Has line items, prices, totals, supplier name.
- "equipment_data_plate": A close-up of a manufacturer rating plate showing model number, serial number, voltage, refrigerant type.
- "site_photo": A photo of equipment in place, ductwork, electrical panel, condenser, attic, install location, before/after shots — anything depicting the customer's home or HVAC system.
- "document": A permit, contract, customer-signed form, or other paperwork that is NOT a supply invoice.
- "other": Anything that doesn't fit above (selfies, blurred shots, etc).

Be CONSERVATIVE on supply_invoice — only return it when you are very confident the image shows pricing/cost data we should hide from the customer.`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Classify this photo:" },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_photo",
              description: "Return the photo's category and confidence",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["supply_invoice", "equipment_data_plate", "site_photo", "document", "other"],
                  },
                  confidence: { type: "number", description: "0..1" },
                  reason: { type: "string" },
                },
                required: ["category", "confidence"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_photo" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      if (aiResp.status === 429 || aiResp.status === 402) {
        return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Rate limited" : "AI credits exhausted" }), {
          status: aiResp.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiResp.status}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");
    const args = JSON.parse(toolCall.function.arguments);
    const category: string = args.category;
    const confidence: number = Number(args.confidence) || 0;

    const isSupplyInvoice = category === "supply_invoice" && confidence >= 0.7;

    // Update attachment row
    await supabase
      .from("job_attachments")
      .update({
        category,
        classification_confidence: confidence,
        hidden_from_tech_share: isSupplyInvoice,
      } as any)
      .eq("id", attachment_id);

    // If supply invoice → create job_invoices row + trigger extract-invoice
    if (isSupplyInvoice) {
      const { data: att } = await supabase
        .from("job_attachments")
        .select("job_id, file_path, file_name")
        .eq("id", attachment_id)
        .maybeSingle();

      if (att?.job_id) {
        const { data: invoice } = await supabase
          .from("job_invoices")
          .insert({
            job_id: att.job_id,
            file_path: att.file_path,
            extraction_status: "pending",
            source: "tech_upload",
          } as any)
          .select("id")
          .single();

        if (invoice?.id) {
          // Fire-and-forget extract-invoice
          fetch(`${supabaseUrl}/functions/v1/extract-invoice`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ invoice_id: invoice.id, image_url }),
          }).catch((e) => console.error("extract-invoice trigger failed", e));
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, category, confidence, hidden: isSupplyInvoice }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("classify-attachment error", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
