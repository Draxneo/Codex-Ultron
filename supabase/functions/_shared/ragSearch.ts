/**
 * Shared RAG search helper — queries knowledge_chunks via match_knowledge RPC.
 * Any edge function can import this to get targeted, similarity-ranked context.
 * Uses OPENAI_API_KEY for embeddings (same as ai-task-agent pattern).
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;

export async function ragSearch(
  supabase: any,
  query: string,
  opts?: { matchCount?: number; source?: string }
): Promise<string> {
  if (!query || query.trim().length < 5) return "";

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.warn("ragSearch: OPENAI_API_KEY not set, skipping RAG");
      return "";
    }

    // 1. Generate embedding via OpenAI/JARVIS gateway (same as ai-task-agent)
    const embResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: query.slice(0, 2000),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!embResp.ok) {
      console.error("ragSearch: embedding error", embResp.status);
      return "";
    }

    const embData = await embResp.json();
    const embedding = embData?.data?.[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error("ragSearch: invalid embedding response");
      return "";
    }

    // 2. Extract keywords for hybrid search
    const stopwords = new Set(["the","and","for","are","but","not","you","all","can","had","her","was","one","our","out","has","have","this","that","with","from","they","been","said","each","which","their","will","other","about","many","then","them","these","some","would","make","like","just","over","such","take","year","also","into","could","than","only","come","made","after","back","through","most","where","much","should","well","what","when","your","very","know","here","does","want","need","how"]);
    const keywords = query.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length >= 3 && !stopwords.has(w));
    const keywordQuery = keywords.length > 0 ? keywords.slice(0, 5).join(" ") : null;

    // 3. Call match_knowledge RPC (hybrid vector + keyword search)
    const matchCount = opts?.matchCount ?? 8;
    const rpcParams: any = {
      query_embedding: JSON.stringify(embedding),
      match_count: matchCount,
      match_threshold: 0.6,
      keyword_query: keywordQuery,
    };
    if (opts?.source) {
      rpcParams.filter_source = opts.source;
    }

    const { data: chunks, error } = await supabase.rpc("match_knowledge", rpcParams);

    if (error) {
      console.error("ragSearch: match_knowledge error", error.message);
      return "";
    }

    if (!chunks || chunks.length === 0) return "";

    // 4. Format results
    const formatted = chunks
      .map((c: any) => {
        const source = c.source_table || "unknown";
        const sim = (c.similarity * 100).toFixed(0);
        const meta = c.metadata?.customer_name ? ` | ${c.metadata.customer_name}` : "";
        return `[${source}${meta}] (${sim}% match): ${c.chunk_text}`;
      })
      .join("\n\n");

    console.log(`ragSearch: ${chunks.length} chunks for "${query.slice(0, 50)}..."${keywordQuery ? ` (kw: ${keywordQuery})` : ""}`);
    return `\n\nRELEVANT KNOWLEDGE (RAG — ${chunks.length} matches):\n${formatted}`;
  } catch (err) {
    console.error("ragSearch: unexpected error", err);
    return "";
  }
}
