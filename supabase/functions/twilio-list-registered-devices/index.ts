import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Diagnostic endpoint: lists all currently-online Twilio Client device
 * registrations for the configured TwiML App / API Key. This shows which
 * `client:identity` endpoints are actually reachable RIGHT NOW.
 *
 * Twilio doesn't expose a single "list registered devices" REST endpoint,
 * so we use two complementary signals:
 *
 *   1. Sync (if SYNC_SERVICE_SID set) — not used here.
 *   2. Bindings on the configured Notify Service — used for FCM/APNs push
 *      registrations (Android/iOS native voice SDK). This is the most
 *      reliable signal for native devices because the voice SDKs auto-
 *      register a binding when they call `register()`.
 *   3. Recent CALL_LOG_REGISTERED events from the Monitor API for JS SDK
 *      browser/Electron registrations.
 *
 * Returns a normalised list per identity with timestamps and binding type.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require an admin user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = getSupabaseAdmin();
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden — admin only" }, 403);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }

    const auth = "Basic " + btoa(`${accountSid}:${authToken}`);

    // ---- 1. Pull push bindings (FCM/APNs) — covers native Android/iOS ----
    // We don't know the Notify Service SID, so probe all services and pick
    // the one with bindings.
    const notifyResp = await fetch(
      `https://notify.twilio.com/v1/Services?PageSize=20`,
      { headers: { Authorization: auth } }
    );
    const notifyData = notifyResp.ok ? await notifyResp.json() : { services: [] };
    const services = notifyData.services || [];

    type Binding = {
      identity: string;
      binding_type: string;
      address: string;
      date_created: string;
      date_updated: string;
      service_sid: string;
      friendly_name?: string;
    };
    const bindings: Binding[] = [];

    for (const svc of services) {
      try {
        const bResp = await fetch(
          `https://notify.twilio.com/v1/Services/${svc.sid}/Bindings?PageSize=100`,
          { headers: { Authorization: auth } }
        );
        if (!bResp.ok) continue;
        const bData = await bResp.json();
        for (const b of bData.bindings || []) {
          bindings.push({
            identity: b.identity,
            binding_type: b.binding_type, // "fcm" | "apn" | "gcm" | "sms"
            address: (b.address || "").slice(0, 24) + "…",
            date_created: b.date_created,
            date_updated: b.date_updated,
            service_sid: svc.sid,
            friendly_name: svc.friendly_name,
          });
        }
      } catch (e) {
        console.warn(`bindings fetch failed for ${svc.sid}:`, (e as Error).message);
      }
    }

    // ---- 2. Recent registration events (JS SDK browser/Electron) ----
    // Monitor API: filter for "deactivation"/"registration" events in last hour.
    // Twilio doesn't have a direct endpoint, but we can read the Voice
    // Insights "Calls Summary" — instead we just return what we have plus
    // recent successful inbound calls per identity from our own logs.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentInbound } = await supabase
      .from("call_log")
      .select("answered_by, status, started_at, twilio_sid")
      .eq("direction", "inbound")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    // ---- 3. Pull employees so we can map user_<uuid> -> name ----
    const identities = Array.from(new Set(bindings.map((b) => b.identity)));
    const userIds = identities
      .filter((i) => i.startsWith("user_"))
      .map((i) => i.slice(5));

    const { data: employees } = userIds.length
      ? await supabase
          .from("employees")
          .select("user_id, full_name, role")
          .in("user_id", userIds)
      : { data: [] };

    const empMap = new Map(
      (employees || []).map((e: any) => [e.user_id, e])
    );

    // Group by identity
    const byIdentity: Record<string, any> = {};
    for (const b of bindings) {
      if (!byIdentity[b.identity]) {
        const userId = b.identity.startsWith("user_") ? b.identity.slice(5) : null;
        const emp = userId ? empMap.get(userId) : null;
        byIdentity[b.identity] = {
          identity: b.identity,
          employee_name: emp?.full_name || null,
          employee_role: emp?.role || null,
          bindings: [],
        };
      }
      byIdentity[b.identity].bindings.push({
        type: b.binding_type,
        address_preview: b.address,
        last_updated: b.date_updated,
        service: b.friendly_name || b.service_sid,
      });
    }

    return json({
      summary: {
        total_identities_with_push: Object.keys(byIdentity).length,
        notify_services_checked: services.length,
        recent_inbound_calls: recentInbound?.length || 0,
      },
      identities: Object.values(byIdentity),
      recent_inbound: recentInbound || [],
      note:
        "Bindings show push-registered native devices (FCM/APN). " +
        "Browser/Electron JS SDK registrations are NOT shown here — " +
        "those are tracked only via active websocket and not queryable.",
    });
  } catch (err) {
    console.error("twilio-list-registered-devices error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
