export type TechCartRepairCatalogItem = {
  id: string;
  name: string;
  category?: string | null;
  tech_description?: string | null;
  customer_description?: string | null;
  keywords?: string[] | null;
  default_severity?: string | null;
  base_price?: number | null;
  member_price?: number | null;
};

export type TechCartEquipmentMatchup = {
  id: string;
  brand: string;
  system_type?: string | null;
  tier?: string | null;
  application?: string | null;
  condenser_model?: string | null;
  furnace_model?: string | null;
  coil_model?: string | null;
  tonnage?: number | null;
  seer2?: number | null;
  eer2?: number | null;
  hspf2?: number | null;
  cooling_cap?: number | null;
  afue?: number | null;
  ahri_number?: string | null;
  ahri_certificate_path?: string | null;
  heat_kit?: string | null;
  total_price?: number | null;
  factory_rebate_price?: number | null;
  monthly_payment?: number | null;
  monthly_payment_120?: number | null;
  cps_tonnage?: number | null;
  early_rebate?: number | null;
  burnout_rebate?: number | null;
  notes?: string | null;
  low_margin_price?: number | null;
  cps_rebate_tier?: string | null;
  features_benefits?: unknown;
  image_url?: string | null;
};

export type TechCartTrainingTerm = {
  id?: string;
  target_type: "repair" | "equipment";
  target_id: string;
  phrase: string;
  status?: "suggested" | "approved" | "rejected" | null;
  confidence?: number | null;
  source?: string | null;
};

export type TechCartCatalogItem = TechCartRepairCatalogItem;

export type TechCartMatch = {
  id: string;
  sourceType: "repair" | "equipment" | "custom";
  sourceId: string | null;
  catalogItem: TechCartRepairCatalogItem | null;
  equipmentMatchup?: TechCartEquipmentMatchup | null;
  name: string;
  description: string | null;
  unitPrice: number;
  confidence: "high" | "medium" | "low";
  capturedSpecs: Record<string, string>;
  missingSpecs: string[];
  sourcePhrase: string;
  metadata?: Record<string, unknown>;
};

export type TechCartFollowUpQuestion = {
  id: string;
  itemName: string;
  question: string;
  options: string[];
};

export type TechCartInterpretation = {
  matches: TechCartMatch[];
  questions: TechCartFollowUpQuestion[];
};

type RepairIntentDefinition = {
  id: string;
  label: string;
  catalogNeedle: RegExp;
  speechNeedle: RegExp;
  requiredSpecs?: Array<"mfd" | "horsepower" | "voltage" | "poles">;
  question?: (itemName: string, missing: string[]) => TechCartFollowUpQuestion;
};

