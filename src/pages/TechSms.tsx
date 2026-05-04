import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquare, Mic, Send, Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { useTechDashboardData } from "@/hooks/useTechDashboardData";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPhone, normalizeLast10 } from "@/lib/formatters";
import { ctTimeLabel } from "@/lib/dateGrouping";

type WorkItem = {
  id: string;
  type: "job" | "estimate";
  phone: string | null;
  phoneKey: string | null;
  customerName: string;
  label: string;
  timeLabel: string | null;
};

function workLabel(item: any, type: WorkItem["type"]) {
  if (type === "estimate") {
    return item.estimate_number ? `Estimate #${item.estimate_number}` : "Estimate";
  }
  return item.job_number || item.hcp_job_number ? `Job #${item.job_number || item.hcp_job_number}` : item.job_type || "Job";
}

function timeLabel(value?: string | null) {
  if (!value) return null;
  try {
    return format(new Date(value), "h:mm a");
  } catch {
    return null;
  }
}

export default function TechSms() {
  const { employeeId } = useEffectiveAuth();
  const { data: employees } = useEmployees();
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const employeeName = useMemo(() => {
    if (!employeeId || !employees) return null;
    return employees.find((employee) => employee.id === employeeId)?.name || null;
  }, [employeeId, employees]);

  const { data: dashboard, isLoading: loadingWork } = useTechDashboardData(employeeName, today);
  const { conversations, sending, sendSms, markAsRead } = useSmsLogScoped();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const {
    isRecording,
    loading: dictating,
    toggle: toggleDictation,
  } = useVoiceToText({
    context: "sms",
    onTranscript: (text) => {
      setBody((current) => [current.trim(), text.trim()].filter(Boolean).join(current.trim() ? " " : ""));
    },
  });

  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const job of dashboard?.jobs || []) if (job.customer_id) ids.add(job.customer_id);
    for (const estimate of dashboard?.estimates || []) if (estimate.customer_id) ids.add(estimate.customer_id);
    return Array.from(ids).sort();
  }, [dashboard]);

  const { data: phoneMap = new Map<string, string>() } = useQuery({
    queryKey: ["tech-sms-customer-phones", customerIds],
    enabled: customerIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, phone, mobile_phone")
        .in("id", customerIds);
      const next = new Map<string, string>();
      for (const customer of data || []) {
        const phone = customer.mobile_phone || customer.phone;
        if (phone) next.set(customer.id, phone);
      }
      return next;
    },
  });

  const workItems = useMemo<WorkItem[]>(() => {
    const items: WorkItem[] = [];
    for (const job of dashboard?.jobs || []) {
      const phone = job.customer_phone || (job.customer_id && phoneMap.get(job.customer_id)) || null;
      items.push({
        id: job.id,
        type: "job",
        phone,
        phoneKey: normalizeLast10(phone),
        customerName: job.customer_name || "Customer",
        label: workLabel(job, "job"),
        timeLabel: timeLabel(job.arrival_start),
      });
    }
    for (const estimate of dashboard?.estimates || []) {
      const phone = estimate.customer_phone || (estimate.customer_id && phoneMap.get(estimate.customer_id)) || null;
      items.push({
        id: estimate.id,
        type: "estimate",
        phone,
        phoneKey: normalizeLast10(phone),
        customerName: estimate.customer_name || "Customer",
        label: workLabel(estimate, "estimate"),
        timeLabel: timeLabel(estimate.arrival_start),
      });
    }
    return items.sort((a, b) => (a.timeLabel || "").localeCompare(b.timeLabel || ""));
  }, [dashboard, phoneMap]);

  const workByPhone = useMemo(() => {
    const map = new Map<string, WorkItem>();
    for (const item of workItems) {
      if (item.phoneKey && !map.has(item.phoneKey)) map.set(item.phoneKey, item);
    }
    return map;
  }, [workItems]);

  const scopedConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      const key = normalizeLast10(conversation.phoneNumber);
      return !!key && workByPhone.has(key);
    });
  }, [conversations, workByPhone]);

  const selectedWork = selectedKey ? workByPhone.get(selectedKey) || null : null;
  const selectedConversation = selectedKey
    ? scopedConversations.find((conversation) => normalizeLast10(conversation.phoneNumber) === selectedKey) || null
    : null;
  const selectedPhone = selectedConversation?.phoneNumber || selectedWork?.phone || null;

  useEffect(() => {
    if (selectedKey && workByPhone.has(selectedKey)) return;
    const unread = scopedConversations.find((conversation) => conversation.unreadCount > 0);
    const firstConversationKey = unread ? normalizeLast10(unread.phoneNumber) : normalizeLast10(scopedConversations[0]?.phoneNumber || null);
    const firstWorkKey = workItems.find((item) => item.phoneKey)?.phoneKey || null;
    setSelectedKey(firstConversationKey || firstWorkKey);
  }, [scopedConversations, selectedKey, workByPhone, workItems]);

  useEffect(() => {
    if (selectedConversation?.unreadCount) {
      markAsRead(selectedConversation.threadKey);
    }
  }, [markAsRead, selectedConversation]);

  const handleSend = async () => {
    if (!selectedPhone || !body.trim()) return;
    const jobId = selectedWork?.type === "job" ? selectedWork.id : undefined;
    const ok = await sendSms(selectedPhone, body.trim(), jobId, selectedWork?.customerName, undefined, {
      fromNumber: selectedConversation?.toNumber || null,
      businessUnitId: selectedConversation?.businessUnitId || null,
      threadKey: selectedConversation?.threadKey || null,
    });
    if (ok) setBody("");
  };

  if (loadingWork) {
    return (
      <div className="flex h-full flex-col bg-background p-4">
        <Skeleton className="mb-3 h-10 w-48" />
        <Skeleton className="mb-2 h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">Job Messages</h1>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Today&apos;s assigned customers only
        </p>
      </div>

      {workItems.length === 0 ? (
        <EmptyState title="No assigned work today" body="Messages will appear here when today's assigned jobs or estimates have a customer phone." />
      ) : workByPhone.size === 0 ? (
        <EmptyState title="No customer phones found" body="Today's assigned work does not have a usable SMS number yet." />
      ) : (
        <>
          <ScrollArea className="shrink-0 border-b">
            <div className="flex gap-2 p-3">
              {workItems.filter((item) => item.phoneKey).map((item) => {
                const conversation = scopedConversations.find((c) => normalizeLast10(c.phoneNumber) === item.phoneKey);
                const active = selectedKey === item.phoneKey;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    onClick={() => setSelectedKey(item.phoneKey)}
                    className={cn(
                      "min-w-[190px] rounded-md border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary/10" : "bg-card active:bg-muted",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.customerName}</span>
                      {conversation?.unreadCount ? <Badge variant="destructive">{conversation.unreadCount}</Badge> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Wrench className="h-3 w-3" />
                      <span className="truncate">{item.label}{item.timeLabel ? ` - ${item.timeLabel}` : ""}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPhone(item.phone || "") || item.phone}</p>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="min-h-0 flex-1">
            {selectedPhone ? (
              <div className="flex h-full flex-col">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold">
                    {selectedWork?.customerName || selectedConversation?.contactName || formatPhone(selectedPhone)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedWork?.label || "Assigned work"}{selectedWork?.timeLabel ? ` - ${selectedWork.timeLabel}` : ""}
                  </p>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-2 p-4">
                    {(selectedConversation?.messages || []).length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No messages for this job yet.
                      </p>
                    ) : (
                      selectedConversation!.messages.map((message) => (
                        <div
                          key={message.id}
                          className={cn("flex", message.direction === "outbound" ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[82%] rounded-lg px-3 py-2 text-sm",
                              message.direction === "outbound"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{message.body}</p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                message.direction === "outbound" ? "text-primary-foreground/75" : "text-muted-foreground",
                              )}
                            >
                              {ctTimeLabel(message.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="border-t bg-card p-3 pb-8">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="Talk or type..."
                      className="min-h-[44px] max-h-28 flex-1 resize-none text-sm"
                      disabled={sending}
                    />
                    <Button
                      size="icon"
                      variant={isRecording ? "destructive" : "outline"}
                      onClick={toggleDictation}
                      disabled={sending || dictating}
                      aria-label={isRecording ? "Stop dictation" : "Start dictation"}
                    >
                      {dictating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      onClick={() => void handleSend()}
                      disabled={sending || !body.trim()}
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="Pick a job" body="Choose one of today's assigned customers to read or send messages." />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center">
      <div>
        <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h2 className="mt-3 text-sm font-semibold">{title}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
