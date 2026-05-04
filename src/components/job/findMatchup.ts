/** Find the best equipment matchup for a job based on AHRI, tonnage, brand, system_type.
 *  Prefers Multiposition when available. For brands/system_types that only have
 *  Vertical/Horizontal (e.g. Goodman gas heat), uses job.orientation to pick. */
export function findMatchup(job: {
  ahri_number?: string | null;
  tonnage?: number | null;
  brand?: string | null;
  system_type?: string | null;
  orientation?: string | null;
}, matchups: any[]) {
  if (!matchups || matchups.length === 0) return undefined;

  /** From a set of candidates, prefer Multiposition. If none exist,
   *  use job.orientation (Vertical/Horizontal). Last resort: first row. */
  const pickBest = (candidates: any[]) => {
    if (candidates.length === 0) return undefined;
    // 1. Multiposition
    const multi = candidates.find(
      (m) => !m.application || m.application === "Multiposition"
    );
    if (multi) return multi;
    // 2. Match job orientation (closet=Vertical, attic=Horizontal)
    if (job.orientation) {
      const oriented = candidates.find(
        (m) => m.application?.toLowerCase() === job.orientation!.toLowerCase()
      );
      if (oriented) return oriented;
    }
    // 3. Fallback to first available
    return candidates[0];
  };

  // Priority 1: AHRI number exact match
  if (job.ahri_number) {
    const candidates = matchups.filter((m) => m.ahri_number === job.ahri_number);
    const pick = pickBest(candidates);
    if (pick) return pick;
  }

  // Priority 2: tonnage + brand + system_type
  const p2 = matchups.filter(
    (m) =>
      (!job.tonnage || m.tonnage === job.tonnage) &&
      (!job.brand || m.brand?.toLowerCase() === job.brand?.toLowerCase()) &&
      (!job.system_type || m.system_type === job.system_type)
  );
  const pick2 = pickBest(p2);
  if (pick2) return pick2;

  // Priority 3: tonnage + brand only
  const p3 = matchups.filter(
    (m) =>
      (!job.tonnage || m.tonnage === job.tonnage) &&
      (!job.brand || m.brand?.toLowerCase() === job.brand?.toLowerCase())
  );
  return pickBest(p3);
}
