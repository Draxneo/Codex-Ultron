import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  messageSid: string;
  className?: string;
}

interface InspectResult {
  sid: string;
  status: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  num_segments: string | null;
  num_media: string | null;
  price: string | null;
  price_unit: string | null;
  error_code: string | null;
  error_message: string | null;
  date_created: string | null;
  date_sent: string | null;
  date_updated: string | null;
  media: Array<{ sid: string; content_type: string; url: string }>;
}

/**
 * Admin-only diagnostic button — pulls live Twilio data for a MessageSid.
 * Mirrors InspectTwilioButton (voice). Shown on outbound SMS rows that
 * are stuck (sending / failed / undelivered) so the operator can see the
 * authoritative status + Twilio error explanation.
 */
export function InspectTwilioSmsButton({ messageSid, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);

  const inspect = async () => {
    setOpen(true);
    if (result) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-sms-inspect", {
        body: { messageSid },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as InspectResult);
    } catch (e: any) {
      toast.error(`Twilio lookup failed: ${e.message || e}`);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inspect();
        }}
        className={className}
        title="Inspect Twilio — fetch authoritative SMS status"
      >
        <Search className="h-3 w-3 mr-1" />
        Inspect
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Twilio SMS inspector</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">
              {messageSid}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Querying Twilio…
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <section className="border rounded-md p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    variant={
                      result.status === "delivered"
                        ? "default"
                        : result.status === "failed" || result.status === "undelivered"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {result.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{result.direction}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="From" value={result.from} />
                  <Field label="To" value={result.to} />
                  <Field label="Segments" value={result.num_segments || "—"} />
                  <Field label="Media" value={result.num_media || "0"} />
                  <Field
                    label="Price"
                    value={
                      result.price ? `${result.price} ${result.price_unit || ""}` : "—"
                    }
                  />
                  <Field label="Sent" value={fmt(result.date_sent)} />
                </div>
              </section>

              {(result.error_code || result.error_message) && (
                <section className="border border-destructive/40 rounded-md p-3 bg-destructive/5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-2">
                    Twilio error
                  </h3>
                  <div className="text-xs space-y-1">
                    {result.error_code && (
                      <div>
                        <span className="text-muted-foreground">Code:</span>{" "}
                        <span className="font-mono font-medium">{result.error_code}</span>
                      </div>
                    )}
                    {result.error_message && (
                      <div>
                        <span className="text-muted-foreground">Message:</span>{" "}
                        <span>{result.error_message}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="border rounded-md p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Body
                </h3>
                <p className="text-xs whitespace-pre-wrap break-words">{result.body || "—"}</p>
              </section>

              {result.media.length > 0 && (
                <section className="border rounded-md p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Media — {result.media.length}
                  </h3>
                  <div className="space-y-1.5">
                    {result.media.map((m) => (
                      <div key={m.sid} className="flex items-center justify-between text-xs">
                        <span className="font-mono truncate">{m.content_type}</span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-2"
                        >
                          open
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
