type LifecycleRecord = Record<string, any>;

export type LifecycleInfo = {
  isComplete: boolean;
  label: string;
};

function isDoneStatus(status: string): boolean {
  return ["done", "invoiced", "completed", "complete", "paid", "won", "lost", "canceled", "cancelled"].includes(status);
}

export function getLifecycleInfo(item: LifecycleRecord): LifecycleInfo {
  const status = String(item.status || item.work_status || "").toLowerCase();
  const isEstimate = item.item_type === "estimate" || item.job_type === "estimate" || !!item.estimate_number;

  if (isEstimate) {
    if (["won", "lost", "canceled", "cancelled"].includes(status)) {
      return { isComplete: true, label: status === "won" ? "Won" : status === "lost" ? "Lost" : "Closed" };
    }
    if (status === "sent") return { isComplete: false, label: "Waiting on customer" };
    if (item.scheduled_date) return { isComplete: false, label: "Estimate scheduled" };
    return { isComplete: false, label: "Needs follow-up" };
  }

  if (item.completed_at || isDoneStatus(status)) {
    return { isComplete: true, label: "Complete" };
  }
  if (status === "on_hold") return { isComplete: false, label: "Waiting on parts" };
  if (!item.scheduled_date) return { isComplete: false, label: "Ready to schedule" };
  if (!item.assigned_to) return { isComplete: false, label: "Needs technician" };
  if (!item.dispatch_sent_at) return { isComplete: false, label: "Ready to dispatch" };
  if (status === "in_progress") return { isComplete: false, label: "In progress" };
  if (item.needs_follow_up) return { isComplete: false, label: "Follow up" };

  return { isComplete: false, label: "Next action" };
}
