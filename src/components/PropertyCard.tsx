import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Home, RefreshCw } from "lucide-react";

interface PropertyData {
  address: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  year_built?: number | null;
  estimated_value?: number | null;
  lot_size?: string | null;
  property_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  street_view_url?: string | null;
  screenshot_url?: string | null;
  zillow_url?: string | null;
  source?: string | null;
}

function formatValue(val: number | null | undefined): string {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatNumber(val: number | null | undefined): string {
  if (!val) return "—";
  return new Intl.NumberFormat("en-US").format(val);
}

export function PropertyCard({ address }: { address: string }) {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const fetchProperty = useCallback(async (force = false) => {
    try {
      const { data: result, error } = await supabase.functions.invoke("lookup-property", {
        body: { address, force },
      });
      if (error) {
        console.error("Property lookup error:", error);
        setData({ address });
      } else {
        setData(result);
        setImageError(false);
      }
    } catch (e) {
      console.error("PropertyCard error:", e);
      setData({ address });
    }
    setLoading(false);
    setRefreshing(false);
  }, [address]);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    fetchedRef.current = false;

    let cancelled = false;

    (async () => {
      try {
        // Check local cache first
        const { data: cached } = await supabase
          .from("property_data" as any)
          .select("*")
          .eq("address", address)
          .maybeSingle();

        if (cached && !cancelled) {
          const c = cached as any;
          const hasStats = c.bedrooms || c.bathrooms || c.sqft || c.year_built || c.estimated_value;
          const hasImage = !!c.street_view_url;

          if (hasStats && hasImage) {
            // Fully cached — show immediately, no fetch needed
            setData(c);
            setLoading(false);
            fetchedRef.current = true;
            return;
          }

          if (hasStats || hasImage) {
            // Partial cache — show what we have, fetch rest in background
            setData(c);
            setLoading(false);
          }
        }

        // Auto-fetch on page visit (no manual refresh needed)
        if (!cancelled && !fetchedRef.current) {
          fetchedRef.current = true;
          await fetchProperty();
        }
      } catch (e) {
        console.error("PropertyCard error:", e);
        if (!cancelled) {
          setData({ address });
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [address, fetchProperty]);

  if (!address) return null;

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <Skeleton className="aspect-[16/9] w-full rounded-none" />
      </Card>
    );
  }

  const hasPropertyData = data && (data.bedrooms || data.bathrooms || data.sqft || data.year_built || data.estimated_value);
  const imageUrl = data?.street_view_url || null;
  const isVerified = data?.source && /CAD/i.test(data.source);

  // Fallback layout when no street view image is available
  if (!imageUrl || imageError) {
    return (
      <Card className="overflow-hidden">
        <div className="relative aspect-[16/9] bg-muted/50 flex items-center justify-center">
          <Home className="h-10 w-10 text-muted-foreground" />
          <button
            onClick={() => { setRefreshing(true); setLoading(true); fetchProperty(true); }}
            disabled={refreshing}
            className="absolute top-2 right-2 p-1.5 rounded bg-black/40 hover:bg-black/60 text-white transition-colors"
            title="Refresh property photo"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {hasPropertyData && (
            <PropertyStatsOverlay data={data!} />
          )}
        </div>
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t">
          <p className="text-xs font-medium text-muted-foreground break-words min-w-0 flex-1">{address}</p>
          {data?.source && (
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                isVerified
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              }`}
              title={isVerified ? "County tax records — verified" : "Estimate — verify with customer"}
            >
              {isVerified ? `${data.source} • verified` : `${data.source} • estimate`}
            </span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Street View with overlaid stats */}
      <div className="relative bg-muted">
        <img
          src={imageUrl}
          alt={`Property at ${address}`}
          className="w-full aspect-[16/9] object-cover"
          loading="lazy"
          onError={() => setImageError(true)}
        />
        {/* Top gradient for legibility */}
        <div className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none" />

        {/* Refresh button */}
        <button
          onClick={() => { setRefreshing(true); setLoading(true); fetchProperty(true); }}
          disabled={refreshing}
          className="absolute top-2 right-2 p-1.5 rounded bg-black/40 hover:bg-black/60 text-white transition-colors z-10"
          title="Refresh property photo"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Stats overlay */}
        {hasPropertyData && <PropertyStatsOverlay data={data!} />}
      </div>

      {/* Address footer */}
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t">
        <p className="text-xs font-medium text-muted-foreground break-words min-w-0 flex-1">{address}</p>
        {data?.source && (
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isVerified
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
            title={isVerified ? "County tax records — verified" : "Estimate — verify with customer"}
          >
            {isVerified ? `${data.source} • verified` : `${data.source} • estimate`}
          </span>
        )}
      </div>
    </Card>
  );
}

function PropertyStatsOverlay({ data }: { data: PropertyData }) {
  const items: { label: string; value: string; sub?: string }[] = [];

  if (data.estimated_value) {
    items.push({
      label: "Estimate",
      value: formatValue(data.estimated_value),
    });
  }
  if (data.bedrooms != null) {
    items.push({ label: "Beds", value: String(data.bedrooms) });
  }
  if (data.bathrooms != null) {
    items.push({
      label: "Baths",
      value: Number(data.bathrooms).toFixed(1).replace(/\.0$/, ".0"),
    });
  }
  if (data.sqft) {
    items.push({ label: "Sq.Ft.", value: formatNumber(data.sqft) });
  }

  if (items.length === 0 && !data.year_built) return null;

  return (
    <div className="absolute top-0 left-0 right-0 p-3 text-white pointer-events-none">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-1">
        {items.map((it) => (
          <div key={it.label} className="leading-tight">
            <div className="text-sm font-bold drop-shadow-md">{it.value}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide opacity-90 drop-shadow">{it.label}</div>
          </div>
        ))}
      </div>
      {data.year_built && (
        <div className="mt-1.5 text-xs font-semibold drop-shadow-md">
          Built in {data.year_built}
        </div>
      )}
    </div>
  );
}
