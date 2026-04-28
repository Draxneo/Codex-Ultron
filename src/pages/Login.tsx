import { useState } from "react";
import logo from "@/assets/logo.png";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";

export default function Login() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const { settings } = useCompanySettings();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showReset, setShowReset] = useState(false);

  if (loading) {
    return <LoadingSpinner fullPage />;
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (showReset) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setSubmitting(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "Password reset link sent." });
        setShowReset(false);
      }
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) {
        const raw = error.message || "";
        const isBackendIssue = !raw || raw === "{}" || /timeout|fetch failed|network error|upstream|502|503|504/i.test(raw);
        const description = isBackendIssue
          ? "The backend is temporarily unavailable. Please wait a moment and try again."
          : raw === "Invalid login credentials"
            ? "Invalid email or password."
            : raw;
        toast({ title: "Login error", description, variant: "destructive" });
      }
    } catch (error) {
      setSubmitting(false);
      const raw = error instanceof Error ? error.message : String(error);
      const isBackendIssue = !raw || raw === "{}" || /timeout|fetch failed|network error|upstream|502|503|504/i.test(raw);
      toast({
        title: "Login error",
        description: isBackendIssue
          ? "The backend is temporarily unavailable. Please wait a moment and try again."
          : raw,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <img src={logo} alt={companyName} className="h-14 w-14 rounded-lg mx-auto" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">{companyName}</CardTitle>
          <p className="text-xs text-muted-foreground">Organize Plus</p>
          <CardDescription>
            {showReset ? "Reset your password" : "Sign in to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {!showReset && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "..." : showReset ? "Send Reset Link" : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {!showReset ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-primary underline"
                onClick={() => setShowReset(true)}
              >
                Forgot password?
              </button>
            ) : (
              <button
                type="button"
                className="text-muted-foreground hover:text-primary underline"
                onClick={() => setShowReset(false)}
              >
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
