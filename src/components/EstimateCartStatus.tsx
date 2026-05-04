import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, Eye, Send, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getJobCompanyName } from "@/lib/jobCompany";

interface Props {
  estimateId: string;
  customerPhone?: string;
  customerName?: string;
}

type EstimatePresentationRow = {
  id: string;
  token: string;
  first_viewed_at: string | null;
};

type EstimateResponseRow = {
  action: string | null;
  selected_tier: string | null;
  payment_preference: string | null;
  responded_at: string | null;
};

export function EstimateCartStatus({ estimateId, customerPhone, customerName }: Props) {
  const { toast } = useToast();

  const { data: presentations } = useQuery({
    queryKey: ["estimate_cart_status", estimateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("estimate_presentations")
        .select("id, token, first_viewed_at")
        .eq("estimate_id", estimateId)
        .eq("cart_source", "tech_onsite")
        .order("created_at", { ascending: false });
      return (data || []) as EstimatePresentationRow[];
    },
  });

  const latest = presentations?.[0];
  const hasResponse = latest?.first_viewed_at;

  const resend = async () => {
    if (!customerPhone) return;
    const link = `${window.location.origin}/presentation/${latest.token}`;
    const firstName = customerName?.split(" ")[0] || "there";
    const companyName = await getJobCompanyName(estimateId);
    const { sendSmsImpl } = await import("@/hooks/useSendSms");
    await sendSmsImpl({
      to: customerPhone,
      body: `Hi ${firstName}, ${companyName} has your estimate ready when you have a minute. You can review it here and text us back with any questions: ${link}`,
      contactName: customerName || null,
      contactType: "customer",
      source: "estimate_cart_resend",
      hitlApproved: true,
      silent: true,
    });
    toast({ title: "Link resent" });
  };

  // Check for approved response
  const { data: responses } = useQuery({
    queryKey: ["estimate_cart_responses", latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("estimate_responses")
        .select("action, selected_tier, payment_preference, responded_at")
        .eq("presentation_id", latest!.id)
        .order("responded_at", { ascending: false })
        .limit(1);
      return (data || []) as EstimateResponseRow[];
    },
  });

  if (!latest) return null;

  const response = responses?.[0];
  const status = response?.action === "approved" ? "approved" : hasResponse ? "viewed" : "pending";

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Estimate Cart</h4>
          <Badge variant={status === "approved" ? "default" : status === "viewed" ? "secondary" : "outline"}>
            {status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {status === "viewed" && <Eye className="h-3 w-3 mr-1" />}
            {status === "pending" && <Clock className="h-3 w-3 mr-1" />}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>

        {response?.selected_tier && (
          <p className="text-sm text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{response.selected_tier}</span>
            {response.payment_preference && ` · ${response.payment_preference}`}
          </p>
        )}

        {response?.responded_at && (
          <p className="text-xs text-muted-foreground">
            Approved {new Date(response.responded_at).toLocaleDateString()}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={resend} disabled={!customerPhone}>
            <Send className="h-3 w-3 mr-1" /> Resend
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={`/presentation/${latest.token}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> View
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
