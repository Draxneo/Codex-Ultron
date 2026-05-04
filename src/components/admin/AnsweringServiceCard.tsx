/**
 * AnsweringServiceCard.tsx
 *
 * Admin → Voice & Phone settings card for the answering-service relationship.
 *
 * SYSTEM CONNECTIONS:
 *   - Reads/writes `company_settings` keys:
 *       - `answering_service_phone` (the toll-free number SMS comes FROM)
 *       - `answering_service_call_forward_number` (the local number we
 *          forward calls TO when handing off)
 *   - Backend consumer: supabase/functions/sms-webhook/index.ts uses
 *     `answering_service_phone` to detect inbound SMS that need the
 *     relay-parser path (caller name + callback phone extracted from body).
 *   - The call-forward number is informational right now — wired into
 *     IVR / forwarding rules in a future commit. Stored here so it's
 *     visible alongside the SMS number and can't be confused with it.
 *
 * Why two separate fields:
 *   The answering service uses TWO different numbers:
 *     1. SMS Relay (e.g. 1-844-935-0432) — toll-free, INBOUND SMS only.
 *        When they take a call, they text us a structured form
 *        ("Caller: <name>\nPhone: <digits>\nComments: <...>").
 *     2. Call Forward (e.g. 1-210-555-0042) — local number, OUTBOUND.
 *        When our IVR routes after-hours / overflow calls to a human,
 *        we forward to this number which rings at the answering service.
 *   Confusing them caused the Sandy Rice mis-attribution earlier today.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Headphones, Loader2, MessageSquare, PhoneForwarded } from "lucide-react";
import { getCompanySettings, setCompanySetting } from "@/lib/companySettings";
import { toast } from "sonner";

const SMS_KEY = "answering_service_phone";
const FORWARD_KEY = "answering_service_call_forward_number";

/** Strip everything except digits and "+" so we store a stable canonical form. */
function normalizePhoneInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Keep leading +, otherwise reduce to digits only. The relay matcher
  // works on the last 10 digits regardless of formatting.
  const startsWithPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return startsWithPlus ? `+${digits}` : digits;
}

/** Pretty-format a stored phone for display: "(844) 935-0432". */
function formatPhoneDisplay(stored: string): string {
  if (!stored) return "";
  const digits = stored.replace(/\D/g, "");
  // Drop leading "1" for US numbers when formatting
  const last10 = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (last10.length !== 10) return stored; // give up, show as-is
  return `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}`;
}

export function AnsweringServiceCard() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["company_settings", "answering_service"],
    queryFn: () => getCompanySettings([SMS_KEY, FORWARD_KEY]),
  });

  const [smsValue, setSmsValue] = useState("");
  const [forwardValue, setForwardValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Hydrate inputs once settings load. Re-syncs on refetch.
  useEffect(() => {
    if (settings) {
      setSmsValue(settings[SMS_KEY] ?? "");
      setForwardValue(settings[FORWARD_KEY] ?? "");
    }
  }, [settings]);

  const save = async (key: string, value: string, label: string) => {
    setSavingKey(key);
    try {
      await setCompanySetting(key, normalizePhoneInput(value));
      toast.success(`${label} saved.`);
      queryClient.invalidateQueries({ queryKey: ["company_settings", "answering_service"] });
    } catch (err: any) {
      console.error("[AnsweringServiceCard] save failed:", err);
      toast.error(`Couldn't save ${label}: ${err?.message ?? "unknown error"}`);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          Answering Service
        </CardTitle>
        <CardDescription className="text-xs">
          Two distinct numbers — keep them straight. The toll-free number is what the answering service texts us FROM. The local number is what we forward calls TO when handing off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* SMS Relay Number (toll-free, inbound) */}
        <div>
          <Label htmlFor="answering-sms-number" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            SMS Relay Number
            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground">inbound texts</span>
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The toll-free number our answering service uses to text us about calls they took. Inbound SMS from this number is treated as a relay — JARVIS parses the body for the real customer name and callback phone instead of treating this number as the customer.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              id="answering-sms-number"
              value={smsValue}
              onChange={(e) => setSmsValue(e.target.value)}
              placeholder="844-935-0432"
              disabled={isLoading || savingKey !== null}
              className="font-mono"
            />
            <Button
              onClick={() => save(SMS_KEY, smsValue, "SMS relay number")}
              disabled={isLoading || savingKey !== null || normalizePhoneInput(smsValue) === normalizePhoneInput(settings?.[SMS_KEY] ?? "")}
            >
              {savingKey === SMS_KEY ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {settings?.[SMS_KEY] && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Currently saved: <span className="font-mono">{formatPhoneDisplay(settings[SMS_KEY])}</span>
            </p>
          )}
        </div>

        {/* Call Forward Number (local, outbound) */}
        <div>
          <Label htmlFor="answering-forward-number" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <PhoneForwarded className="h-3.5 w-3.5" />
            Call Forward Number
            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground">outbound calls</span>
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            The local number we forward calls TO when our IVR hands off to the answering service (after-hours, overflow, voicemail rollover). Should be a 210 area-code number that rings at the service. NOT the same as the toll-free SMS number above.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              id="answering-forward-number"
              value={forwardValue}
              onChange={(e) => setForwardValue(e.target.value)}
              placeholder="210-555-0042"
              disabled={isLoading || savingKey !== null}
              className="font-mono"
            />
            <Button
              onClick={() => save(FORWARD_KEY, forwardValue, "Call forward number")}
              disabled={isLoading || savingKey !== null || normalizePhoneInput(forwardValue) === normalizePhoneInput(settings?.[FORWARD_KEY] ?? "")}
            >
              {savingKey === FORWARD_KEY ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {settings?.[FORWARD_KEY] && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Currently saved: <span className="font-mono">{formatPhoneDisplay(settings[FORWARD_KEY])}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
