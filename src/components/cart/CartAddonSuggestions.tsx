import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Sparkles } from "lucide-react";
import { useCartAddons, type CartAddonRule } from "@/hooks/useCartAddons";

interface Props {
  itemKinds: string[];
  itemNames: string[];
  onAdd: (rule: CartAddonRule) => void;
  variant?: "tech" | "customer";
  maxShown?: number;
}

export function CartAddonSuggestions({ itemKinds, itemNames, onAdd, variant = "tech", maxShown = 6 }: Props) {
  const { suggestions, isLoading } = useCartAddons(itemKinds, itemNames);

  if (isLoading || suggestions.length === 0) return null;

  const shown = suggestions.slice(0, maxShown);
  const heading = variant === "customer" ? "Recommended for you" : "Frequently added";

  return (
    <Card className="overflow-hidden border-primary/20">
      <div className="px-3 py-2 border-b bg-gradient-to-r from-primary/10 to-transparent flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-semibold text-sm">{heading}</p>
        <Badge variant="outline" className="text-[10px] ml-auto">{suggestions.length}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
        {shown.map((r) => (
          <div key={r.id} className="rounded-md border bg-card p-2 flex flex-col gap-1.5 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between gap-1">
              <p className="font-semibold text-xs leading-tight line-clamp-2">{r.name}</p>
              {r.badge && <Badge className="text-[9px] shrink-0 bg-primary/10 text-primary border-primary/20">{r.badge}</Badge>}
            </div>
            {r.description && <p className="text-[10px] text-muted-foreground line-clamp-2">{r.description}</p>}
            <div className="flex items-center justify-between mt-auto pt-1">
              <span className="font-bold text-sm">
                {Number(r.unit_price) === 0 ? "Free" : `$${Number(r.unit_price).toFixed(0)}`}
              </span>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onAdd(r)}>
                <Plus className="h-3 w-3 mr-0.5" /> Add
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
