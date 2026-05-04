import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCustomerPortalInvites, useSendPortalInvite } from "@/hooks/useCustomerOverview";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Props {
  customerId: string;
  email?: string | null;
}

export function CustomerPortalCard({ customerId, email }: Props) {
  const { data: invites = [] } = useCustomerPortalInvites(customerId);
  const send = useSendPortalInvite();
  const { toast } = useToast();
  const latest = invites[0];

  const handleSend = () => {
    if (!email) {
      toast({ title: "No email on file", description: "Add an email to send portal invite", variant: "destructive" });
      return;
    }
    send.mutate(
      { customer_id: customerId, email },
      {
        onSuccess: () => toast({ title: "Invite logged", description: `Sent to ${email}` }),
        onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Customer portal</h3>
      <div className="space-y-3 text-sm">
        {latest ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={latest.accepted_at ? "default" : "secondary"} className="text-[10px]">
                {latest.accepted_at ? "Accepted" : "Sent"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(latest.sent_at), { addSuffix: true })}
              </span>
            </div>
            {latest.email && <p className="text-xs text-muted-foreground truncate">{latest.email}</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No invite sent yet.</p>
        )}
        <Button size="sm" variant="outline" className="w-full" onClick={handleSend} disabled={send.isPending}>
          {latest ? "Resend invite" : "Send invite"}
        </Button>
      </div>
    </Card>
  );
}
