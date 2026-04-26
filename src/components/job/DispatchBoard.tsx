import { useMemo } from "react";
import { format } from "date-fns";
import { Clock, Phone, Car } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { AddressLink } from "@/components/AddressLink";
import { CustomerCard } from "@/components/CustomerCard";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getStageInfo } from "@/hooks/useWorkflowStage";
import { Badge } from "@/components/ui/badge";
import { useCustomerEnrichment } from "@/hooks/useCustomerEnrichment";
import { CustomerStatusBadges, getAvatarColor } from "@/components/CustomerStatusBadges";
import { useTechStatusMap } from "@/hooks/useTechStatusMap";
import { TechStatusBadge } from "@/components/TechStatusBadge";

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
  [key: string]: any; // Allow workflow timestamps to flow through for getStageInfo()
}

const jobTypeBorderColors: Record<string, string> = {
  install: "border-l-primary",
  service: "border-l-[hsl(var(--today))]",
  maintenance: "border-l-[hsl(var(--complete))]",
  estimate: "border-l-purple-600",
  phone_call: "border-l-[hsl(var(--sky))]",
};

const cardBgColors: Record<string, string> = {
  install: "bg-card border border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary))]",
  service: "bg-card border border-[hsl(var(--today))]/25 shadow-[inset_3px_0_0_hsl(var(--today))]",
  maintenance: "bg-card border border-[hsl(var(--complete))]/25 shadow-[inset_3px_0_0_hsl(var(--complete))]",
  estimate: "bg-card border border-purple-300/30 shadow-[inset_3px_0_0_rgb(147,51,234)]",
  phone_call: "bg-card border border-[hsl(var(--sky))]/25 shadow-[inset_3px_0_0_hsl(var(--sky))]",
};

const cardSolidColors: Record<string, string> = {
  install: "bg-primary text-primary-foreground",
  service: "bg-[hsl(var(--today))] text-white",
  maintenance: "bg-[hsl(var(--complete))] text-white",
  estimate: "bg-purple-600 text-white",
  phone_call: "bg-[hsl(var(--sky))] text-white",
};

/** Role-based avatar colors */
const roleAvatarColors: Record<string, string> = {
  install_tech: "bg-primary/20 text-primary ring-2 ring-primary/30",
  service_tech: "bg-[hsl(var(--today))]/20 text-[hsl(var(--today))] ring-2 ring-[hsl(var(--today))]/30",
  sales_tech: "bg-purple-100 text-purple-700 ring-2 ring-purple-300/40",
  admin: "bg-[hsl(var(--sky-light))] text-[hsl(var(--sky))] ring-2 ring-[hsl(var(--sky))]/30",
};

/** Role-based row accent */
const roleRowAccent: Record<string, string> = {
  install_tech: "border-l-[3px] border-l-primary",
  service_tech: "border-l-[3px] border-l-[hsl(var(--today))]",
  sales_tech: "border-l-[3px] border-l-purple-500",
  admin: "border-l-[3px] border-l-[hsl(var(--sky))]",
};

function getRoleColor(role: string | null): { avatar: string; accent: string } {
  if (!role) return { avatar: "bg-muted text-muted-foreground", accent: "" };
  const primary = role.split(",")[0].trim();
  return {
    avatar: roleAvatarColors[primary] || "bg-muted text-muted-foreground",
    accent: roleRowAccent[primary] || "",
  };
}

const START_HOUR = 7;
const END_HOUR = 19;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function hourToPct(h: number) {
  return Math.max(0, Math.min(100, ((h - START_HOUR) / TOTAL_HOURS) * 100));
}

function getStartEnd(item: BoardItem) {
  if (!item.arrival_start) return null;
  try {
    const start = new Date(item.arrival_start);
    const startH = start.getHours() + start.getMinutes() / 60;
    let endH = startH + 1;
    if (item.arrival_end) {
      const end = new Date(item.arrival_end);
      endH = end.getHours() + end.getMinutes() / 60;
    }
    if (endH <= startH) endH = startH + 1;
    return { startH, endH };
  } catch {
    return null;
  }
}

