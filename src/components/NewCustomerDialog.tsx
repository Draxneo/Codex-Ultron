/**
 * NewCustomerDialog — Parse customer info from pasted SMS text or manual entry.
 * Replaces the old chat-embedded customer creation flow.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerPreviewCard, type ParsedCustomer, type ExistingCustomerMatch } from "@/components/CustomerPreviewCard";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedModel } from "@/components/CopilotModelSelector";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2, UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after customer is created with the customer record */
  onCustomerCreated?: (customer: { id: string; first_name: string; last_name: string; phone?: string; address?: string }) => void;
}

export function NewCustomerDialog({ open, onOpenChange, onCustomerCreated }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("paste");
  const [smsText, setSmsText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [parsed, setParsed] = useState<ParsedCustomer | null>(null);
  const [matches, setMatches] = useState<ExistingCustomerMatch[]>([]);
  const [created, setCreated] = useState(false);

  // Manual fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSmsText("");
    setParsed(null);
    setMatches([]);
    setCreated(false);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setStreet("");
    setCity("");
    setState("");
    setZip("");
    setNotes("");
    setPhoneMatch(null);
    setAddressMatch(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleParse = async () => {
    if (!smsText.trim()) return;
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-actions", {
        body: { mode: "parse_customer", text: smsText, model: getSelectedModel() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setParsed(data.customer);
      setMatches(data.existingMatches || []);
    } catch (e: any) {
      toast({ title: "Parse failed", description: e.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const handleCreateFromParsed = async () => {
    if (!parsed) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-actions", {
        body: { mode: "create_customer", customer: parsed },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCreated(true);
      const name = `${parsed.first_name} ${parsed.last_name}`;
      toast({ title: "Customer Created", description: `${name} added to the system` });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onCustomerCreated?.({
        id: data.customer?.id,
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        phone: parsed.mobile_number,
        address: `${parsed.street}, ${parsed.city}, ${parsed.state} ${parsed.zip}`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleUseExisting = (match: ExistingCustomerMatch) => {
    setCreated(true);
    toast({ title: "Existing Customer Selected", description: `Using ${match.first_name} ${match.last_name}` });
    onCustomerCreated?.({
      id: match.id,
      first_name: match.first_name,
      last_name: match.last_name,
      phone: match.mobile_number,
      address: match.address,
    });
  };

  const [phoneMatch, setPhoneMatch] = useState<{ id: string; first_name: string; last_name: string } | null>(null);
  const [addressMatch, setAddressMatch] = useState<{ id: string; first_name: string; last_name: string } | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  // Check for existing customer when phone changes
  const checkPhoneDedup = async (phoneVal: string) => {
    const digits = phoneVal.replace(/\D/g, "");
    if (digits.length < 10) { setPhoneMatch(null); return; }
    const last10 = digits.slice(-10);
    setCheckingPhone(true);
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .or(`phone.ilike.%${last10}%,mobile_phone.ilike.%${last10}%`)
      .limit(1);
    setPhoneMatch(data?.[0] || null);
    setCheckingPhone(false);
  };

  // Check for existing customer when address changes (address+zip OR address+city)
  const checkAddressDedup = async (streetVal: string, zipVal: string) => {
    if (!streetVal) { setAddressMatch(null); return; }
    const normalized = streetVal.trim().toLowerCase().replace(/\b(apt|ste|suite|unit|#)\s*\S*/gi, "").trim();
    if (normalized.length < 5) { setAddressMatch(null); return; }

    // Try address+zip first
    if (zipVal && zipVal.length >= 5) {
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .ilike("address", `%${normalized}%`)
        .eq("zip", zipVal.trim())
        .limit(1);
      if (data?.[0]) { setAddressMatch(data[0]); return; }
    }

    // Fallback: address+city
    if (city) {
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .ilike("address", `%${normalized}%`)
        .ilike("city", city.trim())
        .limit(1);
      if (data?.[0]) { setAddressMatch(data[0]); return; }
    }

    // Fallback: name+address (no zip/city needed)
    if (firstName && lastName) {
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .ilike("first_name", firstName.trim())
        .ilike("last_name", lastName.trim())
        .ilike("address", `%${normalized}%`)
        .limit(1);
      if (data?.[0]) { setAddressMatch(data[0]); return; }
    }

    setAddressMatch(null);
  };

  const dupMatch = addressMatch || phoneMatch;

  const handleManualCreate = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (dupMatch) {
      toast({ title: "Duplicate detected", description: `${dupMatch.first_name} ${dupMatch.last_name} already exists. Use the existing record instead.`, variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const customerData: ParsedCustomer = {
        first_name: firstName,
        last_name: lastName,
        mobile_number: phone,
        email: email || undefined,
        street,
        city,
        state,
        zip,
        notes: notes || undefined,
      };
      const { data, error } = await supabase.functions.invoke("customer-actions", {
        body: { mode: "create_customer", customer: customerData },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const wasDeduplicated = data.customer?._deduplicated;
      toast({ title: wasDeduplicated ? "Existing Customer Found" : "Customer Created", description: `${firstName} ${lastName} ${wasDeduplicated ? "already existed — record updated" : "added"}` });
      qc.invalidateQueries({ queryKey: ["customers"] });
      onCustomerCreated?.({
        id: data.customer?.id,
        first_name: firstName,
        last_name: lastName,
        phone,
        address: [street, city, state, zip].filter(Boolean).join(", "),
      });
      handleClose(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            New Customer
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="paste" className="text-xs">Paste SMS / Info</TabsTrigger>
            <TabsTrigger value="manual" className="text-xs">Manual Entry</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-4 mt-4">
            <div>
              <Label>Paste customer info (SMS, email, notes)</Label>
              <Textarea
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="john smith 5551234567 123 main st anytown tx 75001 ac not cooling"
                rows={4}
                className="mt-1"
              />
            </div>

            {!parsed && (
              <Button onClick={handleParse} disabled={parsing || !smsText.trim()} className="w-full gap-2">
                {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {parsing ? "Parsing..." : "Parse Customer Info"}
              </Button>
            )}

            {parsed && (
              <CustomerPreviewCard
                customer={parsed}
                existingMatches={matches}
                onConfirm={handleCreateFromParsed}
                onUseExisting={handleUseExisting}
                loading={creating}
                created={created}
              />
            )}

            {created && (
              <DialogFooter>
                <Button variant="outline" onClick={() => handleClose(false)}>Done</Button>
              </DialogFooter>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); checkPhoneDedup(e.target.value); }} className="mt-1" />
                {phoneMatch && (
                  <div className="mt-1.5 p-2 rounded-md bg-warning/10 border border-warning/30 flex items-center justify-between">
                    <span className="text-xs text-warning font-medium">⚠ {phoneMatch.first_name} {phoneMatch.last_name} already has this phone</span>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
                      onCustomerCreated?.({ id: phoneMatch.id, first_name: phoneMatch.first_name, last_name: phoneMatch.last_name, phone });
                      handleClose(false);
                    }}>Use Existing</Button>
                  </div>
                )}
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Street</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} onBlur={() => checkAddressDedup(street, zip)} className="mt-1" />
              {addressMatch && !phoneMatch && (
                <div className="mt-1.5 p-2 rounded-md bg-warning/10 border border-warning/30 flex items-center justify-between">
                  <span className="text-xs text-warning font-medium">⚠ {addressMatch.first_name} {addressMatch.last_name} already at this address</span>
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
                    onCustomerCreated?.({ id: addressMatch.id, first_name: addressMatch.first_name, last_name: addressMatch.last_name, address: street });
                    handleClose(false);
                  }}>Use Existing</Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>State</Label>
                <Input value={state} onChange={(e) => setState(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Zip</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} onBlur={() => checkAddressDedup(street, zip)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes / Job Description</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleManualCreate} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {creating ? "Creating..." : "Create Customer"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
