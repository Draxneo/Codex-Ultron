import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/**
 * extract-equipment-photo — AI vision extraction for HVAC field photos.
 *
 * Types (with shorthand aliases):
 *   data_plate           — model + serial from equipment nameplate
 *   supply_ticket         — line items + total from supply house receipt
 *   gauge_reading / gauge — suction/discharge PSI from manifold gauge set
 *   capacitor_reading / capacitor — µF + voltage from capacitor label
 *   filter_assessment / filter — dimensions + condition + MERV from air filter
 *   multimeter_reading / multimeter — value + unit from digital multimeter display
 */

// ─── Extraction configs ───

interface ExtractionConfig {
  systemPrompt: string;
  userText: string;
  toolName: string;
  toolSchema: { name: string; description: string; parameters: Record<string, unknown> };
}

const EXTRACTION_CONFIGS: Record<string, ExtractionConfig> = {
  data_plate: {
    systemPrompt: `You are an HVAC equipment data plate reader. Extract model and serial numbers from equipment nameplates. Look for: "Model", "Mod", "M/N" for model; "Serial", "Ser", "S/N" for serial. Read exact characters including dashes and spaces. HVAC data plates appear on condensers, air handlers, coils, and furnaces.`,
    userText: "Extract model and serial numbers from this HVAC equipment data plate:",
    toolName: "extract_data_plate",
    toolSchema: {
      name: "extract_data_plate",
      description: "Extract model and serial from an HVAC equipment data plate",
      parameters: {
        type: "object",
        properties: {
          model_number: { type: "string", description: "Equipment model number" },
          serial_number: { type: "string", description: "Equipment serial number" },
        },
        additionalProperties: false,
      },
    },
  },

  supply_ticket: {
    systemPrompt: `You are a supply house pickup ticket/receipt reader for an HVAC company. Extract supply house name, total amount, and line items. Common supply houses: Gemaire, Ferguson, Johnstone Supply, Baker Distributing, Wesco, National Refrigerants.`,
    userText: "Extract supply house name, line items, and total from this pickup ticket:",
    toolName: "extract_supply_ticket",
    toolSchema: {
      name: "extract_supply_ticket",
      description: "Extract items and total from a supply house ticket",
      parameters: {
        type: "object",
        properties: {
          supply_house: { type: "string" },
          total: { type: "number" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                part_number: { type: "string" },
                quantity: { type: "number" },
              },
            },
            description: "Line items from the ticket",
          },
        },
        additionalProperties: false,
      },
    },
  },

  gauge_reading: {
    systemPrompt: `You are reading an HVAC refrigerant manifold gauge set or digital manifold. Extract: suction_pressure (low side psig, the blue gauge or low reading), discharge_pressure (high side psig, the red gauge or high reading). Return numbers only, no units.`,
    userText: "Extract refrigerant pressure readings from these manifold gauges:",
    toolName: "extract_gauge_reading",
    toolSchema: {
      name: "extract_gauge_reading",
      description: "Extract manifold gauge pressure readings for HVAC diagnostics",
      parameters: {
        type: "object",
        properties: {
          suction_pressure: { type: "string", description: "Low side pressure in PSI" },
          discharge_pressure: { type: "string", description: "High side pressure in PSI" },
        },
        additionalProperties: false,
      },
    },
  },

  capacitor_reading: {
    systemPrompt: `You are reading an HVAC capacitor label. Extract: capacitance_uf (the µF or MFD rating, may show as dual like 45+5), voltage_vac (the VAC voltage rating). For dual capacitors return the full string like '45+5'.`,
    userText: "Extract capacitance and voltage specifications from this HVAC capacitor label:",
    toolName: "extract_capacitor_reading",
    toolSchema: {
      name: "extract_capacitor_reading",
      description: "Extract capacitance specs from a capacitor label",
      parameters: {
        type: "object",
        properties: {
          capacitance_uf: { type: "string", description: "Capacitance in µF (e.g. 45+5 for dual)" },
          voltage_vac: { type: "string", description: "Voltage rating (e.g. 440)" },
        },
        additionalProperties: false,
      },
    },
  },

  filter_assessment: {
    systemPrompt: `You are looking at an HVAC air filter. Extract: filter_size (the dimensions printed on the frame, e.g. 16x25x1, 20x20x1), condition (your assessment: Clean, Dirty, Very Dirty, or Needs Replacement based on the filter color and debris visible).`,
    userText: "Assess this HVAC air filter and extract its size and condition:",
    toolName: "extract_filter_assessment",
    toolSchema: {
      name: "extract_filter_assessment",
      description: "Extract filter dimensions and condition",
      parameters: {
        type: "object",
        properties: {
          filter_size: { type: "string", description: "Filter dimensions e.g. 16x25x1" },
          condition: { type: "string", description: "One of: Clean, Dirty, Very Dirty, Needs Replacement" },
        },
        additionalProperties: false,
      },
    },
  },

  matchup_table: {
    systemPrompt: `You are an HVAC equipment data extractor. From the provided spec sheet, brochure page, or AHRI certificate screenshot, extract EVERY condenser/coil/furnace matchup combo you can see. For each row determine: brand (Carrier, Trane, Goodman, Lennox, Bosch, Mitsubishi, Daikin, etc.), condenser_model, coil_model (indoor coil/air handler), furnace_model (if present), tonnage (1.5/2/2.5/3/3.5/4/5), seer2, eer2, hspf2 (heat pumps only), afue (gas furnaces only), cooling_cap (BTUh, e.g. 24000/36000/48000/60000), system_type (gas_heat / heat_pump / electric / dual_fuel), application (Multiposition / Vertical / Horizontal — DEFAULT to Multiposition unless the sheet explicitly says vertical-only or horizontal-only), tier (Good / Better / Best — infer from SEER2: <16 = Good, 16-17.9 = Better, ≥18 = Best), ahri_number, heat_kit (e.g. "10kW"). Only include rows you can clearly read. Skip rows with missing condenser_model.`,
    userText: "Extract every HVAC matchup row from this spec sheet / AHRI screenshot / brochure:",
    toolName: "extract_matchups",
    toolSchema: {
      name: "extract_matchups",
      description: "Extract a table of HVAC equipment matchups from a spec sheet, brochure, or AHRI screenshot",
      parameters: {
        type: "object",
        properties: {
          matchups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                brand: { type: "string" },
                condenser_model: { type: "string" },
                coil_model: { type: "string" },
                furnace_model: { type: "string" },
                tonnage: { type: "number" },
                seer2: { type: "number" },
                eer2: { type: "number" },
                hspf2: { type: "number" },
                afue: { type: "number" },
                cooling_cap: { type: "number" },
                system_type: { type: "string", enum: ["gas_heat", "heat_pump", "electric", "dual_fuel"] },
                application: { type: "string", enum: ["Multiposition", "Vertical", "Horizontal"] },
                tier: { type: "string", enum: ["Good", "Better", "Best"] },
                ahri_number: { type: "string" },
                heat_kit: { type: "string" },
              },
              required: ["brand", "condenser_model"],
            },
          },
        },
        required: ["matchups"],
        additionalProperties: false,
      },
    },
  },

  multimeter_reading: {
    systemPrompt: `You are reading a digital multimeter display being used by an HVAC technician. Extract: reading_value (the number shown on the display), reading_unit (the unit shown: V, A, mA, Ω, kΩ, Hz, etc.).`,
    userText: "Read the measurement shown on this multimeter display:",
    toolName: "extract_multimeter_reading",
    toolSchema: {
      name: "extract_multimeter_reading",
      description: "Read a digital multimeter display",
      parameters: {
        type: "object",
        properties: {
          reading_value: { type: "string", description: "The numeric reading on the display" },
          reading_unit: { type: "string", description: "Unit: V, mV, A, mA, Ohm, kOhm, Hz, uF, F, C" },
        },
        additionalProperties: false,
      },
    },
  },
};

