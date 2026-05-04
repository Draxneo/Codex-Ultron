/**
 * DispatchStackDrawer.tsx — Left-rail collapsible drawer for unscheduled work
 *
 * SYSTEM: Sits on the left side of Dispatch HQ. Contains work that has no
 * calendar slot yet:
 *   - Past Due (highest priority)
 *   - Ready to Schedule
 *   - Customer Decisions (estimates awaiting customer response)
 *   - New Leads
 *
 * BEHAVIOR: Sheet slides in from left on mobile/desktop (360px on desktop,
 * full width on mobile). Each section is collapsible (details/summary HTML5).
 * Clicking an item navigates to it via router.
 *
 * DATA SOURCE: useDispatchStack() hook — queries unscheduled work from DB.
 *
 * SITS ON: DispatchCalendar.tsx passes open/onOpenChange props.
 *
 * INTEGRATION: Parent manages drawer open state; this component is purely
 * presentational + data binding.
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatchStack, type StackItem } from "@/hooks/useDispatchStack";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertTriangle, ChevronRight, Clock, FileText, Star, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DispatchStackDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * StackItemRow — clickable row representing a single unscheduled item
 */
function StackItemRow({ item }: { item: StackItem }) {
  const navigate = useNavigate();

  const kindIcon =
    item.kind === "past_due"
      ? AlertTriangle
      : item.kind === "estimate_response"
        ? FileText
        : item.kind === "new_lead"
          ? Star
          : Clock;

  const KindIcon = kindIcon;
  const kindColor =
    item.kind === "past_due"
      ? "text-red-500"
      : item.kind === "estimate_response"
        ? "text-amber-500"
        : item.kind === "new_lead"
          ? "text-violet-500"
          : "text-emerald-500";

  const handleClick = () => {
    navigate(item.target);
  };

  return (
    <button
      onClick={handleClick}
      className="flex w-full items-center justify-between rounded-md border border-transparent bg-card/50 px-3 py-2 text-left transition-colors hover:bg-muted/60 active:bg-muted hover:border-border"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <KindIcon className={cn("h-4 w-4 shrink-0", kindColor)} />
          <p className="truncate font-medium text-sm">{item.title}</p>
        </div>
        {item.subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.subtitle}</p>}
      </div>
      <ChevronRight className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * StackSection — collapsible section with optional items
 */
function StackSection({
  label,
  kind,
  items,
  defaultOpen = false,
}: {
  label: string;
  kind: StackItem["kind"];
  items: StackItem[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const count = items.length;
  const isEmpty = count === 0;

  const kindColor =
    kind === "past_due"
      ? "text-red-500"
      : kind === "estimate_response"
        ? "text-amber-500"
        : kind === "new_lead"
          ? "text-violet-500"
          : "text-emerald-500";

  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
      className="group border-t border-border first:border-t-0"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between bg-muted/30 px-3 py-2.5 hover:bg-muted/50 transition-colors">
        <span className="flex items-center gap-2 font-semibold text-sm">
          <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-background", kindColor, "bg-current")}>
            {count}
          </span>
          {label}
        </span>
        <ChevronRight className={cn("h-4 w-4 transition-transform group-open:rotate-90", "text-muted-foreground")} />
      </summary>

      <div className="space-y-1 bg-card/20 px-2 py-2">
        {isEmpty ? (
          <div className="rounded bg-card/40 px-3 py-2 text-center text-xs text-muted-foreground">All clear</div>
        ) : (
          items.slice(0, 25).map((item) => <StackItemRow key={item.id} item={item} />)
        )}
      </div>
    </details>
  );
}

/**
 * DispatchStackDrawer — main component
 */
export function DispatchStackDrawer({ open, onOpenChange }: DispatchStackDrawerProps) {
  const { readyToSchedule, pastDue, newLeads, estimateResponses, isLoading, isError, errors } = useDispatchStack();

  const totalCount = readyToSchedule.length + pastDue.length + newLeads.length + estimateResponses.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:w-[360px] sm:max-w-[360px]">
        <SheetHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Stack</SheetTitle>
            <div className="text-right">
              <div className="text-2xl font-bold text-muted-foreground">{totalCount}</div>
              <div className="text-xs text-muted-foreground">unscheduled</div>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-0">
          {/* Error banner if any queries failed */}
          {errors.length > 0 && (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-semibold">Data load incomplete</p>
                  <p className="mt-1 text-[11px]">{errors.join(", ")} failed to load</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className="space-y-2 px-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Past Due — highest priority, top */}
              <StackSection label="Past Due" kind="past_due" items={pastDue} defaultOpen={pastDue.length > 0} />

              {/* Ready to Schedule */}
              <StackSection label="Ready to Schedule" kind="ready_to_schedule" items={readyToSchedule} defaultOpen={readyToSchedule.length > 0} />

              {/* Customer Decisions */}
              <StackSection label="Customer Decisions" kind="estimate_response" items={estimateResponses} defaultOpen={estimateResponses.length > 0} />

              {/* New Leads */}
              <StackSection label="New Leads" kind="new_lead" items={newLeads} defaultOpen={newLeads.length > 0} />
            </>
          )}
        </div>

        {/* Total count footer */}
        {!isLoading && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground">
            {totalCount === 0 ? "All work scheduled" : `${totalCount} total items`}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
