import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, X, Mail, Phone, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function PendingContactSuggestions() {
  const qc = useQueryClient();
  const [vendorPicks, setVendorPicks] = useState<Record<string, string>>({});

  const { data: pending, isLoading } = useQuery({
    queryKey: ["pending_vendor_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_vendor_contacts")
        .select("*")
        .eq("status", "pending")
        .order("occurrence_count", { ascending: false })
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ["supply_houses_for_assign"],
    queryFn: async () => {
      const { data } = await supabase
        .from("supply_houses")
        .select("id, name, website_url")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const approve = useMutation({
    mutationFn: async ({ id, vendorId, name, email, phone }: { id: string; vendorId: string; name: string | null; email: string; phone: string | null }) => {
      const { error: insertErr } = await supabase.from("vendor_contacts").upsert(
        { supply_house_id: vendorId, name: name || email.split("@")[0], email, phone },
        { onConflict: "supply_house_id,email", ignoreDuplicates: false }
      );
      if (insertErr) throw insertErr;
      const { error: updateErr } = await supabase
        .from("pending_vendor_contacts")
        .update({ status: "approved", suggested_vendor_id: vendorId, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_vendor_contacts"] });
      qc.invalidateQueries({ queryKey: ["vendor_contacts"] });
      toast({ title: "Contact added", description: "Vendor contact saved." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pending_vendor_contacts")
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_vendor_contacts"] });
    },
  });

  if (isLoading) {
    return (
      <Card className="p-4 flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading suggestions…
      </Card>
    );
  }

  if (!pending || pending.length === 0) return null;

  return (
    <Card className="overflow-hidden border-amber-500/30">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Suggested vendor contacts</h3>
          <Badge variant="secondary" className="text-xs">{pending.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">Auto-detected from inbound emails</span>
      </div>
      <div className="divide-y max-h-[420px] overflow-y-auto">
        {pending.map((p: any) => {
          const guessVendor = (vendors || []).find((v: any) => {
            const wd = v.website_url?.replace(/^https?:\/\//, "").replace(/\/.*/, "").toLowerCase();
            return wd && p.sender_domain?.includes(wd);
          });
          const selectedVendor = vendorPicks[p.id] || guessVendor?.id || "";
          return (
            <div key={p.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.sender_name || p.sender_email.split("@")[0]}</span>
                    {p.occurrence_count > 1 && (
                      <Badge variant="secondary" className="text-[10px]">seen {p.occurrence_count}×</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {p.sender_email}</span>
                    {p.phone_guess && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone_guess}</span>}
                    <span>· @{p.sender_domain}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Select value={selectedVendor} onValueChange={(v) => setVendorPicks((prev) => ({ ...prev, [p.id]: v }))}>
                  <SelectTrigger className="h-8 text-xs flex-1 min-w-[180px] max-w-[260px]">
                    <SelectValue placeholder="Assign to vendor…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(vendors || []).map((v: any) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-8"
                  disabled={!selectedVendor || approve.isPending}
                  onClick={() => approve.mutate({
                    id: p.id,
                    vendorId: selectedVendor,
                    name: p.sender_name,
                    email: p.sender_email,
                    phone: p.phone_guess,
                  })}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() => dismiss.mutate(p.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
