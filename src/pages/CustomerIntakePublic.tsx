import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

export default function CustomerIntakePublic() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAlt, setShowAlt] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    address: "",
    phone: "",
    email: "",
    description: "",
    alt_contact_name: "",
    alt_contact_phone: "",
  });

  // Validate token
  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase
        .from("customer_intake_tokens" as any)
        .select("id, phone, completed_at")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) {
        setValid(false);
      } else if ((data as any).completed_at) {
        setSubmitted(true);
        setValid(true);
      } else {
        setValid(true);
        if ((data as any).phone) {
          setForm((f) => ({ ...f, phone: (data as any).phone }));
        }
      }
      setLoading(false);
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!form.first_name || !form.last_name || !form.address || !form.phone) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("customer-actions", {
        body: {
          mode: "complete_intake",
          token,
          customer: {
            first_name: form.first_name,
            last_name: form.last_name,
            mobile_number: form.phone,
            email: form.email,
            street: form.address,
            notes: [
              form.description,
              form.alt_contact_name ? `Alt contact: ${form.alt_contact_name} ${form.alt_contact_phone}` : null,
            ].filter(Boolean).join(" | "),
          },
        },
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Toaster />
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Link Expired</h1>
          <p className="text-muted-foreground text-sm">
            This intake form link has expired or is invalid. Please contact us to request a new one.
          </p>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Toaster />
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Thank You!</h1>
          <p className="text-muted-foreground text-sm">
            Your information has been received. We'll be in touch shortly to schedule your service.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <Toaster />
      <div className="max-w-lg mx-auto space-y-6 py-8">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Customer Information</h1>
          <p className="text-muted-foreground text-sm">
            Please fill out your information below so we can get you set up quickly.
          </p>
        </div>

        <Card className="p-6">
         <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">First Name *</Label>
              <Input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="First name"
                className="mt-1"
                autoComplete="given-name"
                name="given-name"
              />
            </div>
            <div>
              <Label className="text-sm">Last Name *</Label>
              <Input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Last name"
                className="mt-1"
                autoComplete="family-name"
                name="family-name"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">Service Address *</Label>
            <div className="mt-1">
              <AddressAutocomplete
                value={form.address}
                onChange={(val) => setForm({ ...form, address: val })}
                placeholder="Start typing your address…"
                autoComplete="street-address"
                name="street-address"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm">Phone *</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="(210) 555-1234"
              className="mt-1"
              autoComplete="tel"
              name="tel"
            />
          </div>

          <div>
            <Label className="text-sm">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="your@email.com"
              className="mt-1"
              autoComplete="email"
              name="email"
            />
          </div>

          <div>
            <Label className="text-sm">What's going on? (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Briefly describe the issue or service needed…"
              className="mt-1 min-h-[80px]"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAlt(!showAlt)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAlt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Alternative contact for day of service
          </button>

          {showAlt && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contact Name</Label>
                <Input
                  value={form.alt_contact_name}
                  onChange={(e) => setForm({ ...form, alt_contact_name: e.target.value })}
                  placeholder="Name"
                  className="mt-1 h-10 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Contact Phone</Label>
                <Input
                  type="tel"
                  value={form.alt_contact_phone}
                  onChange={(e) => setForm({ ...form, alt_contact_phone: e.target.value })}
                  placeholder="Phone"
                  className="mt-1 h-10 text-sm"
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitting || !form.first_name || !form.last_name || !form.address || !form.phone}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Information
          </Button>
         </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Your information is secure and will only be used to schedule your service.
        </p>
      </div>
    </div>
  );
}
