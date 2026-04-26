import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, CheckCircle2, XCircle } from "lucide-react";

export interface CpsRebateData {
  qualifies: boolean;
  tierName: string;
  earlyRebate: number;
  burnoutRebate: number;
  seer2: number;
  eer2: number;
  hspf2: number | null;
  ahriNumber: string;
  tonnage: number | null;
  condenserModel: string | null;
  coilModel: string | null;
  furnaceModel: string | null;
  rebateUrl: string;
}

interface Props {
  data: CpsRebateData;
}

export default function CpsRebateBlock({ data }: Props) {
  return (
    <div className="rounded-lg border border-border overflow-hidden mt-6 print:break-inside-avoid">
      {/* Header */}
      <div className="bg-emerald-100 dark:bg-emerald-900/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-foreground">CPS Energy Rebate Eligibility</h3>
        </div>
        {data.qualifies ? (
          <Badge className="bg-emerald-600 text-white border-0 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" /> Qualified
          </Badge>
        ) : (
          <Badge variant="destructive" className="text-xs gap-1 border-0">
            <XCircle className="h-3 w-3" /> Not Eligible
          </Badge>
        )}
      </div>

      <div className="p-4 space-y-4 bg-card">
        {/* Ratings & Tier Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">AHRI #</p>
            <p className="font-semibold text-foreground">{data.ahriNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">SEER2</p>
            <p className="font-semibold text-foreground">{data.seer2}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">EER2</p>
            <p className="font-semibold text-foreground">{data.eer2}</p>
          </div>
          {data.hspf2 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">HSPF2</p>
              <p className="font-semibold text-foreground">{data.hspf2}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tier</p>
            <p className="font-semibold text-foreground">{data.tierName}</p>
          </div>
          {data.tonnage && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Tonnage</p>
              <p className="font-semibold text-foreground">{data.tonnage} Ton</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Early Replacement</p>
            <p className="font-bold text-emerald-700 dark:text-emerald-400">${data.earlyRebate.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Burnout Replacement</p>
            <p className="font-bold text-emerald-700 dark:text-emerald-400">${data.burnoutRebate.toLocaleString()}</p>
          </div>
        </div>

        {/* Equipment Models */}
        {(data.condenserModel || data.coilModel || data.furnaceModel) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm pt-2 border-t border-border">
            {data.condenserModel && (
              <div>
                <p className="text-xs text-muted-foreground">Condenser</p>
                <p className="font-mono text-xs text-foreground">{data.condenserModel}</p>
              </div>
            )}
            {data.coilModel && (
              <div>
                <p className="text-xs text-muted-foreground">Coil / Air Handler</p>
                <p className="font-mono text-xs text-foreground">{data.coilModel}</p>
              </div>
            )}
            {data.furnaceModel && (
              <div>
                <p className="text-xs text-muted-foreground">Furnace</p>
                <p className="font-mono text-xs text-foreground">{data.furnaceModel}</p>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        {data.qualifies && (
          <div className="pt-2 space-y-2">
            <Button
              asChild
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              <a href={data.rebateUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Apply for CPS Energy Rebate →
              </a>
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              You'll need your CPS Energy account number and the information above to complete the application.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
