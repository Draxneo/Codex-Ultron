/**
 * CopilotPage — Full-screen JARVIS dashboard.
 *
 * Left: proactive attention cards grouped by severity.
 * Right: embedded AI chat panel.
 * Caller-aware: detects active call and shows customer context banner.
 */

import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, Zap, Sparkles, BotMessageSquare, PhoneCall, ExternalLink, AlertTriangle, MessageCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppHeader } from "@/components/AppHeader";
import { useAttentionData } from "@/hooks/useAttentionData";
import { DailyBriefing } from "@/components/copilot/DailyBriefing";
import { AttentionCard } from "@/components/copilot/AttentionCard";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { formatPhone } from "@/lib/formatters";

const CopilotChatPanel = lazy(() => import("@/components/CopilotChatPanel"));

export default function CopilotPage() {
  const { needsYou, infoItems, aiHandledCount, totalAttention, queryErrors, hasErrors } = useAttentionData();
  const softphone = useSoftphoneContext();
  const isMobile = useIsMobile();
  const [chatOpen, setChatOpen] = useState(false);

  // Detect active caller
  const callerNumber = softphone.callerInfo?.number ?? null;
  const isCallActive = softphone.status === "on-call" || softphone.status === "ringing" || softphone.status === "connecting";
  const { data: callerCustomer } = useCallerLookup(isCallActive ? callerNumber : null);

  const callerContext = isCallActive && callerNumber
    ? `Currently on call with ${callerCustomer?.first_name ? `${callerCustomer.first_name} ${callerCustomer.last_name ?? ""}`.trim() : formatPhone(callerNumber)}`
    : undefined;

  // Mobile: full-screen chat overlay
  if (isMobile && chatOpen) {
    return (
      <div className="h-full bg-background flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/5 shrink-0">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold flex-1">AI Chat</span>
          <button onClick={() => setChatOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </button>
        </div>
        <div className="flex-1 min-h-0 p-2">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            <CopilotChatPanel
              pageContext={callerContext ?? "JARVIS dashboard"}
              compact={false}
              routeKey="/copilot"
            />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-background flex flex-col overflow-hidden", isMobile ? "h-full" : "h-screen")}>
      {!isMobile && <AppHeader />}
      <div className="flex-1 flex min-h-0">
        {/* Left — Attention Dashboard */}
        <div className={cn("flex-1 overflow-y-auto space-y-4", isMobile ? "p-3" : "p-6 space-y-6 lg:w-[60%]")}>

          {/* Active Caller Banner */}
          {isCallActive && callerNumber && (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 animate-in fade-in slide-in-from-top-2">
              <div className="rounded-full bg-primary/10 p-2">
                <PhoneCall className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {callerCustomer?.first_name
                    ? `${callerCustomer.first_name} ${callerCustomer.last_name ?? ""}`.trim()
                    : "Unknown Caller"}
                </p>
                <p className="text-xs text-muted-foreground">{formatPhone(callerNumber)}</p>
              </div>
              {callerCustomer && (
                <Link
                  to={`/customers/${callerCustomer.id}`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  View Profile <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Zap className={cn("text-primary", isMobile ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div>
                <h1 className={cn("font-bold", isMobile ? "text-base" : "text-lg")}>JARVIS</h1>
                <p className="text-xs text-muted-foreground">
                  {totalAttention > 0
                    ? `${totalAttention} item${totalAttention !== 1 ? "s" : ""} need attention`
                    : "Everything is running smoothly"}
                </p>
              </div>
            </div>
            {aiHandledCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                <BotMessageSquare className="h-4 w-4 text-violet-500" />
                <span className="text-xs text-violet-700 dark:text-violet-300">
                  AI handled <strong>{aiHandledCount}</strong> step{aiHandledCount !== 1 ? "s" : ""} today
                </span>
              </div>
            )}
          </div>

          {/* Error banner */}
          {hasErrors && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Some data sources degraded</AlertTitle>
              <AlertDescription className="text-xs">
                {queryErrors.map((e, i) => <span key={i}>{e}{i < queryErrors.length - 1 ? " · " : ""}</span>)}
              </AlertDescription>
            </Alert>
          )}

          {/* AI Daily Briefing */}
          <DailyBriefing />

          {/* All clear state */}
          {totalAttention === 0 && aiHandledCount === 0 && (
            <Card>
              <CardContent className={cn("flex flex-col items-center justify-center gap-3", isMobile ? "py-8" : "py-12")}>
                <div className="rounded-full bg-emerald-500/10 p-4">
                  <Sparkles className={cn("text-emerald-500", isMobile ? "h-8 w-8" : "h-10 w-10")} />
                </div>
                <p className="text-lg font-semibold">All Clear!</p>
                <p className="text-sm text-muted-foreground text-center">No items need your attention. Use the chat to ask anything.</p>
              </CardContent>
            </Card>
          )}


          {/* Needs You */}
          {needsYou.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-[10px]">NEEDS YOU</Badge>
                <span className="text-xs text-muted-foreground">{needsYou.length} item{needsYou.length !== 1 ? "s" : ""}</span>
              </div>
              <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "sm:grid-cols-2")}>
                {needsYou.map((item) => (
                  <AttentionCard key={item.label} item={item} large />
                ))}
              </div>
            </div>
          )}

          {/* In Progress / Info */}
          {infoItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">IN PROGRESS</Badge>
                <span className="text-xs text-muted-foreground">{infoItems.length} item{infoItems.length !== 1 ? "s" : ""}</span>
              </div>
              <div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "sm:grid-cols-2")}>
                {infoItems.map((item) => (
                  <AttentionCard key={item.label} item={item} large />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — Chat Panel (desktop only) */}
        <div className="hidden lg:flex flex-col w-[40%] border-l min-h-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary/5 shrink-0">
            <Bot className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">AI Chat</span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              }
            >
              <CopilotChatPanel
                pageContext={callerContext ?? "JARVIS dashboard"}
                compact={false}
                routeKey="/copilot"
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Mobile floating chat button */}
      {isMobile && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