function formatTimeRange(item: BoardItem) {
  if (!item.arrival_start) return null;
  try {
    const s = format(new Date(item.arrival_start), "h:mm");
    const e = item.arrival_end ? format(new Date(item.arrival_end), "h:mma").toLowerCase() : null;
    return e ? `${s}-${e}` : s;
  } catch {
    return null;
  }
}

/** Lay out overlapping items into sub-rows (stacked vertically within a tech row) */
function layoutSubRows(items: { item: BoardItem; startH: number; endH: number }[]) {
  const sorted = [...items].sort((a, b) => a.startH - b.startH || a.endH - b.endH);
  const subRows: { endH: number }[] = [];
  const result: { item: BoardItem; startH: number; endH: number; subRow: number }[] = [];

  for (const p of sorted) {
    let placed = false;
    for (let r = 0; r < subRows.length; r++) {
      if (p.startH >= subRows[r].endH) {
        result.push({ ...p, subRow: r });
        subRows[r].endH = p.endH;
        placed = true;
        break;
      }
    }
    if (!placed) {
      result.push({ ...p, subRow: subRows.length });
      subRows.push({ endH: p.endH });
    }
  }

  return { laid: result, totalSubRows: Math.max(subRows.length, 1) };
}

type CardDensity = "compact" | "comfortable" | "expanded";

interface DispatchBoardProps {
  dayItems: BoardItem[];
  employees: any[] | undefined;
  onItemClick: (item: BoardItem) => void;
  routeOrders: Map<string, { order: number; travelMin: number | null; fromLabel: string | null }>;
  visibleFields?: { travelTime?: boolean; customerTags?: boolean };
  cardDensity?: CardDensity;
}

const DENSITY_CONFIG: Record<CardDensity, { minWidth: number; cardHeight: number; cardHeightRich: number }> = {
  compact: { minWidth: 180, cardHeight: 120, cardHeightRich: 140 },
  comfortable: { minWidth: 240, cardHeight: 180, cardHeightRich: 220 },
  expanded: { minWidth: 300, cardHeight: 240, cardHeightRich: 310 },
};

const EMPTY_ROW_HEIGHT = 48;

