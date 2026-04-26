import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, target_margin = 65, employee_id } = await req.json();
    if (!job_id) throw new Error("job_id is required");

            const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const sb = getSupabaseAdmin();

    // 1. Fetch job info
    const { data: job } = await sb.from("jobs")
      .select("id, hcp_job_number, customer_name, job_type, pay_category, customer_id")
      .eq("id", job_id).single();
    if (!job) throw new Error("Job not found");

    // 2. Fetch tech form diagnosis responses
    const { data: techForms } = await sb.from("tech_forms").select("id").eq("job_id", job_id);
    const techFormId = techForms?.[0]?.id;
    let diagnosisText = "";
    if (techFormId) {
      const { data: responses } = await sb.from("tech_form_responses")
        .select("value, tech_form_fields(label, step_group)")
        .eq("tech_form_id", techFormId);
      const diagItems = (responses || []).filter((r: any) =>
        r.tech_form_fields?.step_group === "diagnosis" && r.value
      );
      diagnosisText = diagItems.map((r: any) => `${r.tech_form_fields?.label}: ${r.value}`).join("\n");
    }

    // 3. Fetch supply house invoice costs
    const { data: jobInvoicesData } = await sb.from("job_invoices")
      .select("total_amount, invoice_number, extracted_items")
      .eq("job_id", job_id);
    const partsCost = (jobInvoicesData || []).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);

    // 4. Fetch job equipment
    const { data: jobEquip } = await sb.from("job_equipment")
      .select("brand, model_number, equipment_type")
      .eq("job_id", job_id);
    const equipmentDesc = (jobEquip || []).map((e: any) =>
      `${e.brand || ""} ${e.model_number || ""} (${e.equipment_type || ""})`
    ).join(", ");

    // 5. Historical outlier detection
    const { data: historyData } = await sb.from("customer_invoices")
      .select("total")
      .eq("status", "paid")
      .limit(200);
    const paidTotals = (historyData || []).map((i: any) => i.total).filter((t: number) => t > 0);
    const avgServiceTotal = paidTotals.length > 0
      ? paidTotals.reduce((a: number, b: number) => a + b, 0) / paidTotals.length
      : 0;

    // 6. Fetch repair catalog for matching
    const { data: catalogItems } = await sb.from("repair_catalog")
      .select("*")
      .eq("is_active", true);
    const catalog = catalogItems || [];

    // 7. AI-powered catalog-first quote generation
    const quoteModel = await getTaskModel(sb, "repair_quote");

    const catalogSection = catalog.length > 0
      ? `\nPRE-APPROVED REPAIR CATALOG (use these descriptions AND prices when matched):\n${catalog.map((c: any, i: number) =>
          `[${i}] "${c.name}" | $${Number(c.base_price ?? 0).toFixed(0)} | parts $${Number(c.parts_cost ?? 0).toFixed(0)} | keywords: ${(c.keywords || []).join(", ")} | severity: ${c.default_severity} | labor_hours: ${c.default_labor_hours}`
        ).join("\n")}\n`
      : "";

    const quotePrompt = `You are an HVAC service pricing expert. Given the following diagnosis and costs, generate a structured JSON repair quote targeting ${target_margin}% gross margin.

DIAGNOSIS:
${diagnosisText || "No specific diagnosis fields captured."}

EQUIPMENT: ${equipmentDesc || "Unknown"}
PARTS COST FROM SUPPLY HOUSE: $${partsCost.toFixed(2)}
${catalogSection}
Generate a JSON object with this structure:
{"items": [{"catalog_index": number_or_null, "description": "tech-facing", "customer_description": "close-oriented", "importance": "string", "consequences": "string", "severity": "necessary|recommended|deluxe", "parts_cost": number, "labor_cost": number, "suggested_price": number}]}

Rules:
- FIRST try to match diagnosis findings to catalog entries above by keywords/name. If matched, set "catalog_index" to the catalog entry index number — the system will use that catalog entry's base_price as the suggested price (do NOT back-calculate from margin for matched items).
- For matched items: descriptions, severity, labor_hours, AND price will be pulled from the catalog automatically — your suggested_price will be overridden.
- For UNmatched items (unusual repairs not in catalog): set "catalog_index" to null and follow the description rules below.
- Distribute the $${partsCost.toFixed(2)} parts cost across necessary items
- Labor cost should reflect skilled HVAC work ($85-150/hr) × labor_hours from catalog (or 1-2 hours if no catalog match)
- For UNmatched items only: suggested_price = (parts_cost + labor_cost) / (1 - ${target_margin}/100) to achieve ${target_margin}% margin
- Include 2-4 necessary items, 1-2 recommended, 1-2 deluxe upgrades

DESCRIPTION RULES (for unmatched items only):
- "description" is TECH-FACING ONLY: Include exact part names, specs, measurements, model numbers.
- "customer_description" is CUSTOMER-FACING: Describe the SERVICE being performed, NEVER the specific PART. No part numbers, brand names, or specs the customer could Google.
- "importance": One sentence explaining why this matters to a homeowner.
- "consequences": What happens if they skip it.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: quoteModel,
        messages: [{ role: "user", content: quotePrompt }],
        tools: [{
          type: "function",
          function: {
            name: "return_quote",
            description: "Return the structured repair quote",
            parameters: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      catalog_index: { type: ["number", "null"], description: "Index of matched catalog entry, or null" },
                      description: { type: "string" },
                      customer_description: { type: "string" },
                      importance: { type: "string" },
                      consequences: { type: "string" },
                      severity: { type: "string", enum: ["necessary", "recommended", "deluxe"] },
                      parts_cost: { type: "number" },
                      labor_cost: { type: "number" },
                      suggested_price: { type: "number" },
                    },
                    required: ["catalog_index", "description", "customer_description", "importance", "consequences", "severity", "parts_cost", "labor_cost", "suggested_price"],
                  },
                },
              },
              required: ["items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_quote" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI quoting failed: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const quoteData = toolCall ? JSON.parse(toolCall.function.arguments) : { items: [] };

    // 8. Insert items — overlay catalog descriptions AND prices for matched items
    const insertedItems: any[] = [];
    for (const item of quoteData.items) {
      const catalogMatch = (item.catalog_index != null && catalog[item.catalog_index]) ? catalog[item.catalog_index] : null;

      // For catalog-matched items, anchor price to catalog.base_price (single source of truth)
      const anchoredPrice = catalogMatch && Number((catalogMatch as any).base_price ?? 0) > 0
        ? Number((catalogMatch as any).base_price)
        : item.suggested_price;
      const anchoredPartsCost = catalogMatch && Number((catalogMatch as any).parts_cost ?? 0) > 0
        ? Number((catalogMatch as any).parts_cost)
        : item.parts_cost;

      const row: any = {
        job_id,
        description: catalogMatch ? (catalogMatch as any).tech_description : item.description,
        customer_description: catalogMatch ? (catalogMatch as any).customer_description : item.customer_description,
        importance: catalogMatch ? (catalogMatch as any).importance : item.importance,
        consequences: catalogMatch ? (catalogMatch as any).consequences : item.consequences,
        severity: catalogMatch ? (catalogMatch as any).default_severity : item.severity,
        parts_cost: anchoredPartsCost,
        labor_cost: item.labor_cost,
        suggested_price: anchoredPrice,
        final_price: anchoredPrice,
        pay_category: "service",
        source: catalogMatch ? "catalog_matched" : "ai_suggested",
        catalog_item_id: catalogMatch ? (catalogMatch as any).id : null,
      };

      const { data: inserted } = await sb.from("service_repair_items").insert(row).select().single();
      if (inserted) insertedItems.push(inserted);
    }

    // 9. Update job workflow
    const isDiagOnly = insertedItems.length === 0;
    await sb.from("jobs").update({
      pay_category: isDiagOnly ? "diagnostic" : "service",
      quote_generated_at: new Date().toISOString(),
    }).eq("id", job_id);

    await sb.from("activity_log").insert({
      action: "repair_quote_generated",
      job_id,
      details: `AI generated ${insertedItems.length} repair items (${insertedItems.filter((i: any) => i.source === "catalog_matched").length} from catalog) targeting ${target_margin}% margin — $${insertedItems.reduce((s: number, i: any) => s + (i.final_price || 0), 0).toFixed(0)} total`,
      performed_by: employee_id || "repair-quote-agent",
    });

    // 10. Calculate totals + outlier flag
    const totalPrice = insertedItems.reduce((s: number, i: any) => s + (i.final_price || 0), 0);
    const totalPartsCost = insertedItems.reduce((s: number, i: any) => s + (i.parts_cost || 0), 0);
    const totalLaborCost = insertedItems.reduce((s: number, i: any) => s + (i.labor_cost || 0), 0);
    const profit = totalPrice - totalPartsCost - totalLaborCost;
    const margin = totalPrice > 0 ? (profit / totalPrice) * 100 : 0;
    const needsReview = avgServiceTotal > 0 && totalPrice > avgServiceTotal * 1.5;

    const result = {
      status: "success",
      job_number: job.hcp_job_number,
      customer: job.customer_name,
      items_created: insertedItems.length,
      catalog_matched: insertedItems.filter((i: any) => i.source === "catalog_matched").length,
      ai_generated: insertedItems.filter((i: any) => i.source === "ai_suggested").length,
      supply_house_parts_cost: partsCost,
      total_suggested_price: totalPrice,
      projected_profit: profit,
      projected_margin: Math.round(margin * 10) / 10,
      needs_review: needsReview,
      avg_historical_total: Math.round(avgServiceTotal),
      items: insertedItems.map((i: any) => ({
        description: i.description,
        severity: i.severity,
        price: i.final_price,
        source: i.source,
      })),
      message: `Generated ${insertedItems.length} repair items for ${job.customer_name} — total $${totalPrice.toFixed(0)} at ${margin.toFixed(0)}% margin.${needsReview ? " ⚠️ FLAGGED: Quote exceeds 1.5x historical average ($" + Math.round(avgServiceTotal) + ") — review recommended." : ""}`,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("repair-quote-agent error:", e);
    return new Response(JSON.stringify({ status: "error", error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