const REPAIR_INTENTS: RepairIntentDefinition[] = [
  {
    id: "contactor",
    label: "Contactor Replacement",
    catalogNeedle: /\bcontactor\b/i,
    speechNeedle: /\b(contactor|contacts?|pitted contactor|welded contactor|single pole|single-pole|two pole|two-pole|2 pole|1 pole)\b/i,
    requiredSpecs: ["poles"],
    question: (itemName) => ({
      id: "contactor-poles",
      itemName,
      question: "Which contactor should I add?",
      options: ["Single-pole contactor", "Two-pole contactor", "Not sure yet"],
    }),
  },
  {
    id: "capacitor",
    label: "Capacitor Replacement",
    catalogNeedle: /\bcapacitor\b/i,
    speechNeedle: /\b(capacitor|dual run cap|run cap|start cap|cap\b|microfarad|\d{1,3}\s*(x|by|\/)\s*\d{1,2})\b/i,
    requiredSpecs: ["mfd"],
    question: (itemName) => ({
      id: "capacitor-mfd",
      itemName,
      question: "What size run cap should I add?",
      options: ["35x5 run cap", "40x5 run cap", "45x5 run cap", "55x5 run cap", "70x5 run cap", "Not sure yet"],
    }),
  },
  {
    id: "condenser-fan-motor",
    label: "Condenser Fan Motor Replacement",
    catalogNeedle: /\bcondenser fan motor\b|\boutdoor fan motor\b/i,
    speechNeedle: /\b(condenser fan motor|outdoor fan motor|fan motor)\b/i,
    requiredSpecs: ["horsepower", "voltage"],
    question: (itemName, missing) => ({
      id: "condenser-motor-specs",
      itemName,
      question: `What ${missing.join(" and ")} should I attach to this motor?`,
      options: ["1/4 HP 240V", "1/3 HP 240V", "1/2 HP 240V", "3/4 HP 240V", "Not sure yet"],
    }),
  },
  {
    id: "blower-motor",
    label: "Blower Motor Replacement",
    catalogNeedle: /\bblower motor\b/i,
    speechNeedle: /\b(blower motor|indoor motor|air handler motor)\b/i,
    requiredSpecs: ["horsepower", "voltage"],
    question: (itemName, missing) => ({
      id: "blower-motor-specs",
      itemName,
      question: `What ${missing.join(" and ")} should I attach to this blower motor?`,
      options: ["1/3 HP 120V", "1/2 HP 120V", "3/4 HP 120V", "ECM motor", "Not sure yet"],
    }),
  },
  {
    id: "condenser-coil-cleaning",
    label: "Condenser Coil Cleaning",
    catalogNeedle: /\b(condenser coil|outdoor coil|coil cleaning).*clean|\bclean.*(condenser coil|outdoor coil)\b/i,
    speechNeedle: /\b(condenser coil cleaning|outdoor coil cleaning|wash.*condenser|dirty condenser coil)\b/i,
  },
  {
    id: "evaporator-coil-cleaning",
    label: "Evaporator Coil Cleaning",
    catalogNeedle: /\b(evaporator|evap).*clean|\bclean.*(evaporator|evap)\b/i,
    speechNeedle: /\b(evaporator coil cleaning|evap coil cleaning|dirty evaporator|dirty evap)\b/i,
  },
  {
    id: "drain-line",
    label: "Drain Line Flush",
    catalogNeedle: /\bdrain\b/i,
    speechNeedle: /\b(drain line|primary drain|secondary drain|float switch|clogged drain|clear the drain)\b/i,
  },
  {
    id: "thermostat",
    label: "Thermostat Replacement",
    catalogNeedle: /\bthermostat\b/i,
    speechNeedle: /\b(thermostat|t stat|tstat)\b/i,
  },
  {
    id: "control-board",
    label: "Control Board Replacement",
    catalogNeedle: /\b(control board|circuit board|board)\b/i,
    speechNeedle: /\b(control board|circuit board|bad board|furnace board|defrost board)\b/i,
  },
  {
    id: "txv",
    label: "TXV Replacement",
    catalogNeedle: /\b(txv|thermal expansion valve)\b/i,
    speechNeedle: /\b(txv|thermal expansion valve|metering device)\b/i,
  },
];

const NUMBER_WORDS: Record<string, string> = {
  "one third": "1/3",
  "one-third": "1/3",
  third: "1/3",
  quarter: "1/4",
  "one quarter": "1/4",
  "one-quarter": "1/4",
  half: "1/2",
  "one half": "1/2",
  "one-half": "1/2",
  "three quarter": "3/4",
  "three-quarter": "3/4",
};

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Electric Heat",
  dual_fuel: "Dual Fuel",
};

export function interpretTechCartSpeech(
  transcript: string,
  repairItems: TechCartRepairCatalogItem[] = [],
  equipmentMatchups: TechCartEquipmentMatchup[] = [],
  trainingTerms: TechCartTrainingTerm[] = [],
): TechCartInterpretation {
  const text = normalizeSpeech(transcript);
  const specs = extractSpecs(text);
  const matches: TechCartMatch[] = [];
  const questions: TechCartFollowUpQuestion[] = [];
  const seen = new Set<string>();
  const approvedTerms = trainingTerms.filter((term) => (term.status || "approved") === "approved");

  for (const match of interpretRepairs(transcript, text, specs, repairItems, approvedTerms)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
    const intent = REPAIR_INTENTS.find((item) => match.id.startsWith(`repair-${item.id}`));
    if (match.missingSpecs.length > 0 && intent?.question) {
      questions.push(intent.question(match.name, match.missingSpecs));
    }
  }

  for (const match of interpretSpecialtyCustomItems(transcript, text, specs)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
    if (match.missingSpecs.includes("price")) {
      questions.push({
        id: `${match.id}-price`,
        itemName: match.name,
        question: "What price should I put on this specialty OEM item?",
        options: ["$850", "$1,250", "$1,750", "$2,500", "Not sure yet"],
      });
    }
  }

  for (const match of interpretEquipment(transcript, text, specs, equipmentMatchups, approvedTerms)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
    if (match.missingSpecs.length > 0) {
      questions.push(equipmentQuestion(match.name, match.missingSpecs));
    }
  }

  return { matches, questions };
}

