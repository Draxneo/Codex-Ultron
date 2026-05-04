import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Gift, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

export default function ReferralPublic() {
  const { code } = useParams<{ code: string }>();
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const { toast } = useToast();
  const [referrer, setReferrer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [service, setService] = useState("");

  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data } = await supabase.from("referral_codes")
        .select("customer_id, customers(first_name, last_name)")
        .eq("code", code).eq("is_active", true).limit(1).single();
      if (!data) {
        setNotFound(true);
      } else {
        const cust = (data as any).customers;
        setReferrer([cust?.first_name, cust?.last_name].filter(Boolean).join(" ") || "a valued customer");
      }
      setLoading(false);
    })();
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code) return;
    setSubmitting(true);
    await supabase.from("referrals").insert({
      referrer_code: code,
      referred_name: name,
      referred_phone: phone || null,
      referred_email: email || null,
      referred_address: address || null,
      service_needed: service || null,
    });
    setSubmitting(false);
    setSubmitted(true);
    toast({ title: "Submitted!", description: "We'll be in touch soon." });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-8">
            <p className="text-muted-foreground">This referral link is no longer active.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Thank You!</h2>
            <p className="text-muted-foreground">We'll reach out to schedule your service soon.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You've Been Referred!</CardTitle>
          <CardDescription>
            {referrer} recommended {companyName} for your HVAC needs. Fill out the form below and we'll be in touch!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>Your Name *</Label><Input value={name} onChange={e => setName(e.target.value)} required /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><Label>Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
            <div><Label>What service do you need?</Label><Textarea value={service} onChange={e => setService(e.target.value)} rows={2} placeholder="AC repair, new system install, tune-up, etc." /></div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />}
              Get Started
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
