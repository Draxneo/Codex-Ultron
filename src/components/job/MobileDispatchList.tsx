/**
 * MobileDispatchList — Touch-optimized dispatch view for mobile phones.
 * Groups jobs by technician in collapsible sections with card-based job items.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Car, ChevronDown, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddressLink } from "@/components/AddressLink";
import { ClickToCall } from "@/components/ClickToCall";
import { CustomerStatusBadges, getAvatarColor } from "@/components/CustomerStatusBadges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getLifecycleInfo } from "@/lib/jobLifecycle";
import { useCustomerEnrichment } from "@/hooks/useCustomerEnrichment";
import { useTechStatusMap } from "@/hooks/useTechStatusMap";
import { TechStatusBadge } from "@/components/TechStatusBadge";
import type { CalendarVisibleFields, CardDensity } from "@/components/job/CalendarSettings";

interface BoardItem {
  id: string;
  item_type: "job" | "estimate";
  customer_name: string | null;
  customer_id: string | null;
  address: string | null;
  description: string | null;
  assigned_to: string | null;
  scheduled_date: string | null;
  job_type: string;
  hcp_job_number: string | null;
  job_number: string | null;
  hcp_customer_id: string | null;
  customer_phone: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  estimate_number?: string | null;
  work_status?: string | null;
  status?: string | null;
}

const typeBadgeColors: Record<string, string> = {
  install: "bg-primary text-primary-foreground",
  service: "bg-[hsl(var(--today))] text-white",
  maintenance: "bg-[hsl(var(--complete))] text-white",
  estimate: "bg-purple-600 text-white",
  phone_call: "bg-[hsl(var(--sky))] text-white",
};

const typeCardBorder: Record<string, string> = {
  install: "border-l-primary",
  service: "border-l-[hsl(var(--today))]",
  maintenance: "border-l-[hsl(var(--complete))]",
  estimate: "border-l-purple-600",
  phone_call: "border-l-[hsl(var(--sky))]",
};

const roleAvatarColors: Record<string, string> = {
  install_tech: "bg-primary/20 text-primary ring-2 ring-primary/30",
  service_tech: "bg-[hsl(var(--today))]/20 text-[hsl(var(--today))] ring-2 ring-[hsl(var(--today))]/30",
  sales_tech: "bg-purple-100 text-purple-700 ring-2 ring-purple-300/40",
  admin: "bg-[hsl(var(--sky-light))] text-[hsl(var(--sky))] ring-2 ring-[hsl(var(--sky))]/30",
};

function formatTime(item: BoardItem) {
  if (!item.arrival_start) return null;
  try {
    return format(new Date(item.arrival_start), "h:mma").toLowerCase();
  } catch {
    return null;
  }
}

interface Props {
  dayItems: BoardItem[];
  employees: any[] | undefined;
  routeOrders: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
  cardDensity?: CardDensity;
  visibleFields?: CalendarVisibleFields;
}

function getCustomerShape(item: BoardItem) {
  const nameParts = (item.customer_name || "Unknown").trim().split(/\s+/);
  return {
    first_name: nameParts[0] || null,
    last_name: nameParts.slice(1).join(" ") || null,
    phone: item.customer_phone || null,
    address: item.address || null,
  };
}

function MobileCustomerBlock({
  item,
  enrichment,
  visibleFields,
  compact,
}: {
  item: BoardItem;
  enrichment: any;
  visibleFields?: CalendarVisibleFields;
  compact: boolean;
}) {
  const customer = getCustomerShape(item);
  const initials = `${customer.first_name?.[0] || ""}${customer.last_name?.[0] || ""}`.toUpperCase() || "?";
  const contactName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unknown";
  const zip = item.address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] || null;
  const street = (item.address || "").split(",")[0]?.trim() || item.address;
  const address = visibleFields?.zip && zip ? `${street}, ${zip}` : street;

  const showCustomer = visibleFields?.customer !== false;
  const showTags = visibleFields?.customerTags !== false;
  const showStreet = !compact && visibleFields?.street !== false && address;
  const showPhone = !compact && visibleFields?.phone && item.customer_phone;

  if (!showCustomer && !showTags && !showStreet && !showPhone) return null;

  return (
    <div className="space-y-1">
      {showCustomer && (
        <div className="flex items-center gap-2">
          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0", getAvatarColor(showTags ? enrichment : undefined))}>
            {initials}
          </div>
          <span className="text-sm font-bold text-foreground leading-tight break-words">
            {contactName}
          </span>
        </div>
      )}
      {showTags && (
        <CustomerStatusBadges enrichment={enrichment} className={showCustomer ? "ml-10" : ""} />
      )}
      {showStreet && (
        <div className={showCustomer ? "ml-10" : ""}>
          <AddressLink address={address} className="text-[11px] text-muted-foreground font-medium" iconClassName="h-3 w-3" />
        </div>
      )}
      {showPhone && (
        <div className={showCustomer ? "ml-10" : ""}>
          <ClickToCall
            phone={item.customer_phone!}
            contactName={contactName}
            className="text-[11px] text-muted-foreground font-medium"
            iconClassName="h-3 w-3"
          />
        </div>
      )}
    </div>
  );
}

export function MobileDispatchList({ dayItems, employees, routeOrders, cardDensity = "comfortable", visibleFields }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: enrichmentMap } = useCustomerEnrichment();
  const techStatusMap = useTechStatusMap();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const isCompact = cardDensity === "compact";

  const techRows = useMemo(() => {
    const techOrder = ["Jonathan", "Cedric", "Clint", "Hector", "Juan", "App", "Tim K", "Matt", "Joshua", "Tim"];
    const activeEmps = (employees || [])
      .filter((e: any) => e.is_active !== false)
      .sort((a: any, b: any) => {
        const aIdx = techOrder.findIndex(n => a.name?.startsWith(n));
        const bIdx = techOrder.findIndex(n => b.name?.startsWith(n));
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
      });

    const rows: { techName: string; role: string | null; items: BoardItem[] }[] = [];
    const unassigned = dayItems.filter(i => !i.assigned_to);
    if (unassigned.length > 0) {
      rows.push({ techName: "Unassigned", role: null, items: unassigned });
    }

    const assignedSet = new Set<string>();
    for (const emp of activeEmps) {
      const items = dayItems.filter(i => i.assigned_to === emp.name);
      if (items.length > 0) {
        rows.push({ techName: emp.name, role: emp.role, items });
        assignedSet.add(emp.name);
      }
    }

    // Orphan techs not in employee list
    const orphans = dayItems.filter(i => i.assigned_to && !assignedSet.has(i.assigned_to));
    const orphanMap = new Map<string, BoardItem[]>();
    orphans.forEach(i => {
      if (!orphanMap.has(i.assigned_to!)) orphanMap.set(i.assigned_to!, []);
      orphanMap.get(i.assigned_to!)!.push(i);
    });
    orphanMap.forEach((items, name) => rows.push({ techName: name, role: null, items }));

    return rows;
  }, [dayItems, employees]);

  const toggleCollapse = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    await queryClient.invalidateQueries({ queryKey: ["estimates"] });
  };

  const handleCardClick = (item: BoardItem) => {
    if (item.item_type === "estimate") {
      navigate(`/estimates/${item.id}`);
    } else {
      navigate(`/jobs/${item.id}`);
    }
  };

  if (dayItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 py-16">
        <span className="text-4xl">📋</span>
        <span className="text-sm font-medium">No jobs scheduled for this day</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {techRows.map(({ techName, role, items }) => {
        const isUnassigned = techName === "Unassigned";
        const initials = isUnassigned ? "?" : techName.split(" ").map(n => n[0]).join("").slice(0, 2);
        const primaryRole = role ? role.split(",")[0].trim() : null;
        const avatarColor = primaryRole ? roleAvatarColors[primaryRole] || "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground";
        const isOpen = !collapsed.has(techName);

        return (
          <Collapsible key={techName} open={isOpen} onOpenChange={() => toggleCollapse(techName)}>
            <CollapsibleTrigger className="w-full">
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 border-b active:bg-muted/60 transition-colors",
                isUnassigned && "bg-destructive/5"
              )}>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className={cn(
                    "text-xs font-bold",
                    isUnassigned ? "bg-destructive/20 text-destructive ring-2 ring-destructive/30" : avatarColor
                  )}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    {isUnassigned && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                    <span className="text-sm font-semibold text-foreground truncate">{techName}</span>
                  </div>
                  {primaryRole && (
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {primaryRole.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="text-[11px] shrink-0">
                  {items.length} job{items.length !== 1 ? "s" : ""}
                </Badge>
                {(() => {
                  const emp = (employees || []).find((e: any) => e.name === techName);
                  const ts = emp ? techStatusMap.get(emp.id) : undefined;
                  return ts ? <TechStatusBadge status={ts.status} locationName={ts.locationName} className="shrink-0" /> : null;
                })()}
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                  isOpen && "rotate-180"
                )} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 py-2 space-y-2 bg-muted/20">
                {items.map(item => {
                  const time = formatTime(item);
                  const ro = routeOrders.get(item.id);
                  const typeLabel = item.job_type === "estimate" ? "EST" : item.job_type === "install" ? "INST" : item.job_type === "maintenance" ? "MAINT" : item.job_type === "phone_call" ? "📞 CALL" : "SERV";
                  const lifecycle = getLifecycleInfo({
                    ...item,
                    ...(item.item_type === "estimate" ? { job_type: "estimate", status: item.work_status } : {}),
                  });

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleCardClick(item)}
                      className={cn(
                        "bg-card rounded-lg border border-l-[4px] p-3 active:scale-[0.98] transition-transform cursor-pointer shadow-sm",
                        typeCardBorder[item.job_type || "service"] || "border-l-muted"
                      )}
                    >
                      {/* Top row: route order, type badge, number, time */}
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {visibleFields?.travelTime !== false && ro && ro.order > 0 && (
                          <span className="w-5 h-5 rounded-full bg-foreground/80 text-background text-[10px] font-bold flex items-center justify-center shrink-0">
                            {ro.order}
                          </span>
                        )}
                        {visibleFields?.customerTags !== false && (
                          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase", typeBadgeColors[item.job_type || "service"])}>
                            {typeLabel}
                          </span>
                        )}
                        {visibleFields?.jobNumber !== false && (
                          <span className="text-[11px] text-muted-foreground font-semibold">
                            {item.item_type === "estimate" && item.estimate_number && `#${item.estimate_number}`}
                            {item.item_type === "job" && (item.job_number || item.hcp_job_number) && `#${item.job_number || item.hcp_job_number}`}
                          </span>
                        )}
                        {visibleFields?.arrivalWindow !== false && time && (
                          <span className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground font-medium shrink-0">
                            <Clock className="h-3 w-3" />
                            {time}
                          </span>
                        )}
                      </div>

                      {/* Customer — unified card */}
                      {(() => {
                        const enrichment = item.customer_id ? enrichmentMap?.get(item.customer_id) : undefined;
                        return (
                          <MobileCustomerBlock
                            item={item}
                            enrichment={enrichment}
                            visibleFields={visibleFields}
                            compact={isCompact}
                          />
                        );
                      })()}

                      {cardDensity === "expanded" && item.description && visibleFields?.description !== false && (
                        <div className="mt-2 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                          {item.description}
                        </div>
                      )}

                      {/* Bottom row: stage badge, travel, task progress */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {lifecycle.isComplete ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-[hsl(var(--complete)/0.15)] text-[hsl(var(--complete))]">
                            ✓ Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">
                            ▸ {lifecycle.label}
                          </span>
                        )}

                        {visibleFields?.travelTime !== false && ro?.travelMin != null && (
                          <span className={cn(
                            "flex items-center gap-0.5 text-[10px] font-semibold",
                            ro.travelMin <= 10 ? "text-[hsl(var(--complete))]" : ro.travelMin <= 20 ? "text-amber-500" : "text-destructive"
                          )}>
                            <Car className="h-3 w-3" />
                            {ro.travelMin}m
                          </span>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