// Shorthand aliases
const TYPE_ALIASES: Record<string, string> = {
  gauge: "gauge_reading",
  capacitor: "capacitor_reading",
  multimeter: "multimeter_reading",
  filter: "filter_assessment",
};

// ─── DB column mapping per type ───

function getDbColumns(type: string, extracted: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "data_plate":
      return {
        extracted_model: extracted.model_number || null,
        extracted_serial: extracted.serial_number || null,
        extracted_items: [{ _type: "data_plate", ...extracted }],
      };
    case "supply_ticket":
      return {
        extracted_supply_house: extracted.supply_house || null,
        extracted_total: extracted.total || null,
        extracted_items: (extracted.items as unknown[])?.length > 0
          ? [{ _type: "supply_ticket", ...extracted }]
          : [],
      };
    case "gauge_reading":
      return {
        extracted_suction: extracted.suction_pressure || null,
        extracted_discharge: extracted.discharge_pressure || null,
        extracted_items: [{ _type: "gauge_reading", ...extracted }],
      };
    case "capacitor_reading":
      return {
        extracted_uf: extracted.capacitance_uf || null,
        extracted_vac: extracted.voltage_vac || null,
        extracted_items: [{ _type: "capacitor_reading", ...extracted }],
      };
    case "multimeter_reading":
      return {
        extracted_reading_value: extracted.reading_value || null,
        extracted_reading_unit: extracted.reading_unit || null,
        extracted_items: [{ _type: "multimeter_reading", ...extracted }],
      };
    case "filter_assessment":
      return {
        extracted_filter_size: extracted.filter_size || null,
        extracted_filter_condition: extracted.condition || null,
        extracted_items: [{ _type: "filter_assessment", ...extracted }],
      };
    default:
      return {
        extracted_items: [{ _type: type, ...extracted }],
      };
  }
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    const { photo_id, image_url, type: rawType = "data_plate" } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve alias
    const type = TYPE_ALIASES[rawType] || rawType;
    const config = EXTRACTION_CONFIGS[type];
    if (!config) {
      return new Response(JSON.stringify({ error: `Unknown extraction type: ${rawType}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // matchup_table is a stateless catalog-extraction call — no photo_id, no DB write
    const isStateless = type === "matchup_table";
    if (!isStateless && !photo_id) {
      return new Response(JSON.stringify({ error: "photo_id required for this type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isStateless) {
      await supabase.from("tech_form_photos").update({ extraction_status: "processing" }).eq("id", photo_id);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: await getTaskModel(supabase, "vision_extraction"),
        messages: [
          { role: "system", content: config.systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: config.userText },
              { type: "image_url", image_url: { url: image_url } },
            ],
          },
        ],
        tools: [{ type: "function", function: config.toolSchema }],
        tool_choice: { type: "function", function: { name: config.toolName } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (!isStateless) {
        await supabase.from("tech_form_photos").update({ extraction_status: "error" }).eq("id", photo_id);
      }
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      if (!isStateless) {
        await supabase.from("tech_form_photos").update({ extraction_status: "error" }).eq("id", photo_id);
      }
      throw new Error("No tool call in AI response");
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log(`Extracted ${type}:`, JSON.stringify(extracted));

    // Stateless types (matchup_table) return immediately — no DB write, no reconciliation
    if (isStateless) {
      return new Response(JSON.stringify({ success: true, extracted: { _type: type, ...extracted } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store result
    const dbCols = getDbColumns(type, extracted);
    await supabase.from("tech_form_photos").update({
      extraction_status: "done",
      ...dbCols,
    }).eq("id", photo_id);

    // Equipment reconciliation for data plates
    if (type === "data_plate" && (extracted.model_number || extracted.serial_number)) {
      const { data: photoRecord } = await supabase.from("tech_form_photos").select("tech_form_id").eq("id", photo_id).single();
      if (photoRecord?.tech_form_id) {
        const { data: formRecord } = await supabase.from("tech_forms").select("job_id").eq("id", photoRecord.tech_form_id).single();
        if (formRecord?.job_id) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/reconcile-equipment`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                job_id: formRecord.job_id, source: "data_plate", source_id: photo_id,
                serial_number: extracted.serial_number || null,
                model_number: extracted.model_number || null,
              }),
            });
          } catch (e) { console.error("Reconciliation call failed:", e); }
        }
      }
    }

    // Bridge supply tickets to job_invoices via match-invoice-to-job
    if (type === "supply_ticket") {
      try {
        await fetch(`${supabaseUrl}/functions/v1/match-invoice-to-job`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "photo",
            source_ref_id: photo_id,
            supply_house: extracted.supply_house || null,
            items: extracted.items || [],
            total_cost: extracted.total || null,
          }),
        });
      } catch (e) { console.error("match-invoice-to-job call failed:", e); }
    }

    return new Response(JSON.stringify({ success: true, extracted: { _type: type, ...extracted } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("extract-equipment-photo error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
