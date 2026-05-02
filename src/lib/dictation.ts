export type DictationProvider = "bridgevoice" | "openai" | "deepgram" | "mock";

export type DictationContext =
  | "general"
  | "sms"
  | "jarvis_chat"
  | "tech_jarvis"
  | "tech_notes";

export const DEFAULT_DICTATION_PROVIDER: DictationProvider = "openai";

const GENERAL_DICTATION_PROMPT = [
  "Transcribe this as business dictation for a home-service company.",
  "Use clean punctuation, normal capitalization, and readable sentence spacing.",
  "Preserve customer names, phone numbers, addresses, HVAC terms, construction terms, brands, model numbers, prices, dates, and time windows.",
  "Do not add information that was not spoken.",
].join(" ");

export const DICTATION_PROMPTS: Record<DictationContext, string> = {
  general: GENERAL_DICTATION_PROMPT,
  sms: [
    GENERAL_DICTATION_PROMPT,
    "The text will be inserted into a customer SMS composer.",
    "Keep it friendly, clear, and natural, like personal service from our family to theirs.",
    "Do not add a signature unless it was spoken; the SMS sender handles signatures separately.",
  ].join(" "),
  jarvis_chat: [
    GENERAL_DICTATION_PROMPT,
    "The text is a message to JARVIS. Preserve requests, commands, customer context, and operational details exactly.",
  ].join(" "),
  tech_jarvis: [
    GENERAL_DICTATION_PROMPT,
    "The speaker is an HVAC technician diagnosing a job in the field.",
    "Preserve repair findings, symptoms, test readings, part names, system type, tonnage, brand, tier, orientation, access notes, pricing, and customer objections.",
    "Format the result as clean technician speech that JARVIS can turn into notes, estimate items, and proposal options.",
  ].join(" "),
  tech_notes: [
    GENERAL_DICTATION_PROMPT,
    "The speaker is filling out technician field notes.",
    "Preserve findings, measurements, photos mentioned, safety concerns, equipment details, and next steps.",
  ].join(" "),
};

export function getDictationConfig({
  context = "general",
  provider,
  prompt,
}: {
  context?: DictationContext;
  provider?: DictationProvider;
  prompt?: string;
} = {}) {
  return {
    provider: provider || DEFAULT_DICTATION_PROVIDER,
    prompt: prompt || DICTATION_PROMPTS[context] || DICTATION_PROMPTS.general,
  };
}
