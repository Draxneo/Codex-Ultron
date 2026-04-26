import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, file_name } = await req.json();
    if (!file_path) throw new Error("file_path is required");

            const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = getSupabaseAdmin();

    // Download the file
    const { data: fileData, error: dlErr } = await sb.storage.from("agent-documents").download(file_path);
    if (dlErr) throw dlErr;

    const ext = (file_name || file_path).split(".").pop()?.toLowerCase();
    let rawText = "";

    if (ext === "txt") {
      rawText = await fileData.text();
    } else {
      // For PDF/DOCX, convert to base64 and use AI to extract text
      const arrayBuf = await fileData.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      
      // Use AI to summarize/extract (send as description since binary)
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: await getTaskModel(sb, "vision_extraction"),
          messages: [
            {
              role: "system",
              content: "You are a document text extractor. Extract and return ALL text content from the document. Preserve structure, headings, and formatting. Return only the extracted text, no commentary.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Extract all text from this ${ext?.toUpperCase()} document named "${file_name}":` },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/${ext === "pdf" ? "pdf" : "vnd.openxmlformats-officedocument.wordprocessingml.document"};base64,${base64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!aiResp.ok) {
        // Fallback: just store the filename as a reference
        rawText = `[Document: ${file_name}] — Automatic text extraction failed. Please add content manually.`;
      } else {
        const aiData = await aiResp.json();
        rawText = aiData.choices?.[0]?.message?.content || `[Document: ${file_name}]`;
      }
    }

    // Truncate to reasonable size
    const content = rawText.substring(0, 10000);

    // Store in copilot_training as a document entry
    const { error: insertErr } = await sb.from("copilot_training").insert({
      category: "custom",
      content: `[Document: ${file_name}]\n\n${content}`,
      is_active: true,
    });
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ success: true, chars: content.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-document-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
