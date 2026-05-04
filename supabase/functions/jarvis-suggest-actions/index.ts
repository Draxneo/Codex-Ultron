// JARVIS smart action suggester: returns 3-4 hybrid AI + learned-preference buttons
// for a given context (customer / job / call / sms).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SuggestRequest {
  context_type: "customer" | "job" | "call" | "sms";
  context_subtype?: string; // e.g. "missed_call", "inbound_sms", "open_job"
  customer_id?: string | null;
  job_id?: string | null;
  phone?: string | null;
  summary?: string | null; // last message text, call transcript, etc.
}

interface Suggestion {
  key: string;
  label: string;
  prompt: string; // text to send to JARVIS chat when clicked
  source: "learned" | "ai";
  rank: number;
}

const FALLBACKS: Record<string, Suggestion[]> = {
  call: [
    { key: "call_back", label: "📞 Call back now", prompt: "Call this customer back about their recent call.", source: "ai", rank: 0 },
    { key: "send_sms_followup", label: "💬 Text follow-up", prompt: "Draft a text follow-up about their recent call.", source: "ai", rank: 1 },
    { key: "summarize", label: "📝 Summarize call", prompt: "Summarize the most recent call with this customer.", source: "ai", rank: 2 },
  ],
  sms: [
    { key: "reply_sms", label: "💬 Draft a reply", prompt: "Draft a reply SMS to this customer.", source: "ai", rank: 0 },
    { key: "call_back", label: "📞 Call instead", prompt: "Call this customer instead of texting.", source: "ai", rank: 1 },
    { key: "summarize_thread", label: "📝 Summarize thread", prompt: "Summarize the recent SMS thread with this customer.", source: "ai", rank: 2 },
  ],
  job: [
    { key: "summarize_job", label: "📝 Summarize job", prompt: "Summarize this job and its current state.", source: "ai", rank: 0 },
    { key: "next_step", label: "➡️ What's next?", prompt: "What's the next step on this job?", source: "ai", rank: 1 },
    { key: "draft_followup", label: "💬 Customer follow-up", prompt: "Draft a follow-up text to the customer about this job.", source: "ai", rank: 2 },
  ],
  customer: [
    { key: "history", label: "📜 History", prompt: "Summarize this customer's history with us.", source: "ai", rank: 0 },
    { key: "open_jobs", label: "🛠️ Open jobs", prompt: "Show open jobs for this customer.", source: "ai", rank: 1 },
    { key: "draft_email", label: "✉️ Draft email", prompt: "Draft an email to this customer.", source: "ai", rank: 2 },
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body: SuggestRequest = await req.json();
    const { context_type, context_subtype, customer_id, job_id, phone, summary } = body;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Resolve user from JWT for learned preferences
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    let userId: string | null = null;
    if (jwt) {
      const { data: userRes } = await createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${jwt}` } } },
      ).auth.getUser();
      userId = userRes?.user?.id ?? null;
    }

    // 1) Learned preferences (top clicks for this user + context)
    let learned: Suggestion[] = [];
    if (userId) {
      const { data: top } = await supabase.rpc("get_top_copilot_actions", {
        _user_id: userId,
        _context_type: context_type,
        _context_subtype: context_subtype ?? null,
        _limit: 3,
      });
      if (top && top.length > 0) {
        learned = top.map((r: any, i: number) => ({
          key: r.action_key,
          label: r.action_label,
          prompt: r.action_label, // re-runs the same intent
          source: "learned" as const,
          rank: i,
        }));
      }
    }

    // 2) Pull a thin context blob (customer name, last messages) to feed the LLM
    let contextBlob = summary ?? "";
    if (customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("first_name,last_name,company,notes,tags")
        .eq("id", customer_id)
        .maybeSingle();
      if (cust) {
        contextBlob += `\nCustomer: ${cust.first_name ?? ""} ${cust.last_name ?? ""} ${cust.company ? "(" + cust.company + ")" : ""}`.trim();
        if (cust.tags?.length) contextBlob += `\nTags: ${cust.tags.join(", ")}`;
      }
    }
    if (job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("hcp_job_number,job_type,status,scheduled_date,assigned_to,description")
        .eq("id", job_id)
        .maybeSingle();
      if (job) {
        contextBlob += `\nJob #${job.hcp_job_number ?? ""} (${job.job_type ?? ""}, ${job.status ?? ""}) scheduled ${job.scheduled_date ?? "TBD"} assigned to ${job.assigned_to ?? "unassigned"}.`;
        if (job.description) contextBlob += `\nDescription: ${job.description.slice(0, 300)}`;
      }
    }

    // 3) Ask the LLM for 3-4 short next-step buttons
    let aiSuggestions: Suggestion[] = [];
    if (OPENAI_API_KEY && contextBlob.trim().length > 0) {
      try {
        const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-5-mini",
            messages: [
              {
                role: "system",
                content:
                  "You are JARVIS, an AI assistant for an HVAC dispatcher. Given a brief context about a customer touchpoint (call, SMS, or job), suggest 3-4 high-probability next actions a dispatcher would take. Return very short button labels (3-6 words) with a leading emoji. Be concrete: prefer 'Schedule estimate Mon AM', 'Send invoice link', 'Reassign to Matt' over generic 'Follow up'.",
              },
              { role: "user", content: `Context type: ${context_type}\n${contextBlob}` },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "suggest_actions",
                  description: "Return 3-4 suggested next-step buttons.",
                  parameters: {
                    type: "object",
                    properties: {
                      actions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string", description: "snake_case stable id" },
                            label: { type: "string" },
                            prompt: { type: "string", description: "Full text to send to JARVIS when clicked" },
                          },
                          required: ["key", "label", "prompt"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["actions"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "suggest_actions" } },
          }),
        });
        if (aiResp.ok) {
          const j = await aiResp.json();
          const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (args) {
            const parsed = JSON.parse(args);
            aiSuggestions = (parsed.actions || []).slice(0, 4).map((a: any, i: number) => ({
              key: a.key,
              label: a.label,
              prompt: a.prompt,
              source: "ai" as const,
              rank: i,
            }));
          }
        }
      } catch (e) {
        console.error("AI suggest failed:", e);
      }
    }

    // 4) Merge: learned preferences first, then AI fillers (dedupe by key)
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    for (const s of [...learned, ...aiSuggestions]) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      out.push(s);
      if (out.length >= 4) break;
    }
    if (out.length === 0) {
      for (const s of FALLBACKS[context_type] ?? []) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        out.push(s);
      }
    }

    return new Response(JSON.stringify({ suggestions: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("jarvis-suggest-actions error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
