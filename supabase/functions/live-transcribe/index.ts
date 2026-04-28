import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { buildKeytermParamsSync } from "../_shared/deepgramKeyterms.ts";
import { logApiUsage } from "../_shared/apiUsageLog.ts";

Deno.serve(async (req) => {
  // This endpoint only handles WebSocket upgrades from Twilio <Stream>
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }

  const { socket: twilioWs, response } = Deno.upgradeWebSocket(req);

  const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
  if (!DEEPGRAM_API_KEY) {
    console.error("DEEPGRAM_API_KEY not configured");
    twilioWs.onopen = () => twilioWs.close(1011, "Server misconfigured");
    return response;
  }

  // Dual-track: separate Deepgram connections for caller vs agent
  let dgInbound: WebSocket | null = null;
  let dgOutbound: WebSocket | null = null;
  let streamSid = "";
  let callSid = "";
  let keytermParams = "";
  let streamStartedAt = 0;
  // Diagnostic counters — logged on close so we know whether audio actually flowed
  let mediaInboundCount = 0;
  let mediaOutboundCount = 0;
  let dgMessagesInbound = 0;
  let dgMessagesOutbound = 0;
  let dgTranscriptsInbound = 0;
  let dgTranscriptsOutbound = 0;

  function connectDeepgram(speakerLabel: "caller" | "agent"): WebSocket {
    const url =
      `wss://api.deepgram.com/v1/listen?model=nova-3&encoding=mulaw&sample_rate=8000&channels=1&interim_results=true&smart_format=true&language=en${keytermParams}`;
    const ws = new WebSocket(url, ["token", DEEPGRAM_API_KEY!]);

    ws.onopen = () => {
      console.log(`Deepgram WS connected for ${speakerLabel}, call ${callSid}`);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        // Count every Deepgram message (including metadata, errors, keepalives)
        if (speakerLabel === "caller") dgMessagesInbound++;
        else dgMessagesOutbound++;

        // Log non-transcript Deepgram messages once for diagnostics
        if (data?.type && data.type !== "Results") {
          console.log(`[live-transcribe] Deepgram ${speakerLabel} msg type=${data.type}:`, JSON.stringify(data).slice(0, 300));
          return;
        }

        const alt = data?.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;

        const transcript = alt.transcript.trim();
        if (!transcript) return;

        if (speakerLabel === "caller") dgTranscriptsInbound++;
        else dgTranscriptsOutbound++;

        const isFinal = data.is_final === true;

        // Create a fresh client for each insert to avoid stale connections
        const sb = getSupabaseAdmin();
        const { error } = await sb.from("live_transcripts").insert({
          twilio_sid: callSid,
          speaker: speakerLabel,
          text: transcript,
          is_final: isFinal,
        });

        if (error) {
          console.error(`[live-transcribe] Insert failed for ${speakerLabel}:`, error.message);
        }
      } catch (err) {
        console.error(`Deepgram ${speakerLabel} message parse error:`, err);
      }
    };

    ws.onerror = (e) => {
      console.error(`Deepgram ${speakerLabel} WS error:`, e);
    };

    ws.onclose = () => {
      console.log(`Deepgram ${speakerLabel} WS closed for call ${callSid}`);
    };

    return ws;
  }

  function closeDeepgram(ws: WebSocket | null) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => {
        try { ws?.close(); } catch { /* ignore */ }
      }, 1500);
    }
  }

  twilioWs.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.event) {
        case "connected":
          console.log("Twilio Stream connected");
          break;

        case "start": {
          streamSid = msg.start?.streamSid || "";
          callSid = msg.start?.callSid || "";
          streamStartedAt = Date.now();
          console.log(`Twilio Stream started — SID: ${streamSid}, Call: ${callSid}, track: both_tracks`);
          // Load company name once for keyterm boosting (sync per-connection cost: 1 DB read)
          try {
            const sb = getSupabaseAdmin();
            const { data } = await sb
              .from("company_settings")
              .select("value")
              .eq("key", "company_name")
              .maybeSingle();
            keytermParams = buildKeytermParamsSync((data as any)?.value);
          } catch (err) {
            console.error("[live-transcribe] Failed to load keyterms:", err);
            keytermParams = buildKeytermParamsSync(null);
          }
          // Create Deepgram connections lazily on first media for each track.
          // Some Twilio paths only stream inbound audio; opening an unused second
          // Deepgram socket would be wasteful.
          break;
        }

        case "media": {
          // Twilio sends track field: "inbound" (caller) or "outbound" (agent)
          const track = msg.media?.track;
          if (track === "outbound") mediaOutboundCount++;
          else mediaInboundCount++;
          let targetDg = track === "outbound" ? dgOutbound : dgInbound;
          if (!targetDg || targetDg.readyState === WebSocket.CLOSED) {
            targetDg = connectDeepgram(track === "outbound" ? "agent" : "caller");
            if (track === "outbound") dgOutbound = targetDg;
            else dgInbound = targetDg;
          }
          if (targetDg && targetDg.readyState === WebSocket.OPEN) {
            const audioBuffer = Uint8Array.from(atob(msg.media.payload), (c) =>
              c.charCodeAt(0)
            );
            targetDg.send(audioBuffer);
          }
          break;
        }

        case "stop":
          if (streamStartedAt > 0 && (mediaInboundCount > 0 || mediaOutboundCount > 0)) {
            const seconds = Math.max(1, Math.round((Date.now() - streamStartedAt) / 1000));
            const activeTracks = (mediaInboundCount > 0 ? 1 : 0) + (mediaOutboundCount > 0 ? 1 : 0);
            const estimatedCostCents = Math.round(seconds * Math.max(1, activeTracks) * 0.0072 * 10000) / 10000;
            await logApiUsage(getSupabaseAdmin(), {
              service: "deepgram",
              function_name: "live-transcribe",
              endpoint: "listen-stream",
              estimated_cost_cents: estimatedCostCents,
              metadata: {
                seconds,
                active_tracks: activeTracks,
                stream_sid: streamSid,
                call_sid: callSid,
                media_inbound_count: mediaInboundCount,
                media_outbound_count: mediaOutboundCount,
              },
            });
          }
          console.log(
            `Twilio Stream stopped for call ${callSid} — media in/out: ${mediaInboundCount}/${mediaOutboundCount}, ` +
            `dg msgs in/out: ${dgMessagesInbound}/${dgMessagesOutbound}, ` +
            `dg transcripts in/out: ${dgTranscriptsInbound}/${dgTranscriptsOutbound}`
          );
          closeDeepgram(dgInbound);
          closeDeepgram(dgOutbound);
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Twilio WS message error:", err);
    }
  };

  twilioWs.onclose = () => {
    console.log("Twilio WS closed for call", callSid);
    try { dgInbound?.close(); } catch { /* ignore */ }
    try { dgOutbound?.close(); } catch { /* ignore */ }
  };

  twilioWs.onerror = (e) => {
    console.error("Twilio WS error:", e);
    try { dgInbound?.close(); } catch { /* ignore */ }
    try { dgOutbound?.close(); } catch { /* ignore */ }
  };

  return response;
});
