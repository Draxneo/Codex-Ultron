import { useState } from "react";
import { Plus, Trash2, Send, DollarSign, Check, FileText, CreditCard, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomerInvoices, useCreateCustomerInvoice, useUpdateCustomerInvoice, useUpdateInvoiceStatus, type InvoiceItem } from "@/hooks/useCustomerInvoices";
import { usePaymentPlanRules, getMaxInstallments } from "@/hooks/usePaymentPlanRules";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { INVOICE_STATUS_COLORS } from "@/lib/statusColors";
const statusColors: Record<string, string> = Object.fromEntries(
  Object.entries(INVOICE_STATUS_COLORS).map(([k, v]) => [k, v.className])
);

type Props = {
  jobId: string;
  jobType?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
};

export default function CustomerInvoicePanel({ jobId, jobType, customerName, customerPhone, customerEmail }: Props) {
  const { data: invoices, isLoading } = useCustomerInvoices(jobId);
  const { data: rules } = usePaymentPlanRules();
  const createInvoice = useCreateCustomerInvoice();
  const updateInvoice = useUpdateCustomerInvoice();
  const updateStatus = useUpdateInvoiceStatus();

  const [creating, setCreating] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unit_price: 0, total: 0, sort_order: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [notes, setNotes] = useState("");
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editTaxRate, setEditTaxRate] = useState(8.25);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("draft");
  const [sending, setSending] = useState<string | null>(null);

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0, total: 0, sort_order: items.length }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    updated[idx].total = updated[idx].quantity * updated[idx].unit_price;
    setItems(updated);
  };

  const editSubtotal = editItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const editTaxAmount = editSubtotal * (editTaxRate / 100);
  const editTotal = editSubtotal + editTaxAmount;

  const openEditInvoice = (invoice: any) => {
    setEditingInvoice(invoice);
    setEditTaxRate(Number(invoice.tax_rate || 0));
    setEditNotes(invoice.notes || "");
    setEditStatus(invoice.status || "draft");
    setEditItems(
      (invoice.customer_invoice_items || []).map((item: any, index: number) => ({
        id: item.id,
        description: item.description || "",
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        total: Number(item.total || 0),
        sort_order: item.sort_order ?? index,
      })),
    );
  };

  const addEditItem = () => setEditItems([...editItems, { description: "", quantity: 1, unit_price: 0, total: 0, sort_order: editItems.length }]);
  const removeEditItem = (idx: number) => setEditItems(editItems.filter((_, i) => i !== idx));
  const updateEditItem = (idx: number, field: string, value: any) => {
    const updated = [...editItems];
    (updated[idx] as any)[field] = value;
    updated[idx].total = updated[idx].quantity * updated[idx].unit_price;
    setEditItems(updated);
  };

  const handleSaveEdit = async () => {
    if (!editingInvoice) return;
    const validItems = editItems.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    await updateInvoice.mutateAsync({
      invoiceId: editingInvoice.id,
      jobId,
      items: validItems,
      taxRate: editTaxRate,
      notes: editNotes,
      status: editStatus,
    });
    await supabase.from("activity_log").insert({
      job_id: jobId,
      action: "invoice_updated",
      details: `Invoice ${editingInvoice.invoice_number || editingInvoice.id.slice(0, 8)} edited`,
    });
    toast({ title: "Invoice updated" });
    setEditingInvoice(null);
  };

  const handleCreate = async () => {
    const validItems = items.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    await createInvoice.mutateAsync({ jobId, items: validItems, taxRate, notes });
    toast({ title: "Invoice created" });
    setCreating(false);
    setItems([{ description: "", quantity: 1, unit_price: 0, total: 0, sort_order: 0 }]);
    setNotes("");
  };

  const handleSendSMS = async (invoiceId: string, invoiceNumber: string, invoiceTotal: number) => {
    if (!customerPhone) {
      toast({ title: "No phone number", description: "Customer has no phone on file.", variant: "destructive" });
      return;
    }
    setSending(invoiceId);
    // Find the public_token for this invoice to build the link
    const inv = invoices?.find((i: any) => i.id === invoiceId);
    const publicToken = inv?.public_token;
    const link = publicToken ? `\n\nView & pay online: ${window.location.origin}/invoice/${publicToken}` : "";
    const body = `Hi ${customerName?.split(" ")[0] || "there"}, thank you for letting our family help yours. Invoice ${invoiceNumber} for $${invoiceTotal.toFixed(2)} is ready.${link}`;
    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    const result = await sendSmsImpl({
      to: customerPhone, body, jobId, contactName: customerName || null,
      contactType: "customer", source: "customer_invoice_sms", hitlApproved: true, silent: true,
    });
    if (!result.success) {
      toast({ title: "SMS failed", description: result.error, variant: "destructive" });
    } else {
      await updateStatus.mutateAsync({ invoiceId, status: "sent", jobId, sentVia: "sms" });
      // Stamp invoice_sent_at on the job for attention/lifecycle tracking
      await supabase.from("jobs").update({ invoice_sent_at: new Date().toISOString() } as any).eq("id", jobId).is("invoice_sent_at" as any, null);
      await supabase.from("activity_log").insert({ job_id: jobId, action: "invoice_sent_sms", details: `Invoice ${invoiceNumber} sent via SMS` });
      toast({ title: "Invoice sent via SMS" });
    }
    setSending(null);
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await updateStatus.mutateAsync({ invoiceId, status: "paid", jobId });

    // Release held paysheet entries for this job
    const { data: heldEntries } = await supabase
      .from("paysheet_entries")
      .select("id, rate_type, pay_category")
      .eq("job_id", jobId)
      .eq("status", "held");

    const inv = invoices?.find((i: any) => i.id === invoiceId);
    const invoiceTotal = inv?.total || 0;

    if (heldEntries && heldEntries.length > 0) {
      for (const entry of heldEntries) {
        const updates: any = { status: "pending" };
        if ((entry as any).rate_type === "percentage" && invoiceTotal > 0) {
          // Recalculate percentage-based amount
          const { data: empRate } = await supabase
            .from("employee_pay_rates")
            .select("rate")
            .eq("employee_id", (entry as any).employee_id)
            .eq("job_type", (entry as any).pay_category || "service")
            .single();
          if (empRate?.rate) {
            updates.amount = (empRate.rate / 100) * invoiceTotal;
          }
        }
        await supabase.from("paysheet_entries").update(updates).eq("id", entry.id);
      }
    }

    // Stamp payment_collected_at on job
    await supabase.from("jobs").update({
      payment_collected_at: new Date().toISOString(),
    } as any).eq("id", jobId);
    await supabase.from("activity_log").insert({ job_id: jobId, action: "payment_collected", details: `Payment marked as collected` });

    // Compute and cache job profitability
    const { data: allEntries } = await supabase
      .from("paysheet_entries")
      .select("amount")
      .eq("job_id", jobId)
      .in("status", ["pending", "approved", "paid"]);
    const laborCost = (allEntries || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);

    const { data: jobInvoices } = await supabase
      .from("job_invoices" as any)
      .select("total_amount")
      .eq("job_id", jobId);
    const partsCost = ((jobInvoices || []) as any[]).reduce((s: number, i: any) => s + (i.total_amount || 0), 0);

    const revenue = invoiceTotal;
    const totalCost = partsCost + laborCost;
    const profit = revenue - totalCost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

    await supabase.from("jobs").update({
      parts_cost: partsCost,
      labor_cost: laborCost,
      total_cost: totalCost,
      profit: Math.round(profit * 100) / 100,
      margin_pct: Math.round(marginPct * 10) / 10,
    } as any).eq("id", jobId);

    toast({ title: "Invoice marked as paid" });
  };

  const handlePayOnline = async (invoiceId: string, invoiceTotal: number, planCount: number) => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          type: "invoice",
          invoice_id: invoiceId,
          amount: invoiceTotal,
          customer_name: customerName,
          customer_email: customerEmail,
          payment_plan_count: planCount,
          payment_plan_interval: planCount > 1 ? "month" : undefined,
          success_url: `${window.location.origin}/jobs/${jobId}?paid=true`,
          cancel_url: `${window.location.origin}/jobs/${jobId}`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        navigator.clipboard.writeText(data.url);
        // Bridge: stamp invoice_sent_at on the job since we're sharing a payment link
        await supabase.from("jobs").update({ invoice_sent_at: new Date().toISOString() } as any).eq("id", jobId).is("invoice_sent_at" as any, null);
        await supabase.from("activity_log").insert({ job_id: jobId, action: "invoice_sent_stripe", details: "Payment link generated and copied" });
        // Also mark the invoice as sent
        await updateStatus.mutateAsync({ invoiceId, status: "sent", jobId, sentVia: "stripe_link" });
        toast({
          title: "Payment link copied!",
          description: planCount > 1 ? `${planCount}-payment plan link copied.` : "Share this link with the customer.",
        });
      }
    } catch (e: any) {
      toast({ title: "Stripe error", description: e.message, variant: "destructive" });
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  /** Build payment options for a given invoice total based on rules */
  const getPaymentOptions = (invoiceTotal: number) => {
    const maxInstall = getMaxInstallments(rules || [], jobType || null, invoiceTotal);
    const options = [{ value: "1", label: `Pay in Full — ${fmt(invoiceTotal)}` }];
    for (let i = 2; i <= maxInstall; i++) {
      options.push({ value: String(i), label: `${i} Payments — ${fmt(invoiceTotal / i)}/mo` });
    }
    return options;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4" /> Customer Invoices
        </h3>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Invoice
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {invoices && invoices.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground text-center py-6">No invoices yet</p>
      )}

      {invoices?.map((inv: any) => {
        const payOptions = getPaymentOptions(inv.total);
        return (
          <Card key={inv.id} className="overflow-hidden">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {inv.invoice_number || "Draft"}
                </CardTitle>
                <Badge className={cn("text-[10px]", statusColors[inv.status] || statusColors.draft)}>
                  {inv.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(inv.created_at), "M/d/yyyy h:mm a")}
                {inv.sent_at && <> · Sent {format(new Date(inv.sent_at), "M/d")}</>}
                {inv.paid_at && <> · Paid {format(new Date(inv.paid_at), "M/d")}</>}
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {inv.customer_invoice_items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span className="flex-1">{item.description}</span>
                  <span className="text-muted-foreground">{item.quantity} × {fmt(item.unit_price)}</span>
                  <span className="ml-3 font-medium w-20 text-right">{fmt(item.total)}</span>
                </div>
              ))}
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Subtotal</span><span className="font-medium">{fmt(inv.subtotal)}</span>
                </div>
                {inv.tax_amount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span>Tax ({inv.tax_rate}%)</span><span>{fmt(inv.tax_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold">
                  <span>Total</span><span>{fmt(inv.total)}</span>
                </div>
              </div>
              {inv.notes && <p className="text-xs text-muted-foreground italic">{inv.notes}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openEditInvoice(inv)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
              </div>
              {inv.status !== "paid" && inv.status !== "void" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {payOptions.length === 1 ? (
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handlePayOnline(inv.id, inv.total, 1)}>
                      <CreditCard className="h-3 w-3 mr-1" /> Pay Online
                    </Button>
                  ) : (
                    <Select onValueChange={(plan) => handlePayOnline(inv.id, inv.total, Number(plan))}>
                      <SelectTrigger className="h-7 w-auto text-xs gap-1 border-input">
                        <CreditCard className="h-3 w-3" />
                        <span>Pay Online</span>
                      </SelectTrigger>
                      <SelectContent>
                        {payOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {customerPhone && (
                    <Button size="sm" variant="outline" className="text-xs h-7" disabled={sending === inv.id} onClick={() => handleSendSMS(inv.id, inv.invoice_number, inv.total)}>
                      <Send className="h-3 w-3 mr-1" /> {sending === inv.id ? "Sending..." : "SMS"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleMarkPaid(inv.id)}>
                    <Check className="h-3 w-3 mr-1" /> Mark Paid
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Create Invoice Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Line Items</Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                    className="w-16 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.unit_price || ""}
                    onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                    className="w-24 h-9 text-sm"
                  />
                  <span className="text-sm font-medium pt-2 w-20 text-right">{fmt(item.quantity * item.unit_price)}</span>
                  {items.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => removeItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="ghost" className="text-xs" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>

            <div className="flex gap-4">
              <div>
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-24 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax ({taxRate}%)</span><span>{fmt(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createInvoice.isPending}>
              {createInvoice.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={!!editingInvoice} onOpenChange={(open) => !open && setEditingInvoice(null)}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-xs">Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Line Items</Label>
              {editItems.map((item, idx) => (
                <div key={`${item.id || "new"}-${idx}`} className="flex gap-2 items-start">
                  <Input
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateEditItem(idx, "description", e.target.value)}
                    className="flex-1 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity || ""}
                    onChange={(e) => updateEditItem(idx, "quantity", Number(e.target.value))}
                    className="w-16 h-9 text-sm"
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    value={item.unit_price || ""}
                    onChange={(e) => updateEditItem(idx, "unit_price", Number(e.target.value))}
                    className="w-24 h-9 text-sm"
                  />
                  <span className="text-sm font-medium pt-2 w-20 text-right">{fmt(item.quantity * item.unit_price)}</span>
                  {editItems.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => removeEditItem(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="ghost" className="text-xs" onClick={addEditItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>

            <div className="flex gap-4">
              <div>
                <Label className="text-xs">Tax Rate (%)</Label>
                <Input
                  type="number"
                  value={editTaxRate}
                  onChange={(e) => setEditTaxRate(Number(e.target.value))}
                  className="w-24 h-9 text-sm"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="Optional notes..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            <div className="border-t pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span><span>{fmt(editSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax ({editTaxRate}%)</span><span>{fmt(editTaxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span><span>{fmt(editTotal)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingInvoice(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateInvoice.isPending}>
              {updateInvoice.isPending ? "Saving..." : "Save Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
