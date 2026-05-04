import { useEffect, useRef } from "react";
import { loadGoogleMaps, geocodeAddress } from "@/lib/google-maps";
import { MapPin } from "lucide-react";

interface Props {
  addresses: { id: string; fullAddress: string; isPrimary?: boolean }[];
}

/**
 * Compact Google Map showing pins for each customer address.
 * Geocodes addresses (with cache) and auto-fits bounds.
 */
export function AddressesMap({ addresses }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || addresses.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps();
      } catch (err) {
        console.warn("[AddressesMap] Google Maps load failed:", err);
        return;
      }
      if (cancelled || !containerRef.current) return;

      // 2026-05-03 fix: loadGoogleMaps() can resolve before window.google.maps
      // is fully attached on slow connections, throwing "google.maps.Map is
      // not a constructor". Guard before calling the constructor.
      if (typeof google === "undefined" || !google.maps?.Map) {
        console.warn("[AddressesMap] google.maps.Map not available after load");
        return;
      }

      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: 29.42, lng: -98.49 },
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
      }

      // Clear existing markers
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];

      const bounds = new google.maps.LatLngBounds();
      let plotted = 0;

      for (const a of addresses) {
        const coords = await geocodeAddress(a.fullAddress);
        if (cancelled) return;
        if (!coords) continue;

        const marker = new google.maps.Marker({
          position: coords,
          map: mapRef.current!,
          title: a.fullAddress,
          icon: a.isPrimary
            ? {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }
            : undefined,
        });
        markersRef.current.push(marker);
        bounds.extend(coords);
        plotted++;
      }

      if (plotted > 0 && mapRef.current) {
        if (plotted === 1) {
          mapRef.current.setCenter(bounds.getCenter());
          mapRef.current.setZoom(15);
        } else {
          mapRef.current.fitBounds(bounds, 40);
        }
      }
    })();

    return () => {
      cancelled = true;
    }