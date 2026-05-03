import { withActionOwnership } from "./actionOwnership.ts";

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

function mergeMediaList(previous: unknown, incoming: unknown) {
  const list = [
    ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
    ...(Array.isArray(incoming) ? incoming : incoming ? [incoming] : []),
  ].filter(Boolean);
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Statuses where a card is still "alive" and should accept new context updates.
// Anything outside this set (resolved, completed, cancelled, dismissed) is treated as
// terminal — new evidence about the same job creates a fresh card instead of nesting
// onto a closed one.
const NON_TERMINAL_STATUSES = ["pending", "accepted", "in_progress"];

export async function upsertLiveActionItem(supabase: any, input: UpsertActionItemInput) {
  const metadata = withActionOwnership({
    category: input.category,
    title: input.title,
    description: input.description || null,
    suggested_action: input.suggested_action || null,
    metadata: input.metadata || {},
  });
  const phone = input.customer_phone || (metadata as any).phone || (metadata as any).customer_phone || null;
  const digits = phoneDigits(phone);

  // Two windows: a wide one for cards already linked to a job/estimate (the work
  // can stay open for days), and the original 24h window for unlinked phone-only matches.
  const phoneWindowHours = input.merge_window_hours || 24;
  const jobBoundWindowHours = Math.max(input.merge_window_hours || 0, 24 * 30); // 30 days default
  const phoneSince = new Date(Date.now() - phoneWindowHours * 60 * 60 * 1000).toISOString();
  const jobBoundSince = new Date(Date.now() - jobBoundWindowHours * 60 * 60 * 1000).toISOString();

  const incomingBusinessKey = businessContextKey(metadata);
  const incomingEstimateId = (metadata as any).active_estimate_id || null;

  let existing: any = null;

  // PRIMARY: job_id is the strongest dedup key. Any non-terminal card on the same job
  // is the right home for new evidence — regardless of category, regardless of who set
  // the original status. Pick the OLDEST so we always merge back into the original card.
  if (input.job_id) {
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .eq("job_id", input.job_id)
      .in("status", NON_TERMINAL_STATUSES)
      .gte("created_at", jobBoundSince)
      .order("created_at", { ascending: true })
      .limit(5);
    existing = (data || [])[0] || null;
  }

  // SECONDARY: estimate id match — useful when a customer texts about a quote before
  // the estimate has been promoted to a real job.
  if (!existing && incomingEstimateId) {
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .in("status", NON_TERMINAL_STATUSES)
      .gte("created_at", jobBoundSince)
      .contains("metadata", { active_estimate_id: incomingEstimateId })
      .order("created_at", { ascending: true })
      .limit(5);
    existing = (data || [])[0] || null;
  }

  // FALLBACK: phone + business match. Used when the incoming event has no job_id /
  // estimate_id yet (intake stage). We still skip rows whose job_id conflicts with the
  // incoming job_id — that protects against merging two genuinely-different jobs that
  // share a customer phone.
  if (!existing && digits.length === 10) {
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .in("status", NON_TERMINAL_STATUSES)
      .gte("created_at", phoneSince)
      .order("created_at", { ascending: true })
      .limit(20);

    existing = (data || []).find((row: any) => {
      const rowMeta = row.metadata || {};
      const rowDigits = phoneDigits(row.customer_phone || rowMeta.phone || rowMeta.customer_phone || rowMeta.callback_phone);
      const rowBusinessKey = businessContextKey(rowMeta);
      const samePhone = rowDigits === digits;
      const sameBusiness = !incomingBusinessKey || !rowBusinessKey || incomingBusinessKey === rowBusinessKey;
      // Don't merge a known-job event into a card tagged for a different job.
      const jobConflict = input.job_id && row.job_id && row.job_id !== input.job_id;
      return samePhone && sameBusiness && !jobConflict;
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
    media_urls: mergeMediaList(previousMeta.media_urls || previousMeta.source_sms_media_urls, (metadata as any).media_urls || (metadata as any).source_sms_media_urls),
    source_sms_media_urls: mergeMediaList(previousMeta.source_sms_media_urls || previousMeta.media_urls, (metadata as any).source_sms_media_urls || (metadata as any).media_urls),
    owner_type: (metadata as any).owner_type || previousMeta.owner_type,
    owner_queue: (metadata as any).owner_queue || previousMeta.owner_queue,
    owner_label: (metadata as any).owner_label || previousMeta.owner_label,
    owner_required: (metadata as any).owner_required ?? previousMeta.owner_required,
    needs_schedule_before_accept: (metadata as any).needs_schedule_before_accept ?? previousMeta.needs_schedule_before_accept,
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

  // If a human already accepted/started the card, the title/description/category
  // describe the OWNED work — don't overwrite them with the latest event's framing.
  // Just nest new context, refresh metadata, and bump priority if the new event is hotter.
  // For still-pending cards (no human has touched yet), keep the original behavior of
  // showing the most recent framing so dispatch sees the freshest summary.
  const isPending = existing.status === "pending";
  const updatePayload: Record<string, unknown> = {
    priority: higherPriority(input.priority, existing.priority),
    source: input.source || existing.source,
    customer_phone: phone || existing.customer_phone,
    job_id: input.job_id || existing.job_id || null,
    metadata: nextMeta,
  };
  if (isPending) {
    updatePayload.title = input.title || existing.title;
    updatePayload.description = input.description || existing.description;
    updatePayload.category = input.category || existing.category;
    updatePayload.suggested_action = input.suggested_action || existing.suggested_action;
  }

  const result = await supabase
    .from("action_items")
    .update(updatePayload)
    .eq("id", existing.id);
  if (result.error) throw result.error;
  return result;
}
