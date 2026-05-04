/**
 * TechServicePlansCard.tsx — Shows active customer service agreements.
 */

import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCustomerAgreements } from "@/hooks/useServiceAgreements";
import { format, parseISO } from "date-fns";

interface TechServicePlansCardProps {
  customerId: string | null;
  /** Render without the outer Card chrome / header (used inside TechCollapsibleCard) */
  bare?: boolean;
}

export function TechServicePlansCard({ customerId, bare = false }: TechServicePlansCardProps) {
  const { data: agreements, isLoading } = useCustomerAgreements(customerId || undefined);

  const body = (
    <div className="p-4">
      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : !agreements || agreements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active service plans</p>
      ) : (
        <ul className="space-y-2">
          {agreements.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-foreground">{a.plan_name || "Service Plan"}</p>
                {a.end_date && (
                  <p className="text-xs text-muted-foreground">
                    Expires {format(parseISO(a.end_date), "MMM d, yyyy")}
                  </p>
                )}
              </div>
              <span className="text-[10px] uppercase font-bold text-[hsl(var(--complete))] bg-[hsl(var(--complete))]/10 px-2 py-0.5 rounded">
                {a.status || "active"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center px-4 h-12 border-b border-border">
        <Shield className="h-4 w-4 text-primary mr-2" />
        <h3 className="text-sm font-semibold text-foreground">Service Plans</h3>
      </div>
      {body}
    </Card>
  );
}
