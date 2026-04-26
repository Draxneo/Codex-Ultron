/**
 * useWorkflowStage.ts — Data-driven workflow stage detection
 * 
 * This is the BRAIN of the "What's Next" system. It walks the workflow steps
 * in order and finds the first incomplete one — that's the current step.
 * 
 * USED BY:
 * - DispatchBoard (shows where each job is in its lifecycle)
 * - AttentionStrip (detects stuck jobs)
 * 
 * HOW IT WORKS:
 * 1. Get the step list for the job's type (install/service/maintenance/estimate)
 * 2. For each step, check if its completion condition is met (timestamp exists, status matches, etc.)
 * 3. The first step that ISN'T complete = current "What's Next" step
 * 4. If ALL steps are complete, the workflow is done
 * 
 * COMPLETION CHECKS (3 types):
 * - "timestamp": Check if a timestamp column has a value (e.g., dispatch_sent_at)
 * - "status": Check if the job status matches a target (e.g., "in_progress")
 * - "field_set": Check if any field has a value or matches a specific value
 * 
 * CONDITIONAL SKIPS:
 * Steps can define skip_when conditions. For example, the deposit step skips
 * when payment_method = "financed" because financed jobs don't need a deposit.
 */

import { getDefaultSteps, type WorkflowStep } from "@/hooks/useWorkflowDefinitions";

/** Shape returned by getStageInfo() — everything the UI needs to render workflow state */
export interface StageInfo {
  /** The step definition from the workflow */
  step: WorkflowStep;
  /** Index in the steps array (0-based) */
  stepIndex: number;
  /** Total number of steps in this workflow */
  totalSteps: number;
  /** All legacy lifecycle steps with their completion status. */
  allSteps: Array<WorkflowStep & { completed: boolean; current: boolean }>;
  /** Is the entire workflow complete? (all steps done) */
  isComplete: boolean;
  /** Step id string for backward compat (e.g., "schedule", "dispatch") */
  stage: string;
  /** Human-readable label (e.g., "Send Invoice to Customer") */
  label: string;
  /** Lucide icon name (e.g., "calendar", "truck") */
  icon: string;
  /** Tailwind color class for the current stage */
  color: string;
}

/**
 * Check whether a step should be auto-skipped based on its skip_when condition.
 * 
 * Examples:
 * - Deposit step: skip_when: { field: "payment_method", value: "financed" }
 *   → Skip if the job is financed (no deposit needed)
 * - Finance paperwork: skip_when: { field: "payment_method", not_value: "financed" }
 *   → Skip if the job is NOT financed (no finance docs needed)
 * - Rebate: skip_when: { field: "rebate_eligible", value: false }
 *   → Skip if the job isn't eligible for a rebate
 */
function isStepSkipped(step: WorkflowStep, job: Record<string, any>): boolean {
  if (!step.skip_when) return false;
  const fieldVal = job[step.skip_when.field];
  if (step.skip_when.value !== undefined) {
    return fieldVal === step.skip_when.value;
  }
  if (step.skip_when.not_value !== undefined) {
    return !fieldVal || fieldVal !== step.skip_when.not_value;
  }
  return false;
}

/**
 * Check whether a single step is complete given a job record.
 * 
 * Three completion strategies:
 * 1. "timestamp" — Is the timestamp column non-null? (most common)
 * 2. "status" — Does the job status match? (used for "mark in progress")
 * 3. "field_set" — Is a specific field set or matching a value?
 * 
 * Auto-skipped steps always return true (they count as complete).
 */
