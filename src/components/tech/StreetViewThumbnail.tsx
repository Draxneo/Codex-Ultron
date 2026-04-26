/**
 * StreetViewThumbnail.tsx — Google Static Street View image for a customer address.
 *
 * Renders a 16:9 (or square) image using Google's Static Street View API.
 * Falls back to a Static Maps satellite image when Street View has no panorama.
 * Tap → launches turn-by-turn navigation.
 */

import { MapPin } from "lucide-react";
import { GOOGLE_MAPS_API_KEY } from "@/lib/google-maps";
import { launchNavigation } from "@/lib/launchNavigation";
import { cn } from "@/lib/utils";

interface StreetViewThumbnailProps {
  address: string | null | undefined;
  className?: string;
  /** Aspect ratio: "16/9" (default) or "square" */
  aspect?: "16/9" | "square";
}

export function StreetViewThumbnail({ address, className, aspect = "16/9" }: StreetViewThumbnailProps) {
  if (!address) {
    return (
      <div
        className={cn(
          "w-full bg-muted flex items-center justify-center text-muted-foreground rounded-lg",
          aspect === "16/9" ? "aspect-video" : "aspect-square",
          className,
        )}
      >
        <MapPin className="h-6 w-6 opacity-40" />
      </div>
    );
  }

  const encoded = encodeURIComponent(address);
  // 640x360 is the max free Street View Static size; we display responsively
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${encoded}&fov=80&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;
  // Map fallback if no street view panorama exists at this location
  const mapFallback = `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=18&size=640x360&maptype=satellite&markers=color:red%7C${encoded}&key=${GOOGLE_MAPS_API_KEY}`;

  return (
    <button
      type="button"
      onClick={() => launchNavigation(address)}
      className={cn(
        "relative w-full overflow-hidden rounded-lg group",
        aspect === "16/9" ? "aspect-video" : "aspect-square",
        className,
      )}
      aria-label="Open in maps"
    >
      <img
        src={streetViewUrl}
        alt={`Street view of ${address}`}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = mapFallback;
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent group-active:from-black/60 transition-colors" />
    </button>
  );
}
