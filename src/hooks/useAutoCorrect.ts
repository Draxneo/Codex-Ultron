import { useCallback, useRef, useEffect } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";

/**
 * Autocorrect modes:
 * - "off"         — No JS corrections at all. Native browser/OS spellcheck only.
 * - "safe"        — Only fix obvious typos (fat-finger swaps, HVAC terms). No contraction
 *                   rewrites, no slang normalization, no fuzzy matching.
 * - "aggressive"  — Full dictionary + fuzzy + slang + phrase corrections (legacy behavior).
 * - "native-only" — Alias for "off" (kept for clarity in call sites).
 */
export type AutoCorrectMode = "off" | "safe" | "aggressive" | "native-only";

// ── Typo-only corrections (safe mode) ──
// These are words that are NEVER valid English — pure misspellings.
const SAFE_CORRECTIONS: Record<string, string> = {
  // Common misspellings
  teh: "the", thier: "their", recieve: "receive", seperate: "separate",
  occured: "occurred", accomodate: "accommodate", occurence: "occurrence",
  becuase: "because", beleive: "believe", acheive: "achieve",
  adress: "address", begining: "beginning", calender: "calendar",
  catagory: "category", comittee: "committee", completly: "completely",
  concious: "conscious", convinient: "convenient", embarass: "embarrass",
  enviroment: "environment", explaination: "explanation", familar: "familiar",
  goverment: "government", grammer: "grammar", garauntee: "guarantee",
  harrass: "harass", immediatlely: "immediately", independant: "independent",
  knowlege: "knowledge", liason: "liaison", libary: "library",
  millenium: "millennium", mispell: "misspell",
  noticable: "noticeable", occassion: "occasion", particualr: "particular",
  persistant: "persistent", posession: "possession", prefered: "preferred",
  proffessional: "professional", publically: "publicly",
  refered: "referred", relevent: "relevant", rythm: "rhythm",
  scedule: "schedule", succesful: "successful", suprise: "surprise",
  truely: "truly", wierd: "weird", writting: "writing",
  availble: "available", availabe: "available", avaiable: "available",
  custmer: "customer", cusotmer: "customer", cutomer: "customer",
  equipmnet: "equipment", equipemnt: "equipment",
  furnance: "furnace", furncae: "furnace",
  whcih: "which", wihch: "which",
  peice: "piece", peple: "people", pepole: "people",
  diffrent: "different", differnt: "different",
  togther: "together", togehter: "together",
  somthing: "something", somethign: "something",
  everthing: "everything", everythign: "everything",
  nothign: "nothing", anythign: "anything",
  remeber: "remember", remmeber: "remember",
  intrested: "interested", instrested: "interested",
  beautful: "beautiful", beautifull: "beautiful",
  necesary: "necessary", nessecary: "necessary", neccessary: "necessary",
  reccomend: "recommend", recomend: "recommend",
  tomorow: "tomorrow",
  untill: "until",
  // Fat-finger swaps
  adn: "and", nad: "and", anf: "and",
  jsut: "just", juts: "just",
  ahve: "have", hvae: "have",
  liek: "like", lkie: "like",
  woudl: "would", wuold: "would",
  coudl: "could", cuold: "could",
  shoudl: "should", shuold: "should",
  abotu: "about", abuot: "about",
  knwo: "know", konw: "know",
  watn: "want", wnat: "want",
  nede: "need", neeed: "need",
  rigth: "right", rihgt: "right",
  worng: "wrong", wrogn: "wrong",
  sicne: "since", snce: "since",
  alredy: "already", alreayd: "already", alraeady: "already",
  agian: "again", agan: "again",
  evrey: "every", eveyr: "every",
  mayeb: "maybe", mabye: "maybe",
  realy: "really", relly: "really", raelly: "really",
  ussually: "usually", usally: "usually", usaully: "usually",
  actaully: "actually", actualy: "actually", acutally: "actually",
  problam: "problem", probelm: "problem",
  questoin: "question", quesiton: "question",
  anser: "answer", answre: "answer",
  beause: "because", becasue: "because", becuaes: "because",
  poeple: "people", peopel: "people",
  betwen: "between", bewteen: "between",
  throught: "through", throuhg: "through",
  belive: "believe", beleieve: "believe",
  recived: "received", recevied: "received",
  comapny: "company", compnay: "company",
  nuber: "number", numbre: "number", numbr: "number",
  sevice: "service", serivce: "service", servcie: "service",
  mesage: "message", messgae: "message", messge: "message",
  pleaes: "please", plase: "please", plesae: "please",
  okeay: "okay", okya: "okay", oaky: "okay",
  thnk: "think", thnak: "thank", thnaks: "thanks",
  yeha: "yeah", yaeh: "yeah",
  // Double-letter mistakes
  didd: "did", gott: "got", justt: "just", withh: "with",
  fromm: "from", thatt: "that", whenn: "when", thenn: "then",
  beenn: "been", havee: "have", heree: "here", somee: "some",
  likee: "like", makee: "make", takee: "take", timee: "time",
  donee: "done", gonee: "gone", comee: "come", givee: "give",
  // Days & months misspellings
  tommorow: "tomorrow", tommorrow: "tomorrow", tomarrow: "tomorrow",
  comming: "coming", runing: "running", stoping: "stopping",
  wensday: "Wednesday", wendsday: "Wednesday", wedensday: "Wednesday",
  thurday: "Thursday", thrusday: "Thursday",
  febuary: "February", feburary: "February",
  // HVAC acronyms (always safe to uppercase)
  hvac: "HVAC", seer: "SEER", seer2: "SEER2", hspf: "HSPF", hspf2: "HSPF2",
  afue: "AFUE", btu: "BTU", btus: "BTUs", eer: "EER", eer2: "EER2",
  ahri: "AHRI", epa: "EPA", nate: "NATE", osha: "OSHA", doe: "DOE",
  cfm: "CFM", psi: "PSI", kwh: "kWh", merv: "MERV", hepa: "HEPA",
  r22: "R-22", r410a: "R-410A", r32: "R-32", r454b: "R-454B",
  ahu: "AHU", vrf: "VRF", vav: "VAV", rtu: "RTU", ptac: "PTAC",
  txv: "TXV", eev: "EEV", iaq: "IAQ", erv: "ERV", hrv: "HRV",
  eta: "ETA", asap: "ASAP", fyi: "FYI",
  cop: "COP", ach: "ACH", dx: "DX",
  // HVAC equipment misspellings
  thermastat: "thermostat", thermosat: "thermostat", thermstat: "thermostat",
  thermostst: "thermostat", thermsstat: "thermostat", thermostate: "thermostat",
  compresser: "compressor", comprssor: "compressor", compreesor: "compressor",
  condensor: "condenser", condensser: "condenser", condeser: "condenser", conadenser: "condenser",
  refridgerant: "refrigerant", refrigerent: "refrigerant", refirgerant: "refrigerant",
  refirgent: "refrigerant", refrigrant: "refrigerant", refridgrant: "refrigerant",
  capaciter: "capacitor", capicator: "capacitor", capcitor: "capacitor", capactior: "capacitor",
  contactar: "contactor", contater: "contactor", conactor: "contactor",
  blowor: "blower", blowre: "blower", blowr: "blower",
  economiser: "economizer", economzer: "economizer",
  humidifer: "humidifier", dehumidifer: "dehumidifier",
  humidifyer: "humidifier", dehumidifyer: "dehumidifier",
  evaporater: "evaporator", evaportor: "evaporator", evaporatr: "evaporator",
  ductowrk: "ductwork", ductwrok: "ductwork", ductwrk: "ductwork", ductwerk: "ductwork",
  ariflow: "airflow", airfow: "airflow", airflwo: "airflow",
  pressue: "pressure", presure: "pressure", presssure: "pressure",
  vaccum: "vacuum", vacum: "vacuum", vaccuum: "vacuum", vacuem: "vacuum",
  tonage: "tonnage", tonnge: "tonnage",
  maintenace: "maintenance", maintanance: "maintenance", maintnance: "maintenance",
  maintainence: "maintenance", maintence: "maintenance",
  waranty: "warranty", warrnty: "warranty", warrantee: "warranty",
  insepction: "inspection", inpection: "inspection", inspecton: "inspection",
  diagnositc: "diagnostic", diagnosic: "diagnostic", diagnotic: "diagnostic",
  troubleshoting: "troubleshooting", troublshooting: "troubleshooting",
  // HVAC brands
  lennox: "Lennox", trane: "Trane", carrier: "Carrier",
  goodman: "Goodman", rheem: "Rheem", ruud: "Ruud",
  daikin: "Daikin", mitsubishi: "Mitsubishi", fujitsu: "Fujitsu",
  amana: "Amana", bosch: "Bosch", bryant: "Bryant",
  honeywell: "Honeywell", ecobee: "ecobee", emerson: "Emerson",
  copeland: "Copeland", danfoss: "Danfoss",
  aprilaire: "Aprilaire",
  // Business terms misspellings
  apointment: "appointment", appoitment: "appointment", appointmnt: "appointment",
  custoemr: "customer", clinet: "client",
  schdule: "schedule", schudle: "schedule", schedle: "schedule",
  scheudled: "scheduled", shceduled: "scheduled",
  reciept: "receipt", recipt: "receipt", receit: "receipt",
  pament: "payment", payemnt: "payment", paymnet: "payment",
  dispach: "dispatch", dispatcch: "dispatch", dispath: "dispatch",
  technican: "technician", technicain: "technician", technicen: "technician",
  technichan: "technician", techincian: "technician",
  estmate: "estimate", estiamte: "estimate", estimte: "estimate",
  invoce: "invoice", invocie: "invoice", invioce: "invoice",
  propsal: "proposal", prposal: "proposal", proposle: "proposal",
  definately: "definitely", defintely: "definitely", definetly: "definitely",
};

