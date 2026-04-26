/**
 * Shared formatting utilities for edge functions.
 * Mirror of src/lib/formatters.ts for Deno edge function usage.
 */

/** Title-case a name, preserving particles like O'Brien, McDonald */
export function formatName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map(word => {
      if (!word) return word;
      if (/^[A-Za-z]['']/u.test(word)) {
        const parts = word.split(/(?<=[''])/);
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
      }
      if (/^mc[a-z]/i.test(word)) {
        return "Mc" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }
      if (/^mac[a-z]/i.test(word) && word.length > 4) {
        return "Mac" + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
      }
      if (/^(la|de)[A-Z]/i.test(word) && word.length > 2) {
        const prefix = word.slice(0, 2);
        return prefix.charAt(0).toUpperCase() + prefix.charAt(1).toLowerCase() +
          word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Title-case a street address, keeping unit/apt abbreviations uppercase */
export function formatAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map(word => {
      const upper = word.toUpperCase();
      if (["N", "S", "E", "W", "NE", "NW", "SE", "SW", "APT", "STE", "BLDG", "FL", "PO", "TX", "CT"].includes(upper)) return upper;
      if (/^\d+(st|nd|rd|th)$/i.test(word)) return word.toLowerCase();
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Title-case a city name */
export function formatCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const trimmed = city.trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Uppercase state abbreviation */
export function formatState(state: string | null | undefined): string | null {
  if (!state) return null;
  return state.trim().toUpperCase() || null;
}

/** Lowercase and trim email */
export function formatEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase() || null;
}

/** Format phone to (XXX) XXX-XXXX */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone.trim();
}

/** Convert any phone format to Twilio E.164: +12105551234 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return null;
}

/** Convert YYYY-MM-DD or ISO timestamp to friendly US format: "Sunday, March 29th" */
export function formatDateUS(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return formatDateFriendly(dateStr) || dateStr;
}

/** Format ISO timestamp to friendly US date + Central Time: "Sunday, March 29th, 2:30 PM" */
export function formatDateTimeUS(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const datePart = formatDateFriendly(isoStr);
    const timePart = formatTimeCentral(isoStr);
    if (datePart && timePart) return `${datePart}, ${timePart}`;
    if (datePart) return datePart;
    if (timePart) return timePart;
    return isoStr;
  } catch {
    return formatDateUS(isoStr);
  }
}

/** Format ISO timestamp to Central Time only: "2:30 PM" */
export function formatTimeCentral(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const utcMs = d.getTime();
    const year = d.getUTCFullYear();
    const mar1 = new Date(Date.UTC(year, 2, 1));
    const mar2ndSun = 8 + ((7 - mar1.getUTCDay()) % 7);
    const dstStart = Date.UTC(year, 2, mar2ndSun, 8);
    const nov1 = new Date(Date.UTC(year, 10, 1));
    const nov1stSun = 1 + ((7 - nov1.getUTCDay()) % 7);
    const dstEnd = Date.UTC(year, 10, nov1stSun, 7);
    const isDST = utcMs >= dstStart && utcMs < dstEnd;
    const c = new Date(utcMs + (isDST ? -5 : -6) * 3600000);
    const h24 = c.getUTCHours();
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 || 12;
    const mi = String(c.getUTCMinutes()).padStart(2, "0");
    return `${h12}:${mi} ${ampm}`;
  } catch {
    return isoStr;
  }
}

/**
 * Get the current date/time in Central Time (America/Chicago) reliably.
 * Works around Deno edge-function environments where Intl.DateTimeFormat
 * timezone support may silently return UTC instead of the requested zone.
 */
export function getCentralNow(): Date {
  const now = new Date();
  const utcMs = now.getTime();
  const year = now.getUTCFullYear();

  // DST starts: 2nd Sunday of March at 2 AM CST = 8 AM UTC
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = 8 + ((7 - mar1.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, mar2ndSun, 8); // 2 AM CST = 8 AM UTC

  // DST ends: 1st Sunday of November at 2 AM CDT = 7 AM UTC
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = Date.UTC(year, 10, nov1stSun, 7); // 2 AM CDT = 7 AM UTC

  const isDST = utcMs >= dstStart && utcMs < dstEnd;
  const offsetMs = (isDST ? -5 : -6) * 3600000;
  return new Date(utcMs + offsetMs);
}

/** Get today's date in YYYY-MM-DD format, Central Time */
export function getCentralToday(): string {
  const c = getCentralNow();
  const y = c.getUTCFullYear();
  const m = String(c.getUTCMonth() + 1).padStart(2, "0");
  const d = String(c.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Get human-readable Central Time strings for system prompt injection */
export function getCentralTimeStrings(): { dayOfWeek: string; localDateStr: string; localTimeStr: string } {
  const c = getCentralNow();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const dayOfWeek = days[c.getUTCDay()];
  const localDateStr = `${months[c.getUTCMonth()]} ${c.getUTCDate()}, ${c.getUTCFullYear()}`;
  const hours24 = c.getUTCHours();
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  const mins = String(c.getUTCMinutes()).padStart(2, "0");
  const localTimeStr = `${hours12}:${mins} ${ampm}`;
  return { dayOfWeek, localDateStr, localTimeStr };
}

/** Human-friendly date: "Sunday, March 29th" — for all customer-facing output */
export function formatDateFriendly(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const ymd = dateStr.split("T")[0];
    const d = new Date(ymd + "T12:00:00Z");
    if (isNaN(d.getTime())) return dateStr;
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const day = d.getUTCDate();
    const suffix = [11,12,13].includes(day) ? "th" : ({1:"st",2:"nd",3:"rd"} as Record<number,string>)[day % 10] || "th";
    return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${day}${suffix}`;
  } catch {
    return dateStr || "";
  }
}

/** Get current Central Time hour/day context for business-hours checks */
export function getCentralHour(): { hour: number; dayOfWeek: number; isWeekend: boolean } {
  const c = getCentralNow();
  const hour = c.getUTCHours();
  const dayOfWeek = c.getUTCDay();
  return { hour, dayOfWeek, isWeekend: dayOfWeek === 0 || dayOfWeek === 6 };
}

/**
 * Detect the correct Central Time UTC offset for a given date string.
 * Returns "-05:00" during CDT (daylight) or "-06:00" during CST (standard).
 * Uses the same DST algorithm as getCentralNow() — ONE source of truth.
 */
export function detectCentralOffset(dateStr: string): "-05:00" | "-06:00" {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T12:00:00Z");
  const utcMs = d.getTime();
  const year = d.getUTCFullYear();

  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = 8 + ((7 - mar1.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, mar2ndSun, 8);

  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = Date.UTC(year, 10, nov1stSun, 7);

  return (utcMs >= dstStart && utcMs < dstEnd) ? "-05:00" : "-06:00";
}

/**
 * Convert a UTC ISO timestamp to its Central-Time YYYY-MM-DD.
 *
 * Critical for "scheduled_date" — HCP returns UTC (e.g. "2026-04-17T01:30Z"),
 * which is Thursday Apr 16 8:30 PM Central. Naive .split("T")[0] would store
 * "2026-04-17" (Friday), pushing late-evening jobs to the next day on tech
 * dashboards. This helper applies the correct CST/CDT offset first.
 */
export function toCentralDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const offset = detectCentralOffset(iso); // "-05:00" or "-06:00"
    const offsetHours = parseInt(offset.slice(0, 3), 10); // -5 or -6
    const shifted = new Date(d.getTime() + offsetHours * 3600000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const day = String(shifted.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/** Format a time window smartly: "8:00 – 8:30 AM" (drop duplicate AM/PM) */
export function formatTimeWindow(startIso: string | null | undefined, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return "";
  const s = formatTimeCentral(startIso);
  const e = formatTimeCentral(endIso);
  if (!s || !e) return [s, e].filter(Boolean).join(" – ");
  const sUpper = s.toUpperCase();
  const eUpper = e.toUpperCase();
  if ((sUpper.endsWith("AM") && eUpper.endsWith("AM")) || (sUpper.endsWith("PM") && eUpper.endsWith("PM"))) {
    return `${s.replace(/ ?[AP]M$/i, "")} – ${e}`;
  }
  return `${s} – ${e}`;
}
