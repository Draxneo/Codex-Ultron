import { MapPin, Navigation, Map } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  address: string;
  className?: string;
  iconClassName?: string;
  showIcon?: boolean;
};

export function AddressLink({ address, className, iconClassName, showIcon = true }: Props) {
  const encoded = encodeURIComponent(address);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 text-left cursor-pointer hover:text-primary transition-colors",
            className
          )}
        >
          {showIcon && <MapPin className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0", iconClassName)} />}
          <span>{address}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2 space-y-1" align="start" sideOffset={6}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs h-8"
          asChild
        >
          <a href={`https://maps.google.com/?q=${encoded}`} target="_blank" rel="noopener noreferrer">
            <Map className="h-3.5 w-3.5" />
            View on Map
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs h-8"
          asChild
        >
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encoded}`} target="_blank" rel="noopener noreferrer">
            <Navigation className="h-3.5 w-3.5" />
            Get Directions
          </a>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
