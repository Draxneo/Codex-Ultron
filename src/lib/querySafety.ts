export type CountResult = {
  count: number | null;
  error: unknown;
};

/** Extract a Supabase count without letting one failed card break a dashboard. */
export function safeCount(
  result: PromiseSettledResult<CountResult>,
  label: string,
  errors: string[],
  logPrefix = "QuerySafety"
): number {
  if (result.status === "rejected") {
    console.error(`[${logPrefix}] ${label} query rejected:`, result.reason);
    errors.push(label);
    return 0;
  }

  if (result.value.error) {
    console.error(`[${logPrefix}] ${label} query error:`, result.value.error);
    errors.push(label);
    return 0;
  }

  return result.value.count || 0;
}
