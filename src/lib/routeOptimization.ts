export type RouteStopKind = "job" | "estimate";

export type RouteStopInput = {
  id: string;
  kind?: RouteStopKind | "unknown" | null;
  item_type?: RouteStopKind | null;
  customerName?: string | null;
  customer_name?: string | null;
  customerPhone?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  zip?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  technicianId?: string | null;
  technician_id?: string | null;
  technicianName?: string | null;
  assigned_to?: string | null;
  scheduledDate?: string | null;
  scheduled_date?: string | null;
  arrivalStart?: string | null;
  arrival_start?: string | null;
  arrivalEnd?: string | null;
  arrival_end?: string | null;
  scheduledTime?: string | null;
  scheduled_time?: string | null;
  durationMinutes?: number | null;
  duration_minutes?: number | null;
  jobNumber?: string | null;
  job_number?: string | null;
  hcp_job_number?: string | null;
  estimateNumber?: string | null;
  estimate_number?: string | null;
  description?: string | null;
  notes?: string | null;
  note?: string | null;
  hcp_note?: string | null;
  appointmentType?: string | null;
  appointment_type?: string | null;
  timeFlexibility?: RouteTimeFlexibility | string | null;
  time_flexibility?: RouteTimeFlexibility | string | null;
  isFixed?: boolean | null;
  is_fixed?: boolean | null;
  locked?: boolean | null;
  route_locked?: boolean | null;
  priority?: number | null;
  status?: string | null;
};

export type RouteTimeFlexibility = "fixed" | "flexible" | "preferred" | "unknown";

export type RouteFlexibilityDetection = {
  flexibility: RouteTimeFlexibility;
  fixed: boolean;
  source: "structured" | "notes" | "time-window" | "default";
  reasons: string[];
  warnings: string[];
};

export type NormalizedRouteStop = {
  id: string;
  kind: RouteStopKind;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  zip: string | null;
  technicianId: string | null;
  technicianName: string | null;
  technicianKey: string;
  scheduledDate: string | null;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  scheduledTime: string | null;
  durationMinutes: number | null;
  reference: string | null;
  notes: string | null;
  description: string | null;
  status: string | null;
  priority: number;
  flexibility: RouteTimeFlexibility;
  fixed: boolean;
  detection: RouteFlexibilityDetection;
  original: RouteStopInput;
};

export type RouteStopGroup = {
  key: string;
  technicianKey: string;
  technicianName: string | null;
  zip: string | null;
  stops: NormalizedRouteStop[];
};

export type RouteSuggestionStop = {
  stop: NormalizedRouteStop;
  suggestedOrder: number;
  reasons: string[];
  warnings: string[];
};

export type RouteSuggestionGroup = {
  key: string;
  technicianKey: string;
  technicianName: string | null;
  zip: string | null;
  suggestedStops: RouteSuggestionStop[];
  warnings: string[];
};

export type RouteSuggestion = {
  groups: RouteSuggestionGroup[];
  warnings: string[];
};

export type RouteSmsDraftOptions = {
  companyName?: string;
  technicianName?: string;
  arrivalPhrase?: string;
  includeStopNumber?: boolean;
  signature?: string;
};

export type RouteSmsDraft = {
  stopId: string;
  to: string | null;
  body: string;
  editable: true;
  warnings: string[];
};

const DEFAULT_TECHNICIAN_KEY = "unassigned";
const DEFAULT_ZIP_KEY = "unknown-zip";

const FIXED_NOTE_PATTERNS = [
  /\bfixed\b/i,
  /\blocked\b/i,
  /\bdo not move\b/i,
  /\bdon't move\b/i,
  /\bcannot move\b/i,
  /\bcan't move\b/i,
  /\bmust (?:be|start|arrive)\b/i,
  /\bhard (?:window|time)\b/i,
  /\bpromised\b/i,
  /\bcustomer requested\b/i,
  /\bfirst stop\b/i,
  /\blast stop\b/i,
];

const FLEXIBLE_NOTE_PATTERNS = [
  /\bflex(?:ible)?\b/i,
  /\bany ?time\b/i,
  /\bcan move\b/i,
  /\bmove around\b/i,
  /\bopen schedule\b/i,
  /\bwhenever\b/i,
  /\bno preference\b/i,
];

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || null;
}

