import { Card } from "@/components/ui/card";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";
import { properBrand } from "@/lib/quoteTemplate";

interface Props {
  matchup: EquipmentMatchup;
  customerName?: string | null;
  preparedAt?: string | null;
}

export function QuoteHero({ matchup, customerName, preparedAt }: Props) {
  const brand = properBrand(matchup.brand);
  const tons = matchup.tonnage ?? "";
  const sysShort = (matchup.system_type || "").toLowerCase().includes("heat") ? "Heat Pump" : "Gas System";
  const firstName = customerName?.split(" ")[0] || "there";
  const date = preparedAt ? new Date(preparedAt) : new Date();

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Your Custom Quote</p>
        <h1 className="text-2xl md:text-4xl font-bold text-foreground leading-tight">
          Your New {brand} {tons}-Ton {sysShort}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          Hi {firstName} — quote prepared{" "}
          {date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
        </p>
      </div>
    </Card>
  );
}
