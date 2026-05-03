type UpsertActionItemInput = {
  title: string;
  description?: string | null;
  category: string;
  priority?: string;
  source?: string;
  status?: string;
  customer_phone?: string | null;
  job_id?: string | null;
  suggested_action?: string | null;
  metadata?: Record<string, unknown> | null;
  merge_window_hours?: number;
};

function phoneDigits(value?: string | null): string {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function businessContextKey(metadata: Record<string, unknown> | null | undefined): string {
  const businessUnitId = String(metadata?.business_unit_id || metadata?.businessUnitId || "").trim();
  if (businessUnitId) return `bu:${businessUnitId}`;
  const companyLine = phoneDigits(
    (metadata?.company_phone_number as string | null | undefined) ||
    (metadata?.company_phone as string | null | undefined) ||
    (metadata?.to_number as string | null | undefined) ||
    (metadata?.from_number as string | null | undefined),
  );
  return companyLine ? `line:${companyLine}` : "";
}

function priorityRank(value?: string | null): number {
  const key = String(value || "normal").toLowerCase();
  if (key === "critical") return 4;
  if (key === "high") return 3;
  if (key === "medium") return 2;
  if (key === "normal") return 1;
  return 0;
}

function higherPriority(a?: string | null, b?: string | null): string {
  return priorityRank(a) >= priorityRank(b) ? (a || "normal") : (b || "normal");
}

function compactEvidence(value: unknown) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 500) : null;
}

export async function upsertLiveActionItem(supabase: any, input: UpsertActionItemInput) {
  const metadata = input.metadata || {};
  const phone = input.customer_phone || (metadata as any).phone || (metadata as any).customer_phone || null;
  const digits = phoneDigits(phone);
  const since = new Date(Date.now() - (input.merge_window_hours || 24) * 60 * 60 * 1000).toISOString();
  const categories = Array.from(new Set([input.category, "new_appointment", "booking_confirm", "follow_up", "thread_attention", "new_lead", "create_customer"]));

  let existing: any = null;
  if (digits.length === 10) {
    const incomingBusinessKey = businessContextKey(metadata);
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .eq("status", "pending")
      .in("category", categories)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);

    existing = (data || []).find((row: any) => {
      const rowMeta = row.metadata || {};
      const rowDigits = phoneDigits(row.customer_phone || rowMeta.phone || rowMeta.customer_phone || rowMeta.callback_phone);
      const rowBusinessKey = businessContextKey(rowMeta);
      const samePhone = rowDigits === digits;
      const sameJob = input.job_id && row.job_id === input.job_id;
      const sameEstimate = (metadata as any).active_estimate_id && rowMeta.active_estimate_id === (metadata as any).active_estimate_id;
      const sameBusiness = !incomingBusinessKey || !rowBusinessKey || incomingBusinessKey === rowBusinessKey;
      return samePhone && sameBusiness && (sameJob || sameEstimate || !input.job_id);
    }) || null;
  }

  if (!existing) {
    const result = await supabase.from("action_items").insert({
      title: input.title,
      description: input.description || null,
      category: input.category,
      priority: input.priority || "normal",
      source: input.source || "jarvis",
      status: "pending",
      customer_phone: phone,
      job_id: input.job_id || null,
      suggested_action: input.suggested_action || null,
      metadata: {
        ...metadata,
        living_card: true,
        context_updates: [{
          at: new Date().toISOString(),
          source: input.source || "jarvis",
          category: input.category,
          intent: (metadata as any).jarvis_intent || null,
          summary: compactEvidence(input.description || input.suggested_action || input.title),
        }],
      },
    });
    if (result.error) throw result.error;
    return result;
  }

  const previousMeta = existing.metadata || {};
  const previousUpdates = Array.isArray(previousMeta.context_updates) ? previousMeta.context_updates : [];
  const nextMeta = {
    ...previousMeta,
    ...metadata,
    living_card: true,
    previous_category: previousMeta.previous_category || existing.category,
    last_context_update_at: new Date().toISOString(),
    context_updates: [
      {
        at: new Date().toISOString(),
        source: input.source || "jarvis",
        category: input.category,
        intent: (metadata as any).jarvis_intent || null,
        summary: compactEvidence(input.description || input.suggested_action || input.title),
      },
      ...previousUpdates,
    ].slice(0, 12),
  };

  const result = await supabase
    .from("action_items")
    .update({
      title: input.title || existing.title,
      description: input.description || existing.description,
      category: input.category || existing.category,
      priority: higherPriority(input.priority, existing.priority),
      source: input.source || existing.source,
      customer_phone: phone || existing.customer_phone,
      job_id: input.job_id || existing.job_id || null,
      suggested_action: input.suggested_action || existing.suggested_action,
      metadata: nextMeta,
    })
    .eq("id", existing.id);
  if (result.error) throw result.error;
  return result;
}
