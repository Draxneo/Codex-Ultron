import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, SplitSquareHorizontal } from "lucide-react";
import { usePaymentPlanRules, useCreatePaymentPlanRule, useUpdatePaymentPlanRule, useDeletePaymentPlanRule, type PaymentPlanRule } from "@/hooks/usePaymentPlanRules";
import { toast } from "@/hooks/use-toast";

const JOB_TYPE_LABELS: Record<string, string> = {
  all: "All Job Types",
  install: "Install",
  service: "Service",
  maintenance: "Maintenance",
  repair: "Repair",
  phone_call: "Phone Call",
  estimate: "Estimate",
};

export function PaymentPlanRulesCard() {
  const { data: rules, isLoading } = usePaymentPlanRules();
  const createMut = useCreatePaymentPlanRule();
  const updateMut = useUpdatePaymentPlanRule();
  const deleteMut = useDeletePaymentPlanRule();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    job_type: "all",
    min_amount: "0",
    max_amount: "",
    max_installments: "2",
  });

  const handleCreate = async () => {
    await createMut.mutateAsync({
      job_type: form.job_type,
      min_amount: Number(form.min_amount),
      max_amount: form.max_amount ? Number(form.max_amount) : null,
      max_installments: Number(form.max_installments),
      is_active: true,
    });
    setCreating(false);
    setForm({ job_type: "all", min_amount: "0", max_amount: "", max_installments: "2" });
    toast({ title: "Payment plan rule added" });
  };

  const fmt = (n: number) => `$${Number(n).toLocaleString()}`;

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <SplitSquareHorizontal className="h-4 w-4" /> Payment Plan Rules
            </CardTitle>
            <CardDescription className="text-xs">
              Define which invoices qualify for installment payments based on job type and amount.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
          {rules?.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No rules yet — all invoices will default to pay-in-full only.
            </p>
          )}
          {rules?.map(r => (
            <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{JOB_TYPE_LABELS[r.job_type] || r.job_type}</Badge>
                  <span className="text-sm">
                    {fmt(r.min_amount)}{r.max_amount ? ` – ${fmt(r.max_amount)}` : "+"} → up to {r.max_installments} payments
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) => updateMut.mutate({ id: r.id, is_active: v })}
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  deleteMut.mutate(r.id);
                  toast({ title: "Rule deleted" });
                }}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Payment Plan Rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Job Type</Label>
              <Select value={form.job_type} onValueChange={v => setForm(p => ({ ...p, job_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Job Types</SelectItem>
                  <SelectItem value="install">Install</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="estimate">Estimate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Min Amount ($)</Label>
                <Input type="number" value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Max Amount ($)</Label>
                <Input type="number" placeholder="No limit" value={form.max_amount} onChange={e => setForm(p => ({ ...p, max_amount: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Max Installments</Label>
              <Select value={form.max_installments} onValueChange={v => setForm(p => ({ ...p, max_installments: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 payments</SelectItem>
                  <SelectItem value="3">3 payments</SelectItem>
                  <SelectItem value="4">4 payments</SelectItem>
                  <SelectItem value="6">6 payments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Add Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