// ── AGGRESSIVE-only additions (contractions, slang, phrases) ──
// These are REAL words being changed to other words — risky for manual typing.
const AGGRESSIVE_ONLY_CORRECTIONS: Record<string, string> = {
  // Contractions (were→we're, lets→let's, etc.) — DANGEROUS
  dont: "don't", cant: "can't", wont: "won't", didnt: "didn't",
  doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", werent: "weren't",
  havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", wouldnt: "wouldn't",
  couldnt: "couldn't", shouldnt: "shouldn't", arent: "aren't",
  im: "I'm", ive: "I've", ill: "I'll", id: "I'd",
  youre: "you're", youve: "you've", youll: "you'll", youd: "you'd",
  theyre: "they're", theyve: "they've", theyll: "they'll", theyd: "they'd",
  were: "we're", weve: "we've", wed: "we'd", well: "we'll",
  hes: "he's", shes: "she's", its: "it's",
  whats: "what's", thats: "that's", whos: "who's",
  heres: "here's", theres: "there's", wheres: "where's",
  lets: "let's", wouldve: "would've", couldve: "could've", shouldve: "should've",
  mustve: "must've", mightve: "might've",
  aint: "ain't", wasent: "wasn't", doenst: "doesn't",
  // Slang → proper
  alot: "a lot", gonna: "going to", wanna: "want to",
  ur: "your", u: "you", r: "are", thx: "thanks", pls: "please",
  bc: "because", b4: "before", nvm: "never mind",
  idk: "I don't know", imo: "IMO", tbh: "to be honest",
  smh: "shaking my head", brb: "be right back", omw: "on my way",
  lmk: "let me know", np: "no problem",
  // South Texas slang
  fixin: "fixing", fixinto: "fixing to", finna: "fixing to",
  yall: "y'all", yalls: "y'all's",
  tryna: "trying to", bouta: "about to", outta: "out of",
  supposably: "supposedly", acrost: "across",
  heighth: "height", irregardless: "regardless",
  musta: "must have", coulda: "could have", woulda: "would have", shoulda: "should have",
  oughta: "ought to", gotta: "got to", hafta: "have to",
  kinda: "kind of", sorta: "sort of", lotta: "lot of",
  thru: "through", tho: "though",
  prolly: "probably",
  cuz: "because", dun: "done",
};

