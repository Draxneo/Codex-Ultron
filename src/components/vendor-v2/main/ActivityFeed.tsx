import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Mail, MessageSquare, Phone, Package, Activity } from "lucide-react";

interface Props {
  vendorId: string;
}

interface FeedItem {
  id: string;
  kind: "email" | "sms" | "call" | "order";
  title: string;
  body?: string | null;
  created_at: string;
  meta?: string;
}

const ICONS: Record<string, any> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  order: Package,
};

export function VendorActivityFeed({ vendorId }: Props) {
  const { data: items = [], isLoading } = useQuery<FeedItem[]>({
    queryKey: ["vendor_activity_feed", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const [sms, calls, orders] = await Promise.all([
        (supabase.from("sms_log").select("id, body, created_at, direction, phone_number") as any)
          .eq("related_vendor_id", vendorId).order("created_at", { ascending: false }).limit(25),
        (supabase.from("call_log").select("id, ai_summary, contact_name, phone_number, created_at, direction, duration_seconds") as any)
          .eq("related_vendor_id", vendorId).order("created_at", { ascending: false }).limit(25),
        supabase.from("parts_orders").select("id, description, po_number, status, created_at")
          .eq("supply_house_id", vendorId).order("created_at", { ascending: false }).limit(25),
      ]);

      const all: FeedItem[] = [];
      (sms.data || []).forEach((s: any) => all.push({
        id: `sms-${s.id}`,
        kind: "sms",
        title: s.direction === "inbound" ? "SMS received" : "SMS sent",
        body: s.body,
        created_at: s.created_at,
        meta: s.phone_number,
      }));
      (calls.data || []).forEach((c: any) => all.push({
        id: `call-${c.id}`,
        kind: "call",
        title: c.direction === "inbound" ? "Call received" : "Call placed",
        body: c.ai_summary || null,
        created_at: c.created_at,
        meta: c.contact_name || c.phone_number,
      }));
      (orders.data || []).forEach((o: any) => all.push({
        id: `order-${o.id}`,
        kind: "order",
        title: `Order ${o.po_number ? `#${o.po_number}` : ""} · ${o.status}`,
        body: o.description,
        created_at: o.created_at,
      }));

      return all
        .filter((i) => i.created_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
    },
  });

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Activity</h3>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-1 opacity-40" />
          <p className="text-sm">No activity yet</p>
        </div>
      )}

      {items.length > 0 && (
        <ol className="relative">
          {items.map((r) => {
            const Icon = ICONS[r.kind] || Activity;
            return (
              <li key={r.id} className="flex gap-3 py-2.5 border-b last:border-0">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.body && <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    {r.meta && ` · ${r.meta}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
