import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.text();
    const params = new URLSearchParams(formData);

    const callSid = params.get("CallSid") || "";
    const answeredBy = params.get("AnsweredBy") || ""; // human, machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax, unknown

    console.log(`AMD callback: CallSid=${callSid}, AnsweredBy=${answeredBy}`);

    if (!callSid || !answeredBy) {
      return new Response("ok", { headers: corsHeaders, status: 200 });
    }

    const supabase = getSupabaseAdmin();

    // Update call_log row with detection result
    await supabase
      .from("call_log")
      .update({ answered_by: answeredBy })
      .eq("twilio_sid", callSid);

    // Broadcast via realtime channel so UI can react instantly
    const channel = supabase.channel(`call-amd-${callSid}`);
    await channel.send({
      type: "broadcast",
      event: "amd",
      payload: { callSid, answeredBy },
    });

    return new Response("ok", { headers: corsHeaders, status: 200 });
  } catch (error) {
    console.error("voice-amd-callback error:", error);
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
});
