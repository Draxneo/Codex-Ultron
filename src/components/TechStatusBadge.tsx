import { Car, MapPin, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TechStatus } from "@/hooks/useTechStatusMap";

const config: Record<TechStatus, { label: string; icon: typeof Car; className: string }> = {
  en_route: {
    label: "En Route",
    icon: Car,
    className: "bg-[hsl(var(--sky))]/15 text-[hsl(var(--sky))]",
  },
  on_site: {
    label: "On Site",
    icon: MapPin,
    className: "bg-[hsl(var(--complete))]/15 text-[hsl(var(--complete))]",
  },
  at_supply_house: {
    label: "At Supply",
    icon: Store,
    className: "bg-amber-500/15 text-amber-600",
  },
};

interface Props {
  status: TechStatus;
  locationName?: string | null;
  className?: string;
}

export function TechStatusBadge({ status, locationName, className }: Props) {
  const c = config[status];
  const Icon = c.icon;

  // Truncate location name for compact display
  const shortName = locationName
    ? locationName.length > 20
      ? locationName.slice(0, 18) + "…"
      : locationName
    : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold max-w-[160px]",
        c.className,
        className
      )}
      title={locationName || undefined}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {shortName ? `${c.label} · ${shortName}` : c.label}
      </span>
    </span>
  );
}
