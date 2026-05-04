import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Loader2, Zap, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SoftphoneStrip } from "./SoftphoneStrip";
import { NowTab } from "./copilot/NowTab";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAttentionData } from "@/hooks/useAttentionData";
import { isElectron, onMainMessage } from "@/lib/electron";
import { ROUTE_LABELS } from "@/lib/routeLabels";

const CopilotChatPanel = lazy(() => import("@/components/CopilotChatPanel"));

function getPageContext(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  if (pathname.startsWith("/jobs/")) return "Job detail";
  if (pathname.startsWith("/estimates/")) return "Estimate detail";
  if (pathname.startsWith("/customers/")) return "Customer detail";
  return pathname;
}

function getContextRef(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "HOME";
  if (parts[0] === "jobs" && parts[1]) return `JOB-${parts[1].slice(0, 6).toUpperCase()}`;
  if (parts[0] === "estimates" && parts[1]) return `EST-${parts[1].slice(0, 6).toUpperCase()}`;
  if (parts[0] === "customers" && parts[1]) return `CUST-${parts[1].slice(0, 6).toUpperCase()}`;
  return parts[0].toUpperCase();
}

function useEnrichedContext(pathname: string) {
  const [enriched, setEnriched] = useState<{ label: string; context: string } | null>(null);

  useEffect(() => {
    setEnriched(null);
    const parts = pathname.split("/");
    const entity = parts[1];
    const id = parts[2];
    if (!id) return;

    let cancelled = false;

    if (entity === "customers") {
      supabase
        .from("customers")
        .select("first_name, last_name, email, phone, address, city, state, zip")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || "Unknown";
          const addr = [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ");
          setEnriched({
            label: name,
            context: `Customer detail for ${name}. Phone: ${data.phone || "N/A"}. Email: ${data.email || "N/A"}. Address: ${addr || "N/A"}.`,
          });
        });
    } else if (entity === "jobs") {
      supabase
        .from("jobs")
        .select("job_number, job_type, customer_name, address")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const label = `#${data.job_number || "?"} ${data.job_type || ""}`.trim();
          setEnriched({
            label,
            context: `Job detail for ${label}. Customer: ${data.customer_name || "N/A"}. Address: ${data.address || "N/A"}.`,
          });
        });
    } else if (entity === "estimates") {
      supabase
        .from("estimates")
        .select("estimate_number, customer_name, address")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const label = `#${data.estimate_number || "?"} ${data.customer_name || ""}`.trim();
          setEnriched({
            label,
            context: `Estimate detail for ${label}. Address: ${data.address || "N/A"}.`,
          });
        });
    }

    return () => { cancelled = true; };
  }, [pathname]);

  return enriched;
}

export function CopilotSidePanel({ employeeId }: { employeeId?: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const enriched = useEnrichedContext(location.pathname);
  const [callContext, setCallContext] = useState<string | null>(null);
  const [phonePoppedOut, setPhonePoppedOut] = useState(false);
  const { totalAttention } = useAttentionData();

  // Listen for Electron IPC messages about phone window state
  useEffect(() => {
    if (!isElectron()) return;
    const unsub1 = onMainMessage("phone-popped-out", () => setPhonePoppedOut(true));
    const unsub2 = onMainMessage("phone-popped-in", () => setPhonePoppedOut(false));
    return () => { unsub1(); unsub2(); };
  }, []);

  const handleCallContextChange = useCallback((ctx: string | null) => {
    setCallContext(ctx);
  }, []);

  const baseContext = getPageContext(location.pathname);
  const displayLabel = enriched?.label || baseContext;
  const refTag = getContextRef(location.pathname);
  const pageContext = [enriched?.context || baseContext, callContext].filter(Boolean).join("\n\n");

  return (
    // `dark` flips semantic tokens for everything inside the panel
    // so existing nested cards/buttons render in the avionics palette
    <div className="dark flex flex-col h-full bg-[#0d0e12] text-foreground">
      {/* Phone strip — visually hidden when popped out but stays mounted so
          the Twilio device keeps receiving calls and screen-pop can fire */}
      <div className={phonePoppedOut ? "hidden" : "shrink-0 border-b border-[#262933] bg-[#08090b] shadow-[inset_0_4px_10px_rgba(0,0,0,0.3)]"}>
        <SoftphoneStrip onCallContextChange={handleCallContextChange} />
      </div>

      {/* Tactical header */}
      <button
        onClick={() => navigate("/copilot")}
        className="group shrink-0 w-full text-left px-4 py-3 border-b border-[#262933] bg-[#0d0e12] hover:bg-[#11131a] transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#ff8b00] shadow-[0_0_8px_#ff8b00] animate-pulse" />
            <h1 className="text-foreground font-semibold text-[13px] tracking-[0.2em] uppercase font-mono">
              JARVIS_SYS
            </h1>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
            v2.4.1
          </span>
        </div>

        <div className="bg-[#181a20]/80 border border-[#ff8b00]/30 px-2 py-1.5 rounded-sm flex flex-col gap-0.5">
          <div className="text-[10px] text-[#ff8b00] font-medium tracking-wider uppercase font-mono">
            [REF] Active Context
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-foreground text-[13px] font-medium truncate">
              {displayLabel}
            </span>
            {totalAttention > 0 && (
              <span className="shrink-0 text-[10px] font-mono text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 px-1.5 py-0.5 rounded-sm tracking-wider">
                {totalAttention} ALERT
              </span>
            )}
            {totalAttention === 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground font-mono tracking-wider">
                {refTag}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Tabs */}
      <Tabs defaultValue="now" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-3 grid grid-cols-2 h-8 bg-[#181a20] border border-[#262933] p-0.5 rounded-sm shrink-0">
          <TabsTrigger
            value="now"
            className="text-[11px] uppercase tracking-widest font-mono gap-1.5 py-1 rounded-[2px] data-[state=active]:bg-[#ff8b00] data-[state=active]:text-[#0d0e12] data-[state=active]:shadow-none text-muted-foreground"
          >
            <Zap className="h-3 w-3" />
            Now
            {totalAttention > 0 && (
              <span className="h-3.5 min-w-[14px] px-1 text-[9px] leading-none rounded-sm bg-[#ff3333] text-white flex items-center justify-center font-semibold">
                {totalAttention}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="chat"
            className="text-[11px] uppercase tracking-widest font-mono gap-1.5 py-1 rounded-[2px] data-[state=active]:bg-[#ff8b00] data-[state=active]:text-[#0d0e12] data-[state=active]:shadow-none text-muted-foreground"
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="now" className="flex-1 min-h-0 overflow-y-auto mt-2">
          <NowTab />
        </TabsContent>

        <TabsContent value="chat" className="flex-1 min-h-0 mt-2 p-2">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            <CopilotChatPanel pageContext={pageContext} compact employeeId={employeeId} routeKey={location.pathname} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
