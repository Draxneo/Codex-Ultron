/// <reference types="google.maps" />
import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Car, AlertTriangle } from "lucide-react";
import type { SupplyHouseLocation } from "@/hooks/useSupplyHouseLocations";
import { loadGoogleMaps, geocodeAddress } from "@/lib/google-maps";

interface MapItem {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  job_type: string;
  hcp_job_number: string | null;
  job_number: string | null;
  customer_phone: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  estimate_number?: string | null;
}

const markerColors: Record<string, string> = {
  install: "#1e40af",
  service: "#ea580c",
  maintenance: "#16a34a",
  estimate: "#9333ea",
};

const techColors = ["#1e40af", "#ea580c", "#16a34a", "#9333ea", "#dc2626", "#0891b2"];

interface RouteLeg {
  techName: string;
  fromLabel: string;
  toLabel: string;
  durationMin: number;
  distanceMiles: number;
  path: google.maps.LatLng[] | null;
  trafficCondition: "light" | "normal" | "heavy" | "severe";
}

interface TechSummary {
  name: string;
  stops: number;
  totalMin: number;
  totalMiles: number;
  hasTraffic: boolean;
  color: string;
}

interface Props {
  items: MapItem[];
  onItemClick: (item: MapItem) => void;
  mapRange?: "today" | "week";
  onToggleRange?: () => void;
  employees?: { name: string; home_address: string | null }[];
  supplyHouseLocations?: SupplyHouseLocation[];
}

