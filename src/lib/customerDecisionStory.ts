type AnyItem = {
  kind?: string | null;
  name?: string | null;
  description?: string | null;
  metadata?: Record<string, any> | null;
};

export type DecisionStoryCard = {
  title: string;
  body: string;
};

export type CustomerDecisionStory = {
  headline: string;
  subheadline: string;
  whatWeFound: DecisionStoryCard;
  whyNow: DecisionStoryCard;
  riskIfWaiting: DecisionStoryCard;
  benefits: DecisionStoryCard[];
};

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function normalizeCards(value: unknown): DecisionStoryCard[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return { title: "Benefit", body: cleanText(item) };
        if (!item || typeof item !== "object") return null;
        const card = item as Record<string, any>;
        const body = firstText(card.body, card.text, card.description);
        if (!body) return null;
        return {
          title: firstText(card.title, card.label, "Benefit"),
          body,
        };
      })
      .filter((item): item is DecisionStoryCard => Boolean(item?.body));
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;|\|/)
      .map((text) => cleanText(text))
      .filter(Boolean)
      .map((body) => ({ title: "Benefit", body }));
  }
  return [];
}

function itemLabel(item?: AnyItem | null) {
  if (!item) return "recommended option";
  return cleanText(item.name) || "recommended option";
}

export function buildDefaultDecisionMetadata(action: {
  name: string;
  description?: string | null;
  kind?: string | null;
  sourceLine?: string | null;
}) {
  const name = cleanText(action.name);
  const description = cleanText(action.description);
  const isReplacement = /\b(system|condenser|furnace|air handler|coil|equipment|unit)\b/i.test(`${name} ${description}`);
  const isRepair = /\b(repair|replace|capacitor|contactor|motor|board|clean|service|part)\b/i.test(`${name} ${description}`);

  return {
    customer_problem_summary: description || `Our technician found an issue that points to ${name}.`,
    why_now: isReplacement
      ? "Comfort equipment usually fails harder when it is already stressed by heat. Handling it now protects comfort, schedule, and available options."
      : isRepair
        ? "Small HVAC problems can turn into larger failures when the system keeps running under stress. Fixing it now helps protect the equipment and the home."
        : "This keeps the job moving while the details are fresh and the technician can still verify the result.",
    risk_if_waiting: isReplacement
      ? "Waiting can mean more uncomfortable days, emergency scheduling, and fewer equipment choices if the old system quits completely."
      : "Waiting can cause repeat visits, more wear on connected parts, and a higher chance the system stops working when you need it most.",
    sales_positioning: [
      { title: "Comfort", body: "This option is meant to restore dependable cooling and help the home feel comfortable again." },
      { title: "Reliability", body: "It addresses the problem while the technician is already on site and can verify operation." },
      { title: "Peace of mind", body: "You get a clear approval path and a record of what was recommended." },
      { title: "Why now", body: isRepair ? "HVAC issues usually get more expensive when the system keeps running while damaged." : "Approving now helps protect your schedule and comfort." },
    ],
    field_evidence_summary: action.sourceLine || description || name,
  };
}

export function buildCustomerDecisionStory(items: AnyItem[], job?: Record<string, any> | null): CustomerDecisionStory {
  const primary = items.find((item) => item.kind === "equipment") || items[0] || null;
  const meta = (primary?.metadata || {}) as Record<string, any>;
  const primaryName = itemLabel(primary);
  const customerName = cleanText(job?.customer_name).split(" ")[0];
  const salesCards = normalizeCards(meta.sales_positioning);
  const featureCards = normalizeCards(meta.features_benefits).map((card) => ({
    title: card.title === "Benefit" ? "Comfort feature" : card.title,
    body: card.body,
  }));
  const benefits = [...salesCards, ...featureCards].slice(0, 4);

  const fallbackBenefits: DecisionStoryCard[] = [
    { title: "Comfort", body: "The goal is to restore dependable comfort and help the home feel right again." },
    { title: "Reliability", body: "The recommendation is based on what the technician found, not a generic sales script." },
    { title: "Peace of mind", body: "The approval link keeps the scope, price, and next step in one clear place." },
    { title: "Family service", body: "Our family handles the follow-through so your family is not left guessing." },
  ];

  const whatFound = firstText(
    meta.customer_problem_summary,
    meta.diagnosis_summary,
    meta.field_evidence_summary,
    primary?.description,
    primaryName,
  );

  return {
    headline: customerName ? `${customerName}, here is the simple version.` : "Here is the simple version.",
    subheadline: "What we found, why it matters, and the choice in front of you.",
    whatWeFound: {
      title: "What we found",
      body: whatFound || `Our technician recommended ${primaryName}.`,
    },
    whyNow: {
      title: "Why it matters now",
      body: firstText(
        meta.why_now,
        "HVAC problems usually get more stressful when they are left alone. Taking care of it now protects comfort, schedule, and the equipment around the failed part.",
      ),
    },
    riskIfWaiting: {
      title: "If you wait",
      body: firstText(
        meta.risk_if_waiting,
        "The system may keep running for a while, but the risk is a repeat breakdown, more discomfort, and a more expensive decision later.",
      ),
    },
    benefits: benefits.length ? benefits : fallbackBenefits,
  };
}
