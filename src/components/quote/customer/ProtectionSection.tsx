import { Card } from "@/components/ui/card";
import { Shield, Wrench, Sparkles } from "lucide-react";
import { properBrand } from "@/lib/quoteTemplate";

interface Props { brand: string; }

export function ProtectionSection({ brand }: Props) {
  const b = properBrand(brand);
  return (
    <Card className="p-6 md:p-8 bg-gradient-to-br from-success/5 via-background to-background border-success/20">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-2xl">🛡️</span>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Your Protection</h2>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Pillar
          icon={<Shield className="h-6 w-6 text-success" />}
          title="10-Year Parts Warranty"
          body={`We register your new ${b} system with the manufacturer — no paperwork on your end.`}
        />
        <Pillar
          icon={<Wrench className="h-6 w-6 text-success" />}
          title="1-Year Labor"
          body="Standard labor warranty included. Upgrade to 10-year labor coverage available."
        />
        <Pillar
          icon={<Sparkles className="h-6 w-6 text-success" />}
          title="2 Years Comfort Club"
          body="Annual maintenance & priority service included with every install."
        />
      </div>
    </Card>
  );
}

function Pillar({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<p className="font-bold text-foreground">{title}</p></div>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