export function mergeFollowUpAnswer(transcript: string, answer: string) {
  const cleaned = answer.trim();
  if (!cleaned || /not sure/i.test(cleaned)) return transcript;
  return `${transcript.trim()} ${cleaned}.`;
}

function interpretRepairs(
  transcript: string,
  text: string,
  specs: Record<string, string>,
  items: TechCartRepairCatalogItem[],
  trainingTerms: TechCartTrainingTerm[],
) {
  const matches: TechCartMatch[] = [];

  for (const intent of REPAIR_INTENTS) {
    if (!intent.speechNeedle.test(text)) continue;
    if (intent.id === "control-board" && looksLikeSpecialtyCustomPart(text)) continue;
    if (intent.id.includes("motor") && looksLikeSpecialtyCustomPart(text)) continue;
    const catalogItem = findIntentRepairItem(intent, items, text, trainingTerms);
    matches.push(buildRepairMatch(intent, catalogItem, transcript, specs));
  }

  for (const scored of scoreRepairCatalog(text, items, trainingTerms).slice(0, 3)) {
    if (matches.some((match) => match.sourceId === scored.item.id)) continue;
    const missingSpecs = inferMissingRepairSpecs(scored.item, text, specs);
    matches.push({
      id: `repair-keyword-${scored.item.id}`,
      sourceType: "repair",
      sourceId: scored.item.id,
      catalogItem: scored.item,
      name: buildMatchedName(scored.item.name, specsForRepairName(scored.item, specs)),
      description: buildRepairDescription(scored.item, specs, transcript),
      unitPrice: Number(scored.item.base_price || scored.item.member_price || 0),
      confidence: scored.score >= 10 && missingSpecs.length === 0 ? "high" : "medium",
      capturedSpecs: specs,
      missingSpecs,
      sourcePhrase: transcript.trim(),
      metadata: {
        match_reason: "repair_catalog_keywords",
        score: scored.score,
        category: scored.item.category || null,
      },
    });
  }

  return matches;
}

function interpretSpecialtyCustomItems(
  transcript: string,
  text: string,
  specs: Record<string, string>,
): TechCartMatch[] {
  if (!looksLikeSpecialtyCustomPart(text)) return [];
  const specialty = detectSpecialtyPartLabel(text);
  if (!specialty) return [];
  const price = extractQuotedPrice(text);
  const missingSpecs = price > 0 ? [] : ["price"];
  return [{
    id: `custom-specialty-${specialty.slug}`,
    sourceType: "custom",
    sourceId: null,
    catalogItem: null,
    name: specialty.name,
    description: [
      specialty.description,
      "Pricing is job-specific because OEM specialty parts can vary by model, supplier, availability, and warranty status.",
      `Tech said: ${transcript.trim()}`,
    ].filter(Boolean).join(" "),
    unitPrice: price,
    confidence: price > 0 ? "medium" : "low",
    capturedSpecs: { ...specs, specialty_part: specialty.slug, ...(price > 0 ? { price: String(price) } : {}) },
    missingSpecs,
    sourcePhrase: transcript.trim(),
    metadata: {
      match_reason: "specialty_oem_custom_item",
      specialty_part: specialty.slug,
      variable_pricing: true,
      allow_custom_price: true,
    },
  }];
}

function looksLikeSpecialtyCustomPart(text: string) {
  return /\b(oem|factory|special\s*order|variable[-\s]*speed|ecm|x13|cpu|module|control board|circuit board|defrost board|inverter board)\b/i.test(text)
    && /\b(board|motor|module|part|replacement|cpu|oem|ecm|x13)\b/i.test(text);
}

function detectSpecialtyPartLabel(text: string) {
  const labels = [
    {
      slug: "cpu-board",
      needle: /\b(cpu|control board|circuit board|furnace board|defrost board|inverter board|board)\b/i,
      name: "OEM replacement part - CPU/control board",
      description: "Replace failed OEM control board or electronic module.",
    },
    {
      slug: "variable-speed-blower-motor",
      needle: /\b(variable[-\s]*speed|ecm|x13).*\b(blower|indoor)?\s*motor\b|\bblower motor\b/i,
      name: "OEM replacement part - variable-speed blower motor",
      description: "Replace OEM indoor blower motor or module assembly.",
    },
    {
      slug: "blower-motor",
      needle: /\bblower motor|indoor motor|air handler motor\b/i,
      name: "OEM replacement part - blower motor",
      description: "Replace OEM indoor blower motor.",
    },
    {
      slug: "condenser-fan-motor",
      needle: /\bcondenser fan motor|outdoor fan motor\b/i,
      name: "OEM replacement part - condenser fan motor",
      description: "Replace OEM outdoor condenser fan motor.",
    },
    {
      slug: "specialty-oem-part",
      needle: /\boem|factory|special\s*order\b/i,
      name: "OEM replacement part - specialty component",
      description: "Replace job-specific OEM component.",
    },
  ];
  return labels.find((item) => item.needle.test(text)) || null;
}

