import { useState } from "react";
import logo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";


export default function PortalLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [codeSentVia, setCodeSentVia] = useState<"sms" | "email">("sms");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("portal-auth", {
      body: { action: "send_code", email: email.trim().toLowerCase() },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Something went wrong", variant: "destructive" });
      return;
    }
    setCustomerId(data.customer_id);
    setMaskedPhone(data.masked_phone);
    setMaskedEmail(data.masked_email || "");
    setCodeSentVia("sms");
    setStep("code");
    toast({ title: "Code sent!", description: `Verification code sent to ${data.masked_phone}` });
  };

  const handleResendViaEmail = async () => {
    setResending(true);
    const { data, error } = await supabase.functions.invoke("portal-auth", {
      body: { action: "send_code", email: email.trim().toLowerCase(), delivery: "email" },
    });
    setResending(false);
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message || "Could not send email", variant: "destructive" });
      return;
    }
    setCodeSentVia("email");
    toast({ title: "Code sent!", description: `Verification code sent to ${data.masked_email || "your email"}` });
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("portal-auth", {
      body: { action: "verify_code", email: customerId, code },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({ title: "Invalid code", description: data?.error || "Please try again", variant: "destructive" });
      return;
    }
    localStorage.setItem("portal_session_token", data.token);
    navigate("/portal/dashboard");
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <img src={logo} alt="Company Logo" className="h-14 w-14 rounded-lg mx-auto" />
          </div>
          <CardTitle>Customer Portal</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Enter your email to receive a verification code."
              : codeSentVia === "email"
                ? `Enter the 6-digit code sent to ${maskedEmail}`
                : `Enter the 6-digit code sent to ${maskedPhone}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Code
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <Label>Verification Code</Label>
                <Input
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify & Sign In
              </Button>

              {codeSentVia === "sms" && maskedEmail && (
                <button
                  type="button"
                  onClick={handleResendViaEmail}
                  disabled={resending}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                  Didn't get it? Send code to my email instead
                </button>
              )}

              <Button type="button" variant="ghost" className="w-full text-xs" onClick={() => { setStep("email"); setCode(""); }}>
                Use a different email
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
