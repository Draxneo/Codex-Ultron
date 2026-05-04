import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



/**
 * generate-embeddings: Chunks and embeds content from various sources into
 * the knowledge_chunks table for RAG-powered JARVIS responses.
 *
 * Supports: copilot_training, agent_instructions, call_log, sms_log, or "all"
 * Modes: "full" (default) — re-embeds everything; "incremental" — only new/updated records
 */

const CHUNK_SIZE = 1500; // chars (~375 tokens)
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 20; // embeddings per API call
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  if (!text || text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

async function embedTexts(texts: string[], _openaiKey: string): Promise<number[][]> {
  // OpenAI/JARVIS gateway does NOT support embedding models — use OpenAI directly
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new Error("OPENAI_API_KEY not configured for embeddings");
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Embedding API error ${resp.status}: ${errText}`);
  }
  const data = await resp.json();
  return (data.data || []).map((d: any) => d.embedding);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { source = "all", mode = "full" } = await req.json().catch(() => ({}));

            const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not configured");

    const sb = getSupabaseAdmin();

    const sources = source === "all"
      ? ["copilot_training", "agent_instructions", "call_log", "sms_log"]
      : [source];

    // For incremental mode, find the latest embedded_at per source
    const lastEmbeddedMap: Record<string, string | null> = {};
    if (mode === "incremental") {
      for (const src of sources) {
        const { data: latest } = await sb
          .from("knowledge_chunks")
          .select("embedded_at")
          .eq("source_table", src)
          .order("embedded_at", { ascending: false })
          .limit(1);
        lastEmbeddedMap[src] = latest?.[0]?.embedded_at || null;
      }
    }

    let totalChunks = 0;
    let totalEmbedded = 0;

    for (const src of sources) {
      console.log(`Processing source: ${src} (mode: ${mode})`);
      const rows: { id: string; text: string; metadata: Record<string, unknown> }[] = [];
      const lastEmbedded = lastEmbeddedMap[src];

      if (src === "copilot_training") {
        let query = sb.from("copilot_training").select("id, category, content, updated_at").eq("is_active", true);
        if (mode === "incremental" && lastEmbedded) {
          query = query.gt("updated_at", lastEmbedded);
        }
        const { data } = await query;
        for (const row of (data || [])) {
          if (!row.content?.trim()) continue;
          rows.push({ id: row.id, text: `[Training - ${row.category}]: ${row.content}`, metadata: { category: row.category } });
        }
      } else if (src === "agent_instructions") {
        let query = sb.from("agent_instructions").select("id, label, slug, content, updated_at").eq("is_active", true);
        if (mode === "incremental" && lastEmbedded) {
          query = query.gt("updated_at", lastEmbedded);
        }
        const { data } = await query;
        for (const row of (data || [])) {
          if (!row.content?.trim()) continue;
          rows.push({ id: row.id, text: `[Instruction - ${row.label}]: ${row.content}`, metadata: { slug: row.slug, label: row.label } });
        }
      } else if (src === "call_log") {
        let query = sb.from("call_log")
          .select("id, phone_number, contact_name, transcription, ai_summary, created_at, direction")
          .not("transcription", "is", null)
          .order("created_at", { ascending: false });
        if (mode === "incremental" && lastEmbedded) {
          query = query.gt("created_at", lastEmbedded);
        } else {
          query = query.limit(500);
        }
        const { data } = await query;
        for (const row of (data || [])) {
          const text = [
            row.ai_summary ? `Summary: ${row.ai_summary}` : null,
            row.transcription ? `Transcript: ${row.transcription}` : null,
          ].filter(Boolean).join("\n\n");
          if (!text.trim()) continue;
          rows.push({
            id: row.id,
            text: `[Call ${row.direction} - ${row.contact_name || "Unknown"} - ${row.phone_number}]: ${text}`,
            metadata: { phone: row.phone_number, customer_name: row.contact_name, direction: row.direction, date: row.created_at },
          });
        }
      } else if (src === "sms_log") {
        // Group SMS by phone number into conversations
        let query = sb.from("sms_log")
          .select("id, phone_number, contact_name, body, direction, created_at")
          .not("body", "is", null)
          .order("created_at", { ascending: false });
        if (mode === "incremental" && lastEmbedded) {
          query = query.gt("created_at", lastEmbedded);
        } else {
          query = query.limit(2000);
        }
        const { data } = await query;
        
        const byPhone: Record<string, { msgs: any[]; contact_name: string }> = {};
        for (const row of (data || [])) {
          if (!row.body?.trim()) continue;
          const phone = row.phone_number;
          if (!byPhone[phone]) byPhone[phone] = { msgs: [], contact_name: row.contact_name || "Unknown" };
          byPhone[phone].msgs.push(row);
          if (row.contact_name && row.contact_name !== "Unknown") byPhone[phone].contact_name = row.contact_name;
        }

        for (const [phone, conv] of Object.entries(byPhone)) {
          // Build conversation thread (chronological order)
          const thread = conv.msgs.reverse().map((m: any) =>
            `[${m.direction === "outbound" ? "Us" : conv.contact_name}]: ${m.body}`
          ).join("\n");
          if (!thread.trim()) continue;
          rows.push({
            id: conv.msgs[0].id, // use first message ID as source_id
            text: `[SMS Thread - ${conv.contact_name} - ${phone}]:\n${thread}`,
            metadata: { phone, customer_name: conv.contact_name, message_count: conv.msgs.length },
          });
        }
      }

      console.log(`${src}: ${rows.length} records to process`);

      if (rows.length === 0) continue;

      // In full mode, delete old chunks for this source before inserting new ones
      // In incremental mode, delete only chunks for the specific source_ids we're re-embedding
      if (mode === "full") {
        await sb.from("knowledge_chunks").delete().eq("source_table", src);
      } else {
        const sourceIds = rows.map(r => r.id);
        // Delete in batches of 100 to avoid query size limits
        for (let i = 0; i < sourceIds.length; i += 100) {
          const batch = sourceIds.slice(i, i + 100);
          await sb.from("knowledge_chunks").delete().eq("source_table", src).in("source_id", batch);
        }
      }

      // Chunk and embed — assign quality scores based on source and content quality
      const allChunks: { source_table: string; source_id: string; chunk_text: string; metadata: Record<string, unknown>; quality_score: number }[] = [];
      for (const row of rows) {
        const chunks = chunkText(row.text);
        // Quality scoring: training/instructions = 1.0, calls with AI summary = 0.8, raw transcripts = 0.5, SMS = 0.6
        let baseQuality = 0.5;
        if (src === "copilot_training" || src === "agent_instructions") baseQuality = 1.0;
        else if (src === "call_log") baseQuality = row.text.includes("Summary:") ? 0.8 : 0.5;
        else if (src === "sms_log") baseQuality = 0.6;
        for (const chunk of chunks) {
          allChunks.push({ source_table: src, source_id: row.id, chunk_text: chunk, metadata: row.metadata, quality_score: baseQuality });
        }
      }
      totalChunks += allChunks.length;
      console.log(`${src}: ${allChunks.length} chunks to embed`);

      // Embed in batches
      for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);
        const texts = batch.map(c => c.chunk_text);

        try {
          const embeddings = await embedTexts(texts, openaiApiKey);

          const insertRows = batch.map((c, idx) => ({
            source_table: c.source_table,
            source_id: c.source_id,
            chunk_text: c.chunk_text,
            embedding: JSON.stringify(embeddings[idx]),
            metadata: c.metadata,
            embedded_at: new Date().toISOString(),
            quality_score: c.quality_score,
          }));

          const { error } = await sb.from("knowledge_chunks").insert(insertRows);
          if (error) {
            console.error(`Insert error for batch ${i}:`, error.message);
          } else {
            totalEmbedded += batch.length;
          }
        } catch (embedErr) {
          console.error(`Embedding batch ${i} failed:`, embedErr);
          // Wait before retrying to avoid rate limits
          await new Promise(r => setTimeout(r, 2000));
        }

        // Rate limit protection
        if (i + BATCH_SIZE < allChunks.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    console.log(`Done. Mode: ${mode}. Total chunks: ${totalChunks}, embedded: ${totalEmbedded}`);

    return new Response(
      JSON.stringify({ success: true, mode, total_chunks: totalChunks, total_embedded: totalEmbedded, sources }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-embeddings error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
