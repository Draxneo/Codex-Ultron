import { sendViaSendGrid, getSendGridConfig } from "../_shared/sendgridHelper.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, email, code, token, delivery } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = getSupabaseAdmin();

    // Fetch company name from settings
    const { data: companyNameRow } = await supabase.from("company_settings").select("value").eq("key", "company_name").maybeSingle();
    const companyName = companyNameRow?.value || "Your Service Team";

    if (action === "send_code") {
      // Find customer by email
      const { data: customer } = await supabase.from("customers")
        .select("id, first_name, phone, mobile_phone, email")
        .eq("email", email).limit(1).single();

      if (!customer) {
        return new Response(JSON.stringify({ error: "No account found with that email." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
        });
      }

      const phone = customer.mobile_phone || customer.phone;
      if (!phone) {
        return new Response(JSON.stringify({ error: "No phone number on file. Contact the office." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
        });
      }

      // Generate 6-digit code
      const pinCode = String(Math.floor(100000 + Math.random() * 900000));

      // Expire old codes
      await supabase.from("customer_portal_codes")
        .update({ used: true })
        .eq("customer_id", customer.id)
        .eq("used", false);

      // Insert new code
      await supabase.from("customer_portal_codes").insert({
        customer_id: customer.id,
        code: pinCode,
      });

      const body = `Your ${companyName} portal code is: ${pinCode}. It expires in 10 minutes.`;

      if (delivery === "email") {
        // Send via SendGrid
        const { apiKey, domain } = getSendGridConfig();
        await sendViaSendGrid(apiKey, {
          to: [customer.email],
          from: { email: `service@${domain}`, name: companyName },
          subject: `Your ${companyName} portal code`,
          text: body,
        });
      } else {
        // Route OTP through centralized send-sms (HITL bypass — OTP must send immediately)
        await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
            "x-hitl-approved": "true",
            "x-source-function": "portal-auth-otp",
          },
          body: JSON.stringify({ to: phone, body }),
        });
      }

      // Mask phone & email for UI
      const masked = phone.replace(/\d(?=\d{4})/g, "*");
      const maskedEmail = customer.email
        ? customer.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + b.replace(/./g, "*") + c)
        : null;

      return new Response(JSON.stringify({ sent: true, masked_phone: masked, masked_email: maskedEmail, customer_id: customer.id, delivery: delivery || "sms" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify_code") {
      const { data: codeEntry } = await supabase.from("customer_portal_codes")
        .select("*")
        .eq("customer_id", email) // customer_id passed as 'email' field for reuse
        .eq("code", code)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1).single();

      if (!codeEntry) {
        return new Response(JSON.stringify({ error: "Invalid or expired code." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
        });
      }

      // Mark code used
      await supabase.from("customer_portal_codes").update({ used: true }).eq("id", codeEntry.id);

      // Create session
      const { data: session } = await supabase.from("customer_portal_sessions")
        .insert({ customer_id: codeEntry.customer_id })
        .select("token, expires_at").single();

      // Auto-generate referral code if none exists
      const { data: existingCode } = await supabase.from("referral_codes")
        .select("id").eq("customer_id", codeEntry.customer_id).limit(1).single();

      if (!existingCode) {
        const { data: cust } = await supabase.from("customers")
          .select("last_name").eq("id", codeEntry.customer_id).single();
        const prefix = (cust?.last_name || "REF").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
        const suffix = Math.floor(1000 + Math.random() * 9000);
        await supabase.from("referral_codes").insert({
          customer_id: codeEntry.customer_id,
          code: `${prefix}${suffix}`,
        });
      }

      return new Response(JSON.stringify({ token: session?.token, expires_at: session?.expires_at }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "validate_session") {
      const { data: session } = await supabase.from("customer_portal_sessions")
        .select("customer_id, expires_at")
        .eq("token", token)
        .gte("expires_at", new Date().toISOString())
        .limit(1).single();

      if (!session) {
        return new Response(JSON.stringify({ valid: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
        });
      }

      return new Response(JSON.stringify({ valid: true, customer_id: session.customer_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  } catch (error) {
    console.error("portal-auth error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
