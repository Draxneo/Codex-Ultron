import { Card } from "@/components/ui/card";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

interface Props { matchup: EquipmentMatchup; }

export function EquipmentSpecsSection({ matchup }: Props) {
  const isGas = (matchup.system_type || "").toLowerCase().includes("gas")
    || (matchup.system_type || "").toLowerCase().includes("dual");

  return (
    <Card className="p-6 md:p-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🔧</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Equipment & Specs</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Equipment models */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Models</p>
          <dl className="space-y-2 text-sm">
            <Row label={isGas ? "Outdoor Unit" : "Heat Pump"} value={matchup.condenser_model} />
            <Row label={isGas ? "Furnace" : "Air Handler"} value={matchup.furnace_model || matchup.coil_model} />
            {isGas && <Row label="Coil" value={matchup.coil_model} />}
            {!isGas && matchup.heat_kit && <Row label="Heat Kit" value={matchup.heat_kit} />}
            <Row label="Orientation" value={matchup.application || "Multi-Position"} />
          </dl>
        </div>

        {/* Performance */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Performance</p>
          <dl className="space-y-2 text-sm">
            <Row label="SEER2" value={matchup.seer2 != null ? String(matchup.seer2) : null} />
            <Row label="EER2" value={matchup.eer2 != null ? String(matchup.eer2) : null} />
            {matchup.hspf2 != null && <Row label="HSPF2" value={String(matchup.hspf2)} />}
            <Row label="Cooling Capacity" value={matchup.cooling_cap ? `${matchup.cooling_cap.toLocaleString()} BTU` : null} />
            {matchup.afue && <Row label="AFUE" value={`${matchup.afue}%`} />}
            <Row label="AHRI #" value={matchup.ahri_number} mono />
          </dl>
        </div>
      </div>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 border-b border-border/50 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-foreground font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </dd>
    </div>
  );
}
