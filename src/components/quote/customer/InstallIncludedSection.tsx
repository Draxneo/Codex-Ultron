import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

const OUTDOOR = [
  "New pre-formed composite pad",
  "Proper equipment leveling",
  "New high-voltage emergency disconnect",
  "New electrical whip(s)",
  "Properly sized refrigerant lines",
  "Re-insulated refrigerant lines",
  "Factory-recommended start-up",
  "EPA-compliant disposal",
];
const INDOOR = [
  "Safe removal of existing equipment",
  "Multi-positional furnace & evaporator coil",
  "Gas line connection & leak testing",
  "New primary drain pan",
  "Ceiling saver pan",
  "Float safety switch",
  "Secure mounting",
  "Re-sealed plenums",
  "Sealed duct connections",
  "Proper condensate drain piping",
  "New thermostat installation",
  "Homeowner orientation",
];
const QC = [
  "Refrigerant charge verified",
  "Electrical connections inspected",
  "Final system walkthrough",
  "Gas pressure tested",
  "Full system operational testing",
  "Complete jobsite cleanup",
];

export function InstallIncludedSection() {
  return (
    <Card className="p-6 md:p-8">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">✓</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">What's Included in Your Install</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        💰 <strong className="text-foreground">All-Inclusive Pricing</strong> — permits, taxes, materials, and labor.
        No surprises, no hidden fees.
      </p>

      <div className="grid md:grid-cols-3 gap-6">
        <Bucket title="🏠 Outdoor Unit" items={OUTDOOR} />
        <Bucket title="🏡 Indoor Unit" items={INDOOR} />
        <Bucket title="🔧 Start-Up & QC" items={QC} />
      </div>
    </Card>
  );
}

function Bucket({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-bold text-foreground mb-3">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-foreground/90">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