// Multi-word phrase corrections — aggressive only
const PHRASE_CORRECTIONS: [RegExp, string][] = [
  [/\balot\b/gi, "a lot"],
  [/\bcould of\b/gi, "could have"],
  [/\bwould of\b/gi, "would have"],
  [/\bshould of\b/gi, "should have"],
  [/\bmust of\b/gi, "must have"],
  [/\bmight of\b/gi, "might have"],
  [/\bsuppose to\b/gi, "supposed to"],
  [/\buse to\b/gi, "used to"],
];

// ── Levenshtein distance for fuzzy matching (aggressive only) ──
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 2) return 3;
  const prev = new Uint8Array(n + 1);
  const curr = new Uint8Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    prev.set(curr);
  }
  return prev[n];
}

import { WORD_LIST } from "@/data/wordList";
const CORRECT_WORDS_SET = new Set<string>(WORD_LIST);
Object.values(SAFE_CORRECTIONS).forEach(w => CORRECT_WORDS_SET.add(w.toLowerCase()));
Object.values(AGGRESSIVE_ONLY_CORRECTIONS).forEach(w => CORRECT_WORDS_SET.add(w.toLowerCase()));
const FUZZY_TARGETS = Array.from(CORRECT_WORDS_SET);

const FUZZY_SKIP = new Set([
  "a", "i", "is", "it", "in", "on", "to", "do", "go", "no", "so", "up",
  "an", "as", "at", "be", "by", "he", "if", "me", "my", "of", "or", "we",
  "am", "us", "ok", "hi", "ac", "pm",
]);

