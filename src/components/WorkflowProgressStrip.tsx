/**
 * WorkflowProgressStrip.tsx — Visual step progress bar
 * 
 * Shows a horizontal row of dots connected by lines, representing each step
 * in the workflow. Completed steps are filled, the current step pulses,
 * and future steps are dimmed.
 * 
 * FEATURES:
 * - Dynamic labels: substitutes real tech/customer names into step labels
 * - Tooltips: hover any dot to see step name, description, and completion timestamp
 * - Responsive: truncates labels to fit narrow containers
 * 
 * USED IN: JobDetail page (below the header), EstimateDetail page
 * 
 * DEPENDS ON: useWorkflowStage.getStageInfo() for completion data
 */

import { Check, Circle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getStageInfo, type StageInfo } from "@/hooks/useWorkflowStage";
import type { WorkflowStep } from "@/hooks/useWorkflowDefinitions";

interface WorkflowProgressStripProps {
  job: any;
  steps?: WorkflowStep[];
}

/**
 * Actions that target a tech vs a customer — used to personalize step labels.
 * E.g., "Text Job Details to Tech" becomes "Text Job Details to Mike"
 */
const TECH_ACTIONS = new Set(["dispatch", "send_form", "send_install_checklist", "assign", "mark_in_progress"]);
const CUSTOMER_ACTIONS = new Set(["send_confirmation", "send_eta", "send_invoice", "request_review", "collect_deposit", "send_brochure", "send_maint_report", "mark_paid"]);

/** Replace generic role names with actual person names in step labels */
function resolveLabel(label: string, action: string, job: any): string {
  const techName = job.assigned_to;
  const customerFirst = job.customer_name?.split(" ")[0];

  if (TECH_ACTIONS.has(action) && techName) {
    return label
      .replace(/\bto Tech\b/i, `to ${techName}`)
      .replace(/\bto Installer\b/i, `to ${techName}`)
      .replace(/\bto Sales Tech\b/i, `to ${techName}`)
      .replace(/\bInstaller Crew\b/i, techName)
      .replace(/\bTech On-Site\b/i, `${techName} On-Site`)
      .replace(/\bCrew On-Site\b/i, `${techName} On-Site`);
  }
  if (CUSTOMER_ACTIONS.has(action) && customerFirst) {
    return label
      .replace(/\bto Customer\b/i, `to ${customerFirst}`)
      .replace(/\bCustomer Appointment Reminder\b/i, `${customerFirst} Appointment Reminder`);
  }
  return label;
}

export function WorkflowProgressStrip({ job, steps }: WorkflowProgressStripProps) {
  const stageInfo = getStageInfo(job, steps);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="px-4 py-3 border-b bg-card/50">
        <div className="flex items-center gap-0">
          {stageInfo.allSteps.map((step, i) => {
            // Read the timestamp value for display in tooltip
            const ts = step.timestamp_field ? job[step.timestamp_field] : null;
            const dynamicLabel = resolveLabel(step.label, step.primary_action, job);
            // Strip common verb prefixes for shorter display labels
            const shortLabel = dynamicLabel.replace(/^(Send |Text |Mark |Submit |Confirm |Register |Schedule |Collect |Create |Email )/i, "");

            return (
              <div key={step.id + i} className="flex items-center flex-1 last:flex-initial">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1 cursor-default">
                      {/* Step dot — filled (complete), pulsing (current), or dimmed (future) */}
                      <div
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center text-xs transition-colors shrink-0",
                          step.completed && "bg-primary text-primary-foreground",
                          step.current && !step.completed && "bg-primary/20 text-primary border-2 border-primary",
                          !step.completed && !step.current && "bg-muted text-muted-foreground"
                        )}
                      >
                        {step.completed ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : step.current ? (
                          <AlertCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                      </div>
                      {/* Truncated label below the dot */}
                      <span
                        className={cn(
                          "text-[10px] font-medium leading-tight text-center whitespace-nowrap max-w-[72px] truncate",
                          step.completed ? "text-foreground" : "text-muted-foreground",
                          step.current && "text-primary font-semibold"
                        )}
                      >
                        {shortLabel}
                      </span>
                    </div>
                  </TooltipTrigger>
                  {/* Tooltip shows full step name, description, and timestamp */}
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-medium">{dynamicLabel}</p>
                    <p className="text-muted-foreground">{step.description}</p>
                    {ts && !isNaN(new Date(ts.includes?.("T") ? ts : ts + "T00:00:00").getTime()) && (
                      <p className="text-muted-foreground mt-0.5">
                        {format(new Date(ts.includes("T") ? ts : ts + "T00:00:00"), "MMM d, yyyy h:mm a")}
                      </p>
                    )}
                    {step.current && !step.completed && (
                      <p className="text-primary font-medium mt-0.5">⬤ Current Step</p>
                    )}
                  </TooltipContent>
                </Tooltip>
                {/* Connecting line between dots */}
                {i < stageInfo.allSteps.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1 rounded-full",
                      step.completed ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
