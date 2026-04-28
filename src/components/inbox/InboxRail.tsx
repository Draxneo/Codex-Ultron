import { MessageSquare, Phone, Voicemail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type InboxSection = "sms" | "calls" | "voicemail";

interface InboxRailProps {
  active: InboxSection;
  onChange: (s: InboxSection) => void;
  unread: Record<string, number>;
}

const ITEMS: { key: InboxSection; label: string; icon: any }[] = [
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "voicemail", label: "Voicemail", icon: Voicemail },
];

export function InboxRail({ active, onChange, unread }: InboxRailProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <aside className="w-14 shrink-0 border-r border-border/50 bg-muted/20 py-3 flex flex-col items-center gap-1.5">
        {ITEMS.map((item) => {
          const isActive = active === item.key;
          const count = unread[item.key] || 0;
          return (
            <Tooltip key={item.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onChange(item.key)}
                  className={cn(
                    "relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </aside>
    </TooltipProvider>
  );
}
