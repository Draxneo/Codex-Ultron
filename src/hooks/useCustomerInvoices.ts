import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InvoiceItem = {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
};

export function useCustomerInvoices(jobId?: string) {
  return useQuery({
    queryKey: ["customer_invoices", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("*, customer_invoice_items(*)")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCustomerInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      jobId,
      items,
      taxRate,
      notes,
    }: {
      jobId: string;
      items: InvoiceItem[];
      taxRate: number;
      notes?: string;
    }) => {
      const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const { data: invoice, error } = await supabase
        .from("customer_invoices")
        .insert({
          job_id: jobId,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          notes,
        })
        .select()
        .single();
      if (error) throw error;

      // Insert line items
      if (items.length > 0) {
        const { error: itemsErr } = await supabase
          .from("customer_invoice_items")
          .insert(
            items.map((item, idx) => ({
              invoice_id: invoice.id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total: item.quantity * item.unit_price,
              sort_order: idx,
            }))
          );
        if (itemsErr) throw itemsErr;
      }

      return invoice;
    },
    onSuccess: (invoice, vars) => {
      qc.invalidateQueries({ queryKey: ["customer_invoices", vars.jobId] });
      // Bridge: stamp invoice_sent_at on the job when first invoice is created
      // (many offices create+send in one step)
    },
  });
}

export function useUpdateInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      status,
      jobId,
      sentVia,
    }: {
      invoiceId: string;
      status: string;
      jobId: string;
      sentVia?: string;
    }) => {
      const updates: Record<string, any> = { status };
      if (status === "sent") {
        updates.sent_at = new Date().toISOString();
        if (sentVia) updates.sent_via = sentVia;
      }
      if (status === "paid") {
        updates.paid_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("customer_invoices")
        .update(updates)
        .eq("id", invoiceId);
      if (error) throw error;

      // Bridge: stamp invoice_sent_at on the job when invoice is marked sent
      if (status === "sent") {
        await supabase
          .from("jobs")
          .update({ invoice_sent_at: new Date().toISOString() })
          .eq("id", jobId)
          .is("invoice_sent_at", null);
      }

      // Bridge: When invoice is marked paid, stamp payment_collected_at + set status "invoiced"
      if (status === "paid") {
        await supabase
          .from("jobs")
          .update({
            status: "invoiced",
            payment_collected_at: new Date().toISOString(),
            last_payment_error: null,
            last_payment_error_at: null,
          })
          .eq("id", jobId)
          .not("status", "in", '("canceled")');
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["customer_invoices", vars.jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["activity_log"] });
      qc.invalidateQueries({ queryKey: ["chat-channels"] });
    },
  });
}