function normalizeZip(value: string | null | undefined, address?: string | null): string | null {
  const direct = cleanText(value || null);
  const found = direct || cleanText(address || null)?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;
  if (!found) return null;
  const match = found.match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0].slice(0, 5) : found;
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function firstBoolean(...values: Array<boolean | null | undefined>): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function timeValue(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();

  const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridian = match[3]?.toLowerCase();
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function minutesOfDay(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getHours() * 60 + date.getMinutes();

  const match = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridian = match[3]?.toLowerCase();
  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function dateKey(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function referenceForStop(stop: RouteStopInput): string | null {
  const kind = stop.kind || stop.item_type;
  const jobNumber = firstText(stop.jobNumber, stop.job_number, stop.hcp_job_number);
  const estimateNumber = firstText(stop.estimateNumber, stop.estimate_number);
  if (kind === "estimate" && estimateNumber) return `Estimate #${estimateNumber}`;
  if (jobNumber) return `Job #${jobNumber}`;
  if (estimateNumber) return `Estimate #${estimateNumber}`;
  return null;
}

export function detectRouteStopFlexibility(stop: RouteStopInput): RouteFlexibilityDetection {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const structuredFixed = firstBoolean(stop.isFixed, stop.is_fixed, stop.locked, stop.route_locked);
  const flexibility = firstText(
    stop.timeFlexibility as string | null | undefined,
    stop.time_flexibility as string | null | undefined,
    stop.appointmentType,
    stop.appointment_type
  )?.toLowerCase();

  if (structuredFixed != null) {
    reasons.push(structuredFixed ? "Structured field marks this stop fixed." : "Structured field marks this stop movable.");
    return {
      flexibility: structuredFixed ? "fixed" : "flexible",
      fixed: structuredFixed,
      source: "structured",
      reasons,
      warnings,
    };
  }

  if (flexibility) {
    if (/\b(fixed|locked|hard|appointment|scheduled)\b/.test(flexibility)) {
      reasons.push(`Structured flexibility value is "${flexibility}".`);
      return { flexibility: "fixed", fixed: true, source: "structured", reasons, warnings };
    }
    if (/\b(flex(?:ible)?|open|any|movable)\b/.test(flexibility)) {
      reasons.push(`Structured flexibility value is "${flexibility}".`);
      return { flexibility: "flexible", fixed: false, source: "structured", reasons, warnings };
    }
    if (/\b(preferred|request)\b/.test(flexibility)) {
      reasons.push(`Structured flexibility value is "${flexibility}".`);
      return { flexibility: "preferred", fixed: false, source: "structured", reasons, warnings };
    }
  }

  const notes = [stop.notes, stop.note, stop.hcp_note, stop.description].map(cleanText).filter(Boolean).join(" ");
  const noteSaysFixed = FIXED_NOTE_PATTERNS.some((pattern) => pattern.test(notes));
  const noteSaysFlexible = FLEXIBLE_NOTE_PATTERNS.some((pattern) => pattern.test(notes));

  if (noteSaysFixed && noteSaysFlexible) {
    warnings.push("Notes mention both fixed and flexible timing; treating as fixed for safety.");
  }
  if (noteSaysFixed) {
    reasons.push("Notes include fixed-time language.");
    return { flexibility: "fixed", fixed: true, source: "notes", reasons, warnings };
  }
  if (noteSaysFlexible) {
    reasons.push("Notes include flexible-time language.");
    return { flexibility: "flexible", fixed: false, source: "notes", reasons, warnings };
  }

  const start = firstText(stop.arrivalStart, stop.arrival_start, stop.scheduledTime, stop.scheduled_time);
  const end = firstText(stop.arrivalEnd, stop.arrival_end);
  if (start && end) {
    const startTime = minutesOfDay(start);
    const endTime = minutesOfDay(end);
    if (startTime != null && endTime != null && Math.abs(endTime - startTime) <= 90) {
      reasons.push("Arrival window is narrow enough to preserve.");
      return { flexibility: "preferred", fixed: false, source: "time-window", reasons, warnings };
    }
  }
  if (start && !end) {
    reasons.push("Single scheduled time found.");
    return { flexibility: "preferred", fixed: false, source: "time-window", reasons, warnings };
  }

  reasons.push("No timing notes found.");
  return { flexibility: "unknown", fixed: false, source: "default", reasons, warnings };
}

export function normalizeRouteStop(stop: RouteStopInput): NormalizedRouteStop {
  const address = firstText(stop.address);
  const zip = normalizeZip(firstText(stop.zip, stop.postalCode, stop.postal_code), address);
  const technicianId = firstText(stop.technicianId, stop.technician_id);
  const technicianName = firstText(stop.technicianName, stop.assigned_to);
  const detection = detectRouteStopFlexibility(stop);
  const kind = stop.kind === "estimate" || stop.item_type === "estimate" ? "estimate" : "job";

  return {
    id: stop.id,
    kind,
    customerName: firstText(stop.customerName, stop.customer_name),
    customerPhone: firstText(stop.customerPhone, stop.customer_phone),
    address,
    zip,
    technicianId,
    technicianName,
    technicianKey: technicianId || technicianName || DEFAULT_TECHNICIAN_KEY,
    scheduledDate: dateKey(firstText(stop.scheduledDate, stop.scheduled_date)),
    arrivalStart: firstText(stop.arrivalStart, stop.arrival_start),
    arrivalEnd: firstText(stop.arrivalEnd, stop.arrival_end),
    scheduledTime: firstText(stop.scheduledTime, stop.scheduled_time),
    durationMinutes: firstNumber(stop.durationMinutes, stop.duration_minutes),
    reference: referenceForStop(stop),
    notes: firstText(stop.notes, stop.note, stop.hcp_note),
    description: firstText(stop.description),
    status: firstText(stop.status),
    priority: firstNumber(stop.priority) ?? 0,
    flexibility: detection.flexibility,
    fixed: detection.fixed,
    detection,
    original: stop,
  };
}

export function normalizeRouteStops(stops: RouteStopInput[]): NormalizedRouteStop[] {
  return stops.map(normalizeRouteStop);
}

export function groupRouteStopsByTechnicianAndZip(stops: NormalizedRouteStop[]): RouteStopGroup[] {
  const groups = new Map<string, RouteStopGroup>();

  for (const stop of stops) {
    const key = stop.technicianKey;
    const existing = groups.get(key);
    if (existing) {
      existing.stops.push(stop);
      if (existing.zip && stop.zip !== existing.zip) existing.zip = null;
    } else {
      groups.set(key, {
        key,
        technicianKey: stop.technicianKey,
        technicianName: stop.technicianName,
        zip: stop.zip,
        stops: [stop],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    return a.technicianKey.localeCompare(b.technicianKey);
  });
}

function stopSortScore(stop: NormalizedRouteStop): [number, number, string, string] {
  const anchor = stop.fixed ? 0 : stop.flexibility === "preferred" ? 1 : 2;
  const time = timeValue(stop.arrivalStart || stop.scheduledTime) ?? Number.MAX_SAFE_INTEGER;
  return [anchor, time, stop.zip || "", stop.address || stop.customerName || stop.id];
}

function compareSuggestionStops(a: NormalizedRouteStop, b: NormalizedRouteStop): number {
  const left = stopSortScore(a);
  const right = stopSortScore(b);
  for (let i = 0; i < left.length; i += 1) {
    const aValue = left[i];
    const bValue = right[i];
    if (typeof aValue === "number" && typeof bValue === "number") {
      if (aValue !== bValue) return aValue - bValue;
    } else {
      const compared = String(aValue).localeCompare(String(bValue));
      if (compared !== 0) return compared;
    }
  }
  return 0;
}

function warningsForStop(stop: NormalizedRouteStop): string[] {
  const warnings = [...stop.detection.warnings];
  if (!stop.address) warnings.push("Missing address; office needs to check before routing.");
  if (!stop.zip) warnings.push("Missing ZIP; grouped under unknown ZIP.");
  if (!stop.customerPhone) warnings.push("Missing customer phone; SMS draft cannot be addressed.");
  if (stop.technicianKey === DEFAULT_TECHNICIAN_KEY) warnings.push("Missing technician assignment.");
  return warnings;
}

function reasonsForStop(stop: NormalizedRouteStop, previous: NormalizedRouteStop | null): string[] {
  const reasons = [...stop.detection.reasons];
  if (stop.fixed) reasons.push("Placed before flexible stops to protect promised timing.");
  if (!stop.fixed && stop.flexibility === "preferred") reasons.push("Kept near its scheduled time, but can still be adjusted.");
  if (!stop.fixed && stop.flexibility !== "preferred") reasons.push("Flexible stop sorted after fixed anchors.");
  if (previous?.zip && stop.zip && previous.zip === stop.zip) reasons.push(`Kept near another ${stop.zip} stop.`);
  if (previous?.zip && stop.zip && previous.zip !== stop.zip) reasons.push(`ZIP changes from ${previous.zip} to ${stop.zip}.`);
  return reasons;
}

export function buildRouteSuggestion(stops: RouteStopInput[] | NormalizedRouteStop[]): RouteSuggestion {
  const normalized = stops.map((stop) => "detection" in stop ? stop : normalizeRouteStop(stop));
  const groups = groupRouteStopsByTechnicianAndZip(normalized);
  const routeWarnings: string[] = [];

  const suggestionGroups = groups.map((group) => {
    const sorted = [...group.stops].sort(compareSuggestionStops);
    const groupWarnings: string[] = [];
    const suggestedStops = sorted.map((stop, index) => {
      const warnings = warningsForStop(stop);
      if (warnings.length > 0) groupWarnings.push(...warnings.map((warning) => `${stop.id}: ${warning}`));
      return {
        stop,
        suggestedOrder: index + 1,
        reasons: reasonsForStop(stop, index > 0 ? sorted[index - 1] : null),
        warnings,
      };
    });

    return {
      key: group.key,
      technicianKey: group.technicianKey,
      technicianName: group.technicianName,
      zip: group.zip,
      suggestedStops,
      warnings: Array.from(new Set(groupWarnings)),
    };
  });

  for (const group of suggestionGroups) {
    routeWarnings.push(...group.warnings);
  }

  return {
    groups: suggestionGroups,
    warnings: Array.from(new Set(routeWarnings)),
  };
}

function firstName(name: string | null): string {
  return name?.split(/\s+/)[0] || "there";
}

function stopLabel(stop: NormalizedRouteStop): string {
  return stop.reference || (stop.kind === "estimate" ? "your estimate" : "your appointment");
}

export function buildRouteSmsDraftBody(
  stop: NormalizedRouteStop,
  suggestedOrder?: number,
  options: RouteSmsDraftOptions = {}
): string {
  const companyName = options.companyName || "our office";
  const techName = options.technicianName || stop.technicianName || "your technician";
  const arrivalPhrase = options.arrivalPhrase || (
    stop.arrivalStart && stop.arrivalEnd
      ? `between ${formatSmsTime(stop.arrivalStart)} and ${formatSmsTime(stop.arrivalEnd)}`
      : stop.arrivalStart
        ? `around ${formatSmsTime(stop.arrivalStart)}`
        : "during the scheduled window"
  );
  const stopNumber = options.includeStopNumber && suggestedOrder ? ` You are stop ${suggestedOrder} on the route.` : "";
  const signature = options.signature ? ` ${options.signature}` : "";

  return `Hi ${firstName(stop.customerName)}, this is ${companyName}. ${techName} is scheduled for ${stopLabel(stop)} ${arrivalPhrase}.${stopNumber} Reply here if that timing does not work.${signature}`;
}

export function buildRouteSmsDrafts(
  suggestion: RouteSuggestion,
  options: RouteSmsDraftOptions = {}
): RouteSmsDraft[] {
  return suggestion.groups.flatMap((group) =>
    group.suggestedStops.map((suggested) => {
      const warnings = warningsForStop(suggested.stop).filter((warning) => warning.includes("SMS") || warning.includes("phone"));
      return {
        stopId: suggested.stop.id,
        to: suggested.stop.customerPhone,
        body: buildRouteSmsDraftBody(suggested.stop, suggested.suggestedOrder, {
          ...options,
          technicianName: options.technicianName || group.technicianName || undefined,
        }),
        editable: true,
        warnings,
      };
    })
  );
}

export function formatSmsTime(value: string): string {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  }
  return value.trim();
}
