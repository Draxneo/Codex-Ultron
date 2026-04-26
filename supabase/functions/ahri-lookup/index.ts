import { scrape, getKey } from "../_shared/firecrawl-v2.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function extractField(html: string, labelRegex: string, isRawRegex = false): string {
  const pattern = isRawRegex
    ? labelRegex
    : labelRegex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<td[^>]*font-700[^>]*>[\\s\\S]*?${pattern}[\\s\\S]*?</td>\\s*<td[^>]*>([^<]*)</td>`,
    "i"
  );
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : "";
}

function parseNumber(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ahri_number, system_type } = await req.json();

    if (!ahri_number) {
      return new Response(
        JSON.stringify({ success: false, error: "AHRI number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = getKey();

    // system_type: "heat_pump" -> /99/, everything else -> /101/
    const programCode = system_type === "heat_pump" ? "99" : "101";
    const url = `https://www.ahridirectory.org/details/${programCode}/${ahri_number}`;

    console.log("Fetching AHRI via Firecrawl v2:", url);

    // Use Firecrawl v2 to scrape the JS-rendered page
    const fcResult = await scrape(url, {
      formats: ["html"],
      waitFor: 3000,
    }, apiKey);

    if (!fcResult.success) {
      console.error("Firecrawl error:", fcResult.raw);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch AHRI page" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = fcResult.html || "";

    // Check if the page actually has data
    if (!html.includes("MODEL DETAILS") && !html.includes("AHRI Reference")) {
      console.error("No AHRI data in scraped HTML, length:", html.length);
      return new Response(
        JSON.stringify({ success: false, error: "No AHRI data found for this number" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse all fields
    const seerIdx = html.indexOf("SEER2");
    if (seerIdx >= 0) {
      console.log("HTML around SEER2:", html.substring(seerIdx - 100, seerIdx + 200));
    } else {
      console.log("SEER2 not found in HTML at all");
    }
    
    const coolIdx = html.indexOf("Cooling Capacity");
    if (coolIdx >= 0) {
      console.log("HTML around Cooling Capacity:", html.substring(coolIdx - 50, coolIdx + 250));
    }

    const parsed = {
      ahri_number: String(ahri_number),
      program_type: programCode,
      outdoor_brand: extractField(html, "Outdoor Unit Brand Name"),
      outdoor_series: extractField(html, "Outdoor Unit Series Name"),
      outdoor_model: extractField(html, "Outdoor Unit Model Number"),
      indoor_brand: extractField(html, "Indoor Unit Brand Name"),
      indoor_model: extractField(html, "Indoor Unit Model Number"),
      furnace_model: extractField(html, "Furnace Model Number"),
      cooling_cap_btuh: parseNumber(extractField(html, "Cooling Capacity.*?btuh.*?Appendix M1", true)),
      seer2: parseNumber(extractField(html, "SEER2\\s*\\(Appendix M1\\)", true)),
      eer2: parseNumber(extractField(html, "EER2\\s*\\(95F\\)\\s*\\(Appendix M1\\)", true)),
      hspf2: parseNumber(extractField(html, "HSPF2.*?Appendix M1", true)),
      model_status: extractField(html, "Model Status"),
      refrigerant: extractField(html, "Refrigerant Type"),
      energy_star: extractField(html, "ENERGY STAR").toLowerCase().includes("yes"),
    };

    console.log("Parsed AHRI data:", JSON.stringify(parsed, null, 2));

    // Save to database
            const supabase = getSupabaseAdmin();

    // Try to capture AHRI certificate screenshot via Firecrawl v2
    let certificatePath: string | null = null;
    try {
      const certPageUrl = `https://www.ahridirectory.org/details/${programCode}/${ahri_number}`;
      console.log("Taking screenshot of AHRI page:", certPageUrl);
      
      const certResult = await scrape(certPageUrl, {
        formats: ["screenshot"],
        waitFor: 3000,
      }, apiKey);
      
      const screenshotVal = certResult.screenshot;
      if (certResult.success && screenshotVal) {
        console.log("Screenshot type:", typeof screenshotVal, "starts with:", String(screenshotVal).substring(0, 80));
        
        let bytes: Uint8Array;
        if (screenshotVal.startsWith("http")) {
          const imgResp = await fetch(screenshotVal);
          const imgBuf = await imgResp.arrayBuffer();
          bytes = new Uint8Array(imgBuf);
        } else {
          const clean = screenshotVal
            .replace(/^data:image\/[^;]+;base64,/, "")
            .replace(/[\r\n\s]/g, "");
          const binLen = clean.length * 3 / 4 - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0);
          bytes = new Uint8Array(binLen);
          let offset = 0;
          const chunkSize = 8192;
          for (let i = 0; i < clean.length; i += chunkSize) {
            const chunk = clean.slice(i, i + chunkSize);
            const decoded = globalThis.atob(chunk);
            for (let j = 0; j < decoded.length; j++) {
              bytes[offset++] = decoded.charCodeAt(j);
            }
          }
        }
        
        const filePath = `${ahri_number}/${ahri_number}_certificate.png`;
        const { error: uploadError } = await supabase.storage
          .from("ahri-certificates")
          .upload(filePath, bytes, {
            contentType: "image/png",
            upsert: true,
          });
        if (uploadError) {
          console.error("Certificate upload error:", uploadError);
        } else {
          certificatePath = filePath;
          console.log("Certificate screenshot saved to:", filePath);
        }
      } else {
        console.log("Certificate screenshot not available");
      }
    } catch (certErr) {
      console.error("Certificate download error:", certErr);
    }

    const { data, error } = await supabase
      .from("ahri_lookups")
      .insert({
        ahri_number: parsed.ahri_number,
        program_type: parsed.program_type,
        raw_html: html,
        outdoor_brand: parsed.outdoor_brand || null,
        outdoor_series: parsed.outdoor_series || null,
        outdoor_model: parsed.outdoor_model || null,
        indoor_brand: parsed.indoor_brand || null,
        indoor_model: parsed.indoor_model || null,
        furnace_model: parsed.furnace_model || null,
        cooling_cap_btuh: parsed.cooling_cap_btuh,
        seer2: parsed.seer2,
        eer2: parsed.eer2,
        hspf2: parsed.hspf2,
        model_status: parsed.model_status || null,
        refrigerant: parsed.refrigerant || null,
        energy_star: parsed.energy_star,
        raw_json: parsed,
        certificate_path: certificatePath,
      })
      .select()
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save lookup: " + error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AHRI lookup saved:", data.id);

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AHRI lookup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});