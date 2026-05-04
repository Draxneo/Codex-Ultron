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

    const baseUrl = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://codex-ultron.onrender.com";
    const invoiceUrl = `${baseUrl}/invoice/${invoice.public_token}`;


    // Log activity
    await supabase.from("activity_log").insert({
      job_id,
      action: "deposit_requested",
      performed_by: "System",
      details: `${currentDraw.label} invoice #${invoice.invoice_number} ($${total.toFixed(2)}) created for ${job.customer_name || "customer"}. Payment link: ${invoiceUrl}`,
    });

    return new Response(JSON.stringify({
      created: true,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      draw_label: currentDraw.label,
      draw_index: drawIndex,
      amount: total,
      invoice_url: invoiceUrl,
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

