/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Camera } from "lucide-react";
import { loadGoogleMaps, GOOGLE_MAPS_API_KEY, geocodeAddress } from "@/lib/google-maps";

interface PhotoLocation {
  id: string;
  photo_type: string | null;
  photo_latitude: number;
  photo_longitude: number;
  photo_taken_at: string | null;
  file_path: string;
}

function usePhotoLocations(jobId: string) {
  return useQuery({
    queryKey: ["photo_locations", jobId],
    queryFn: async () => {
      const { data: forms } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobId);
      if (!forms || forms.length === 0) return [];

      const formIds = forms.map(f => f.id);
      const { data: photos } = await supabase
        .from("tech_form_photos")
        .select("id, photo_type, photo_latitude, photo_longitude, photo_taken_at, file_path")
        .in("tech_form_id", formIds)
        .not("photo_latitude", "is", null)
        .not("photo_longitude", "is", null);

      return (photos || []) as PhotoLocation[];
    },
  });
}

export function PhotoLocationMap({ jobId, jobAddress }: { jobId: string; jobAddress?: string | null }) {
  const { data: photos, isLoading } = usePhotoLocations(jobId);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [jobCoords, setJobCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Geocode job address for reference pin
  useEffect(() => {
    if (!jobAddress) return;
    geocodeAddress(jobAddress).then(coords => {
      if (coords) setJobCoords(coords);
    });
  }, [jobAddress]);

  useEffect(() => {
    if (!mapContainer.current || (!photos?.length && !jobCoords)) return;

    const initMap = async () => {
      try {
        await loadGoogleMaps();
      } catch (err) {
        console.warn("[PhotoLocationMap] Google Maps load failed:", err);
        return;
      }
      // 2026-05-03 fix: guard against the constructor being unavailable on
      // slow connections — same pattern as AddressesMap. Without this we
      // get "google.maps.Map is not a constructor" reported to Mission
      // Control on every job-detail page that the script hadn't finished
      // loading for yet.
      if (typeof google === "undefined" || !google.maps?.Map) {
        console.warn("[PhotoLocationMap] google.maps.Map not available after load");
        return;
      }

      // Clean up previous
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      if (mapRef.current) {
        // Google Maps doesn't have a remove method, just clear
        mapRef.current = null;
      }

      const hasPhotos = photos && photos.length > 0;
      const center = hasPhotos
        ? { lat: photos[0].photo_latitude, lng: photos[0].photo_longitude }
        : jobCoords || { lat: 29.4, lng: -98.5 };

      const map = new google.maps.Map(mapContainer.current!, {
        center,
        zoom: 15,
        mapId: "photo-location-map",
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
      });
      mapRef.current = map;

      const bounds = new google.maps.LatLngBounds();

      // Job address pin (blue)
      if (jobCoords) {
        const marker = new google.maps.Marker({
          position: jobCoords,
          map,
          title: "Job Address",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#3b82f6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        const infoWindow = new google.maps.InfoWindow({
          content: `<strong>Job Address</strong>`,
        });
        marker.addListener("click", () => infoWindow.open(map, marker));
        markersRef.current.push(marker);
        bounds.extend(jobCoords);
      }

      // Photo pins (green)
      if (hasPhotos) {
        for (const photo of photos) {
          const position = { lat: photo.photo_latitude, lng: photo.photo_longitude };
          const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(photo.file_path);
          const timeStr = photo.photo_taken_at
            ? new Date(photo.photo_taken_at).toLocaleString()
            : "Unknown time";

          const marker = new google.maps.Marker({
            position,
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: "#22c55e",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });

          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="text-align:center">
                <img src="${urlData.publicUrl}" style="width:150px;height:100px;object-fit:cover;border-radius:4px;margin-bottom:4px" />
                <div style="font-size:12px;font-weight:600">${photo.photo_type || "Photo"}</div>
                <div style="font-size:10px;color:#666">${timeStr}</div>
              </div>
            `,
            maxWidth: 200,
          });
          marker.addListener("click", () => infoWindow.open(map, marker));
          markersRef.current.push(marker);
          bounds.extend(position);
        }
      }

      // Fit bounds if we have multiple points
      if (!bounds.isEmpty()) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const hasSpread = Math.abs(ne.lng() - sw.lng()) > 0.0001 || Math.abs(ne.lat() - sw.lat()) > 0.0001;
        if (hasSpread) {
          map.fitBounds(bounds, 50);
        } else {
          map.setCenter(ne);
          map.setZoom(16);
        }
      }
    };

    initMap();
  }, [photos, jobCoords]);

  if (isLoading) return null;
  if (!photos?.length && !jobCoords) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Photo Locations
          {photos && photos.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              ({photos.length} geotagged)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={mapContainer} className="h-[250px] w-full rounded-b-lg" />
        {photos && photos.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            No geotagged photos yet — showing job address only
          </div>
        )}
      </CardContent>
    </Card>
  );
}
