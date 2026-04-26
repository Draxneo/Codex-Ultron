import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  brands?: string[] | null;
}

export function BrandAffinityCard({ brands }: Props) {
  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Brand affinity</h3>
      {brands && brands.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No brands tagged for this vendor.</p>
      )}
    </Card>
  );
}
