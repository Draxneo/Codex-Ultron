/**
 * ContextualActions — Route-aware action buttons for Copilot side panel.
 * Renders relevant action buttons based on the current page.
 * Includes dialog triggers for New Customer and New Job.
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import {
  ArrowRight, MessageSquare, Eye, FileText, BarChart3,
  Send, Users, Zap, ClipboardList, Phone, UserPlus, Briefcase, ClipboardPaste,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { NewJobDialog } from "@/components/NewJobDialog";

interface ActionDef {
  label: string;
  icon: React.ElementType;
  action: () => void;
  variant?: "default" | "outline";
}

export function ContextualActions() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sendQuery } = useCopilotPanel();
  const path = location.pathname;
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);

  const actions: ActionDef[] = [];

  // Always show creation actions at top
  const createActions: ActionDef[] = [
    { label: "New Customer", icon: UserPlus, action: () => setShowNewCustomer(true), variant: "default" },
    { label: "New Job", icon: Briefcase, action: () => setShowNewJob(true), variant: "default" },
    { label: "Paste Lead", icon: ClipboardPaste, action: () => sendQuery("[INTAKE_PASTE] I'm about to paste lead info. Stand by to extract and process it."), variant: "default" },
  ];

  if (path === "/") {
    actions.push(
      { label: "Morning Briefing", icon: Zap, action: () => sendQuery("Give me this morning's briefing — what's stuck, what's next, and what did AI handle today.") },
      { label: "Stuck Jobs Summary", icon: ClipboardList, action: () => sendQuery("Show me all stuck jobs — any that have been in the same status for 3+ days.") },
      { label: "Unread Summary", icon: MessageSquare, action: () => sendQuery("Summarize all unread SMS and voicemails. Show who's waiting for a response.") },
    );
  } else if (path.startsWith("/jobs/") && path.split("/").length === 3) {
    actions.push(
      { label: "What's Next", icon: ArrowRight, action: () => sendQuery(`Review this job and tell me what is still outstanding, who owns it, and the next best action.`) },
      { label: "Text Tech", icon: MessageSquare, action: () => sendQuery(`Draft a text to the tech assigned to this job with the job details and schedule.`) },
      { label: "View Form Status", icon: FileText, action: () => sendQuery(`What's the status of the tech form and completion form for this job?`) },
    );
  } else if (path.startsWith("/customers/") && path.split("/").length === 3) {
    actions.push(
      { label: "Send Portal Invite", icon: Send, action: () => sendQuery("Draft a portal invite SMS for this customer.") },
      { label: "View History", icon: ClipboardList, action: () => sendQuery("Show me all jobs, estimates, and communication history for this customer.") },
      { label: "Draft Text", icon: MessageSquare, action: () => sendQuery("Draft a professional follow-up text to this customer.") },
    );
  } else if (path.startsWith("/estimates/") && path.split("/").length === 3) {
    actions.push(
      { label: "Send Presentation", icon: Eye, action: () => sendQuery("Help me send the sales presentation for this estimate.") },
      { label: "Compare Tiers", icon: BarChart3, action: () => sendQuery("Show me a comparison of the equipment tiers available for this estimate.") },
    );
  } else if (path === "/sms") {
    actions.push(
      { label: "Unread Summary", icon: MessageSquare, action: () => sendQuery("Summarize all unread SMS conversations — who needs a response?") },
      { label: "Draft Text", icon: Send, action: () => sendQuery("Help me draft a text response to this conversation.") },
    );
  } else if (path === "/phone" || path === "/calls") {
    actions.push(
      { label: "Missed Calls", icon: Phone, action: () => sendQuery("Show me all missed calls from today and suggest which ones need a callback.") },
    );
  } else if (path === "/agreements") {
    actions.push(
      { label: "Visits Due", icon: ClipboardList, action: () => sendQuery("Which service agreement visits are coming due in the next 30 days?") },
      { label: "Renewals Due", icon: FileText, action: () => sendQuery("Which agreements are expiring soon and need renewal outreach?") },
    );
  }

  // Fallback
  if (actions.length === 0) {
    actions.push(
      { label: "Morning Briefing", icon: Zap, action: () => sendQuery("Give me this morning's briefing — what's stuck, what's next, and what did AI handle today.") },
      { label: "Ask Anything", icon: MessageSquare, action: () => sendQuery("") },
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 overflow-y-auto">
      {/* Create actions */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        Create
      </p>
      {createActions.map((a) => {
        const Icon = a.icon;
        return (
          <Button
            key={a.label}
            variant={a.variant || "outline"}
            size="sm"
            className="justify-start gap-2 h-auto py-2.5 text-left"
            onClick={a.action}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm">{a.label}</span>
          </Button>
        );
      })}

      {/* Context actions */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mt-2">
        Quick Actions
      </p>
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Button
            key={a.label}
            variant="outline"
            size="sm"
            className="justify-start gap-2 h-auto py-2.5 text-left"
            onClick={a.action}
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm">{a.label}</span>
          </Button>
        );
      })}

      {/* Dialogs */}
      <NewCustomerDialog
        open={showNewCustomer}
        onOpenChange={setShowNewCustomer}
        onCustomerCreated={(c) => {
          setShowNewCustomer(false);
          // After creating customer, offer to create a job
          setShowNewJob(true);
        }}
      />
      <NewJobDialog
        open={showNewJob}
        onOpenChange={setShowNewJob}
      />
    </div>
  );
}
