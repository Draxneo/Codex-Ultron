import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Diagnostic endpoint: given a Twilio parent CallSid, returns everything
 * Twilio knows about that call — parent leg, child legs (overflow dial),
 * and any Recording resources, with playback URLs proxied through
 * `recording-proxy` so the browser can stream them.
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

    // Parse input
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const callSid = (body.callSid as string) || url.searchParams.get("callSid");
    if (!callSid || !/^CA[0-9a-f]{32}$/i.test(callSid)) {
      return json({ error: "Missing or invalid callSid" }, 400);
    }

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!accountSid || !authToken) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }

    const projectId = Deno.env.get("SUPABASE_URL")!.match(/https:\/\/([^.]+)\./)?.[1];
    const proxyBase = `https://${projectId}.supabase.co/functions/v1/recording-proxy`;

    const auth = "Basic " + btoa(`${accountSid}:${authToken}`);
    const apiBase = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`;

    const fetchTwilio = async (path: string) => {
      const r = await fetch(`${apiBase}${path}`, { headers: { Authorization: auth } });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Twilio ${path} -> ${r.status}: ${txt.slice(0, 200)}`);
      }
      return r.json();
    };

    // 1. Parent call
    const parent = await fetchTwilio(`/Calls/${callSid}.json`);

    // 2. Child legs
    const childrenResp = await fetchTwilio(`/Calls.json?ParentCallSid=${callSid}&PageSize=20`);
    const children = (childrenResp.calls || []).map((c: any) => ({
      sid: c.sid,
      to: c.to,
      from: c.from,
      status: c.status,
      duration: Number(c.duration) || 0,
      start_time: c.start_time,
      end_time: c.end_time,
    }));

    // 3. Recordings — check parent + every child
    const recordingSids = new Set<string>();
    const recordings: any[] = [];

    const collectRecordings = async (sid: string, label: string) => {
      try {
        const r = await fetchTwilio(`/Calls/${sid}/Recordings.json?PageSize=20`);
        for (const rec of r.recordings || []) {
          if (recordingSids.has(rec.sid)) continue;
          recordingSids.add(rec.sid);
          // Twilio recording media URL (proxy will append .mp3)
          const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${rec.sid}`;
          recordings.push({
            sid: rec.sid,
            duration: Number(rec.duration) || 0,
            channels: Number(rec.channels) || 1,
            source: rec.source,
            status: rec.status,
            date_created: rec.date_created,
            from_leg: label,
            media_url: mediaUrl,
            play_url: `${proxyBase}?url=${encodeURIComponent(mediaUrl)}`,
          });
        }
      } catch (e) {
        console.warn(`recordings fetch failed for ${sid}:`, (e as Error).message);
      }
    };

    await collectRecordings(callSid, "parent");
    for (const child of children) {
      await collectRecordings(child.sid, `child:${child.to || child.sid}`);
    }

    return json({
      parent: {
        sid: parent.sid,
        status: parent.status,
        duration: Number(parent.duration) || 0,
        answered_by: parent.answered_by,
        from: parent.from,
        to: parent.to,
        start_time: parent.start_time,
        end_time: parent.end_time,
        direction: parent.direction,
      },
      children,
      recordings,
    });
  } catch (err) {
    console.error("twilio-call-inspect error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
