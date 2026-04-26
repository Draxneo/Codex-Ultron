import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    const { invoice_id, image_url } = await req.json();
    if (!invoice_id || !image_url) {
      return new Response(JSON.stringify({ error: "invoice_id and image_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase.from("job_invoices").update({ extraction_status: "processing" }).eq("id", invoice_id);

    const systemPrompt = `You are an HVAC supply house invoice data extractor. Extract the following from the invoice image:

1. model_number - Equipment model number(s). Look for "Model", "Mod #", "Model No" fields.
2. serial_number - Equipment serial number(s). Look for "Serial", "Ser #", "Serial No" fields.
3. invoice_number - The invoice/receipt number
4. invoice_date - The date on the invoice (YYYY-MM-DD format)
5. total_amount - The total amount (just the number, no $ sign)
6. supply_house - The name of the supply house/distributor
7. po_number - The Purchase Order number (PO #, P.O., Customer PO, Job #, Job Number, Reference). CRITICAL — our team writes the JOB NUMBER as the PO on every order. Extract it exactly as printed (typically just digits, no "PO" prefix).
8. items - An array of items purchased. For each item include:
   - name: item description/name
   - part_number: the supply house's part number or item number
   - quantity: how many were purchased

Be precise. If you can't find a field, return null for it. For items, include ALL line items you can identify.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await getTaskModel(supabase, "vision_extraction"),
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all data from this supply house invoice:" },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_invoice_data",
              description: "Extract structured data from a supply house invoice",
              parameters: {
                type: "object",
                properties: {
                  model_number: { type: "string", description: "Equipment model number(s)" },
                  serial_number: { type: "string", description: "Equipment serial number(s)" },
                  invoice_number: { type: "string", description: "Invoice/receipt number" },
                  invoice_date: { type: "string", description: "Invoice date in YYYY-MM-DD format" },
                  total_amount: { type: "number", description: "Total amount on the invoice" },
                  supply_house: { type: "string", description: "Name of the supply house" },
                  po_number: { type: "string", description: "PO number / job number written as PO on the invoice" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Item description" },
                        part_number: { type: "string", description: "Supply house part/item number" },
                        quantity: { type: "number", description: "Quantity purchased" },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_invoice_data" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        await supabase.from("job_invoices").update({ extraction_status: "error", raw_extraction: { error: "Rate limited, try again shortly" } }).eq("id", invoice_id);
        return new Response(JSON.stringify({ error: "Rate limited, please try again in a moment" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await supabase.from("job_invoices").update({ extraction_status: "error", raw_extraction: { error: "AI credits exhausted" } }).eq("id", invoice_id);
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("job_invoices").update({ extraction_status: "error", raw_extraction: { error: errText.substring(0, 500) } }).eq("id", invoice_id);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      await supabase.from("job_invoices").update({ extraction_status: "error", raw_extraction: aiResult }).eq("id", invoice_id);
      throw new Error("No tool call in AI response");
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted invoice data:", JSON.stringify(extracted));

    // Update the invoice record with extracted data
    const updateData: any = {
      extraction_status: "done",
      raw_extraction: extracted,
      extracted_items: extracted.items || [],
    };
    if (extracted.model_number) updateData.model_number = extracted.model_number;
    if (extracted.serial_number) updateData.serial_number = extracted.serial_number;
    if (extracted.invoice_number) updateData.invoice_number = extracted.invoice_number;
    if (extracted.invoice_date) updateData.invoice_date = extracted.invoice_date;
    if (extracted.total_amount != null) updateData.total_amount = extracted.total_amount;

    // Normalize and store PO number (digits only — that's our job-number convention)
    let poDigits: string | null = null;
    if (extracted.po_number) {
      const cleaned = String(extracted.po_number).replace(/[^0-9]/g, "");
      if (cleaned.length >= 3) {
        poDigits = cleaned;
        updateData.po_number = cleaned;
      }
    }

    // Try to match supply house
    if (extracted.supply_house) {
      const { data: houses } = await supabase.from("supply_houses").select("id, name");
      const match = (houses || []).find((h: any) =>
        extracted.supply_house.toLowerCase().includes(h.name.toLowerCase()) ||
        h.name.toLowerCase().includes(extracted.supply_house.toLowerCase())
      );
      if (match) updateData.supply_house_id = match.id;
    }

    // PO → job match (highest-confidence signal: our team uses job # as PO)
    if (poDigits) {
      const { data: poJob } = await supabase
        .from("jobs")
        .select("id, job_number, hcp_job_number")
        .or(`job_number.eq.${poDigits},hcp_job_number.eq.${poDigits}`)
        .maybeSingle();
      if (poJob?.id) {
        updateData.job_id = poJob.id;
        updateData.match_confidence = "high";
        updateData.match_status = "confirmed";
        updateData.match_reason = `PO #${poDigits} matched job ${poJob.job_number || poJob.hcp_job_number}`;
        console.log(`PO match: ${poDigits} → job ${poJob.id}`);
      }
    }

    await supabase.from("job_invoices").update(updateData).eq("id", invoice_id);

    // Trigger reconciliation to populate job_equipment
    const { data: invoiceRecord } = await supabase.from("job_invoices").select("job_id").eq("id", invoice_id).single();
    if (invoiceRecord?.job_id) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/reconcile-equipment`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            job_id: invoiceRecord.job_id,
            source: "invoice",
            source_id: invoice_id,
            serial_number: extracted.serial_number || null,
            model_number: extracted.model_number || null,
          }),
        });
        console.log("Reconciliation triggered for job:", invoiceRecord.job_id);
      } catch (e) {
        console.error("Reconciliation call failed:", e);
      }
    }

    // Auto-add extracted parts to the parts catalog
    if (extracted.items && extracted.items.length > 0) {
      for (const item of extracted.items) {
        if (!item.name) continue;
        // Check if part already exists
        const { data: existing } = await supabase
          .from("parts_catalog")
          .select("id")
          .ilike("name", item.name)
          .limit(1);

        let partId: string;
        if (existing && existing.length > 0) {
          partId = existing[0].id;
        } else {
          const { data: newPart } = await supabase
            .from("parts_catalog")
            .insert({ name: item.name })
            .select("id")
            .single();
          if (!newPart) continue;
          partId = newPart.id;
        }

        // If we matched a supply house and have a part number, save the mapping
        if (updateData.supply_house_id && item.part_number) {
          const { error: mapErr } = await supabase
            .from("part_supply_house_numbers")
            .upsert({
              part_id: partId,
              supply_house_id: updateData.supply_house_id,
              part_number: item.part_number,
            }, { onConflict: "part_id,supply_house_id" });
          if (mapErr) console.error("Part mapping error:", mapErr);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("extract-invoice error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
