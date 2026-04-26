import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  cartId: string;
  initialFirstViewedAt?: string | null;
  initialLastViewedAt?: string | null;
  initialViewCount?: number;
  status?: string;
}

/**
 * Tech-side read-receipt indicator. Subscribes to job_carts realtime so
 * the moment the customer opens the link, the dispatcher / tech can see it.
 */
export function CartViewStatus({ cartId, initialFirstViewedAt, initialLastViewedAt, initialViewCount = 0, status }: Props) {
  const [firstAt, setFirstAt] = useState<string | null>(initialFirstViewedAt || null);
  const [lastAt, setLastAt] = useState<string | null>(initialLastViewedAt || null);
  const [count, setCount] = useState<number>(initialViewCount);

  useEffect(() => {
    setFirstAt(initialFirstViewedAt || null);
    setLastAt(initialLastViewedAt || null);
    setCount(initialViewCount);
  }, [initialFirstViewedAt, initialLastViewedAt, initialViewCount]);

  useEffect(() => {
    if (!cartId) return;
    const channel = supabase
      .channel(`cart-views-${cartId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "job_carts", filter: `id=eq.${cartId}` }, (payload) => {
        const row = payload.new as any;
        setFirstAt(row.first_viewed_at);
        setLastAt(row.last_viewed_at);
        setCount(row.view_count || 0);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cartId]);

  if (!status || status === "draft") return null;
  if (!firstAt) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <EyeOff className="h-3.5 w-3.5" /> Not yet opened
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
      <Eye className="h-3.5 w-3.5" />
      Viewed {count > 1 ? `${count}× · last ` : ""}
      {formatDistanceToNow(new Date(lastAt || firstAt), { addSuffix: true })}
    </div>
  );
}
