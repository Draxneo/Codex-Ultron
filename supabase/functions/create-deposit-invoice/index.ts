import { wrapInLayout, htmlToPlainText } from "../_shared/emailLayout.ts";
import { loadCompanyInfo } from "../_shared/companyInfo.ts";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id required");

            const supabase = getSupabaseAdmin();

    // Get job info
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, customer_name, customer_phone, customer_email, customer_id, job_type, total_price, payment_method")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) throw new Error("Job not found");

    // Don't create deposit for financed jobs
    if (job.payment_method === "financed") {
      return new Response(JSON.stringify({ skipped: true, reason: "financed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobTotal = job.total_price || 0;
    if (jobTotal <= 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no total" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up deposit schedule for this job type
    const { data: schedule } = await supabase
      .from("deposit_schedules")
      .select("draws")
      .eq("job_type", job.job_type || "install")
      .eq("is_active", true)
      .maybeSingle();

    // Fallback to generic install schedule
    const draws: Array<{ percent: number; label: string }> = schedule?.draws
      || [{ percent: 50, label: "Deposit" }];

    // Count existing invoices to determine which draw we're on
    const { count } = await supabase
      .from("customer_invoices")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job_id);

    const drawIndex = count || 0;
    if (drawIndex >= draws.length) {
      return new Response(JSON.stringify({ skipped: true, reason: "all draws created" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentDraw = draws[drawIndex];
    const drawAmount = Math.round((jobTotal * currentDraw.percent / 100) * 100) / 100;

    // Get tax rate and company info from company_settings (Rule 2)
    const [taxSettingResult, company] = await Promise.all([
      supabase.from("company_settings").select("value").eq("key", "tax_rate").single(),
      loadCompanyInfo(supabase),
    ]);
    const taxRate = parseFloat(taxSettingResult.data?.value || "8.25") / 100;
    const taxAmount = Math.round(drawAmount * taxRate * 100) / 100;
    const total = Math.max(0, drawAmount + taxAmount);

    // Create invoice
    const { data: invoice, error: invErr } = await supabase
      .from("customer_invoices")
      .insert({
        job_id,
        subtotal: drawAmount,
        tax_rate: taxRate * 100,
        tax_amount: taxAmount,
        total,
        status: "draft",
        notes: `${currentDraw.label} — ${currentDraw.percent}% of job total`,
      })
      .select("id, public_token, invoice_number")
      .single();

    if (invErr) throw new Error(`Invoice creation failed: ${invErr.message}`);

    // Create line item
    await supabase.from("customer_invoice_items").insert({
      invoice_id: invoice.id,
      description: `${currentDraw.label} (${currentDraw.percent}% of $${jobTotal.toLocaleString()})`,
      quantity: 1,
      unit_price: drawAmount,
      total: drawAmount,
    });

    // Mark invoice as sent
    await supabase.from("customer_invoices")
      .update({ status: "sent", sent_at: new Date().toISOString(), sent_via: "email" })
      .eq("id", invoice.id);

    // Send email if customer has email
    const customerEmail = job.customer_email || await getCustomerEmail(supabase, job.customer_id);
    const firstName = job.customer_name?.split(" ")[0] || "";

    if (customerEmail) {
      // Get email template
      const { data: tpl } = await supabase
        .from("email_templates")
        .select("subject_template, body_html")
        .eq("slug", "deposit-request")
        .eq("is_active", true)
        .maybeSingle();

      const baseUrl = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://codex-ultron.onrender.com";
      const invoiceUrl = `${baseUrl}/invoice/${invoice.public_token}`;

      const replacements: Record<string, string> = {
        "{{customer_name}}": job.customer_name || "",
        "{{customer_first_name}}": firstName,
        "{{job_type}}": job.job_type || "install",
        "{{company_name}}": company.name,
        "{{draw_label}}": currentDraw.label,
        "{{draw_amount}}": `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        "{{invoice_url}}": invoiceUrl,
        "{{invoice_number}}": invoice.invoice_number || "",
      };

      let bodyHtml = tpl?.body_html || `<p>Your ${currentDraw.label} of $${total.toFixed(2)} is ready.</p><p><a href="${invoiceUrl}">Pay Now</a></p>`;
      let subject = tpl?.subject_template || `Your deposit — ${company.name}`;

      for (const [key, val] of Object.entries(replacements)) {
        bodyHtml = bodyHtml.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), val);
        subject = subject.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), val);
      }

      const html = wrapInLayout(bodyHtml, { previewText: `${currentDraw.label} ready for payment`, companyName: company.name, companyPhone: company.phone });
      const plainText = htmlToPlainText(bodyHtml);

      await supabase.functions.invoke("email-send", {
        body: { to: customerEmail, subject, html, text: plainText },
      });
    }

    // Log activity
    await supabase.from("activity_log").insert({
      job_id,
      action: "deposit_requested",
      performed_by: "System",
      details: `${currentDraw.label} invoice #${invoice.invoice_number} ($${total.toFixed(2)}) created and sent to ${job.customer_name || "customer"}`,
    });

    return new Response(JSON.stringify({
      sent: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      draw_label: currentDraw.label,
      draw_index: drawIndex,
      amount: total,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-deposit-invoice error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});

async function getCustomerEmail(supabase: any, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase.from("customers").select("email").eq("id", customerId).single();
  return data?.email || null;
}
