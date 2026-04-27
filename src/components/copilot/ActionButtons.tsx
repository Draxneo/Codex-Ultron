import { Phone, ClipboardList, Wrench, UserPlus, PhoneCall, MessageSquare, Bell, Check, X, Building2, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PropertyOption = {
  id?: string | null;
  label: string;
  formatted: string;
};

export type SuggestedAction = {
  type: "book_job" | "book_estimate" | "book_maintenance" | "create_customer" | "linked_property_proposal" | "select_property" | "call_back" | "send_text" | "reply_sms" | "send_invoice_reminder" | "view_job" | "view_voicemail" | "confirm" | "confirm_no";
  job_type?: string;
  customer_name?: string;
  customer_id?: string;
  phone?: string;
  address?: string;
  description?: string;
  email?: string;
  job_id?: string;
  payload?: string;
  label?: string;
  // Linked-property: caller (existing customer) is calling about a NEW property
  // not yet on file (church, rental, parent's house, business).
  parent_customer_id?: string;
  proposed_label?: string;
  relationship?: "church" | "rental" | "parents" | "business" | "other";
  // Multi-address: caller has 2+ known properties — dispatcher picks one.
  property_options?: PropertyOption[];
};

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; emoji: string; color: string }> = {
  book_job: { icon: Phone, label: "Book Service Call", emoji: "📞", color: "border-primary/30 text-primary hover:bg-primary/10" },
  book_estimate: { icon: ClipboardList, label: "Book Estimate", emoji: "📋", color: "border-amber-500/30 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400" },
  book_maintenance: { icon: Wrench, label: "Book Maintenance", emoji: "🔧", color: "border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400" },
  create_customer: { icon: UserPlus, label: "Create Customer", emoji: "👤", color: "border-violet-500/30 text-violet-700 hover:bg-violet-500/10 dark:text-violet-400" },
  linked_property_proposal: { icon: Building2, label: "Create Linked Property", emoji: "🏛️", color: "border-fuchsia-500/40 text-fuchsia-700 hover:bg-fuchsia-500/15 dark:text-fuchsia-400 font-semibold" },
  select_property: { icon: Home, label: "Which Property?", emoji: "🏠", color: "border-cyan-500/40 text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-400 font-semibold" },
  call_back: { icon: PhoneCall, label: "Call Back", emoji: "📲", color: "border-blue-500/30 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400" },
  send_text: { icon: MessageSquare, label: "Send Text", emoji: "💬", color: "border-teal-500/30 text-teal-700 hover:bg-teal-500/10 dark:text-teal-400" },
  reply_sms: { icon: MessageSquare, label: "Reply via SMS", emoji: "💬", color: "border-teal-500/30 text-teal-700 hover:bg-teal-500/10 dark:text-teal-400" },
  send_invoice_reminder: { icon: Bell, label: "Send Reminder", emoji: "🔔", color: "border-orange-500/30 text-orange-700 hover:bg-orange-500/10 dark:text-orange-400" },
  view_job: { icon: ClipboardList, label: "View Job", emoji: "📂", color: "border-sky-500/30 text-sky-700 hover:bg-sky-500/10 dark:text-sky-400" },
  view_voicemail: { icon: Phone, label: "View Voicemail", emoji: "📩", color: "border-rose-500/30 text-rose-700 hover:bg-rose-500/10 dark:text-rose-400" },
  confirm: { icon: Check, label: "Yes", emoji: "✅", color: "border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400 font-semibold" },
  confirm_no: { icon: X, label: "No", emoji: "❌", color: "border-red-500/40 text-red-700 hover:bg-red-500/15 dark:text-red-400 font-semibold" },
};

interface ActionButtonsProps {
  actions: SuggestedAction[];
  onAction: (action: SuggestedAction, propertyChoice?: PropertyOption) => void;
  disabled?: boolean;
}

export function ActionButtons({ actions, onAction, disabled }: ActionButtonsProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mr-8 mt-2 ml-1">
      {actions.map((action, i) => {
        const config = ACTION_CONFIG[action.type] || ACTION_CONFIG.book_job;

        // Multi-address chooser — render header + one chip per known property + optional "+ New".
        if (action.type === "select_property" && action.property_options && action.property_options.length > 0) {
          return (
            <div
              key={i}
              className="flex flex-col gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/5 p-2"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                <span className="text-base leading-none">🏠</span>
                <span>{action.label || "Which property is this for?"}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {action.property_options.map((opt, j) => (
                  <Button
                    key={opt.id || j}
                    size="sm"
                    variant="outline"
                    className={cn("h-auto py-1.5 px-2.5 text-xs gap-1.5 border", config.color)}
                    onClick={() => onAction(action, opt)}
                    disabled={disabled}
                  >
                    <Home className="h-3 w-3" />
                    <div className="text-left">
                      <div className="font-semibold capitalize">{opt.label}</div>
                      <div className="text-[10px] opacity-80 font-normal">{opt.formatted}</div>
                    </div>
                  </Button>
                ))}
                {action.parent_customer_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-auto py-1.5 px-2.5 text-xs gap-1.5 border border-fuchsia-500/40 text-fuchsia-700 hover:bg-fuchsia-500/15 dark:text-fuchsia-400"
                    onClick={() => onAction({ ...action, type: "linked_property_proposal" })}
                    disabled={disabled}
                  >
                    <Building2 className="h-3 w-3" />
                    <span className="font-semibold">+ New Property</span>
                  </Button>
                )}
              </div>
            </div>
          );
        }

        return (
          <Button
            key={i}
            size="sm"
            variant="outline"
            className={cn("h-auto py-2 px-3 text-xs gap-2 border self-start", config.color)}
            onClick={() => onAction(action)}
            disabled={disabled}
          >
            <span className="text-base leading-none">{config.emoji}</span>
            <div className="text-left">
              <div className="font-semibold">{action.label || config.label}</div>
              {action.type === "linked_property_proposal" && action.address && (
                <div className="text-[10px] opacity-80 font-normal">
                  {action.proposed_label ? `${action.proposed_label} · ` : ""}{action.address}
                </div>
              )}
              {action.type !== "linked_property_proposal" && action.customer_name && (
                <div className="text-[10px] opacity-70 font-normal">{action.customer_name}</div>
              )}
            </div>
          </Button>
        );
      })}
    </div>
  );
}
