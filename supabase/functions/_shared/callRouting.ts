/**
 * callRouting.ts — Server-side routing decisions for inbound calls.
 *
 * Single source of truth for:
 *   1) Busy detection — is a target user already on a live call?
 *   2) IVR department routing — which Ultraphone Client(s) should ring for a given department?
 *
 * Used by both `voice-webhook` (no-IVR direct dial) and `voice-ivr-handler`
 * (after the caller picks Sales/Service from the menu) so behavior is
 * identical regardless of entry path inside this app's IVR stack.
 */
import { logSystemTrace } from "./systemTrace.ts";

function escapeXmlSafe(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePersonName(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fast check: is this user (by employee name) currently on a live call? */
export async function isUserBusy(
  supabase: any,
  employeeName: string,
): Promise<boolean> {
  if (!employeeName) return false;
  // We track active calls via call_log.status = 'in-progress'.
  // Cover the longest softphone Dial timeLimit (4h outbound) plus callback lag.
  // This avoids a long live call becoming routeable again halfway through.
  // Stale rows are cleaned by reconcile-stuck-calls instead of shortening this
  // guard and risking a second inbound ring during an active call.
  const sinceIso = new Date(Date.now() - 255 * 60 * 1000).toISOString();
  try {
    const { data } = await supabase
      .from("call_log")
      .select("id, answered_by, started_at")
      .eq("status", "in-progress")
      .gte("started_at", sinceIso)
      .limit(20);
    const rows = (data || []) as Array<{ answered_by: string | null; started_at: string | null }>;
    if (rows.length === 0) return false;

    const wantedNorm = employeeName.toLowerCase().trim();

    // Direct match: row was attributed to this employee
    if (rows.some((r) => (r.answered_by || "").toLowerCase().trim() === wantedNorm)) {
      console.log(`[callRouting] ${employeeName}: BUSY (direct answered_by match)`);
      return true;
    }

    // Defensive fallback: if there's an unattributed live call, treat the
    // routing destination as busy. This is safer than double-ringing them.
    // Reason: client-side answered_by attribution can fail silently when
    // employees rows aren't linked to profile_id. Better to overflow to the
    // answering service than to bridge a 2nd caller into the active call's
    // notification stream and risk dropping the original call.
    if (rows.some((r) => !r.answered_by)) {
      console.log(`[callRouting] ${employeeName}: BUSY (unattributed live call — defensive)`);
      return true;
    }

    return false;
  } catch (e) {
    console.warn("[callRouting] isUserBusy check failed, assuming free:", e);
    return false;
  }
}

/** Map an employee name → Ultraphone client identity (`user_<uuid_no_dashes>`). */
async function resolveClientIdentityForEmployee(
  supabase: any,
  employeeName: string,
): Promise<string | null> {
  try {
    const wanted = normalizePersonName(employeeName);
    const wantedParts = wanted.split(" ").filter(Boolean);

    const { data: emp } = await supabase
      .from("employees")
      .select("name, profile_id")
      .eq("is_active", true);

    const employeeRows = (emp || []) as Array<{ name?: string | null; profile_id?: string | null }>;
    const exactEmployee = employeeRows.find((row) => normalizePersonName(row.name) === wanted);
    const partialEmployee = employeeRows.find((row) => {
      const candidate = normalizePersonName(row.name);
      if (!candidate) return false;
      if (candidate.includes(wanted) || wanted.includes(candidate)) return true;
      const candidateParts = candidate.split(" ").filter(Boolean);
      return wantedParts.every((part) => candidateParts.some((candidatePart) => candidatePart.startsWith(part)));
    });
    const chosenEmployee = exactEmployee || partialEmployee;

    if (chosenEmployee?.profile_id) {
      return `user_${String(chosenEmployee.profile_id).replace(/-/g, "")}`;
    }

    // Ultraphone client identities are derived from profile ids.
    // Fallback to profile-name matching for legacy rows that have not been linked yet.
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, full_name")
      .limit(200);

    const profileRows = (prof || []) as Array<{ id?: string | null; full_name?: string | null }>;
    const exactProfile = profileRows.find((row) => normalizePersonName(row.full_name) === wanted);
    const partialProfile = profileRows.find((row) => {
      const candidate = normalizePersonName(row.full_name);
      if (!candidate) return false;
      if (candidate.includes(wanted) || wanted.includes(candidate)) return true;
      const candidateParts = candidate.split(" ").filter(Boolean);
      return wantedParts.every((part) => candidateParts.some((candidatePart) => candidatePart.startsWith(part)));
    });
    const chosenProfile = exactProfile || partialProfile;

    if (chosenProfile?.id) {
      return `user_${String(chosenProfile.id).replace(/-/g, "")}`;
    }
  } catch (e) {
    console.warn("[callRouting] resolveClientIdentityForEmployee failed:", e);
  }
  return null;
}

export type DepartmentDialEvaluation = {
  reason: "available" | "all_busy" | "ooo_only" | "no_rules" | "missing_identity";
  totalCandidates: number;
  busyCount: number;
  oooCount: number;
  missingIdentityCount: number;
};

/**
 * Given a department, return the ordered list of <Client> identity strings
 * that should ring from this app's IVR routing layer — skipping anyone busy
 * or marked away-from-desk.
 *
 * Returns empty array if no one is currently available; the caller can then
 * be queued, overflowed, or sent to voicemail by the calling handler.
 */
export async function buildDepartmentDialList(
  supabase: any,
  department: string,
  trace?: { callSid?: string | null; parentCallSid?: string | null; traceGroup?: string | null; sourceName?: string },
): Promise<{ clientIdentities: string[]; chosenEmployees: string[]; evaluation: DepartmentDialEvaluation }> {
  const { data: rules } = await supabase
    .from("call_routing_rules")
    .select("employee_name, priority")
    .eq("department", department)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  const candidates = ((rules || []) as Array<{ employee_name: string }>).map(
    (r) => r.employee_name,
  );
  if (candidates.length === 0) {
    return {
      clientIdentities: [],
      chosenEmployees: [],
      evaluation: {
        reason: "no_rules",
        totalCandidates: 0,
        busyCount: 0,
        oooCount: 0,
        missingIdentityCount: 0,
      },
    };
  }

  // Pull OOO state for all candidates in one query
  const { data: emps } = await supabase
    .from("employees")
    .select("name, ooo_enabled")
    .in("name", candidates);
  const oooSet = new Set(
    ((emps || []) as Array<{ name: string; ooo_enabled: boolean }>)
      .filter((e) => e.ooo_enabled)
      .map((e) => e.name.toLowerCase()),
  );

  const identities: string[] = [];
  const chosen: string[] = [];
  let busyCount = 0;
  let oooCount = 0;
  let missingIdentityCount = 0;

  for (const name of candidates) {
    if (oooSet.has(name.toLowerCase())) {
      oooCount += 1;
      console.log(`[callRouting] ${name} is OOO — skipping`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: trace?.sourceName || "call-routing",
        eventKind: "candidate_skipped",
        summary: `${name} skipped during ${department} routing`,
        reason: "out_of_office",
        severity: "info",
        traceGroup: trace?.traceGroup ?? trace?.callSid ?? null,
        entityType: "department",
        entityId: department,
        callSid: trace?.callSid ?? null,
        parentCallSid: trace?.parentCallSid ?? null,
        metadata: { employee_name: name, department },
      });
      continue;
    }
    if (await isUserBusy(supabase, name)) {
      busyCount += 1;
      console.log(`[callRouting] ${name} is busy — skipping`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: trace?.sourceName || "call-routing",
        eventKind: "candidate_skipped",
        summary: `${name} skipped during ${department} routing`,
        reason: "busy",
        severity: "warning",
        traceGroup: trace?.traceGroup ?? trace?.callSid ?? null,
        entityType: "department",
        entityId: department,
        callSid: trace?.callSid ?? null,
        parentCallSid: trace?.parentCallSid ?? null,
        metadata: { employee_name: name, department },
      });
      continue;
    }
    const ident = await resolveClientIdentityForEmployee(supabase, name);
    if (ident) {
      identities.push(ident);
      chosen.push(name);
    } else {
      missingIdentityCount += 1;
      console.warn(`[callRouting] no client identity for ${name}`);
      await logSystemTrace({
        sourceType: "voice",
        sourceName: trace?.sourceName || "call-routing",
        eventKind: "candidate_skipped",
        summary: `${name} skipped during ${department} routing`,
        reason: "missing_client_identity",
        severity: "warning",
        traceGroup: trace?.traceGroup ?? trace?.callSid ?? null,
        entityType: "department",
        entityId: department,
        callSid: trace?.callSid ?? null,
        parentCallSid: trace?.parentCallSid ?? null,
        metadata: { employee_name: name, department },
      });
    }
  }

  const reason: DepartmentDialEvaluation["reason"] = identities.length > 0
    ? "available"
    : busyCount > 0
      ? "all_busy"
      : oooCount === candidates.length
        ? "ooo_only"
        : "missing_identity";

  return {
    clientIdentities: identities,
    chosenEmployees: chosen,
    evaluation: {
      reason,
      totalCandidates: candidates.length,
      busyCount,
      oooCount,
      missingIdentityCount,
    },
  };
}

/**
 * Build a `<Client>...</Client>` block from identity strings, optionally
 * tagging caller name for the native Twilio Voice notification UI.
 */
export function buildClientTags(
  identities: string[],
  contactName: string | null,
): string {
  if (identities.length === 0) return "";
  const callerNameAttr = contactName
    ? ` CapacitorTwilioCallerName="${escapeXmlSafe(contactName)}"`
    : "";
  return identities
    .map((id) => `<Client${callerNameAttr}>${escapeXmlSafe(id)}</Client>`)
    .join("\n    ");
}