function fuzzyCorrect(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower.length < 4) return null;
  if (CORRECT_WORDS_SET.has(lower)) return null;
  if (FUZZY_SKIP.has(lower)) return null;
  if (/^\d/.test(word) || /^[A-Z]{2,}$/.test(word)) return null;

  let bestMatch: string | null = null;
  let bestDist = 3;

  for (const target of FUZZY_TARGETS) {
    if (Math.abs(target.length - lower.length) > 2) continue;
    if (target.length < 4) continue;
    const dist = levenshtein(lower, target);
    if (dist > 0 && dist < bestDist) {
      bestDist = dist;
      bestMatch = target;
      if (dist === 1) break;
    }
  }

  return bestMatch;
}

function correctWord(word: string, mode: AutoCorrectMode): string {
  if (word === "i") return "I";
  const lower = word.toLowerCase();

  // Safe corrections (pure typos)
  const safeReplacement = SAFE_CORRECTIONS[lower];
  if (safeReplacement) {
    if (word === word.toUpperCase() && word.length > 1) return safeReplacement.toUpperCase();
    if (/^[A-Z]/.test(word)) return safeReplacement[0].toUpperCase() + safeReplacement.slice(1);
    return safeReplacement;
  }

  // Aggressive-only corrections (contractions, slang)
  if (mode === "aggressive") {
    const aggressiveReplacement = AGGRESSIVE_ONLY_CORRECTIONS[lower];
    if (aggressiveReplacement) {
      if (word === word.toUpperCase() && word.length > 1) return aggressiveReplacement.toUpperCase();
      if (/^[A-Z]/.test(word)) return aggressiveReplacement[0].toUpperCase() + aggressiveReplacement.slice(1);
      return aggressiveReplacement;
    }

    // Fuzzy match (aggressive only)
    const fuzzy = fuzzyCorrect(word);
    if (fuzzy) {
      if (word === word.toUpperCase() && word.length > 1) return fuzzy.toUpperCase();
      if (/^[A-Z]/.test(word)) return fuzzy[0].toUpperCase() + fuzzy.slice(1);
      return fuzzy;
    }
  }

  return word;
}

