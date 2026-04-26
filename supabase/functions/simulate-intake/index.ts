import { handleIntakeSession } from "../_shared/handleIntakeSession.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



const SIMULATOR_PHONE = "0000000000"; // fake 10-digit number

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

      const supabase = getSupabaseAdmin();

  try {
    const { action, message } = await req.json();

    // ── RESET action — clears the simulator session ──
    if (action === "reset") {
      await supabase
        .from("sms_intake_sessions")
        .delete()
        .eq("phone_number", SIMULATOR_PHONE);
      return new Response(
        JSON.stringify({ ok: true, message: "Session reset" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── GET_STATE action — returns current session state ──
    if (action === "get_state") {
      const { data: session } = await supabase
        .from("sms_intake_sessions")
        .select("*")
        .eq("phone_number", SIMULATOR_PHONE)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return new Response(
        JSON.stringify({ ok: true, session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SEND action — simulate a customer message through REAL intake logic ──
    if (action !== "send" || !message) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use 'send', 'reset', or 'get_state'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Uses the SAME handleIntakeSession as sms-webhook, with dryRun=true
    // to skip customer/job/action creation side effects
    const result = await handleIntakeSession({
      from: `+1${SIMULATOR_PHONE}`,
      body: message,
      supabase,
      contactName: null,
      dryRun: true,
    });

    // Get current session state
    const { data: currentSession } = await supabase
      .from("sms_intake_sessions")
      .select("current_step, collected_data")
      .eq("phone_number", SIMULATOR_PHONE)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        ok: true,
        reply: result?.reply || "No reply generated",
        shouldEscalate: result?.shouldEscalate || false,
        trace: result?.trace || [],
        session: currentSession,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Simulate intake error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
