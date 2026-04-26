import { useState } from "react";
import { Forward, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface Props {
  messageBody: string;
  senderName: string;
  mediaUrls?: { url: string; content_type: string }[];
}

export function SmsForwardButton({ messageBody, senderName, mediaUrls }: Props) {
  const [open, setOpen] = useState(false);
  const [forwarding, setForwarding] = useState(false);

  const { data: employees } = useQuery({
    queryKey: ["employees-for-forward"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, name, phone")
        .eq("is_active", true)
        .not("phone", "is", null)
        .order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const handleForward = async (emp: { name: string; phone: string }) => {
    setForwarding(true);
    try {
      const fwdBody = `FWD from ${senderName}: ${messageBody}`;
      const media = mediaUrls?.map((m) => m.url) ?? [];

      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const result = await sendSmsImpl({
        to: emp.phone,
        body: fwdBody,
        mediaUrls: media.length > 0 ? media : undefined,
        contactName: emp.name,
        contactType: "employee",
        source: "sms_forward",
        hitlApproved: true,
        silent: true,
      });

      if (!result.success) throw new Error(result.error || "Forward failed");
      toast.success(`Forwarded to ${emp.name}`);
      setOpen(false);
    } catch (err: any) {
      toast.error("Forward failed", { description: err?.message });
    } finally {
      setForwarding(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
          title="Forward to team member"
        >
          <Forward className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <p className="text-xs font-medium mb-2 px-1">Forward to:</p>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {!employees?.length && (
            <p className="text-xs text-muted-foreground px-1 py-2">No team members found</p>
          )}
          {employees?.map((emp) => (
            <Button
              key={emp.id}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs h-8"
              disabled={forwarding}
              onClick={() => handleForward({ name: emp.name, phone: emp.phone! })}
            >
              {forwarding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {emp.name}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
