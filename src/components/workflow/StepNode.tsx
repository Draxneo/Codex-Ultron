/**
 * StepNode — Custom React Flow node for a single workflow step.
 * Renders as a styled card showing icon, label, "Waiting for" trigger,
 * automation chips, skip conditions, owner badge, and embedded form section pills.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Zap, SkipForward, CheckCircle, BotMessageSquare, Wrench, Wind, HardHat, ClipboardCheck } from "lucide-react";
import { WORKFLOW_ICON_MAP, OWNER_COLORS } from "@/lib/workflowIcons";
import type { WorkflowStep, StepOwner } from "@/hooks/useWorkflowDefinitions";

/* ── Waiting-for descriptions ── */
const WAITING_FOR: Record<string, string> = {
  schedule: "Office picks a date",
  assign: "Office assigns a tech",
  collect_deposit: "Customer pays deposit",
  send_confirmation: "System texts reminder",
  send_install_checklist: "Installer submits checklist",
  dispatch: "Office dispatches tech",
  send_eta: "System texts ETA",
  mark_in_progress: "Tech taps 'On-Site'",
  send_form: "Tech submits checklist",
  send_completion_form: "Tech submits form",
  register_warranty: "Warranty # entered",
  send_invoice: "System sends invoice",
  mark_paid: "Payment confirmed",
  request_review: "System texts review link",
  close: "Office closes job",
  send_brochure: "System emails brochure",
  review_estimate: "Office reviews estimate",
  mark_won_lost: "Mark won or lost",
  complete_follow_up: "Follow-up call done",
  confirm_photos: "Photos verified",
  submit_rebate: "Rebate submitted",
  schedule_inspection: "Inspection scheduled",
  mark_inspection_passed: "Inspection passed",
  send_maint_report: "Report emailed",
  schedule_next_visit: "Next visit booked",
  complete_finance_paperwork: "Paperwork signed",
  none: "Manual action",
};

/* ── Form section label map ── */
const SECTION_LABELS: Record<string, string> = {
  pickup: "Pick Up",
  arrival: "Arrival",
  photos: "Photos",
  specs: "Specs",
  diagnosis: "Diagnosis",
  checklist: "Checklist",
  conditions: "Conditions",
  notes: "Notes",
  completion: "Completion",
};

/* ── Job type options for the schedule/create step ── */
const JOB_TYPE_OPTIONS = [
  { key: "service", label: "Service", icon: Wrench },
  { key: "maintenance", label: "Maintenance", icon: Wind },
  { key: "install", label: "Install", icon: HardHat },
  { key: "estimate", label: "Estimate", icon: ClipboardCheck },
];

export interface StepNodeData extends Record<string, unknown> {
  stepIndex: number;
  totalSteps: number;
  onSelect: (id: string) => void;
  onSectionClick?: (stepId: string, section: string) => void;
  id: string;
  label: string;
  description: string;
  icon: string;
  automations: string[];
  primary_action: string;
  sort_order: number;
  notes: string[];
  integrations: string[];
  timestamp_field: string | null;
  completion_check: string;
  skip_when?: { field: string; value?: string | boolean; not_value?: string | boolean };
  form_sections?: string[];
  owner?: StepOwner;
  auto_completable?: boolean;
  auto_complete_condition?: string;
}

/** Custom node card for the workflow canvas */
function StepNodeComponent({ data, selected }: NodeProps & { data: StepNodeData }) {
  const step = data as StepNodeData;
  const hasSkip = !!step.skip_when;
  const hasAutomations = step.automations.length > 0;
  const hasSections = step.form_sections && step.form_sections.length > 0;
  const isAutopilot = !!step.auto_completable;
  const ownerStyle = step.owner ? OWNER_COLORS[step.owner] : null;
  const isScheduleCreate = step.primary_action === "schedule_or_create";

  return (
    <>
      {/* Input handle — left side */}
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />

      {/* Card body */}
      <div
        onClick={() => step.onSelect(step.id)}
        className={`
          min-w-[220px] max-w-[260px] rounded-lg border bg-card text-card-foreground shadow-md
          cursor-pointer transition-all hover:shadow-lg
          ${selected ? "ring-2 ring-primary border-primary" : "border-border"}
        `}
      >
        {/* Header */}
        <div className="px-3 py-2.5 flex items-start gap-2">
          <div className="mt-0.5 text-primary shrink-0">
            {WORKFLOW_ICON_MAP[step.icon] || <CheckCircle className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight">{step.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
              {WAITING_FOR[step.primary_action] || step.description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
              {step.stepIndex + 1}
            </Badge>
            {ownerStyle && (
              <Badge className={`text-[8px] h-3.5 px-1 ${ownerStyle.bg} ${ownerStyle.text} ${ownerStyle.border}`}>
                {ownerStyle.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Chips row — automations + skip */}
        {(hasAutomations || hasSkip || isAutopilot) && (
          <div className="px-3 pb-1.5 flex flex-wrap gap-1">
            {isAutopilot && (
              <Badge className="text-[9px] h-4 px-1.5 bg-violet-500/15 text-violet-700 border-violet-300 hover:bg-violet-500/25">
                <BotMessageSquare className="h-2.5 w-2.5 mr-0.5" />
                Autopilot
              </Badge>
            )}
            {hasAutomations && (
              <Badge className="text-[9px] h-4 px-1.5 bg-amber-500/15 text-amber-700 border-amber-300 hover:bg-amber-500/25">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                Auto
              </Badge>
            )}
            {hasSkip && (
              <Badge className="text-[9px] h-4 px-1.5 bg-blue-500/15 text-blue-700 border-blue-300 hover:bg-blue-500/25">
                <SkipForward className="h-2.5 w-2.5 mr-0.5" />
                Skippable
              </Badge>
            )}
          </div>
        )}

        {/* Job type pills for schedule/create step */}
        {isScheduleCreate && (
          <div className="px-3 pb-2 border-t border-dashed border-border/60 pt-1.5 mt-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider mb-1 font-medium">Job Types</p>
            <div className="flex flex-wrap gap-1">
              {JOB_TYPE_OPTIONS.map(jt => {
                const Icon = jt.icon;
                return (
                  <Badge
                    key={jt.key}
                    variant="secondary"
                    className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"
                  >
                    <Icon className="h-2.5 w-2.5 mr-0.5" />
                    {jt.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Form section pills */}
        {hasSections && (
          <div className="px-3 pb-2 border-t border-dashed border-border/60 pt-1.5 mt-0.5">
            <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider mb-1 font-medium">Form Sections</p>
            <div className="flex flex-wrap gap-1">
              {step.form_sections!.map(s => (
                <Badge
                  key={s}
                  variant="secondary"
                  className="text-[9px] h-4 px-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-200 cursor-pointer hover:bg-emerald-500/25 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    step.onSectionClick?.(step.id, s);
                  }}
                >
                  {SECTION_LABELS[s] || s}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Output handle — right side */}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-primary !border-2 !border-background" />
    </>
  );
}

export default memo(StepNodeComponent);