function extractQuotedPrice(text: string) {
  const money = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)\b/);
  if (money) return Number(money[1].replace(/,/g, ""));
  const verbal = text.match(/\b(?:for|at|price|priced|charge|quote)\s+([\d,]+(?:\.\d{1,2})?)\s*(?:dollars|bucks)?\b/i);
  return verbal ? Number(verbal[1].replace(/,/g, "")) : 0;
}

function interpretEquipment(
  transcript: string,
  text: string,
  specs: Record<string, string>,
  matchups: TechCartEquipmentMatchup[],
  trainingTerms: TechCartTrainingTerm[],
) {
  if (!looksLikeEquipment(text)) return [];

  const desired = extractEquipmentIntent(text);
  const targetBrands = ["carrier", "day and night", "goodman"];
  const filtered = matchups.filter((m) => targetBrands.includes(normalizeBrand(m.brand)));
  const scored = filtered
    .map((matchup) => ({ matchup, score: scoreEquipmentMatchup(matchup, desired, text, trainingTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.matchup || null;
  if (!best) {
    const missing = ["brand", "tonnage", "system type", "tier", "location"].filter((field) => !(desired as any)[fieldKey(field)]);
    return [{
      id: "equipment-unmatched",
      sourceType: "equipment" as const,
      sourceId: null,
      catalogItem: null,
      equipmentMatchup: null,
      name: "Equipment quote",
      description: `Tech said: ${transcript.trim()}`,
      unitPrice: 0,
      confidence: "low" as const,
      capturedSpecs: { ...specs, ...compactIntent(desired) },
      missingSpecs: missing.length ? missing : ["catalog match"],
      sourcePhrase: transcript.trim(),
      metadata: { match_reason: "equipment_unmatched", desired },
    }];
  }

  const missingSpecs = missingEquipmentSpecs(desired);
  const confidence = scored[0].score >= 12 && missingSpecs.length === 0 ? "high" : scored[0].score >= 8 ? "medium" : "low";

  return [{
    id: `equipment-${best.id}`,
    sourceType: "equipment" as const,
    sourceId: best.id,
    catalogItem: null,
    equipmentMatchup: best,
    name: buildEquipmentName(best, desired),
    description: buildEquipmentDescription(best, transcript),
    unitPrice: Number(best.total_price || 0),
    confidence,
    capturedSpecs: { ...specs, ...compactIntent(desired) },
    missingSpecs,
    sourcePhrase: transcript.trim(),
    metadata: buildEquipmentMetadata(best, desired, scored[0].score),
  }];
}

function buildRepairMatch(
  intent: RepairIntentDefinition,
  catalogItem: TechCartRepairCatalogItem | null,
  transcript: string,
  specs: Record<string, string>,
): TechCartMatch {
  const missingSpecs = (intent.requiredSpecs || []).filter((spec) => !specs[spec]);
  const itemName = catalogItem?.name || intent.label;
  return {
    id: `repair-${intent.id}-${catalogItem?.id || "custom"}`,
    sourceType: "repair",
    sourceId: catalogItem?.id || null,
    catalogItem,
    name: buildMatchedName(itemName, specsForRepairName(catalogItem, specs)),
    description: buildRepairDescription(catalogItem, specs, transcript),
    unitPrice: Number(catalogItem?.base_price || catalogItem?.member_price || 0),
    confidence: catalogItem ? (missingSpecs.length > 0 ? "medium" : "high") : "low",
    capturedSpecs: specs,
    missingSpecs,
    sourcePhrase: transcript.trim(),
    metadata: {
      match_reason: "repair_intent",
      intent: intent.id,
      category: catalogItem?.category || null,
    },
  };
}

function normalizeSpeech(value: string) {
  return value
    .toLowerCase()
    .replace(/day\s*&\s*night/g, "day and night")
    .replace(/\bdual run capacitor\b/g, "dual run cap")
    .replace(/\bmicro farad\b/g, "microfarad")
    .replace(/\bhorse power\b/g, "horsepower")
    .replace(/\bup flow\b/g, "upflow")
    .replace(/\bdown flow\b/g, "downflow")
    .replace(/\btwo stage\b/g, "two-stage")
    .replace(/\b2 stage\b/g, "two-stage");
}

function findIntentRepairItem(
  intent: RepairIntentDefinition,
  items: TechCartRepairCatalogItem[],
  text: string,
  trainingTerms: TechCartTrainingTerm[],
) {
  const scored = scoreRepairCatalog(text, items.filter((item) => intent.catalogNeedle.test(searchableRepairText(item))), trainingTerms);
  return scored[0]?.item || items.find((item) => intent.catalogNeedle.test(searchableRepairText(item))) || null;
}

function scoreRepairCatalog(text: string, items: TechCartRepairCatalogItem[], trainingTerms: TechCartTrainingTerm[] = []) {
  return items
    .map((item) => ({ item, score: scoreRepairItem(text, item, trainingTerms) }))
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score);
}

function scoreRepairItem(text: string, item: TechCartRepairCatalogItem, trainingTerms: TechCartTrainingTerm[] = []) {
  let score = 0;
  const haystack = searchableRepairText(item).toLowerCase();
  const words = importantWords(item.name);
  for (const word of words) {
    if (word.length >= 4 && text.includes(word)) score += 2;
  }
  for (const keyword of item.keywords || []) {
    const normalized = normalizeSpeech(String(keyword));
    if (!normalized || normalized.length < 3) continue;
    if (text.includes(normalized)) score += normalized.includes(" ") ? 6 : 4;
  }
  score += scoreTrainingTerms(text, trainingTerms, "repair", item.id);
  if (/\brun cap\b|\bdual run cap\b/.test(text) && haystack.includes("capacitor")) score += 8;
  if (/\btwo-pole\b|\bsingle-pole\b|\bcontactor\b/.test(text) && haystack.includes("contactor")) score += 8;
  if (/\bcondenser fan motor\b|\boutdoor fan motor\b/.test(text) && haystack.includes("condenser fan motor")) score += 8;
  return score;
}

function searchableRepairText(item: TechCartRepairCatalogItem) {
  return [item.name, item.category, item.tech_description, item.customer_description, (item.keywords || []).join(" ")]
    .filter(Boolean)
    .join(" ");
}

function importantWords(value: string | null | undefined) {
  return normalizeSpeech(value || "")
    .split(/[^a-z0-9/.-]+/)
    .filter((word) => word.length >= 4 && !["replacement", "repair", "service"].includes(word));
}

function inferMissingRepairSpecs(
  item: TechCartRepairCatalogItem,
  text: string,
  specs: Record<string, string>,
) {
  const searchable = searchableRepairText(item).toLowerCase();
  if (searchable.includes("capacitor") || /\brun cap\b/.test(text)) return specs.mfd ? [] : ["mfd"];
  if (searchable.includes("contactor")) return specs.poles ? [] : ["poles"];
  if (searchable.includes("motor")) {
    return ["horsepower", "voltage"].filter((field) => !specs[field]);
  }
  return [];
}

function extractSpecs(text: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const capacitor =
    text.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:x|by|\/|-)\s*(\d{1,2}(?:\.\d+)?)\s*(?:mfd|uf|microfarad|run cap|cap|capacitor)?\b/i) ||
    text.match(/\b(\d{1,3}(?:\.\d+)?)\s*(mfd|uf|microfarad)s?\b/i);
  if (capacitor) {
    specs.mfd = capacitor[2] && !/mfd|uf|microfarad/i.test(capacitor[2])
      ? `${capacitor[1]}/${capacitor[2]} MFD`
      : `${capacitor[1]} MFD`;
  }

  const hp = text.match(/\b(1\/4|1\/3|1\/2|3\/4|\d(?:\.\d+)?|one-third|one third|third|quarter|one-quarter|one quarter|half|one-half|one half|three-quarter|three quarter)\s*(hp|horsepower)\b/i);
  if (hp) specs.horsepower = `${NUMBER_WORDS[hp[1].toLowerCase()] || hp[1]} HP`;

  const voltage = text.match(/\b(24|120|208|230|240|277|460)\s*(v|volt|volts)\b/i);
  if (voltage) specs.voltage = `${voltage[1]}V`;

  const poles = text.match(/\b(single|one|1|two|2)\s*-?\s*pole\b/i);
  if (poles) specs.poles = /two|2/i.test(poles[1]) ? "Two-pole" : "Single-pole";

  const tonnage = text.match(/\b(1\.5|2\.5|3\.5|1|2|3|4|5)\s*(ton|tons|tonne|tonnage)\b/i);
  if (tonnage) specs.tonnage = `${tonnage[1]} Ton`;

  return specs;
}

function specsForRepairName(item: TechCartRepairCatalogItem | null, specs: Record<string, string>) {
  const text = searchableRepairText(item || { id: "", name: "" }).toLowerCase();
  return {
    mfd: text.includes("capacitor") ? specs.mfd : undefined,
    horsepower: text.includes("motor") ? specs.horsepower : undefined,
    voltage: text.includes("motor") ? specs.voltage : undefined,
    poles: text.includes("contactor") ? specs.poles : undefined,
  } as Record<string, string>;
}

function buildMatchedName(name: string, specs: Record<string, string>) {
  const specText = [specs.mfd, specs.horsepower, specs.voltage, specs.poles].filter(Boolean).join(" ");
  return specText ? `${name} (${specText})` : name;
}

function buildRepairDescription(
  catalogItem: TechCartRepairCatalogItem | null,
  specs: Record<string, string>,
  transcript: string,
) {
  const base = catalogItem?.customer_description || catalogItem?.tech_description || null;
  const specText = Object.entries(specs)
    .filter(([key]) => ["mfd", "horsepower", "voltage", "poles"].includes(key))
    .map(([, value]) => value)
    .filter(Boolean)
    .join(", ");
  const fieldNote = transcript.trim();
  return [base, specText ? `Field specs: ${specText}.` : null, fieldNote ? `Tech said: ${fieldNote}` : null]
    .filter(Boolean)
    .join(" ");
}

function looksLikeEquipment(text: string) {
  return /\b(carrier|day and night|goodman|infinity|performance|comfort|greenspeed|gas heat|electric heat|heat pump|straight cool|system|condenser|air handler|furnace|attic|closet|horizontal|upflow|vertical)\b/i.test(text);
}

function extractEquipmentIntent(text: string) {
  return {
    brand: extractBrand(text),
    tonnage: extractTonnage(text),
    systemType: extractSystemType(text),
    tier: extractTier(text),
    application: extractApplication(text),
    stages: extractStages(text),
  };
}

function extractBrand(text: string) {
  if (/\bcarrier\b/.test(text)) return "carrier";
  if (/\bday and night\b|\bday n night\b|\bday night\b|\bicp\b/.test(text)) return "day and night";
  if (/\bgoodman\b/.test(text)) return "goodman";
  return null;
}

function extractTonnage(text: string) {
  const match = text.match(/\b(1\.5|2\.5|3\.5|1|2|3|4|5)\s*(ton|tons)\b/i);
  return match ? Number(match[1]) : null;
}

function extractSystemType(text: string) {
  if (/\bheat pump\b/.test(text)) return "heat_pump";
  if (/\bdual fuel\b/.test(text)) return "dual_fuel";
  if (/\bgas heat\b|\bgas system\b|\bfurnace\b/.test(text)) return "gas_heat";
  if (/\belectric heat\b|\belectric system\b|\bstraight cool\b|\bair handler\b/.test(text)) return "electric";
  return null;
}

function extractTier(text: string) {
  if (/\bgreenspeed\b|\bultimate\b/.test(text)) return "Ultimate";
  if (/\binfinity\b|\bbest\b|\bvariable\b|\bvariable-speed\b/.test(text)) return "Best";
  if (/\bperformance\b|\bbetter\b|\btwo-stage\b|\b2-stage\b/.test(text)) return "Better";
  if (/\bcomfort\b|\bgood\b/.test(text)) return "Good";
  if (/\bvalue plus\b|\bs5\b/.test(text)) return "Value Plus";
  if (/\bvalue\b|\bs4\b|\bbasic\b/.test(text)) return "Value";
  return null;
}

function extractStages(text: string) {
  if (/\btwo-stage\b|\b2-stage\b|\btwo stage\b/.test(text)) return "two-stage";
  if (/\bvariable\b|\binverter\b|\binfinity\b|\bgreenspeed\b/.test(text)) return "variable";
  if (/\bsingle-stage\b|\bsingle stage\b/.test(text)) return "single-stage";
  return null;
}

function extractApplication(text: string) {
  if (/\battic\b|\bhorizontal\b|\bsideways\b/.test(text)) return "Horizontal";
  if (/\bcloset\b|\bupflow\b|\bup flow\b|\bvertical\b/.test(text)) return "Vertical";
  if (/\bmultiposition\b|\bmulti-position\b/.test(text)) return "Multiposition";
  return null;
}

function scoreEquipmentMatchup(
  matchup: TechCartEquipmentMatchup,
  desired: ReturnType<typeof extractEquipmentIntent>,
  text: string,
  trainingTerms: TechCartTrainingTerm[] = [],
) {
  let score = 0;
  const brand = normalizeBrand(matchup.brand);
  const application = normalizeSpeech(matchup.application || "");
  const haystack = normalizeSpeech([
    matchup.brand,
    matchup.tier,
    matchup.system_type,
    matchup.application,
    matchup.condenser_model,
    matchup.furnace_model,
    matchup.coil_model,
    matchup.notes,
  ].filter(Boolean).join(" "));

  if (desired.brand && brand === desired.brand) score += 5;
  if (desired.tonnage && Number(matchup.tonnage) === desired.tonnage) score += 5;
  if (desired.systemType && matchup.system_type === desired.systemType) score += 5;
  if (desired.tier && equipmentTierMatches(desired.tier, matchup.tier)) score += 5;
  if (desired.application && applicationMatches(desired.application, matchup.application)) score += 3;
  if (desired.stages && haystack.includes(desired.stages)) score += 2;
  if (desired.tier === "Better" && /\bperformance\b|\btwo-stage\b/.test(text) && equipmentTierMatches("Better", matchup.tier)) score += 3;
  if (desired.tier === "Best" && /\binfinity\b|\bvariable\b/.test(text) && equipmentTierMatches("Best", matchup.tier)) score += 3;
  score += scoreTrainingTerms(text, trainingTerms, "equipment", matchup.id);
  return score;
}

function scoreTrainingTerms(
  text: string,
  trainingTerms: TechCartTrainingTerm[],
  targetType: TechCartTrainingTerm["target_type"],
  targetId: string,
) {
  let score = 0;
  for (const term of trainingTerms) {
    if (term.target_type !== targetType || term.target_id !== targetId) continue;
    const phrase = normalizeSpeech(term.phrase || "").trim();
    if (!phrase || phrase.length < 2) continue;
    if (text.includes(phrase)) {
      const confidence = typeof term.confidence === "number" ? term.confidence : 1;
      score += phrase.includes(" ") ? 10 * confidence : 6 * confidence;
    }
  }
  return score;
}

function normalizeBrand(value: string | null | undefined) {
  const text = normalizeSpeech(value || "");
  if (text.includes("carrier")) return "carrier";
  if (text.includes("day and night") || text.includes("icp")) return "day and night";
  if (text.includes("goodman")) return "goodman";
  return text.trim();
}

function equipmentTierMatches(desired: string, actual: string | null | undefined) {
  const desiredRank = equipmentTierRank(desired);
  const actualRank = equipmentTierRank(actual);
  return Boolean(desiredRank && actualRank && desiredRank === actualRank);
}

function equipmentTierRank(value: string | null | undefined) {
  const text = normalizeSpeech(value || "");
  if (text.includes("greenspeed") || text.includes("ultimate")) return "ultimate";
  if (text.includes("infinity") || text.includes("best") || text.includes("variable")) return "best";
  if (text.includes("performance") || text.includes("better") || text.includes("two-stage")) return "better";
  if (text.includes("comfort") || text.includes("good")) return "good";
  if (text.includes("value plus")) return "value-plus";
  if (text.includes("value") || text.includes("basic")) return "value";
  return "";
}

function applicationMatches(desired: string, actual: string | null | undefined) {
  const actualText = normalizeSpeech(actual || "");
  if (!actualText) return false;
  if (actualText.includes("multiposition")) return true;
  if (desired === "Horizontal") return actualText.includes("horizontal");
  if (desired === "Vertical") return actualText.includes("vertical");
  return actualText.includes(normalizeSpeech(desired));
}

function missingEquipmentSpecs(desired: ReturnType<typeof extractEquipmentIntent>) {
  const missing: string[] = [];
  if (!desired.brand) missing.push("brand");
  if (!desired.tonnage) missing.push("tonnage");
  if (!desired.systemType) missing.push("system type");
  if (!desired.tier) missing.push("tier");
  if (!desired.application) missing.push("location");
  return missing;
}

function equipmentQuestion(itemName: string, missing: string[]): TechCartFollowUpQuestion {
  const first = missing[0];
  if (first === "brand") {
    return { id: "equipment-brand", itemName, question: "Which brand should I quote?", options: ["Carrier", "Day and Night", "Goodman"] };
  }
  if (first === "tonnage") {
    return { id: "equipment-tonnage", itemName, question: "What size system?", options: ["2 Ton", "2.5 Ton", "3 Ton", "3.5 Ton", "4 Ton", "5 Ton"] };
  }
  if (first === "system type") {
    return { id: "equipment-type", itemName, question: "What type of system?", options: ["Gas heat", "Electric heat", "Heat pump", "Dual fuel"] };
  }
  if (first === "tier") {
    return { id: "equipment-tier", itemName, question: "Which comfort level?", options: ["Good", "Better / Performance", "Best / Infinity", "Ultimate / Greenspeed"] };
  }
  return { id: "equipment-location", itemName, question: "Where is the indoor unit?", options: ["Attic / horizontal", "Closet / upflow", "Vertical", "Multiposition"] };
}

function buildEquipmentName(matchup: TechCartEquipmentMatchup, desired: ReturnType<typeof extractEquipmentIntent>) {
  const systemType = SYSTEM_TYPE_LABELS[matchup.system_type || ""] || matchup.system_type || desired.systemType || "System";
  const location = desired.application ? locationLabel(desired.application) : locationLabel(matchup.application || "");
  return [
    matchup.brand,
    matchup.tonnage ? `${matchup.tonnage} Ton` : null,
    matchup.tier,
    systemType,
    location,
  ].filter(Boolean).join(" ");
}

function locationLabel(value: string | null | undefined) {
  const text = normalizeSpeech(value || "");
  if (text.includes("horizontal")) return "Horizontal / attic";
  if (text.includes("vertical")) return "Vertical / closet";
  if (text.includes("multiposition")) return "Multiposition";
  return value || "";
}

function buildEquipmentDescription(matchup: TechCartEquipmentMatchup, transcript: string) {
  const specs = [
    matchup.seer2 ? `${matchup.seer2} SEER2` : null,
    matchup.eer2 ? `${matchup.eer2} EER2` : null,
    matchup.ahri_number ? `AHRI ${matchup.ahri_number}` : null,
    matchup.cps_rebate_tier ? `CPS ${matchup.cps_rebate_tier}` : null,
  ].filter(Boolean).join(", ");
  const models = [matchup.condenser_model, matchup.furnace_model, matchup.coil_model].filter(Boolean).join(" + ");
  return [
    "Matched comfort system for customer approval.",
    specs ? `Specs: ${specs}.` : null,
    models ? `Models: ${models}.` : null,
    `Tech said: ${transcript.trim()}`,
  ].filter(Boolean).join(" ");
}

function buildEquipmentMetadata(
  matchup: TechCartEquipmentMatchup,
  desired: ReturnType<typeof extractEquipmentIntent>,
  score: number,
) {
  return {
    match_reason: "equipment_matchup_field_language",
    score,
    desired,
    ahri_number: matchup.ahri_number,
    seer2: matchup.seer2,
    eer2: matchup.eer2,
    hspf2: matchup.hspf2,
    cooling_cap: matchup.cooling_cap,
    afue: matchup.afue,
    tonnage: matchup.tonnage,
    brand: matchup.brand,
    system_type: matchup.system_type,
    system_type_label: SYSTEM_TYPE_LABELS[matchup.system_type || ""] || matchup.system_type,
    tier: matchup.tier,
    application: matchup.application,
    condenser_model: matchup.condenser_model,
    furnace_model: matchup.furnace_model,
    coil_model: matchup.coil_model,
    heat_kit: matchup.heat_kit,
    ahri_certificate_path: matchup.ahri_certificate_path,
    factory_rebate_price: matchup.factory_rebate_price,
    monthly_payment: matchup.monthly_payment,
    monthly_payment_120: matchup.monthly_payment_120,
    cps_tonnage: matchup.cps_tonnage,
    early_rebate: matchup.early_rebate,
    burnout_rebate: matchup.burnout_rebate,
    cps_rebate_tier: matchup.cps_rebate_tier,
    features_benefits: matchup.features_benefits,
    model_summary: [matchup.condenser_model, matchup.furnace_model, matchup.coil_model].filter(Boolean).join(" + "),
  };
}

function compactIntent(desired: ReturnType<typeof extractEquipmentIntent>) {
  return Object.fromEntries(
    Object.entries(desired)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );
}

function fieldKey(label: string) {
  if (label === "system type") return "systemType";
  if (label === "location") return "application";
  return label;
}
