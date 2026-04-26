/**
 * Shared formatting utilities for CRM data normalization.
 * Applied on all create/update mutations to enforce consistent capitalization,
 * phone formatting, and email casing across the entire app.
 */

/** Title-case a name, preserving particles like O'Brien, McDonald, LaQue */
export function formatName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  return trimmed
    .split(/\s+/)
    .map(word => {
      if (!word) return word;
      // Handle O'Brien, D'Angelo etc.
      if (/^[A-Za-z]['']/u.test(word)) {
        const parts = word.split(/(?<=[''])/);
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
      }
      // Handle Mc/Mac prefixes: McDonald, MacGregor
      if (/^mc[a-z]/i.test(word)) {
        return "Mc" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }
      if (/^mac[a-z]/i.test(word) && word.length > 4) {
        return "Mac" + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
      }
      // Handle La/De prefixes: LaQue, DeLeon
      if (/^(la|de)[A-Z]/i.test(word) && word.length > 2) {
        const prefix = word.slice(0, 2);
        return prefix.charAt(0).toUpperCase() + prefix.charAt(1).toLowerCase() +
          word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
      }
      // Standard title case
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
      // Keep directional & unit abbreviations uppercase
      if (["N", "S", "E", "W", "NE", "NW", "SE", "SW", "APT", "STE", "BLDG", "FL", "PO", "TX", "CT"].includes(upper)) {
        return upper;
      }
      // Keep ordinals like 1st, 2nd, 3rd lowercase after digit
      if (/^\d+(st|nd|rd|th)$/i.test(word)) return word.toLowerCase();
      // Keep numbers as-is
      if (/^\d+$/.test(word)) return word;
      // Standard title case
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
  const trimmed = state.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/** Lowercase and trim email */
export function formatEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/** Format phone to (210) 878-7887 style */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  // Handle 10-digit US numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // Handle 11-digit with leading 1
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // Return trimmed original if not standard US
  return phone.trim();
}

/** Convert any phone format to Twilio E.164: +12105551234.
 * Strict — returns null if the input cannot be coerced to a valid US/E.164 number.
 * Use this when handing a number to Twilio (call, SMS, lookup). */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = String(phone).trim();
  // Already valid E.164 (any country): keep as-is
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return null; // Non-US or invalid
}

/** Lenient phone normalizer for UI inputs / click-to-text prefill.
 * - Always returns a string (never null) so React inputs stay controlled.
 * - If the digits resolve to a valid US number, returns pretty "(210) 907-7382".
 * - If they resolve to E.164, returns that.
 * - Otherwise returns the digits-only string so the user can keep typing.
 * Use for INPUT display. Use toE164 right before sending to Twilio. */
export function formatPhoneInput(phone: string | null | undefined): string {
  if (!phone) return "";
  const raw = String(phone).trim();
  if (/^\+[1-9]\d{7,14}$/.test(raw)) {
    // Pretty-print +1 numbers, leave other countries as raw E.164
    if (raw.startsWith("+1") && raw.length === 12) {
      const d = raw.slice(2);
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return raw;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length < 10) {
    // Partial — show pretty-as-you-type up to what we have
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/** True when phone can be sent to Twilio (10-digit US, 11 with leading 1, or full E.164). */
export function isValidSmsPhone(phone: string | null | undefined): boolean {
  return toE164(phone) !== null;
}

/** Apply all relevant formatters to a customer-shaped record */
export function formatCustomerData(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  if ("first_name" in result) result.first_name = formatName(result.first_name);
  if ("last_name" in result) result.last_name = formatName(result.last_name);
  if ("email" in result) result.email = formatEmail(result.email);
  if ("phone" in result) result.phone = formatPhone(result.phone);
  if ("mobile_phone" in result) result.mobile_phone = formatPhone(result.mobile_phone);
  if ("address" in result) result.address = formatAddress(result.address);
  if ("city" in result) result.city = formatCity(result.city);
  if ("state" in result) result.state = formatState(result.state);
  if ("company" in result) result.company = formatName(result.company);
  return result;
}

/** Apply formatters to a job/estimate-shaped record */
export function formatJobData(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  if ("customer_name" in result) result.customer_name = formatName(result.customer_name);
  if ("customer_email" in result) result.customer_email = formatEmail(result.customer_email);
  if ("customer_phone" in result) result.customer_phone = formatPhone(result.customer_phone);
  if ("address" in result) result.address = formatAddress(result.address);
  return result;
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
    return d.toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoStr;
  }
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

/**
 * Detect the correct Central Time UTC offset for a given date string.
 * Returns "-05:00" during CDT (daylight) or "-06:00" during CST (standard).
 * Browser-safe: uses Intl which works reliably in all modern browsers.
 */
export function detectCentralOffset(dateStr: string): "-05:00" | "-06:00" {
  const probe = new Date(`${dateStr.split("T")[0]}T12:00:00Z`);
  const isDST = probe.toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).includes("CDT");
  return isDST ? "-05:00" : "-06:00";
}

/** Strip a phone to its last 10 digits — universal contact-matching key */
export function normalizeLast10(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").slice(-10);
}

/** Format a number as US currency: "$1,234.56" */
export function formatCurrency(n: number, decimals = 2): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Compact currency for charts/cards: "$12k", "$850" */
export function formatCurrencyShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return formatCurrency(n, 0);
}

/** Relative date for inbox-style lists: time if today, "Yesterday", or "Mar 5" */
export function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Short US date: "Mar 5, 2025" */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format a time window smartly: "8:00 – 8:30 AM" (drop duplicate AM/PM) */
export function formatTimeWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "";
  const s = formatTimeCentral(start);
  const e = formatTimeCentral(end);
  if (!s || !e) return [s, e].filter(Boolean).join(" – ");
  // If both are AM or both are PM, drop the first AM/PM
  const sUpper = s.toUpperCase();
  const eUpper = e.toUpperCase();
  if ((sUpper.endsWith("AM") && eUpper.endsWith("AM")) || (sUpper.endsWith("PM") && eUpper.endsWith("PM"))) {
    return `${s.replace(/ ?[AP]M$/i, "")} – ${e}`;
  }
  return `${s} – ${e}`;
}
