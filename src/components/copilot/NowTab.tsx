/**
 * NowTab — Proactive attention cards for the Copilot side panel.
 * Consumes useAttentionData() — same source as Mission Control.
 * Includes inline tech proposal review panel and unmatched invoice review queue.
 */

import { useState, useEffect, useCallback } from "react";
import { useAttentionData } from "@/hooks/useAttentionData";
import { supabase } from "@/integrations/supabase/client";
import { BotMessageSquare, Sparkles, Loader2, Check, RotateCcw, ChevronLeft, FileQuestion, X, AlertTriangle, Bot, MessageSquareText, ArrowRight } from "lucide-react";
import { AttentionCard } from "./AttentionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { ActionItemCards } from "./ActionItemCards";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

import { ReminderBatchCard } from "./ReminderBatchCard";
import { PendingSmsCard } from "./PendingSmsCard";

type TeamNowNotification = {
  id: string;
  title: string;
  body: string | null;
  related_entity_id: string | null;
  created_at: string;
};

function TeamMessagesNowCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["now-team-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_notifications" as any)
        .select("id, title, body, related_entity_id, created_at")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as TeamNowNotification[];
    },
    refetchInterval: 15000,
  });

  const markRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("team_notifications" as any)
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast({ title: "Could not clear team alerts", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Team alerts cleared" });
    qc.invalidateQueries({ queryKey: ["now-team-notifications", user.id] });
    qc.invalidateQueries({ queryKey: ["side-rail-team-notifications", user.id] });
    qc.invalidateQueries({ queryKey: ["team-notifications", user.id] });
    qc.invalidateQueries({ queryKey: ["intake-team-notifications", user.id] });
  };

  if (notifications.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#ff8b00]/30 bg-[#ff8b00]/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-[#ff8b00]" />
          <div>
            <p className="text-xs font-semibold text-foreground">Employee texts</p>
            <p className="text-[10px] text-muted-foreground">{notifications.length} unread team alert{notifications.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <button type="button" onClick={markRead} className="text-[10px] font-medium text-[#ffb84d] hover:text-[#ffd08a]">
          Mark read
        </button>
      </div>
      <div className="space-y-1.5">
        {notifications.slice(0, 3).map((notification) => (
          <a
            key={notification.id}
            href="/team"
            className="block rounded-md border border-[#262933] bg-[#0d0e12]/80 px-2.5 py-2 hover:border-[#ff8b00]/40"
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{notification.title}</p>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </div>
            {notification.body && <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{notification.body}</p>}
          </a>
        ))}
      </div>
    </div>
  );
}

interface TechProposal {
  id: string;
  job_id: string;
  employee_id: string;
  estimate_id: string | null;
  selected_tiers: string[];
  payment_preference: string | null;
  created_at: string;
  admin_notes: string | null;
  employee_name?: string;
  customer_name?: string;
  address?: string;
}

function TechProposalReviewPanel({ onBack }: { onBack: () => void }) {
  const [proposals, setProposals] = useState<TechProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const loadProposals = useCallback(async () => {
      const { data } = await supabase
        .from("estimate_reviews")
        .select("*, employees(name), jobs(customer_name, address)")
        .eq("status", "pending_review")
        .order("created_at", { ascending: false });

      const enriched: TechProposal[] = (data || []).map((r: any) => ({
        ...r,
        selected_tiers: r.selected_tiers || [],
        employee_name: r.employees?.name || "Unknown",
        customer_name: r.jobs?.customer_name || "Unknown",
        address: r.jobs?.address || "",
      }));
      setProposals(enriched);
      setLoading(false);
  }, []);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    const channel = supabase
      .channel("tech-proposal-review-sync")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "estimate_reviews" },
        () => loadProposals()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProposals]);

  const handleAction = async (proposal: TechProposal, status: "approved" | "revision_requested") => {
    setActionId(proposal.id);
    try {
      const { data, error } = await supabase
        .from("estimate_reviews")
        .update({
          status,
          admin_notes: notes[proposal.id] || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id || null,
        })
        .eq("id", proposal.id)
        .eq("status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This proposal was already handled by someone else.");

      await supabase.from("activity_log").insert({
        action: status === "approved" ? "estimate_approved" : "estimate_revision_requested",
        details: `Tech proposal for ${proposal.customer_name} ${status === "approved" ? "approved" : "sent back for revision"}`,
        job_id: proposal.job_id,
      });

      toast({
        title: status === "approved" ? "Proposal Approved" : "Revision Requested",
        description: `${proposal.customer_name} — notified ${proposal.employee_name}`,
      });

      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["activity_log"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back to Now
      </button>

      {proposals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No pending proposals.</p>
      ) : (
        proposals.map((p) => (
          <div key={p.id} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{p.customer_name}</p>
                {p.address && (
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{p.address}</p>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(p.created_at), "MMM d, h:mm a")}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Tech:</span>
              <span className="text-xs font-medium">{p.employee_name}</span>
            </div>

            <div className="flex flex-wrap gap-1">
              {p.selected_tiers.map((tier) => (
                <Badge key={tier} variant="outline" className="text-xs">{tier}</Badge>
              ))}
            </div>

            {p.payment_preference && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Payment:</span>
                <Badge variant="secondary" className="text-xs">
                  {p.payment_preference === "financing_36mo"
                    ? "0% / 36mo"
                    : p.payment_preference === "financing_120mo"
                      ? "9.99% / 120mo"
                      : "Instant Rebate"}
                </Badge>
              </div>
            )}

            <Textarea
              placeholder="Notes (optional)..."
              className="text-xs h-16 resize-none"
              value={notes[p.id] || ""}
              onChange={(e) => setNotes((prev) => ({ ...prev, [p.id]: e.target.value }))}
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleAction(p, "approved")}
                disabled={actionId === p.id}
              >
                {actionId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => handleAction(p, "revision_requested")}
                disabled={actionId === p.id}
              >
                <RotateCcw className="h-3 w-3" />
                Revise
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Unmatched Invoice Review Queue ── */

function UnmatchedInvoiceReviewPanel({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Record<string, string>>({});

  useRealtimeInvalidation(
    [
      { table: "job_invoices", queryKeys: [["unmatched_invoices"], ["hud_attention_counts"], ["job_invoices"]] },
      { table: "jobs", queryKeys: [["todays_open_jobs"]] },
    ],
    "unmatched-invoice-review-sync"
  );

  const { data: pendingInvoices, isLoading } = useQuery({
    queryKey: ["unmatched_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_invoices")
        .select("*, supply_houses(name)")
        .eq("match_status", "pending_review")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: todayJobs } = useQuery({
    queryKey: ["todays_open_jobs"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, customer_name")
        .eq("scheduled_date", today)
        .not("status", "in", CLOSED_WORK_STATUS_FILTER)
        .order("customer_name");
      if (error) throw error;
      return data || [];
    },
  });

  const handleAttach = async (invoiceId: string) => {
    const jobId = selectedJobs[invoiceId];
    if (!jobId) {
      toast({ title: "Select a job first", variant: "destructive" });
      return;
    }
    setActionId(invoiceId);
    try {
      const { data, error } = await supabase.from("job_invoices").update({
        job_id: jobId,
        match_status: "confirmed",
        match_confidence: "manual",
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString(),
      } as any)
        .eq("id", invoiceId)
        .eq("match_status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This invoice was already handled by someone else.");
      toast({ title: "Invoice attached to job" });
      qc.invalidateQueries({ queryKey: ["unmatched_invoices"] });
      qc.invalidateQueries({ queryKey: ["job_invoices"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  const handleDismiss = async (invoiceId: string) => {
    setActionId(invoiceId);
    try {
      const { data, error } = await supabase.from("job_invoices").update({
        match_status: "rejected",
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString(),
      } as any)
        .eq("id", invoiceId)
        .eq("match_status", "pending_review")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This invoice was already handled by someone else.");
      toast({ title: "Invoice dismissed" });
      qc.invalidateQueries({ queryKey: ["unmatched_invoices"] });
      
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setActionId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back to Now
      </button>

      {(!pendingInvoices || pendingInvoices.length === 0) ? (
        <p className="text-sm text-muted-foreground text-center py-4">No unmatched invoices.</p>
      ) : (
        pendingInvoices.map((inv: any) => {
          const items = Array.isArray(inv.extracted_items) ? inv.extracted_items.slice(0, 3) : [];
          return (
            <div key={inv.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Badge variant={inv.source === "photo" ? "default" : "secondary"} className="text-[10px]">
                    {inv.source === "photo" ? "Photo" : inv.source === "email" ? "Email" : inv.source}
                  </Badge>
                  {(inv.supply_houses?.name || inv.supply_house) && (
                    <span className="text-xs font-medium">{inv.supply_houses?.name || inv.supply_house}</span>
                  )}
                </div>
                {inv.total_amount && (
                  <span className="text-sm font-bold text-primary">${Number(inv.total_amount).toFixed(2)}</span>
                )}
              </div>

              {items.length > 0 && (
                <div className="space-y-0.5">
                  {items.map((item: any, i: number) => (
                    <p key={i} className="text-[11px] text-muted-foreground truncate">
                      • {item.name || item.description}{item.part_number ? ` (#${item.part_number})` : ""}
                    </p>
                  ))}
                </div>
              )}

              {inv.match_reason && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{inv.match_reason}</p>
              )}

              <Select
                value={selectedJobs[inv.id] || ""}
                onValueChange={(v) => setSelectedJobs((prev) => ({ ...prev, [inv.id]: v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  {(todayJobs || []).map((job: any) => (
                    <SelectItem key={job.id} value={job.id} className="text-xs">
                      #{job.job_number} — {job.customer_name || "No name"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => handleAttach(inv.id)}
                  disabled={actionId === inv.id || !selectedJobs[inv.id]}
                >
                  {actionId === inv.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Attach to Job
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDismiss(inv.id)}
                  disabled={actionId === inv.id}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function NowTab() {
  const { needsYou, infoItems, aiHandledCount, totalAttention, queryErrors, hasErrors } = useAttentionData();
  const [showActionItems, setShowActionItems] = useState(false);

  const [showProposals, setShowProposals] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  if (showActionItems) {
    return <ActionItemCards onBack={() => setShowActionItems(false)} />;
  }
  if (showProposals) {
    return <TechProposalReviewPanel onBack={() => setShowProposals(false)} />;
  }
  if (showUnmatched) {
    return <UnmatchedInvoiceReviewPanel onBack={() => setShowUnmatched(false)} />;
  }

  if (totalAttention === 0 && aiHandledCount === 0 && !hasErrors) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
        <div className="rounded-full bg-emerald-500/10 p-4">
          <Sparkles className="h-8 w-8 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold">All Clear!</p>
        <p className="text-xs text-muted-foreground">No items need your attention right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2 overflow-y-auto">
      {/* Reminder Batch Card — top priority */}
      <ReminderBatchCard />

      {/* Pending SMS approvals — inline HITL (replaces SMS Outbox) */}
      <PendingSmsCard />

      {/* Employee/team texts — dispatch needs these in NOW, not hidden in chat */}
      <TeamMessagesNowCard />

      {/* Error banner — nothing fails silently */}
      {hasErrors && queryErrors.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-medium text-destructive">
              {queryErrors.length} data source{queryErrors.length !== 1 ? "s" : ""} unavailable
            </span>
            <p className="text-[10px] text-destructive/70 mt-0.5">
              {queryErrors.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* AI summary */}
      {aiHandledCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
          <BotMessageSquare className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="text-xs text-violet-700 dark:text-violet-300">
            AI handled <strong>{aiHandledCount}</strong> step{aiHandledCount !== 1 ? "s" : ""} today
          </span>
        </div>
      )}

      {/* Needs You — critical + warning */}
      {needsYou.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Needs You
          </p>
          {needsYou.map((item) => (
            <AttentionCard
              key={item.label}
              item={item}
              onClick={
                item.label === "Tech Proposals" ? () => setShowProposals(true) :
                item.label === "Unmatched" ? () => setShowUnmatched(true) :
                item.label === "Action Items" ? () => setShowActionItems(true) :
                undefined
              }
            />
          ))}
        </div>
      )}

      {/* Info items */}
      {infoItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            In Progress
          </p>
          {infoItems.map((item) => (
            <AttentionCard key={item.label} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
