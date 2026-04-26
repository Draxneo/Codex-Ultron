/**
 * Central-Time-aware day grouping for call & SMS lists.
 *
 * IMPORTANT: all day labels are computed against America/Chicago, NOT the
 * user's browser timezone. This keeps day labels consistent between office
 * desktops, Electron, Android techs in the field, and the Postgres
 * `day_ct` column on v_call_log_with_day / v_sms_log_with_day.
 */

const CT = "America/Chicago";

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CT,
  weekday: "long",
});

const shortWeekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CT,
  weekday: "short",
});

const monthDayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CT,
  month: "short",
  day: "numeric",
});

const monthDayYearFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CT,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CT,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** YYYY-MM-DD in Central Time — stable key for bucketing. */
export function ctDayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return dayKeyFmt.format(d);
}

/** Hour:minute am/pm in Central Time. */
export function ctTimeLabel(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return timeFmt.format(d);
}

/** "Today" / "Yesterday" / weekday / "Mon, Apr 16" / "Mon, Apr 16, 2025" */
export function ctDayLabel(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  const targetKey = ctDayKey(d);
  const todayKey = ctDayKey(now);
  if (targetKey === todayKey) return "Today";

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (targetKey === ctDayKey(yesterday)) return "Yesterday";

  // Within past 6 days → weekday name
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    return weekdayFmt.format(d);
  }

  // Same year → "Mon, Apr 16"
  const nowYear = new Intl.DateTimeFormat("en-US", { timeZone: CT, year: "numeric" }).format(now);
  const targetYear = new Intl.DateTimeFormat("en-US", { timeZone: CT, year: "numeric" }).format(d);
  if (nowYear === targetYear) {
    return `${shortWeekdayFmt.format(d)}, ${monthDayFmt.format(d)}`;
  }

  // Older year → "Mon, Apr 16, 2025"
  return `${shortWeekdayFmt.format(d)}, ${monthDayYearFmt.format(d)}`;
}

/**
 * Compact header label: "Today 10:44 AM" / "Yesterday 4:12 PM" / "Mon, Apr 16 2:30 PM"
 * Used in collapsed card headers so the day can never drift into a wrong
 * relative-time label like "22 minutes ago".
 */
export function ctHeaderLabel(iso: string | Date): string {
  return `${ctDayLabel(iso)} ${ctTimeLabel(iso)}`;
}

export type DayGroup<T> = {
  /** YYYY-MM-DD CT key */
  key: string;
  /** Human label: "Today" / "Yesterday" / "Wednesday" / "Mon, Apr 16" */
  label: string;
  items: T[];
};

/**
 * Group a list by CT day. `getDate(item)` returns the item's timestamp.
 * Preserves the input order within each day (caller controls chronological vs reverse).
 * If the item already has a DB-computed `day_ct` string, it can be passed in via `getKey`
 * to skip the Intl recomputation (views v_call_log_with_day / v_sms_log_with_day expose this).
 */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date,
  getKey?: (item: T) => string | null | undefined
): DayGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const dates = new Map<string, Date>();

  for (const item of items) {
    const rawDate = getDate(item);
    const d = typeof rawDate === "string" ? new Date(rawDate) : rawDate;
    const key = (getKey && getKey(item)) || ctDayKey(d);
    if (!buckets.has(key)) {
      buckets.set(key, []);
      dates.set(key, d);
    }
    buckets.get(key)!.push(item);
  }

  // Preserve the insertion order of the buckets themselves.
  const groups: DayGroup<T>[] = [];
  for (const [key, group] of buckets) {
    const representative = dates.get(key)!;
    groups.push({ key, label: ctDayLabel(representative), items: group });
  }
  return groups;
}
