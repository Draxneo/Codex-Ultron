import { MessageSquare, Phone, Voicemail, Mail, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export type InboxSection = "sms" | "calls" | "voicemail" | "email";

interface InboxRailProps {
  active: InboxSection;
  onChange: (s: InboxSection) => void;
  unread: Record<string, number>;
  onCompose?: () => void;
}

const ITEMS: { key: InboxSection; label: string; icon: any }[] = [
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "voicemail", label: "Voicemail", icon: Voicemail },
  { key: "email", label: "Email", icon: Mail },
];

export function InboxRail({ active, onChange, unread, onCompose }: InboxRailProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <aside className="w-14 shrink-0 border-r border-border/50 bg-muted/20 py-3 flex flex-col items-center gap-1.5">
        {onCompose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={onCompose}
                className="h-9 w-9 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground shadow-md mb-2"
              >
                <FileEdit className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Compose email</TooltipContent>
          </Tooltip>
        )}

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