function applyCorrections(text: string, cursor: number, mode: AutoCorrectMode): { text: string; diff: number } {
  let result = text;
  let diff = 0;

  // Fix double spaces
  const beforeLen = result.length;
  result = result.replace(/  +/g, " ");
  diff += result.length - beforeLen;

  // Word correction: trigger on word-boundary chars OR a newline (Enter).
  // Detecting a newline lets sentence-rescan fire even when the tech
  // doesn't punctuate — they just hit Enter to start a new line.
  const adjustedCursor = cursor + diff;
  const lastChar = result[adjustedCursor - 1];
  const prevChar = result[adjustedCursor - 2];
  const isWordBoundary = !!lastChar && /[\s.,!?;:\n]/.test(lastChar);
  // "Soft sentence end" = period/!/? OR newline OR a second consecutive space
  // (techs often hit space-space when they pause instead of typing punctuation).
  const isSoftSentenceEnd =
    !!lastChar && (/[.!?\n]/.test(lastChar) || (lastChar === " " && prevChar === " "));

  if (isWordBoundary) {
    const beforeBoundary = result.slice(0, adjustedCursor - 1);
    const match = beforeBoundary.match(/(\S+)$/);
    if (match) {
      const word = match[1];
      const corrected = correctWord(word, mode);
      if (corrected !== word) {
        const wordStart = adjustedCursor - 1 - word.length;
        result = result.slice(0, wordStart) + corrected + result.slice(adjustedCursor - 1);
        diff += corrected.length - word.length;
      }
    }

    // Multi-word phrase corrections (aggressive only)
    if (mode === "aggressive") {
      const preLen = result.length;
      for (const [pattern, replacement] of PHRASE_CORRECTIONS) {
        result = result.replace(pattern, replacement);
      }
      diff += result.length - preLen;
    }

    // Sentence-complete re-scan — fires on real punctuation, newline, or
    // a "double space" pause. Available in BOTH safe and aggressive modes
    // so techs who don't punctuate still get whole-sentence typo fixes
    // (only the dictionary entries for that mode are applied).
    if (isSoftSentenceEnd) {
      const updatedCursor = cursor + diff;
      const textBeforePunct = result.slice(0, updatedCursor);
      const sentenceStartMatch = textBeforePunct.match(/(?:^|[.!?\n]\s*|  )([^.!?\n]*)$/);
      if (sentenceStartMatch) {
        const sentenceStart = updatedCursor - sentenceStartMatch[1].length - 1;
        const sentenceEnd = updatedCursor;
        const sentence = result.slice(Math.max(0, sentenceStart), sentenceEnd);
        const preSentenceLen = result.length;
        const correctedSentence = sentence.replace(/\b([a-zA-Z']+)\b/g, (m) => correctWord(m, mode));
        if (correctedSentence !== sentence) {
          result = result.slice(0, Math.max(0, sentenceStart)) + correctedSentence + result.slice(sentenceEnd);
          diff += result.length - preSentenceLen;
        }
        if (mode === "aggressive") {
          const prePhrase2 = result.length;
          for (const [pattern, replacement] of PHRASE_CORRECTIONS) {
            result = result.replace(pattern, replacement);
          }
          diff += result.length - prePhrase2;
        }
      }
    }
  }

  // Capitalize first character
  if (result.length > 0 && /^[a-z]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }

  // Capitalize after sentence-ending punctuation
  result = result.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());

  return { text: result, diff };
}

/**
 * One-shot full-text correction pass — for "on blur" / "on send" cases
 * where the tech typed without word boundaries so live autocorrect never
 * fired. Walks every word and applies dictionary fixes.
 */
export function runFinalCorrectionPass(text: string, mode: AutoCorrectMode = "safe"): string {
  if (!text || mode === "off" || mode === "native-only") return text;
  let result = text.replace(/  +/g, " ");
  result = result.replace(/\b([a-zA-Z']+)\b/g, (m) => correctWord(m, mode));
  if (mode === "aggressive") {
    for (const [pattern, replacement] of PHRASE_CORRECTIONS) {
      result = result.replace(pattern, replacement);
    }
  }
  if (result.length > 0 && /^[a-z]/.test(result)) {
    result = result[0].toUpperCase() + result.slice(1);
  }
  result = result.replace(/([.!?]\s+)([a-z])/g, (_, p, l) => p + l.toUpperCase());
  return result;
}

/** Direct Android WebView check as inline fallback */
function isAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /android/i.test(ua) || /\bwv\b/.test(ua);
}

/**
 * Returns a wrapped onChange + ref for real-time autocorrect on <input> elements.
 * Defaults to "off" — no JS corrections.
 */
export function useAutoCorrect(
  value: string,
  setValue: (v: string) => void,
  mode: AutoCorrectMode = "off"
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const spellcheckRef = useRef(false);
  const { isNative } = useCapacitor();

  const skipCorrections = mode === "off" || mode === "native-only" || isNative || isAndroidWebView();

  if (skipCorrections) {
    return {
      handleChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
      inputRef,
    };
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const start = () => { composingRef.current = true; };
    const end = () => { composingRef.current = false; };
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === "insertReplacementText" || e.inputType === "deleteByComposition") {
        spellcheckRef.current = true;
      }
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    el.addEventListener("beforeinput", onBeforeInput as EventListener);
    return () => {
      el.removeEventListener("compositionstart", start);
      el.removeEventListener("compositionend", end);
      el.removeEventListener("beforeinput", onBeforeInput as EventListener);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (spellcheckRef.current) {
        spellcheckRef.current = false;
        setValue(e.target.value);
        return;
      }
      if (composingRef.current) {
        setValue(e.target.value);
        return;
      }
      const cursor = e.target.selectionStart ?? e.target.value.length;
      const { text, diff } = applyCorrections(e.target.value, cursor, mode);
      setValue(text);
      if (text !== e.target.value || diff !== 0) {
        requestAnimationFrame(() => {
          const el = inputRef.current ?? e.target;
          el.setSelectionRange(cursor + diff, cursor + diff);
        });
      }
    },
    [setValue, mode]
  );

  return { handleChange, inputRef };
}

/**
 * Returns a wrapped onChange + ref for real-time autocorrect on <textarea> elements.
 * Defaults to "off" — no JS corrections.
 */
export function useAutoCorrectTextarea(
  value: string,
  setValue: (v: string) => void,
  mode: AutoCorrectMode = "off"
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const spellcheckRef = useRef(false);
  const { isNative } = useCapacitor();
  const skipCorrections = mode === "off" || mode === "native-only" || isNative || isAndroidWebView();

  if (skipCorrections) {
    return {
      handleChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value),
      textareaRef,
    };
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = () => { composingRef.current = true; };
    const end = () => { composingRef.current = false; };
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === "insertReplacementText" || e.inputType === "deleteByComposition") {
        spellcheckRef.current = true;
      }
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    el.addEventListener("beforeinput", onBeforeInput as EventListener);
    return () => {
      el.removeEventListener("compositionstart", start);
      el.removeEventListener("compositionend", end);
      el.removeEventListener("beforeinput", onBeforeInput as EventListener);
    };
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (spellcheckRef.current) {
        spellcheckRef.current = false;
        setValue(e.target.value);
        return;
      }
      if (composingRef.current) {
        setValue(e.target.value);
        return;
      }
      const cursor = e.target.selectionStart ?? e.target.value.length;
      const { text, diff } = applyCorrections(e.target.value, cursor, mode);
      setValue(text);
      if (text !== e.target.value || diff !== 0) {
        requestAnimationFrame(() => {
          const el = textareaRef.current ?? e.target;
          el.setSelectionRange(cursor + diff, cursor + diff);
        });
      }
    },
    [setValue, mode]
  );

  return { handleChange, textareaRef };
}

