/**
 * useGeofenceTracking.ts — Background GPS tracking with geofence detection.
 *
 * On native (Capacitor), tracks the tech's location in the background and:
 * 1. Upserts their position to `tech_locations` (live location for dispatch/Jarvis)
 * 2. Auto-sets job/estimate status to "on_site" when within ~100 yards (91m)
 * 3. Logs arrival/departure events at jobs AND supply houses
 * 4. Auto-clocks out (logs departure) when leaving last job's geofence
 *
 * Battery optimizations:
 * - 50m distance filter: GPS callback ignored unless tech moves 50+ meters
 * - Dynamic accuracy: switches to WiFi/cell when on-site, GPS when en-route
 * - Adaptive upsert throttle: 60s when stationary, 15s when moving
 */

import { useCallback, useEffect, useRef } from "react";
import { useCapacitor } from "./useCapacitor";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/lib/google-maps";
import { CLOSED_ESTIMATE_STATUS_FILTER, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

const GEOFENCE_RADIUS_M = 91; // ~100 yards
const DISTANCE_FILTER_M = 50; // only process position if moved 50m+
const MOVING_UPSERT_MS = 15_000; // upsert every 15s when moving
const STATIONARY_UPSERT_MS = 60_000; // upsert every 60s when stationary

/** Haversine distance in meters */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface GeoTarget {
  type: "job" | "estimate" | "supply_house";
  id: string;
  name: string;
  lat: number;
  lng: number;
  locationId?: string;
}

export function useGeofenceTracking() {
  const { isNative } = useCapacitor();
  const { employeeId, role } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const lastUpsertRef = useRef(0);
  const insideRef = useRef<Set<string>>(new Set());
  const targetsRef = useRef<GeoTarget[]>([]);
  const targetsFetchedRef = useRef(false);

  // Battery optimization refs
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const isOnSiteRef = useRef(false);
  const isMovingRef = useRef(true); // assume moving initially
  const restartWatchRef = useRef<((highAccuracy: boolean) => void) | null>(null);

  // Fetch geofence targets (today's jobs/estimates + all supply houses)
  const fetchTargets = useCallback(async () => {
    if (!employeeId) return;
    const today = new Date().toISOString().slice(0, 10);

    const { data: emp } = await supabase
      .from("employees")
      .select("name")
      .eq("id", employeeId)
      .single();
    if (!emp?.name) return;

    const [jobsRes, estimatesRes, supplyRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, address, customer_name, status")
        .eq("assigned_to", emp.name)
        .eq("scheduled_date", today)
        .not("status", "in", CLOSED_WORK_STATUS_FILTER),
      supabase
        .from("estimates")
        .select("id, address, customer_name, status")
        .eq("assigned_to", emp.name)
        .eq("scheduled_date", today)
        .not("status", "in", CLOSED_ESTIMATE_STATUS_FILTER),
      supabase
        .from("supply_house_locations")
        .select("id, branch_name, latitude, longitude, supply_houses(name)")
        .eq("is_active", true),
    ]);

    const targets: GeoTarget[] = [];

    for (const job of jobsRes.data || []) {
      if (!job.address) continue;
      const coords = await geocodeAddress(job.address);
      if (coords) {
        targets.push({
          type: "job",
          id: job.id,
          name: job.customer_name || job.address,
          lat: coords.lat,
          lng: coords.lng,
        });
      }
    }

    for (const est of estimatesRes.data || []) {
      if (!est.address) continue;
      const coords = await geocodeAddress(est.address);
      if (coords) {
        targets.push({
          type: "estimate",
          id: est.id,
          name: (est as any).customer_name || est.address,
          lat: coords.lat,
          lng: coords.lng,
        });
      }
    }

    for (const loc of supplyRes.data || []) {
      if (!loc.latitude || !loc.longitude) continue;
      const shName = (loc as any).supply_houses?.name || "";
      targets.push({
        type: "supply_house",
        id: `sh_${loc.id}`,
        name: `${shName} ${loc.branch_name || ""}`.trim(),
        lat: Number(loc.latitude),
        lng: Number(loc.longitude),
        locationId: loc.id,
      });
    }

    targetsRef.current = targets;
    targetsFetchedRef.current = true;
  }, [employeeId]);

  // Process a new GPS position
  const onPosition = useCallback(
    async (lat: number, lng: number, speed: number | null, accuracy: number | null) => {
      if (!employeeId) return;

      // Adaptive upsert throttle: 15s when moving, 60s when stationary
      const now = Date.now();
      const upsertInterval = isMovingRef.current ? MOVING_UPSERT_MS : STATIONARY_UPSERT_MS;
      if (now - lastUpsertRef.current > upsertInterval) {
        lastUpsertRef.current = now;
        supabase
          .from("tech_locations")
          .upsert(
            {
              employee_id: employeeId,
              lat,
              lng,
              speed,
              accuracy,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "employee_id" }
          )
          .then(({ error }) => {
            if (error) console.warn("tech_locations upsert error:", error.message);
          });
      }

      const wasOnSite = isOnSiteRef.current;

      // Check geofences
      for (const target of targetsRef.current) {
        const dist = haversineM(lat, lng, target.lat, target.lng);
        const wasInside = insideRef.current.has(target.id);

        if (dist <= GEOFENCE_RADIUS_M && !wasInside) {
          // ENTERED geofence
          insideRef.current.add(target.id);
          console.log(`[Geofence] ENTERED ${target.type}: ${target.name} (${Math.round(dist)}m)`);

          if (target.type === "job") {
            const arrivedAt = new Date().toISOString();
            await supabase
              .from("jobs")
              .update({ status: "in_progress", started_at: arrivedAt, arrival_time: arrivedAt } as any)
              .eq("id", target.id)
              .in("status", ["scheduled", "dispatched", "en_route", "on_my_way", "on_site"]);

            await supabase.from("tech_location_events").insert({
              employee_id: employeeId,
              event_type: "job_arrival",
              job_id: target.id,
              location_name: target.name,
              lat,
              lng,
            });
          } else if (target.type === "estimate") {
            await supabase.from("tech_location_events").insert({
              employee_id: employeeId,
              event_type: "estimate_arrival",
              estimate_id: target.id,
              location_name: target.name,
              lat,
              lng,
            });
          } else if (target.type === "supply_house") {
            await supabase.from("tech_location_events").insert({
              employee_id: employeeId,
              event_type: "supply_house_arrival",
              supply_house_location_id: target.locationId,
              location_name: target.name,
              lat,
              lng,
            });
          }
        } else if (dist > GEOFENCE_RADIUS_M * 1.5 && wasInside) {
          // EXITED geofence (50% hysteresis)
          insideRef.current.delete(target.id);
          console.log(`[Geofence] EXITED ${target.type}: ${target.name} (${Math.round(dist)}m)`);

          const eventType =
            target.type === "job"
              ? "job_departure"
              : target.type === "estimate"
                ? "estimate_departure"
                : "supply_house_departure";

          await supabase.from("tech_location_events").insert({
            employee_id: employeeId,
            event_type: eventType,
            ...(target.type === "job" ? { job_id: target.id } : {}),
            ...(target.type === "estimate" ? { estimate_id: target.id } : {}),
            ...(target.type === "supply_house" ? { supply_house_location_id: target.locationId } : {}),
            location_name: target.name,
            lat,
            lng,
          });

          // Auto clock-out: if departing a job/estimate and no more job/estimate geofences are active
          if (target.type === "job" || target.type === "estimate") {
            const remainingJobGeofences = Array.from(insideRef.current).some((id) => {
              const t = targetsRef.current.find((tgt) => tgt.id === id);
              return t && (t.type === "job" || t.type === "estimate");
            });

            if (!remainingJobGeofences) {
              const today = new Date().toISOString().slice(0, 10);
              // Check if already clocked out today
              const { data: existingClockOut } = await supabase
                .from("tech_location_events")
                .select("id")
                .eq("employee_id", employeeId)
                .eq("event_type", "clock_out")
                .gte("created_at", `${today}T00:00:00`)
                .limit(1);

              if (!existingClockOut || existingClockOut.length === 0) {
                await supabase.from("tech_location_events").insert({
                  employee_id: employeeId,
                  event_type: "clock_out",
                  ...(target.type === "job" ? { job_id: target.id } : { estimate_id: target.id }),
                  location_name: `Left last site — ${target.name}`,
                  lat,
                  lng,
                });
                console.log("[Clock] Auto clock-out logged — left last job geofence");
              }
            }
          }
        }
      }

      // Dynamic accuracy: toggle between high-accuracy (GPS) and low-accuracy (WiFi/cell)
      const nowOnSite = insideRef.current.size > 0;
      isOnSiteRef.current = nowOnSite;

      if (nowOnSite !== wasOnSite && restartWatchRef.current) {
        const useHighAccuracy = !nowOnSite;
        console.log(`[Geofence] Switching accuracy: highAccuracy=${useHighAccuracy} (onSite=${nowOnSite})`);
        restartWatchRef.current(useHighAccuracy);
      }
    },
    [employeeId]
  );

  // Start/stop tracking
  useEffect(() => {
    if (!isNative || (role !== "tech" && role !== "supervisor") || !employeeId) return;

    let cancelled = false;

    // Function to start (or restart) the watch with a given accuracy
    async function startWatch(highAccuracy: boolean) {
      // Clear existing watch first
      if (watchIdRef.current !== null) {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          await Geolocation.clearWatch({ id: String(watchIdRef.current) });
        } catch { /* ignore */ }
        watchIdRef.current = null;
      }

      if (cancelled) return;

      try {
        const { Geolocation } = await import("@capacitor/geolocation");

        const id = await Geolocation.watchPosition(
          {
            enableHighAccuracy: highAccuracy,
            timeout: 30000,
            maximumAge: highAccuracy ? 10000 : 30000,
          },
          (position, err) => {
            if (err || !position) return;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Distance filter: skip if moved less than 50m
            const lastPos = lastPositionRef.current;
            if (lastPos) {
              const moved = haversineM(lastPos.lat, lastPos.lng, lat, lng);
              if (moved < DISTANCE_FILTER_M) {
                // Hasn't moved enough — mark as stationary, skip processing
                isMovingRef.current = false;
                return;
              }
            }

            // Moved 50m+ or first reading — process it
            lastPositionRef.current = { lat, lng };
            isMovingRef.current = true;

            onPosition(lat, lng, position.coords.speed, position.coords.accuracy);
          }
        );
        if (!cancelled) {
          watchIdRef.current = id ? Number(id) : null;
        }
      } catch (e) {
        console.warn("Geolocation watch failed:", e);
      }
    }

    // Store restart function so onPosition can trigger accuracy changes
    restartWatchRef.current = (highAccuracy: boolean) => {
      startWatch(highAccuracy);
    };

    async function init() {
      await fetchTargets();
      if (cancelled) return;
      // Start with high accuracy (en-route mode)
      await startWatch(true);
    }

    init();

    // Refresh targets every 5 minutes
    const refreshInterval = setInterval(() => {
      fetchTargets();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      restartWatchRef.current = null;
      clearInterval(refreshInterval);
      if (watchIdRef.current !== null) {
        import("@capacitor/geolocation").then(({ Geolocation }) => {
          Geolocation.clearWatch({ id: String(watchIdRef.current) });
        });
        watchIdRef.current = null;
      }
    };
  }, [isNative, role, employeeId, fetchTargets, onPosition]);
}
