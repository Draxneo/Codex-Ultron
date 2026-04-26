import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCustomerActivityFeed } from "@/hooks/useCustomerOverview";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mail, Phone, MessageSquare, FileText, DollarSign, Paperclip, StickyNote, Activity } from "lucide-react";

interface Props {
  customerId: string;
}

const ICONS: Record<string, any> = {
  note_added: StickyNote,
  email_sent: Mail,
  email_received: Mail,
  sms_sent: MessageSquare,
  sms_received: MessageSquare,
  call_inbound: Phone,
  call_outbound: Phone,
  invoice_created: DollarSign,
  payment_received: DollarSign,
  attachment_added: Paperclip,
  estimate_created: FileText,
  job_created: FileText,
};

export function ActivityFeed({ customerId }: Props) {
  const [page, setPage] = useState(0);
  const { data, isLoading } = useCustomerActivityFeed(customerId, page);
  const rows = data?.rows || [];

  return (
    <Card className="p-4 shadow-none border">
      <h3 className="text-sm font-bold mb-3">Activity</h3>

      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-1 opacity-40" />
          <p className="text-sm">No activity yet</p>
        </div>
      )}

      {rows.length > 0 && (
        <ol className="relative">
          {rows.map((r) => {
            const Icon = ICONS[r.event_type] || Activity;
            return (
              <li key={r.id} className="flex gap-3 py-2.5 border-b last:border-0">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.body && <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    {r.actor_name && ` · ${r.actor_name}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {(data?.total || 0) > 30 && (
        <div className="flex justify-between items-center mt-3 pt-3 border-t">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button size="sm" variant="ghost" disabled={(page + 1) * 30 >= (data?.total || 0)} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}
