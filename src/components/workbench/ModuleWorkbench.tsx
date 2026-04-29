import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModuleWorkbenchProps {
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  search?: ReactNode;
  filters?: ReactNode;
  viewControls?: ReactNode;
  meta?: ReactNode;
  sideRail?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function ModuleWorkbench({
  title,
  eyebrow,
  description,
  icon,
  primaryAction,
  search,
  filters,
  viewControls,
  meta,
  sideRail,
  children,
  className,
  contentClassName,
}: ModuleWorkbenchProps) {
  return (
    <section className={cn("flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background", className)}>
      <div className="border-b bg-card">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>}
              <h1 className="truncate text-lg font-semibold leading-tight text-foreground">{title}</h1>
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction}
            {search}
            {filters}
            {viewControls}
            {meta}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sideRail && <aside className="hidden w-56 shrink-0 overflow-auto border-r bg-card/50 lg:block">{sideRail}</aside>}
        <div className={cn("min-w-0 flex-1 overflow-auto", contentClassName)}>{children}</div>
      </div>
    </section>
  );
}
