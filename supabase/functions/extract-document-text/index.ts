import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getTaskModel } from "../_shared/getTaskModel.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log", "xml", "html"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function extensionFrom(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function mimeFor(ext: string): string {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "csv") return "text/csv";
  if (ext === "json") return "application/json";
  if (ext === "html") return "text/html";
  return "text/plain";
}

type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
};

function responseText(data: OpenAIResponsePayload): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function extractWithResponsesApi(params: {
  apiKey: string;
  model: string;
  fileName: string;
  fileDataBase64?: string;
  imageDataUrl?: string;
  prompt: string;
}) {
  const content = params.imageDataUrl
    ? [
        { type: "input_text", text: params.prompt },
        { type: "input_image", image_url: params.imageDataUrl, detail: "high" },
      ]
    : [
        {
          type: "input_file",
          filename: params.fileName,
          file_data: params.fileDataBase64,
        },
        { type: "input_text", text: params.prompt },
      ];

  const aiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      input: [{ role: "user", content }],
      max_output_tokens: 6000,
    }),
  });

  if (!aiResp.ok) {
    const detail = await aiResp.text().catch(() => "");
    throw new Error(`OpenAI extraction failed (${aiResp.status}): ${detail.slice(0, 500)}`);
  }

  return responseText(await aiResp.json());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, file_name } = await req.json();
    if (!file_path) throw new Error("file_path is required");

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const sb = getSupabaseAdmin();
    const displayName = file_name || file_path.split("/").pop() || "document";
    const ext = extensionFrom(displayName);

    const { data: fileData, error: dlErr } = await sb.storage
      .from("agent-documents")
      .download(file_path);
    if (dlErr) throw dlErr;

    let rawText = "";

    if (TEXT_EXTENSIONS.has(ext)) {
      rawText = await fileData.text();
    } else {
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      const model = await getTaskModel(sb, "vision_extraction");

      if (ext === "pdf") {
        rawText = await extractWithResponsesApi({
          apiKey: openaiKey,
          model,
          fileName: displayName,
          fileDataBase64: toBase64(bytes),
          prompt:
            "Extract all readable text from this PDF. Preserve headings, lists, tables, phone numbers, prices, and labels. Return only the extracted text.",
        });
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        const imageDataUrl = `data:${mimeFor(ext)};base64,${toBase64(bytes)}`;
        rawText = await extractWithResponsesApi({
          apiKey: openaiKey,
          model,
          fileName: displayName,
          imageDataUrl,
          prompt:
            "Read this image like OCR. Extract all visible text, labels, serial numbers, model numbers, phone numbers, addresses, prices, and notes. Return only the extracted text.",
        });
      } else {
        rawText = `[Document: ${displayName}]\n\nAutomatic extraction is not available yet for .${ext || "unknown"} files. Upload PDF, TXT/CSV/JSON, or image files for automatic extraction.`;
      }
    }

    const content = rawText.trim().substring(0, 10000);
    if (!content) throw new Error("No text could be extracted from this file");

    const { error: insertErr } = await sb.from("copilot_training").insert({
      category: "custom",
      content: `[Document: ${displayName}]\n\n${content}`,
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
