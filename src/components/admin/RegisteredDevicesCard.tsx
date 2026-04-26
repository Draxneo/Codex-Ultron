/**
 * RegisteredDevicesCard — Admin → Config → Voice & Phone
 *
 * Calls the `twilio-list-registered-devices` edge function and shows which
 * native devices currently have a live FCM/APN push binding with Twilio.
 * Useful when "press 1 / press 2" calls are ringing on the IVR but no
 * device picks up — confirms whether the device is actually registered.
 */
import { useState } from "react";
import { RefreshCw, Smartphone, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Binding = {
  type: string;
  address_preview: string;
  last_updated: string;
  service: string;
};
type Identity = {
  identity: string;
  employee_name: string | null;
  employee_role: string | null;
  bindings: Binding[];
};
type Result = {
  summary: {
    total_identities_with_push: number;
    notify_services_checked: number;
    recent_inbound_calls: number;
  };
  identities: Identity[];
  recent_inbound: Array<{
    answered_by: string | null;
    status: string;
    started_at: string | null;
    twilio_sid: string | null;
  }>;
  note: string;
};

export function RegisteredDevicesCard() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-list-registered-devices");
      if (error) throw error;
      setResult(data as Result);
      toast.success(`Found ${data.summary.total_identities_with_push} registered native device(s)`);
    } catch (err: any) {
      toast.error(`Diagnostic failed: ${err.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-primary" />
          Registered Phone Devices
        </CardTitle>
        <CardDescription>
          Live snapshot of which native devices Twilio can currently push incoming
          calls to. If a person isn't ringing on IVR press-1/2, check here first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetchData} disabled={loading} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Checking Twilio…" : "Check registered devices"}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                {result.summary.total_identities_with_push} identity(ies) with push
              </Badge>
              <Badge variant="secondary">
                {result.summary.notify_services_checked} Notify service(s) checked
              </Badge>
              <Badge variant="secondary">
                {result.summary.recent_inbound_calls} inbound call(s) last hour
              </Badge>
            </div>

            {result.identities.length === 0 ? (
              <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive rounded-md p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">No native devices registered.</p>
                  <p className="text-xs mt-1">
                    No FCM/APN push bindings found. Android/iOS apps must be open
                    and signed in for incoming IVR calls to ring. Browser/Electron
                    JS SDK registrations are not visible via this API — only
                    native push registrations show up here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {result.identities.map((id) => (
                  <div
                    key={id.identity}
                    className="border rounded-md p-3 text-sm space-y-1 bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="font-medium">
                          {id.employee_name || id.identity}
                        </span>
                        {id.employee_role && (
                          <Badge variant="outline" className="text-xs">
                            {id.employee_role}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {id.identity}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                      {id.bindings.map((b, i) => (
                        <div key={i}>
                          • <span className="uppercase font-mono">{b.type}</span>{" "}
                          via {b.service} — last seen{" "}
                          {new Date(b.last_updated).toLocaleString()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">{result.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
