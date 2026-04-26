import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";import { getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders } from "../_shared/cors.ts";


const APP_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://codex-ultron.onrender.com";


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();
    if (!action) throw new Error("action is required");

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = getSupabaseAdmin();

    let result: any = { status: "unknown_action", action };

    // Read tax_rate from company_settings (ONE SOURCE OF TRUTH)
    const { data: settingsRows } = await sb.from("company_settings").select("key, value");
    const csMap: Record<string, string> = {};
    for (const row of (settingsRows || []) as any[]) csMap[row.key] = row.value;
    const defaultTaxRate = parseFloat(csMap.tax_rate || "8.25");

    if (action === "create_invoice_from_job") {
      // ═══════════════════════════════════════════════════════════════
      // ONE SOURCE OF TRUTH: Build invoice directly from job_line_items
      // ═══════════════════════════════════════════════════════════════
      const jobId = params.job_id;
      if (!jobId) throw new Error("job_id is required for create_invoice_from_job");

      // Fetch the job
      const { data: job, error: jobErr } = await sb.from("jobs")
        .select("id, hcp_job_number, job_number, customer_name, customer_phone, customer_email")
        .eq("id", jobId)
        .single();
      if (jobErr || !job) throw new Error(`Job not found: ${jobId}`);

      // Fetch job_line_items — the ONE SOURCE OF TRUTH
      const { data: lineItems, error: liErr } = await sb.from("job_line_items")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (liErr) throw liErr;

      if (!lineItems || lineItems.length === 0) {
        result = { status: "error", error: "No line items found on this job — add line items first" };
      } else {
        const taxRate = params.tax_rate ?? defaultTaxRate;

        // Build invoice items from job line items, respecting waived status
        const invoiceItems = lineItems.map((li: any, idx: number) => {
          const effectivePrice = li.waived ? 0 : Number(li.unit_price);
          const effectiveTotal = li.waived ? 0 : Number(li.total_price);
          return {
            description: li.waived
              ? `${li.name}${li.waived_reason ? ` (${li.waived_reason})` : " (waived)"}`
              : (li.description || li.name),
            quantity: li.quantity || 1,
            unit_price: effectivePrice,
            total: effectiveTotal,
            sort_order: idx,
            source_line_item_id: li.id,
          };
        });

        const subtotal = invoiceItems.reduce((s: number, i: any) => s + i.total, 0);
        const taxAmount = subtotal * (taxRate / 100);
        const total = Math.max(0, subtotal + taxAmount);

        const { data: invoice, error: invErr } = await sb.from("customer_invoices").insert({
          job_id: jobId, subtotal: Math.max(0, subtotal), tax_rate: taxRate,
          tax_amount: Math.max(0, taxAmount), total, notes: params.notes || null,
        }).select("id, invoice_number").single();
        if (invErr) throw invErr;

        await sb.from("customer_invoice_items").insert(
          invoiceItems.map((item: any) => ({
            invoice_id: invoice.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total,
            sort_order: item.sort_order,
            source_line_item_id: item.source_line_item_id,
          }))
        );

        // ONE WORKFLOW: stamp invoice_sent_at to advance workflow
        await sb.from("jobs").update({ invoice_sent_at: new Date().toISOString() }).eq("id", jobId);

        // ONE SOURCE OF TRUTH: activity log
        await sb.from("activity_log").insert({
          action: "invoice_created",
          job_id: jobId,
          details: `Invoice ${invoice.invoice_number} created from job line items — $${total.toFixed(2)} (${invoiceItems.length} items)`,
          performed_by: "invoicing-agent",
        });

        result = {
          status: "success", invoice_id: invoice.id, invoice_number: invoice.invoice_number,
          job_number: job.hcp_job_number || job.job_number, customer: job.customer_name,
          subtotal, tax: taxAmount, total, items_count: invoiceItems.length,
          message: `Invoice ${invoice.invoice_number} created from job line items for ${job.customer_name} — $${total.toFixed(2)}`,
        };
      }
    } else if (action === "create_invoice") {
      // Legacy action — kept for backwards compatibility (manual overrides)
      const identifier = (params.job_identifier || "").toLowerCase();
      const { data: jobs } = await sb.from("jobs")
        .select("id, hcp_job_number, job_number, customer_name, customer_phone, customer_email")
        .or(`hcp_job_number.ilike.%${identifier}%,job_number.ilike.%${identifier}%,customer_name.ilike.%${identifier}%`)
        .order("created_at", { ascending: false }).limit(5);

      if (!jobs || jobs.length === 0) {
        result = { status: "error", error: `No job found matching "${params.job_identifier}"` };
      } else {
        const job = jobs[0];
        const taxRate = params.tax_rate ?? defaultTaxRate;
        const items = (params.items || []).map((item: any, idx: number) => ({
          description: item.description, quantity: item.quantity || 1,
          unit_price: item.unit_price, total: (item.quantity || 1) * item.unit_price, sort_order: idx,
        }));
        const subtotal = items.reduce((s: number, i: any) => s + i.total, 0);
        const taxAmount = subtotal * (taxRate / 100);
        const total = Math.max(0, subtotal + taxAmount);

        const { data: invoice, error: invErr } = await sb.from("customer_invoices").insert({
          job_id: job.id, subtotal: Math.max(0, subtotal), tax_rate: taxRate,
          tax_amount: Math.max(0, taxAmount), total, notes: params.notes || null,
        }).select("id, invoice_number").single();
        if (invErr) throw invErr;

        if (items.length > 0) {
          await sb.from("customer_invoice_items").insert(
            items.map((item: any) => ({
              invoice_id: invoice.id, description: item.description,
              quantity: item.quantity, unit_price: item.unit_price,
              total: item.total, sort_order: item.sort_order,
            }))
          );
        }

        // ONE WORKFLOW: stamp invoice_sent_at to advance workflow
        await sb.from("jobs").update({ invoice_sent_at: new Date().toISOString() }).eq("id", job.id);

        // ONE SOURCE OF TRUTH: activity log
        await sb.from("activity_log").insert({
          action: "invoice_created",
          job_id: job.id,
          details: `Invoice ${invoice.invoice_number} created — $${total.toFixed(2)} (${items.length} items)`,
          performed_by: "invoicing-agent",
        });

        result = {
          status: "success", invoice_id: invoice.id, invoice_number: invoice.invoice_number,
          job_number: job.hcp_job_number || job.job_number, customer: job.customer_name,
          subtotal, tax: taxAmount, total, items_count: items.length,
          message: `Invoice ${invoice.invoice_number} created for ${job.customer_name} — $${total.toFixed(2)}`,
        };
      }
    } else if (action === "generate_payment_link") {
      // Skip payment link generation for $0 invoices
      const identifier = (params.job_identifier || "").toLowerCase();
      const { data: jobs } = await sb.from("jobs")
        .select("id, hcp_job_number, job_number, customer_name, customer_phone, customer_email")
        .or(`hcp_job_number.ilike.%${identifier}%,job_number.ilike.%${identifier}%,customer_name.ilike.%${identifier}%`)
        .order("created_at", { ascending: false }).limit(5);

      if (!jobs || jobs.length === 0) {
        result = { status: "error", error: `No job found matching "${params.job_identifier}"` };
      } else {
        const job = jobs[0];
        let invoiceId: string | null = null;
        let amount = params.amount;
        if (params.type === "invoice") {
          const { data: invoices } = await sb.from("customer_invoices")
            .select("id, total").eq("job_id", job.id).neq("status", "paid")
            .order("created_at", { ascending: false }).limit(1);
          if (!invoices || invoices.length === 0) {
            result = { status: "error", error: "No unpaid invoice for this job" };
          } else {
            invoiceId = invoices[0].id;
            amount = amount || invoices[0].total;
          }
        }
        if (!result || result.status !== "error") {
          if (amount === 0) {
            // $0 invoice — complimentary, no payment needed
            result = {
              status: "success", payment_url: null, amount: 0, type: params.type,
              customer: job.customer_name, sms_sent: false,
              message: `Complimentary invoice for ${job.customer_name} — $0.00, no payment link needed`,
            };
          } else if (!amount || amount < 0) {
            result = { status: "error", error: "Amount is required" };
          } else {
            const resp = await fetch(`${sbUrl}/functions/v1/stripe-checkout`, {
              method: "POST",
              headers: { Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                type: params.type, invoice_id: invoiceId, job_id: job.id, amount,
                customer_name: job.customer_name, customer_email: job.customer_email,
                success_url: `${APP_BASE_URL}/jobs/${job.id}?paid=true`,
                cancel_url: `${APP_BASE_URL}/jobs/${job.id}`,
              }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || "Stripe checkout failed");

            let smsSent = false;
            if (params.send_sms && job.customer_phone && data.url) {
              await fetch(`${sbUrl}/functions/v1/send-sms`, {
                method: "POST",
                headers: { Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: job.customer_phone,
                  body: `💳 Pay online: $${amount.toFixed(2)} — ${job.customer_name}\n${data.url}`,
                  job_id: job.id,
                }),
              });
              smsSent = true;
            }
            result = {
              status: "success", payment_url: data.url, amount, type: params.type,
              customer: job.customer_name, sms_sent: smsSent,
              message: `Payment link generated for $${amount.toFixed(2)}${smsSent ? " — SMS sent" : ""}`,
            };
          }
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("invoicing-agent error:", e);
    return new Response(JSON.stringify({ status: "error", error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
