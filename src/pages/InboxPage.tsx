import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCheck, MoreVertical } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnreadSmsCount } from "@/hooks/useUnreadSmsCount";
import { useVoicemails } from "@/hooks/useVoicemails";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { InboxRail, type InboxSection } from "@/components/inbox/InboxRail";
import { MessageSquare, Phone, Voicemail } from "lucide-react";
import { cn } from "@/lib/utils";

import SmsPage from "./SmsPage";
import CallsPage from "./CallsPage";

const MOBILE_TABS: { key: InboxSection; label: string; icon: any }[] = [
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "voicemail", label: "Voicemail", icon: Voicemail },
];

export default function InboxPage() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const sectionParam = (searchParams.get("section") as InboxSection) || "sms";
  const [activeSection, setActiveSection] = useState<InboxSection>(sectionParam);

  useEffect(() => { setActiveSection(sectionParam); }, [sectionParam]);

  const queryClient = useQueryClient();

  const unreadSms = useUnreadSmsCount();
  const { unreadCount: unreadVoicemails } = useVoicemails();

  const unreadMap: Record<string, number> = {
    sms: unreadSms,
    voicemail: unreadVoicemails,
    calls: 0,
  };

  const markAllAsRead = useCallback(async () => {
    try {
      if (activeSection === "sms") {
        await supabase.from("sms_log").update({ is_read: true } as any).eq("direction", "inbound").eq("is_read", false);
        queryClient.invalidateQueries({ queryKey: ["sms-messages"] });
        queryClient.invalidateQueries({ queryKey: ["unread_sms_count"] });
      } else if (activeSection === "voicemail") {
        await supabase.from("voicemails").update({ is_read: true } as any).eq("is_read", false);
        queryClient.invalidateQueries({ queryKey: ["voicemails"] });
      } else if (activeSection === "calls") {
        await supabase.from("call_log").update({ is_read: true } as any).eq("is_read", false);
        queryClient.invalidateQueries({ queryKey: ["call_log"] });
      }
      toast.success("All marked as read");
    } catch {
      toast.error("Failed to mark as read");
    }
  }, [activeSection, queryClient]);

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {!isMobile && <AppHeader />}
      <div className="flex flex-1 min-h-0">
        {/* Slim icon rail (desktop only) */}
        {!isMobile && (
          <div className="flex flex-col">
            <InboxRail
              active={activeSection}
              onChange={setActiveSection}
              unread={unreadMap}
            />
            <div className="px-1 pb-2 flex justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right">
                  <DropdownMenuItem onClick={markAllAsRead}>
                    <CheckCheck className="h-4 w-4 mr-2" />
                    Mark all as read
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          {/* Mobile tab bar */}
          <div className="md:hidden flex border-b bg-card px-2 py-1 gap-1 shrink-0 overflow-x-auto">
            {MOBILE_TABS.map((s) => {
              const unread = unreadMap[s.key] || 0;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors",
                    activeSection === s.key
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                  {unread > 0 && (
                    <span className="h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Render active section */}
          <div className="flex-1 min-h-0">
            {activeSection === "sms" && <SmsPage embedded />}
            {activeSection === "calls" && <CallsPage embedded />}
            {activeSection === "voicemail" && <CallsPage embedded defaultTab="voicemail" />}
          </div>
        </div>
      </div>
    </div>
  );
}
