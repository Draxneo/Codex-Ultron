const STAFF_ROLES = new Set(["admin", "office", "tech", "supervisor"]);

export type FunctionAuthResult =
  | { ok: true; kind: "service_role" | "internal_secret" | "staff"; userId?: string; role?: string }
  | { ok: false; status: number; error: string };

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

export function isServiceRoleBearer(req: Request): boolean {
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = getBearerToken(req);
  return !!serviceRole && !!bearer && constantTimeEqual(bearer, serviceRole);
}

export function hasInternalFunctionSecret(req: Request): boolean {
  const expected = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";
  const provided = req.headers.get("x-internal-function-secret") || "";
  return !!expected && !!provided && constantTimeEqual(provided, expected);
}

/**
 * Authorize edge-function callers that may perform sensitive server actions.
 *
 * Internal function-to-function calls should prefer:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * If service-role bearer is not practical, set INTERNAL_FUNCTION_SECRET and send:
 *   x-internal-function-secret: <INTERNAL_FUNCTION_SECRET>
 */
export async function requireStaffOrInternal(
  req: Request,
  supabaseAdmin: any,
): Promise<FunctionAuthResult> {
  if (isServiceRoleBearer(req)) return { ok: true, kind: "service_role" };
  if (hasInternalFunctionSecret(req)) return { ok: true, kind: "internal_secret" };

  const bearer = getBearerToken(req);
  if (!bearer) {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(bearer);
  const user = userData?.user;
  if (userError || !user?.id) {
    return { ok: false, status: 401, error: "Invalid authentication" };
  }

  const { data: roles, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .limit(5);

  if (roleError) {
    console.error("Staff authorization role lookup failed:", roleError);
    return { ok: false, status: 500, error: "Authorization check failed" };
  }

  const role = (roles || []).map((r: any) => r.role).find((r: string) => STAFF_ROLES.has(r));
  if (!role) {
    return { ok: false, status: 403, error: "Staff authorization required" };
  }

  return { ok: true, kind: "staff", userId: user.id, role };
}