export function isStepComplete(step: WorkflowStep, job: Record<string, any>): boolean {
  // Conditional skip — step auto-completes when skip condition is met
  if (isStepSkipped(step, job)) return true;

  switch (step.completion_check) {
    case "timestamp":
      // Most steps: just check if the timestamp column has a value
      return !!job[step.timestamp_field!];

    case "status": {
      // For "mark in progress" — status must be in_progress (or beyond)
      const target = step.field_check?.value;
      const status = job.status || "new";
      if (target === "in_progress") {
        // Once you're in_progress, done, or invoiced, this step is complete
        return status === "in_progress" || status === "done" || status === "invoiced";
      }
      return status === target;
    }

    case "field_set": {
      // Generic field check — is the field truthy or matching a specific value?
      const field = step.field_check?.field || step.timestamp_field;
      if (!field) return false;
      const val = job[field];
      if (step.field_check?.value) {
        return val === step.field_check.value;
      }
      return !!val;
    }

    default:
      return false;
  }
}

/**
 * Color map for each stage id.
 * Most steps use text-primary. Special stages get unique colors:
 * - schedule: destructive (red) — most urgent, needs a date
 * - review/follow_up/won_lost: complete (green) — final stages
 */
const STAGE_COLORS: Record<string, string> = {
  schedule: "text-destructive",
  assign: "text-primary",
  deposit: "text-amber-600",
  confirmation: "text-primary",
  install_checklist: "text-purple-600",
  dispatch: "text-primary",
  eta: "text-primary",
  in_progress: "text-primary",
  completion_form: "text-primary",
  photos: "text-primary",
  warranty: "text-primary",
  rebate: "text-primary",
  inspection_schedule: "text-primary",
  inspection_pass: "text-primary",
  invoice: "text-primary",
  payment: "text-primary",
  review: "text-[hsl(var(--complete))]",
  follow_up: "text-[hsl(var(--complete))]",
  maint_report: "text-primary",
  next_visit: "text-[hsl(var(--complete))]",
  tech_form: "text-primary",
  review_approve: "text-primary",
  send_presentation: "text-primary",
  won_lost: "text-[hsl(var(--complete))]",
  schedule_call: "text-destructive",
  assign_caller: "text-primary",
  text_reminder: "text-primary",
  make_call: "text-primary",
  log_outcome: "text-primary",
  create_followup: "text-[hsl(var(--complete))]",
};

/**
 * Get current workflow stage info for a job.
 * 
 * This is the main function used everywhere. It:
 * 1. Resolves the correct step list for the job type
 * 2. Marks each step as completed or not
 * 3. Finds the first incomplete step (= current)
 * 4. Returns everything the UI needs to render
 * 
 * @param job - The job/estimate record (any shape — reads fields dynamically)
 * @param steps - Optional legacy steps. Falls back to defaults for the job_type.
 */
export function getStageInfo(
  job: Record<string, any>,
  steps?: WorkflowStep[],
): StageInfo {
  const jobType = job.job_type || "service";
  const resolvedSteps = steps || getDefaultSteps(jobType);

  // Mark each step as completed or not
  const allSteps = resolvedSteps.map((s, i) => ({
    ...s,
    completed: isStepComplete(s, job),
    current: false,
  }));

  // Find the first incomplete step — that's where we are
  let currentIdx = allSteps.findIndex(s => !s.completed);
  const isComplete = currentIdx === -1;
  if (isComplete) currentIdx = allSteps.length - 1;
  allSteps[currentIdx].current = true;

  const currentStep = resolvedSteps[currentIdx];

  return {
    step: currentStep,
    stepIndex: currentIdx,
    totalSteps: resolvedSteps.length,
    allSteps,
    isComplete,
    stage: currentStep.id,
    label: isComplete ? "All Steps Complete" : currentStep.label,
    icon: isComplete ? "check-circle-2" : currentStep.icon,
    color: isComplete ? "text-[hsl(var(--complete))]" : (STAGE_COLORS[currentStep.id] || "text-primary"),
  };
}

/* ─── Legacy compat: old getStage function ─── */
export type Stage = string;

/** Simple wrapper that returns just the stage id string */
export function getStage(job: Record<string, any>, steps?: WorkflowStep[]): string {
  return getStageInfo(job, steps).stage;
}