export function DispatchBoard({ dayItems, employees, onItemClick, routeOrders, visibleFields, cardDensity = "comfortable" }: DispatchBoardProps) {
  const queryClient = useQueryClient();
  const { data: enrichmentMap } = useCustomerEnrichment();
  const techStatusMap = useTechStatusMap();
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  // Group items by tech, compute sub-row layouts
  const techRows = useMemo(() => {
    const techOrder = ["Jonathan", "Cedric", "Clint", "Hector", "Juan", "App", "Tim K", "Matt", "Joshua", "Tim"];
    const activeEmps = (employees || []).filter((e: any) => e.is_active !== false).sort((a: any, b: any) => {
      const aIdx = techOrder.findIndex(n => a.name?.startsWith(n));
      const bIdx = techOrder.findIndex(n => b.name?.startsWith(n));
      const aOrder = aIdx === -1 ? 999 : aIdx;
      const bOrder = bIdx === -1 ? 999 : bIdx;
      return aOrder - bOrder;
    });
    const assignedTechSet = new Set<string>();

    const rows: {
      techName: string;
      role: string | null;
      items: BoardItem[];
      timedLayout: ReturnType<typeof layoutSubRows>;
      untimedItems: BoardItem[];
    }[] = [];

    const unassigned = dayItems.filter(i => !i.assigned_to);
    const unTimed = unassigned
      .map(i => {
        const se = getStartEnd(i);
        return se ? { item: i, startH: se.startH, endH: se.endH } : null;
      })
      .filter(Boolean) as { item: BoardItem; startH: number; endH: number }[];
    if (unassigned.length > 0) {
      rows.push({
        techName: "Unassigned",
        role: null,
        items: unassigned,
        timedLayout: layoutSubRows(unTimed),
        untimedItems: unassigned.filter(i => !getStartEnd(i)),
      });
    }

    for (const emp of activeEmps) {
      const techItems = dayItems.filter(i => i.assigned_to === emp.name);
      const timed = techItems
        .map(i => {
          const se = getStartEnd(i);
          return se ? { item: i, startH: se.startH, endH: se.endH } : null;
        })
        .filter(Boolean) as { item: BoardItem; startH: number; endH: number }[];
      const untimed = techItems.filter(i => !getStartEnd(i));

      rows.push({
        techName: emp.name,
        role: emp.role,
        items: techItems,
        timedLayout: layoutSubRows(timed),
        untimedItems: untimed,
      });
      assignedTechSet.add(emp.name);
    }

    const orphanItems = dayItems.filter(i => i.assigned_to && !assignedTechSet.has(i.assigned_to));
    const orphanTechs = new Map<string, BoardItem[]>();
    for (const item of orphanItems) {
      if (!orphanTechs.has(item.assigned_to!)) orphanTechs.set(item.assigned_to!, []);
      orphanTechs.get(item.assigned_to!)!.push(item);
    }
    for (const [name, items] of orphanTechs) {
      const timed = items
        .map(i => {
          const se = getStartEnd(i);
          return se ? { item: i, startH: se.startH, endH: se.endH } : null;
        })
        .filter(Boolean) as { item: BoardItem; startH: number; endH: number }[];
      rows.push({
        techName: name,
        role: null,
        items,
        timedLayout: layoutSubRows(timed),
        untimedItems: items.filter(i => !getStartEnd(i)),
      });
    }

    return rows;
  }, [dayItems, employees]);

  const handleDrop = async (e: React.DragEvent, targetTech: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("text/plain");
    if (!itemId) return;
    const item = dayItems.find(i => i.id === itemId);
    if (!item) return;

    const newAssigned = targetTech === "Unassigned" ? null : targetTech;
    if (item.assigned_to === newAssigned) return;

    const oldAssigned = item.assigned_to || "Unassigned";
    const table = item.item_type === "estimate" ? "estimates" : "jobs";
    await supabase.from(table).update({ assigned_to: newAssigned } as any).eq("id", itemId);

    // Log reassignment to activity_log
    if (table === "jobs") {
      await supabase.from("activity_log").insert({
        job_id: itemId,
        action: "reassigned",
        performed_by: "Office",
        details: `Reassigned from ${oldAssigned} to ${newAssigned || "Unassigned"} via dispatch board`,
      });
    }

    // Fire-and-forget sync to HCP
    supabase.functions.invoke("sync-job-to-hcp", {
      body: { [table === "estimates" ? "estimate_id" : "job_id"]: itemId },
    }).catch((err) => console.warn("HCP sync failed:", err));

    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["estimates"] });
    queryClient.invalidateQueries({ queryKey: ["activity_log"] });
  };


  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* Main dispatch grid */}
      <div className="flex-1 min-h-0 overflow-auto">
      {/* Header row with hours */}
      <div className="sticky top-0 z-20 flex bg-gradient-to-r from-[hsl(var(--navy-dark))] via-[hsl(var(--navy))] to-[hsl(var(--navy-light))] border-b">
        <div className="w-[140px] shrink-0 border-r border-white/10 px-3 py-2">
          <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">Technician</span>
        </div>
        <div className="flex-1 relative h-8">
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute top-0 h-full border-l border-white/10 flex items-center"
              style={{ left: `${hourToPct(hour)}%` }}
            >
              <span className="text-[10px] text-white/70 pl-1 whitespace-nowrap font-medium">
                {hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tech rows */}
      {techRows.map(({ techName, role, timedLayout, untimedItems }) => {
        const isUnassigned = techName === "Unassigned";
        const initials = isUnassigned ? "?" : techName.split(" ").map(n => n[0]).join("").slice(0, 2);
        const roleLabel = role ? role.split(",")[0].replace(/_/g, " ") : null;
        const { laid, totalSubRows } = timedLayout;
        const untimedCount = untimedItems.length;
        const jobCount = laid.length + untimedCount;

        const dc = DENSITY_CONFIG[cardDensity];
        const allItems = [...laid.map(l => l.item), ...untimedItems];
        const hasRichContent = allItems.some(i => i.address || i.customer_phone);
        const cardHeight = hasRichContent ? dc.cardHeightRich : dc.cardHeight;

        // Row height: empty rows are slim, otherwise scale by sub-rows
        const rowHeight = jobCount === 0
          ? EMPTY_ROW_HEIGHT
          : Math.max(1, totalSubRows) * cardHeight + (untimedCount > 0 ? 28 : 0);

        const roleColors = getRoleColor(role);

        return (
          <div
            key={techName}
            className={cn(
              "flex border-b group transition-colors",
              isUnassigned && "bg-destructive/5 border-l-[3px] border-l-destructive",
              !isUnassigned && roleColors.accent,
              !isUnassigned && "even:bg-muted/20 hover:bg-muted/40"
            )}
            style={{ minHeight: `${rowHeight}px`, height: 'auto' }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => handleDrop(e, techName)}
          >
            {/* Tech label */}
            <div className={cn(
              "w-[140px] shrink-0 border-r px-2 py-2 flex items-start gap-2 sticky left-0 z-10",
              isUnassigned ? "bg-destructive/5" : "bg-card"
            )}>
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                <AvatarFallback className={cn(
                  "text-[10px] font-bold",
                  isUnassigned ? "bg-destructive/20 text-destructive ring-2 ring-destructive/30" : roleColors.avatar
                )}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">{techName}</div>
                {roleLabel && (
                  <div className="text-[10px] text-muted-foreground capitalize truncate">{roleLabel}</div>
                )}
                {(laid.length + untimedCount) > 0 && (
                  <div className={cn(
                    "text-[10px] font-medium mt-0.5 px-1.5 py-0.5 rounded-full inline-block",
                    (laid.length + untimedCount) >= 4 ? "bg-destructive/10 text-destructive" :
                    (laid.length + untimedCount) >= 2 ? "bg-[hsl(var(--today))]/10 text-[hsl(var(--today))]" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {laid.length + untimedCount} job{(laid.length + untimedCount) !== 1 ? "s" : ""}
                  </div>
                )}
                {(() => {
                  const emp = (employees || []).find((e: any) => e.name === techName);
                  const ts = emp ? techStatusMap.get(emp.id) : undefined;
                  return ts ? <TechStatusBadge status={ts.status} locationName={ts.locationName} /> : null;
                })()}
              </div>
            </div>

            {/* Time grid with cards */}
            <div className="flex-1 relative" style={{ minHeight: `${rowHeight}px`, height: 'auto' }}>
              {/* Hour grid lines */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute top-0 h-full border-l border-border/20"
                  style={{ left: `${hourToPct(hour)}%` }}
                />
              ))}

              {/* Untimed items as full cards at top */}
              {untimedItems.length > 0 && (
                <div className="relative flex flex-wrap gap-1.5 p-1 z-10">
                  {untimedItems.map(item => {
                    const enrichment = item.customer_id ? enrichmentMap?.get(item.customer_id) : undefined;
                    const nameParts = (item.customer_name || "Unknown").split(/\s+/);
                    const custObj = {
                      first_name: nameParts[0] || null,
                      last_name: nameParts.slice(1).join(" ") || null,
                      phone: item.customer_phone || null,
                      address: item.address || null,
                    };
                    const ro = routeOrders.get(item.id);
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                        onClick={() => onItemClick(item)}
                        className={cn(
                          `rounded-md cursor-pointer shadow-sm hover:shadow-lg transition-shadow overflow-hidden max-w-[340px]`,
                          cardBgColors[item.job_type || "service"] || "bg-card border",
                        )}
                        style={{ minWidth: `${dc.minWidth}px` }}
                      >
                        <div className="px-2.5 py-2 flex flex-col gap-1">
                          {!item.assigned_to && (
                            <div className="bg-destructive text-destructive-foreground text-[9px] font-bold text-center py-0.5 rounded animate-pulse-fast mb-0.5">
                              NO TECH ASSIGNED
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            {ro && (
                              <span className="w-4 h-4 rounded-full bg-foreground/80 text-background text-[9px] font-bold flex items-center justify-center shrink-0">
                                {ro.order}
                              </span>
                            )}
                            <span className={cn(
                              "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                              cardSolidColors[item.job_type || "service"]
                            )}>
                              {item.job_type === "estimate" ? "EST" : item.job_type === "install" ? "INST" : item.job_type === "maintenance" ? "MAINT" : item.job_type === "phone_call" ? "📞 CALL" : "SERV"}
                            </span>
                            <span className="text-[11px] text-foreground/80 font-semibold truncate">
                              {item.item_type === "estimate" && item.estimate_number && `#${item.estimate_number}`}
                              {item.item_type === "job" && (item.job_number || item.hcp_job_number) && `#${item.job_number || item.hcp_job_number}`}
                            </span>
                            <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 border-amber-300 text-amber-600 bg-amber-50">
                              No Time Set
                            </Badge>
                          </div>
                          {cardDensity !== "compact" && (
                            <CustomerCard variant="dispatch" customer={custObj} enrichment={visibleFields?.customerTags !== false ? enrichment : undefined} />
                          )}
                          {cardDensity === "compact" && (
                            <span className="text-[11px] font-medium text-foreground/80 truncate">{item.customer_name || "Unknown"}</span>
                          )}
                          {cardDensity !== "compact" && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                              {(() => {
                                const si = getStageInfo({
                                  ...item,
                                  ...(item.item_type === "estimate" ? { job_type: "estimate", status: item.work_status } : {}),
                                } as any);
                                return si.isComplete ? (
                                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs bg-[hsl(var(--complete)/0.15)] text-[hsl(var(--complete))]">✓ Complete</span>
                                ) : (
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs leading-snug",
                                    "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
                                    "shadow-sm break-words"
                                  )}>
                                    ▸ {si.label}
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                          {cardDensity === "expanded" && item.address && (
                            <div className="text-[10px] text-muted-foreground truncate">📍 {item.address}</div>
                          )}
                          {cardDensity === "expanded" && item.description && (
                            <div className="text-[10px] text-muted-foreground truncate">📝 {item.description}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Timed job cards */}
              {laid.map(({ item, startH, endH, subRow }) => {
                const leftPct = hourToPct(startH);
                const widthPct = ((endH - startH) / TOTAL_HOURS) * 100;
                const timeRange = formatTimeRange(item);
                const topOffset = (untimedItems.length > 0 ? 28 : 0) + subRow * cardHeight;
                const ro = routeOrders.get(item.id);

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "absolute rounded-md cursor-pointer shadow-sm hover:shadow-lg transition-shadow z-10 overflow-hidden",
                      cardBgColors[item.job_type || "service"] || "bg-card border",
                    )}
                    style={{
                      left: `${leftPct}%`,
                      width: `max(${widthPct}%, ${dc.minWidth}px)`,
                      top: `${topOffset + 2}px`,
                      height: `${cardHeight - 8}px`,
                    }}
                  >
                    <div className="px-2.5 py-2 flex flex-col justify-between gap-1">
                      {/* No tech warning */}
                      {!item.assigned_to && (
                        <div className="bg-destructive text-destructive-foreground text-[9px] font-bold text-center py-0.5 rounded animate-pulse-fast mb-0.5">
                          NO TECH ASSIGNED
                        </div>
                      )}
                      {/* Row 1: Route order + Type badge + number + time */}
                      <div className="flex items-center gap-1.5">
                        {ro && (
                          <span className="w-4 h-4 rounded-full bg-foreground/80 text-background text-[9px] font-bold flex items-center justify-center shrink-0">
                            {ro.order}
                          </span>
                        )}
                        <span className={cn(
                          "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                          cardSolidColors[item.job_type || "service"]
                        )}>
                          {item.job_type === "estimate" ? "EST" : item.job_type === "install" ? "INST" : item.job_type === "maintenance" ? "MAINT" : item.job_type === "phone_call" ? "📞 CALL" : "SERV"}
                        </span>
                        <span className="text-[11px] text-foreground/80 font-semibold truncate">
                          {item.item_type === "estimate" && item.estimate_number && `#${item.estimate_number}`}
                          {item.item_type === "job" && (item.job_number || item.hcp_job_number) && `#${item.job_number || item.hcp_job_number}`}
                        </span>
                        {timeRange && (
                          <span className="ml-auto flex items-center gap-0.5 text-[11px] text-foreground/70 font-semibold shrink-0">
                            <Clock className="h-3 w-3" />
                            {timeRange}
                          </span>
                        )}
                      </div>

                      {/* Row 2: Customer */}
                      {cardDensity !== "compact" ? (() => {
                        const enrichment = item.customer_id ? enrichmentMap?.get(item.customer_id) : undefined;
                        const nameParts = (item.customer_name || "Unknown").split(/\s+/);
                        const custObj = {
                          first_name: nameParts[0] || null,
                          last_name: nameParts.slice(1).join(" ") || null,
                          phone: item.customer_phone || null,
                          address: item.address || null,
                        };
                        return (
                          <CustomerCard
                            variant="dispatch"
                            customer={custObj}
                            enrichment={visibleFields?.customerTags !== false ? enrichment : undefined}
                          />
                        );
                      })() : (
                        <span className="text-[11px] font-medium text-foreground/80 truncate">{item.customer_name || "Unknown"}</span>
                      )}

                      {/* Row 3: Address + Description (expanded only) */}
                      {cardDensity === "expanded" && item.address && (
                        <div className="text-[10px] text-muted-foreground truncate">📍 {item.address}</div>
                      )}
                      {cardDensity === "expanded" && item.description && (
                        <div className="text-[10px] text-muted-foreground truncate">📝 {item.description}</div>
                      )}

                      {/* Row 4: What's Next badge + travel */}
                      {cardDensity !== "compact" && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                          {(() => {
                            const si = getStageInfo({
                              ...item,
                              ...(item.item_type === "estimate" ? { job_type: "estimate", status: item.work_status } : {}),
                            } as any);
                            return si.isComplete ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs bg-[hsl(var(--complete)/0.15)] text-[hsl(var(--complete))]">✓ Complete</span>
                            ) : (
                              <span className={cn(
                                "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold text-xs leading-snug",
                                "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
                                "shadow-sm break-words"
                              )}>
                                ▸ {si.label}
                              </span>
                            );
                          })()}
                          {visibleFields?.travelTime !== false && ro?.travelMin != null && (
                            <span className={cn(
                              "shrink-0 ml-auto flex items-center gap-0.5 font-semibold",
                              ro.travelMin <= 10 ? "text-[hsl(var(--complete))]" : ro.travelMin <= 20 ? "text-amber-500" : "text-destructive"
                            )}>
                              <Car className="h-3 w-3" />
                              {ro.travelMin} min
                              {ro.fromLabel && <span className="opacity-70 ml-0.5 truncate max-w-[80px]">from {ro.fromLabel}</span>}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