export default function JobsMapView({ items, onItemClick, mapRange = "today", onToggleRange, employees = [], supplyHouseLocations = [] }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const supplyMarkersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoLabelsRef = useRef<google.maps.Marker[]>([]);
  const [showSupplyHouses, setShowSupplyHouses] = useState(false);
  const [geocoded, setGeocoded] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());
  const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([]);
  const [techSummaries, setTechSummaries] = useState<TechSummary[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const init = async () => {
      await loadGoogleMaps();
      const map = new google.maps.Map(mapContainer.current!, {
        center: { lat: 29.42, lng: -98.49 },
        zoom: 10,
        mapId: "jobs-map-view",
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
      });
      mapRef.current = map;
    };
    init();
    return () => { mapRef.current = null; };
  }, []);

  // Geocode addresses
  useEffect(() => {
    const allAddresses = new Set<string>();
    items.forEach(i => { if (i.address) allAddresses.add(i.address); });
    employees.forEach(e => { if (e.home_address) allAddresses.add(e.home_address); });

    const uncached = [...allAddresses].filter(a => !geocodeCacheRef.current.has(a));
    if (uncached.length === 0) {
      const fullMap = new Map<string, { lat: number; lng: number }>();
      geocodeCacheRef.current.forEach((v, k) => { if (v) fullMap.set(k, v); });
      setGeocoded(fullMap);
      return;
    }
    const geocodeAll = async () => {
      await loadGoogleMaps();
      for (const addr of uncached) {
        if (geocodeCacheRef.current.has(addr)) continue;
        const result = await geocodeAddress(addr);
        geocodeCacheRef.current.set(addr, result);
      }
      const fullMap = new Map<string, { lat: number; lng: number }>();
      geocodeCacheRef.current.forEach((v, k) => { if (v) fullMap.set(k, v); });
      setGeocoded(fullMap);
    };
    geocodeAll();
  }, [items, employees]);

  // Group items by tech for route calculation
  const techGroups = useMemo(() => {
    const groups = new Map<string, MapItem[]>();
    items.forEach(item => {
      if (!item.assigned_to || !item.address) return;
      const existing = groups.get(item.assigned_to) || [];
      existing.push(item);
      groups.set(item.assigned_to, existing);
    });
    groups.forEach((jobs) => {
      jobs.sort((a, b) => {
        if (a.arrival_start && b.arrival_start) return a.arrival_start.localeCompare(b.arrival_start);
        if (a.arrival_start) return -1;
        if (b.arrival_start) return 1;
        return 0;
      });
    });
    return groups;
  }, [items]);

  // Fetch routes between consecutive stops
  useEffect(() => {
    if (techGroups.size === 0 || geocoded.size === 0) return;

    const fetchRoutes = async () => {
      await loadGoogleMaps();
      const directionsService = new google.maps.DirectionsService();
      const legs: RouteLeg[] = [];
      const summaries: TechSummary[] = [];
      let techIdx = 0;

      for (const [techName, techJobs] of techGroups) {
        const color = techColors[techIdx % techColors.length];
        let totalMin = 0;
        let totalMiles = 0;
        let hasTraffic = false;

        const homeAddr = employees.find(e => e.name === techName)?.home_address;
        const stops: { address: string; label: string }[] = [];
        if (homeAddr) stops.push({ address: homeAddr, label: "Home" });
        techJobs.forEach(j => {
          if (j.address) stops.push({ address: j.address, label: j.customer_name || "Stop" });
        });

        for (let i = 0; i < stops.length - 1; i++) {
          const fromCoords = geocodeCacheRef.current.get(stops[i].address);
          const toCoords = geocodeCacheRef.current.get(stops[i + 1].address);
          if (!fromCoords || !toCoords) continue;

          try {
            const result = await directionsService.route({
              origin: fromCoords,
              destination: toCoords,
              travelMode: google.maps.TravelMode.DRIVING,
              drivingOptions: {
                departureTime: new Date(),
                trafficModel: google.maps.TrafficModel.BEST_GUESS,
              },
            });

            const leg = result.routes?.[0]?.legs?.[0];
            if (!leg) continue;

            const durationSec = leg.duration?.value || 0;
            const trafficSec = (leg as any).duration_in_traffic?.value || durationSec;
            const durationMin = Math.round(durationSec / 60);
            const distanceMiles = Math.round(((leg.distance?.value || 0) / 1609.34) * 10) / 10;

            const ratio = trafficSec / (durationSec || 1);
            const condition: RouteLeg["trafficCondition"] = ratio < 1.0 ? "light" : ratio <= 1.1 ? "normal" : ratio <= 1.3 ? "heavy" : "severe";

            if (condition === "heavy" || condition === "severe") hasTraffic = true;
            totalMin += durationMin;
            totalMiles += distanceMiles;

            const path = result.routes?.[0]?.overview_path || null;

            legs.push({
              techName,
              fromLabel: stops[i].label,
              toLabel: stops[i + 1].label,
              durationMin,
              distanceMiles,
              path,
              trafficCondition: condition,
            });
          } catch {
            // skip failed route
          }
        }

        summaries.push({ name: techName, stops: techJobs.length, totalMin, totalMiles: Math.round(totalMiles * 10) / 10, hasTraffic, color });
        techIdx++;
      }

      setRouteLegs(legs);
      setTechSummaries(summaries);
    };

    fetchRoutes();
  }, [techGroups, geocoded, employees]);

  // Draw route polylines on map
  useEffect(() => {
    if (!mapRef.current || routeLegs.length === 0) return;

    // Clear old polylines and labels
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];
    infoLabelsRef.current.forEach(m => m.setMap(null));
    infoLabelsRef.current = [];

    let techIdx = 0;
    const techColorMap = new Map<string, string>();

    routeLegs.forEach((leg) => {
      if (!leg.path) return;

      if (!techColorMap.has(leg.techName)) {
        techColorMap.set(leg.techName, techColors[techIdx % techColors.length]);
        techIdx++;
      }

      const lineColor = leg.trafficCondition === "severe" ? "#dc2626"
        : leg.trafficCondition === "heavy" ? "#f59e0b"
        : techColorMap.get(leg.techName) || "#6b7280";

      const polyline = new google.maps.Polyline({
        path: leg.path,
        strokeColor: lineColor,
        strokeOpacity: 0.7,
        strokeWeight: 4,
        map: mapRef.current!,
      });
      polylinesRef.current.push(polyline);

      // Duration label at midpoint
      const midIdx = Math.floor(leg.path.length / 2);
      const midPoint = leg.path[midIdx];
      if (midPoint) {
        const label = new google.maps.Marker({
          position: midPoint,
          map: mapRef.current!,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
          },
          label: {
            text: `${leg.durationMin} min`,
            fontSize: "11px",
            fontWeight: "600",
            color: lineColor,
            className: "route-label",
          },
        });
        infoLabelsRef.current.push(label);
      }
    });
  }, [routeLegs]);

  // Build travel time lookup for popups
  const travelToItem = useMemo(() => {
    const lookup = new Map<string, { min: number; condition: string }>();
    for (const [, techJobs] of techGroups) {
      for (let i = 1; i < techJobs.length; i++) {
        const leg = routeLegs.find(l => l.techName === techJobs[i].assigned_to && l.toLabel === techJobs[i].customer_name);
        if (leg) {
          lookup.set(techJobs[i].id, { min: leg.durationMin, condition: leg.trafficCondition });
        }
      }
    }
    return lookup;
  }, [techGroups, routeLegs]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    const openInfoWindows: google.maps.InfoWindow[] = [];

    items.forEach(item => {
      if (!item.address) return;
      const coords = geocodeCacheRef.current.get(item.address);
      if (!coords) return;

      const color = markerColors[item.job_type] || "#6b7280";
      const typeLabel = item.job_type === "estimate" ? "EST" : item.job_type?.toUpperCase().slice(0, 4) || "JOB";
      const time = item.arrival_start
        ? (() => { try { return format(new Date(item.arrival_start), "h:mm a"); } catch { return null; } })()
        : null;

      const jobLabel = item.item_type === "estimate" && item.estimate_number ? `Est #${item.estimate_number}` :
        item.item_type === "job" && (item.job_number || item.hcp_job_number) ? `Job #${item.job_number || item.hcp_job_number}` : "";

      const travel = travelToItem.get(item.id);
      const travelHtml = travel ? `
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;padding:3px 6px;border-radius:4px;font-size:10px;font-weight:600;
          background:${travel.min <= 10 ? "#dcfce7" : travel.min <= 20 ? "#fef3c7" : "#fee2e2"};
          color:${travel.min <= 10 ? "#16a34a" : travel.min <= 20 ? "#d97706" : "#dc2626"};">
          🚗 ${travel.min} min from prev stop
          ${travel.condition === "heavy" ? " ⚠️ Heavy" : travel.condition === "severe" ? " 🔴 Severe" : ""}
        </div>
      ` : "";

      const contentString = `
        <div style="font-family: system-ui, sans-serif; font-size: 13px; line-height: 1.5;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="background: ${color}; color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">${typeLabel}</span>
            ${jobLabel ? `<span style="color: #888; font-size: 11px; font-weight: 600;">${jobLabel}</span>` : ""}
          </div>
          ${item.assigned_to ? `<div style="font-weight: 600; font-size: 12px;">👤 ${item.assigned_to}</div>` : ""}
          ${time ? `<div style="color: #666; font-size: 11px;">⏰ ${time}${item.arrival_end ? ` – ${(() => { try { return format(new Date(item.arrival_end), "h:mm a"); } catch { return ""; } })()}` : ""}</div>` : ""}
          <div style="font-weight: 600; margin-top: 4px; font-size: 13px;">${item.customer_name || "Unknown"}</div>
          ${item.customer_phone ? `<div style="color: #666; font-size: 11px;">📞 ${(() => { const d = item.customer_phone.replace(/\\D/g, ""); if (d.length === 10) return "(" + d.slice(0,3) + ") " + d.slice(3,6) + "-" + d.slice(6); if (d.length === 11 && d[0] === "1") return "(" + d.slice(1,4) + ") " + d.slice(4,7) + "-" + d.slice(7); return item.customer_phone; })()}</div>` : ""}
          ${item.description ? `<div style="color: #666; font-size: 11px; margin-top: 2px;">${item.description.slice(0, 100)}${item.description.length > 100 ? "…" : ""}</div>` : ""}
          <div style="color: #888; font-size: 11px; margin-top: 2px;">📍 ${item.address}</div>
          ${travelHtml}
        </div>
      `;

      const initials = item.assigned_to ? item.assigned_to.split(" ").map(n => n[0]).join("").slice(0, 2) : "";

      const el = document.createElement("div");
      el.style.cssText = `
        width: 28px; height: 28px; border-radius: 50%; background: ${color};
        border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; color: white;
      `;
      el.textContent = initials;

      const marker = new google.maps.Marker({
        position: coords,
        map: mapRef.current!,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        label: {
          text: initials || " ",
          color: "#ffffff",
          fontSize: "10px",
          fontWeight: "700",
        },
      });

      const infoWindow = new google.maps.InfoWindow({ content: contentString, maxWidth: 280 });

      marker.addListener("mouseover", () => {
        openInfoWindows.forEach(w => w.close());
        openInfoWindows.length = 0;
        infoWindow.open(mapRef.current!, marker);
        openInfoWindows.push(infoWindow);
      });

      marker.addListener("click", () => {
        onItemClick(item);
      });

      markersRef.current.push(marker);
      bounds.extend(coords);
      hasPoints = true;
    });

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, 60);
      const listener = mapRef.current.addListener("idle", () => {
        const zoom = mapRef.current?.getZoom();
        if (zoom && zoom > 13) mapRef.current?.setZoom(13);
        google.maps.event.removeListener(listener);
      });
    }
  }, [items, geocoded, onItemClick, travelToItem]);

  // Supply house markers
  useEffect(() => {
    if (!mapRef.current) return;
    supplyMarkersRef.current.forEach(m => m.setMap(null));
    supplyMarkersRef.current = [];

    if (!showSupplyHouses) return;

    supplyHouseLocations.forEach(loc => {
      if (!loc.latitude || !loc.longitude) return;

      const contentString = `
        <div style="font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.5; max-width: 240px;">
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 2px;">${loc.branch_name.replace(/[\\/]+$/, "").trim()}</div>
          ${loc.supply_house?.name ? `<div style="color: #0d9488; font-size: 11px; font-weight: 600;">${loc.supply_house.name}</div>` : ""}
          ${loc.address ? `<div style="color: #666; font-size: 11px; margin-top: 4px;">📍 ${[loc.address, loc.city, [loc.state, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>` : ""}
          ${loc.phone ? `<div style="color: #666; font-size: 11px;">📞 ${loc.phone}</div>` : ""}
          ${loc.hours ? `<div style="color: #666; font-size: 11px;">🕐 ${loc.hours}</div>` : ""}
          ${loc.account_number ? `<div style="color: #666; font-size: 11px; margin-top: 4px;"># Acct: ${loc.account_number}</div>` : ""}
          ${loc.rep_name ? `<div style="color: #666; font-size: 11px;">👤 ${loc.rep_name}${loc.rep_phone ? ` · ${loc.rep_phone}` : ""}</div>` : ""}
        </div>
      `;

      const marker = new google.maps.Marker({
        position: { lat: Number(loc.latitude), lng: Number(loc.longitude) },
        map: mapRef.current!,
        icon: {
          path: "M -4,-4 L 4,-4 L 4,4 L -4,4 Z",
          fillColor: "#0d9488",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
          rotation: 45,
          scale: 1,
        },
        label: {
          text: "S",
          color: "#ffffff",
          fontSize: "11px",
          fontWeight: "700",
        },
      });

      const infoWindow = new google.maps.InfoWindow({ content: contentString, maxWidth: 260 });
      marker.addListener("mouseover", () => infoWindow.open(mapRef.current!, marker));
      marker.addListener("mouseout", () => {
        setTimeout(() => infoWindow.close(), 300);
      });

      supplyMarkersRef.current.push(marker);
    });
  }, [showSupplyHouses, supplyHouseLocations]);

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

      {/* Toggle range button */}
      {onToggleRange && (
        <button
          onClick={onToggleRange}
          className="absolute top-3 left-3 z-10 bg-card border shadow-md rounded-md px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          {mapRange === "today" ? "Show Full Week" : "Show Today Only"}
        </button>
      )}

      {/* Supply houses toggle */}
      {supplyHouseLocations.length > 0 && (
        <button
          onClick={() => setShowSupplyHouses(v => !v)}
          className={cn(
            "absolute top-12 left-3 z-10 border shadow-md rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            showSupplyHouses ? "bg-teal-600 text-white border-teal-700 hover:bg-teal-700" : "bg-card hover:bg-muted"
          )}
        >
          {showSupplyHouses ? "Hide Supply Houses" : "Show Supply Houses"}
        </button>
      )}

      {/* Route summary panel */}
      {techSummaries.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 bg-card/95 backdrop-blur border shadow-lg rounded-lg p-3 max-w-[260px] text-xs space-y-2">
          <div className="font-semibold text-foreground text-[11px] uppercase tracking-wide">Route Summary</div>
          {techSummaries.map(ts => (
            <div key={ts.name} className="flex items-start gap-2">
              <div className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ background: ts.color }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{ts.name}</div>
                <div className="text-muted-foreground">
                  {ts.stops} stops · {ts.totalMin} min · {ts.totalMiles} mi
                </div>
                {ts.hasTraffic && (
                  <div className="text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3" /> Traffic delays
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
          <div className="text-sm text-muted-foreground">No jobs {mapRange === "today" ? "today" : "this week"}</div>
        </div>
      )}
    </div>
  );
}
