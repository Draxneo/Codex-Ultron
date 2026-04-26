/**
 * TrainContactDialog — Teach JARVIS who a phone number belongs to.
 *
 * Used when JARVIS misclassifies a known vendor / marketing agency / answering
 * service / spam number as a "new lead." Saves to `known_contacts` so all future
 * messages from that number are correctly identified, retroactively updates
 * sms_log labels, and clears stale "new_lead" action items for that number.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Brain, Loader2, Trash2 } from "lucide-react";

const CONTACT_TYPES = [
  { value: "vendor", label: "Vendor (supply house, parts)" },
  { value: "marketing", label: "Marketing / Ads agency" },
  { value: "answering_service", label: "Answering service" },
  { value: "tech_partner", label: "Tech / contractor partner" },
  { value: "spam", label: "Spam / robocall" },
  { value: "personal", label: "Personal contact" },
  { value: "other", label: "Other" },
];

function digitsOnly(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  phone: string;
  defaultName?: string;
}

export function TrainContactDialog({ open, onOpenChange, phone, defaultName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const phoneDigits = digitsOnly(phone);

  const [name, setName] = useState(defaultName || "");
  const [contactType, setContactType] = useState("vendor");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  // Load existing record if any when dialog opens
  useEffect(() => {
    if (!open || !phoneDigits) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("known_contacts" as any)
        .select("id, name, contact_type, notes")
        .eq("phone_digits", phoneDigits)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const d = data as any;
        setExistingId(d.id);
        setName(d.name || defaultName || "");
        setContactType(d.contact_type || "vendor");
        setNotes(d.notes || "");
      } else {
        setExistingId(null);
        setName(defaultName || "");
        setContactType("vendor");
        setNotes("");
      }
    })();
    return () => { cancelled = true; };
  }, [open, phoneDigits, defaultName]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Tell JARVIS what to call this number.", variant: "destructive" });
      return;
    }
    if (phoneDigits.length !== 10) {
      toast({ title: "Bad phone number", description: "Need a 10-digit US number.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Upsert into known_contacts
      const { error: upsertErr } = await supabase
        .from("known_contacts" as any)
        .upsert(
          {
            phone_digits: phoneDigits,
            name: name.trim(),
            contact_type: contactType,
            notes: notes.trim() || null,
            created_by: user?.id || null,
          },
          { onConflict: "phone_digits" }
        );
      if (upsertErr) throw upsertErr;

      // Retro-update sms_log labels for this number
      await supabase
        .from("sms_log")
        .update({ contact_name: name.trim(), contact_type: contactType })
        .or(`phone_number.eq.${phone},phone_number.eq.+1${phoneDigits},phone_number.eq.${phoneDigits}`);

      // Clear stale "new_lead" pending action items for this number
      // (it's not a lead — it's a known vendor/marketing/etc)
      if (["vendor", "marketing", "answering_service", "spam", "tech_partner"].includes(contactType)) {
        await supabase
          .from("action_items")
          .delete()
          .eq("category", "new_lead")
          .eq("status", "pending")
          .or(`customer_phone.eq.${phone},customer_phone.eq.+1${phoneDigits},customer_phone.eq.${phoneDigits}`);
      }

      toast({
        title: "✓ JARVIS trained",
        description: `Future messages from ${name.trim()} will be tagged as ${contactType.replace("_", " ")}.`,
      });

      qc.invalidateQueries({ queryKey: ["action_items_pending"] });
      qc.invalidateQueries({ queryKey: ["sms_threads"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleForget = async () => {
    if (!existingId) return;
    setSaving(true);
    try {
      await supabase.from("known_contacts" as any).delete().eq("id", existingId);
      toast({ title: "Removed", description: "JARVIS will treat this number as unknown again." });
      qc.invalidateQueries({ queryKey: ["action_items_pending"] });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Train JARVIS
          </DialogTitle>
          <DialogDescription>
            Teach JARVIS who <span className="font-mono">{phone}</span> belongs to so it stops treating them like a new customer lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="train-name">Name / Company</Label>
            <Input
              id="train-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yelu Marketing"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="train-type">What are they?</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger id="train-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="train-notes">Context for JARVIS (optional)</Label>
            <Textarea
              id="train-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Google Ads vendor — discuss campaigns, never a customer lead. Surface to Clint only."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {existingId && (
            <Button variant="ghost" onClick={handleForget} disabled={saving} className="mr-auto text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Forget
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            {existingId ? "Update" : "Teach JARVIS"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