/**
 * Hook for contentEditable divs (email compose).
 * Now accepts a mode — defaults to "safe" for email.
 */
export function useContentEditableAutoCorrect(
  ref: React.RefObject<HTMLDivElement | null>,
  mode: AutoCorrectMode = "safe"
) {
  const { isNative } = useCapacitor();

  useEffect(() => {
    if (mode === "off" || mode === "native-only") return;
    if (isNative || isAndroidWebView()) return;
    const el = ref.current;
    if (!el) return;

    let composing = false;
    const onCompStart = () => { composing = true; };
    const onCompEnd = () => { composing = false; };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (composing) return;
      if (!/^[\s.,!?;: ]$/.test(e.key) && e.key !== "Enter") return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return;

      const text = node.textContent;
      const cursor = range.startOffset;
      const boundaryPos = cursor - 1;
      if (boundaryPos < 0) return;

      const beforeBoundary = text.slice(0, boundaryPos);
      const match = beforeBoundary.match(/(\S+)$/);
      if (!match) return;

      const word = match[1];
      const corrected = correctWord(word, mode);
      if (corrected === word) return;

      const wordStart = boundaryPos - word.length;
      node.textContent = text.slice(0, wordStart) + corrected + text.slice(boundaryPos);

      const newCursor = cursor + (corrected.length - word.length);
      try {
        const newRange = document.createRange();
        newRange.setStart(node, Math.min(newCursor, node.textContent.length));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch {
        // If cursor restore fails, do nothing
      }
    };

    const handleInput = () => {
      if (composing) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.getRangeAt(0).startContainer;
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return;

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const firstTextNode = walker.nextNode();
      if (firstTextNode && firstTextNode.textContent && /^[a-z]/.test(firstTextNode.textContent)) {
        const offset = sel.getRangeAt(0).startOffset;
        firstTextNode.textContent = firstTextNode.textContent[0].toUpperCase() + firstTextNode.textContent.slice(1);
        if (node === firstTextNode) {
          try {
            const r = document.createRange();
            r.setStart(firstTextNode, Math.min(offset, firstTextNode.textContent.length));
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
          } catch { /* ignore */ }
        }
      }
    };

    el.addEventListener("compositionstart", onCompStart);
    el.addEventListener("compositionend", onCompEnd);
    el.addEventListener("keyup", handleKeyUp);
    el.addEventListener("input", handleInput);
    return () => {
      el.removeEventListener("compositionstart", onCompStart);
      el.removeEventListener("compositionend", onCompEnd);
      el.removeEventListener("keyup", handleKeyUp);
      el.removeEventListener("input", handleInput);
    };
  }, [ref, mode]);
}

/**
 * @deprecated Use useContentEditableAutoCorrect hook instead
 */
export function applyContentEditableCorrections(el: HTMLDivElement) {
  // kept for backward compat - now a no-op since hook handles it
}
