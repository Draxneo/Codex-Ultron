import { Card } from "@/components/ui/card";
import { Check, ExternalLink } from "lucide-react";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

interface Props { matchup: EquipmentMatchup; }

const QUALIFICATION = [
  { metric: "SEER2", value: "14.3" },
  { metric: "EER2", value: "11.7" },
  { metric: "HSPF2", value: "7.5" },
];

const WE_PROVIDE = [
  "AHRI certificate (pulled from your matched system)",
  "Photos of your existing system (Early Replacement only)",
  "Permit information (City of San Antonio)",
  "Itemized invoice from our licensed contractor — model #s, serials, install date, address, total paid",
];

const YOU_PROVIDE = [
  "Your CPS Energy account (to submit the application)",
  "About 10 minutes to upload the packet we hand you",
];

export function RebateSection({ matchup }: Props) {
  const tier = matchup.cps_rebate_tier || "Tier 1";
  const early = matchup.early_rebate;
  const burnout = matchup.burnout_rebate;

  return (
    <Card className="p-6 md:p-8 bg-gradient-to-br from-accent/5 to-background border-accent/20">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">💵</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">CPS Energy Rebate</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        We do the legwork — you just submit through your CPS Energy account.
      </p>

      {/* Rebate amounts */}
      {(early || burnout) && (
        <div className="rounded-lg border-2 border-success/30 bg-success/5 p-4 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-success mb-2">
            Estimated Rebate Amounts ({tier})
          </p>
          <div className="grid grid-cols-2 gap-4">
            {early != null && (
              <div>
                <p className="text-xs text-muted-foreground">Early Replacement</p>
                <p className="text-2xl font-extrabold text-success">${early.toLocaleString()}</p>
              </div>
            )}
            {burnout != null && (
              <div>
                <p className="text-xs text-muted-foreground">Replace on Burnout</p>
                <p className="text-2xl font-extrabold text-success">${burnout.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5 mb-6">
        <Block title="📋 Qualification">
          <ul className="space-y-1 text-sm">
            {QUALIFICATION.map((q) => (
              <li key={q.metric} className="flex justify-between border-b border-border/50 pb-1">
                <span className="text-muted-foreground">{q.metric}</span>
                <span className="font-medium text-foreground">{q.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-2 italic">Minimum efficiency to qualify</p>
        </Block>

        <Block title="📄 What We Provide">
          <ul className="space-y-1.5">
            {WE_PROVIDE.map((it) => (
              <li key={it} className="flex items-start gap-1.5 text-sm">
                <Check className="h-3.5 w-3.5 text-success shrink-0 mt-1" />
                <span className="text-foreground/90">{it}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="👉 What You Provide">
          <ul className="space-y-1.5">
            {YOU_PROVIDE.map((it) => (
              <li key={it} className="flex items-start gap-1.5 text-sm">
                <Check className="h-3.5 w-3.5 text-success shrink-0 mt-1" />
                <span className="text-foreground/90">{it}</span>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      {/* 3 steps */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <p className="text-sm font-bold text-foreground mb-3">🏆 How Your Rebate Gets Submitted</p>
        <ol className="space-y-2 text-sm">
          <Step n={1} who="YOU">Create a rebate account using your CPS Energy account info</Step>
          <Step n={2} who="US">We prepare your complete rebate packet and hand it off</Step>
          <Step n={3} who="YOU">Upload the packet through the CPS rebate portal — submit & receive your rebate in the mail</Step>
        </ol>
      </div>

      <a
        href="https://cpsenergy.clearesult.com/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        Apply for Rebates at cpsenergy.clearesult.com <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <p className="text-[11px] text-muted-foreground italic mt-4 leading-relaxed">
        Rebates apply to home improvement / retrofit projects only. Must be a one-for-one replacement.
        All HVAC equipment must be installed by an HVAC contractor licensed within the State of Texas.
        Early Replacement: equipment must be &lt; 25 years old (gas) or ≤ 20 years (heat pump) and operational.
      </p>
    </Card>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-bold text-foreground mb-3">{title}</p>
      {children}
    </div>
  );
}

function Step({ n, who, children }: { n: number; who: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="text-foreground/90">
        <strong className="text-foreground">{who}:</strong> {children}
      </span>
    </li>
  );
}
