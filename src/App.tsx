import { useState, useEffect, useRef, useCallback } from "react";
import { ThemeProvider } from "next-themes";
import { useLiveTranscriptBySid } from "@/hooks/useLiveTranscript";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployeeTabAccess, getFirstAllowedRoute } from "@/hooks/useEmployeeTabAccess";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CopilotPanelProvider } from "@/contexts/CopilotPanelContext";
import { SmsLogProvider } from "@/contexts/SmsLogContext";
import { AnnouncerProvider } from "@/components/voice/AnnouncerProvider";
import { useDesktopNotifications } from "@/hooks/useDesktopNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";

import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { usePreWarmCache } from "@/hooks/usePreWarmCache";
import { useAppResume } from "@/hooks/useAppResume";
import { onMainMessage } from "@/lib/electron";
import { SoftphoneStrip } from "./components/SoftphoneStrip";
import { useSoftphoneContext } from "./components/SoftphoneProvider";
import { CallerInfoCenter } from "./components/softphone/CallerInfoCenter";
import { IntakeActionCards } from "./components/softphone/IntakeActionCards";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useLiveTranscript } from "@/hooks/useLiveTranscript";
import Dashboard from "./pages/Index";

import TechMySchedule from "./pages/TechMySchedule";
import TechJobDetail from "./pages/TechJobDetail";
import TechCustomerDetail from "./pages/TechCustomerDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";


import Vendors from "./pages/Vendors";
import VendorDetail from "./pages/VendorDetail";

import CopilotPage from "./pages/CopilotPage";
import { ActionItemCards } from "./components/copilot/ActionItemCards";
import { BookingIntentAlert } from "./components/BookingIntentAlert";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import TechFormPublic from "./pages/TechFormPublic";

import EstimateDetail from "./pages/EstimateDetail";
import JobPhotos from "./pages/JobPhotos";

import AgentTraining from "./pages/AgentTraining";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Agreements from "./pages/Agreements";
import Payments from "./pages/Payments";
import SmsPage from "./pages/SmsPage";
import CallsPage from "./pages/CallsPage";
import InboxPage from "./pages/InboxPage";
import Admin from "./pages/Admin";
import SystemLog from "./pages/SystemLog";
import PortalLogin from "./pages/PortalLogin";
import PortalDashboard from "./pages/PortalDashboard";
import ReferralPublic from "./pages/ReferralPublic";
import CustomerPresentation from "./pages/CustomerPresentation";
import AgreementPresentation from "./pages/AgreementPresentation";
import CertificateView from "./pages/CertificateView";
import InvoicePublic from "./pages/InvoicePublic";
import CustomerCart from "./pages/CustomerCart";

/** Redirect /sms?phone=X to /inbox?section=sms&phone=X preserving query params */
function SmsRedirectComponent() {
  const [sp] = useSearchParams();
  const phone = sp.get("phone");
   const draft = sp.get("draft") || sp.get("body");
   const params = new URLSearchParams({ section: "sms" });
   if (phone) params.set("phone", phone);
   if (draft) params.set("draft", draft);
   const target = `/inbox?${params.toString()}`;
  return <Navigate to={target} replace />;
}

/** Redirect legacy /phone route to the supported calls experience */
function PhoneRedirectComponent() {
  return <Navigate to="/inbox?section=calls" replace />;
}

import UnscheduledJobs from "./pages/UnscheduledJobs";
import CustomerIntakePublic from "./pages/CustomerIntakePublic";
import NotFound from "./pages/NotFound";

import IvrBuilder from "./pages/IvrBuilder";
import CallRoutingSettings from "./pages/CallRoutingSettings";
import AgentPipeline from "./pages/AgentPipeline";
import AgentNetwork from "./pages/AgentNetwork";
import Leads from "./pages/Leads";
import RepairCatalog from "./pages/RepairCatalog";
import Catalog from "./pages/Catalog";
import QuickQuote from "./pages/QuickQuote";
import QuickQuoteCustomerView from "./pages/QuickQuoteCustomerView";
import PayPage from "./pages/PayPage";
import { SoftphoneProvider } from "./components/SoftphoneProvider";
import { ViewAsProvider } from "./contexts/ViewAsContext";
import { AdminViewAsBar } from "./components/AdminViewAsBar";
import { SmsPanel } from "./components/SmsPanel";
import { useUnreadSmsCount } from "./hooks/useUnreadSmsCount";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Badge } from "./components/ui/badge";
import { Phone as PhoneIcon, MessageSquare, Sparkles, Headphones } from "lucide-react";
import { ScrollArea } from "./components/ui/scroll-area";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: true,
    },
  },
});

/**
 * PrivateAppListeners — mounts heavy app-wide listeners only for authenticated
 * internal app routes. This avoids hammering the backend from public/login pages.
 */
function PrivateAppListeners() {
  useDesktopNotifications();
  usePushNotifications();
  usePreWarmCache();
  useAppResume();
  return null;
}

/**
 * NotificationListeners — mounts lightweight listeners globally, but only mounts
 * heavy internal listeners after auth on non-public routes.
 */
function NotificationListeners() {
  const location = useLocation();
  const { user } = useAuth();

  useAndroidBackButton();

  const publicPrefixes = [
    "/login",
    "/reset-password",
    "/form/",
    "/photos/",
    "/portal/",
    "/refer/",
    "/presentation/",
    "/agreement/",
    "/certificate/",
    "/invoice/",
    "/intake/",
    "/cart/",
    "/q/",
  ];

  const isPublicRoute = publicPrefixes.some((prefix) =>
    location.pathname === prefix || location.pathname.startsWith(prefix)
  );

  if (isPublicRoute || !user) {
    return null;
  }

  return <PrivateAppListeners />;
}

/**
 * Compact softphone-only view for the Electron pop-out window.
 * Rendered when the URL has ?view=softphone.
 *
 * Now a UNIFIED window combining: Dialer + Live Call (caller info + transcript)
 * + Quick Actions, replacing the previous separate "CSR Intake" popup.
 */
function SoftphoneOnlyView() {
  const softphone = useSoftphoneContext();
  const { startCallSession } = useCopilotPanel();
  const phoneNumber = softphone.callerInfo?.number ?? null;
  const callerName = softphone.callerInfo?.name;
  const prevStatusRef = useRef<string>("idle");

  // Active-call state
  const isOnCall = softphone.status === "on-call";
  const isRinging = softphone.status === "ringing";
  const isConnecting = softphone.status === "connecting";
  const isCallActive = isOnCall || isRinging || isConnecting;

  // Caller customer record (for action cards)
  const { data: customer } = useCallerLookup(phoneNumber);
  const resolvedName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    : callerName;

  // Live transcript driven by the active Twilio call object (this window
  // owns the Twilio Device, so the in-process call stream is available).
  const { liveTranscript, transcriptEndRef, liveTranscriptionEnabled } =
    useLiveTranscript(softphone.activeCall, isOnCall);

  // Tabbed UI state — auto-switch when call lifecycle changes
  const [activeTab, setActiveTab] = useState<"phone" | "live" | "actions">("phone");
  useEffect(() => {
    if (isCallActive) {
      setActiveTab("live");
    } else if (prevStatusRef.current === "on-call") {
      // Just hung up — bring user back to dialer
      setActiveTab("phone");
    }
    prevStatusRef.current = softphone.status;
  }, [softphone.status, isCallActive]);

  // Auto-trigger copilot when a call connects
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== "on-call" && softphone.status === "on-call" && phoneNumber) {
      startCallSession(phoneNumber, callerName);
    }
  }, [softphone.status, phoneNumber, callerName, startCallSession]);

  // Auto-switch to Phone tab when a dial-number arrives via IPC
  useEffect(() => {
    if (softphone.pendingDialNumber) {
      setActiveTab("phone");
    }
  }, [softphone.pendingDialNumber]);

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="grid grid-cols-3 mx-2 mt-2 shrink-0">
          <TabsTrigger value="phone" className="text-xs gap-1.5">
            <PhoneIcon className="h-3.5 w-3.5" />
            Phone
          </TabsTrigger>
          <TabsTrigger value="live" className="text-xs gap-1.5 relative">
            <Headphones className="h-3.5 w-3.5" />
            Live Call
            {isCallActive && (
              <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                isRinging ? "bg-[hsl(var(--success))] animate-pulse" : "bg-[hsl(var(--success))]"
              }`} />
            )}
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Actions
          </TabsTrigger>
        </TabsList>

        {/* PHONE — dialer + answer/decline + in-call controls */}
        <TabsContent value="phone" className="flex-1 min-h-0 m-0 flex overflow-hidden">
          <SoftphoneStrip alwaysExpanded />
        </TabsContent>

        {/* LIVE CALL — caller info card + live transcript + compact controls */}
        <TabsContent value="live" className="flex-1 min-h-0 m-0 flex flex-col">
          {/* Caller identity / history */}
          <div className="shrink-0 max-h-[55%] overflow-hidden flex flex-col border-b">
            <CallerInfoCenter phoneNumber={phoneNumber} callerName={resolvedName} />
          </div>

          {/* Live transcript */}
          <div className="flex-1 min-h-0 flex flex-col">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-4 pt-2 pb-1 shrink-0">
              {isOnCall ? "Live Transcript" : isCallActive ? "Connecting…" : "Last Call Transcript"}
            </p>
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 pb-3 space-y-0.5 text-xs text-foreground">
                {liveTranscript.length > 0 ? (
                  <>
                    {liveTranscript.map((t, i) => (
                      <p key={i} className={t.is_final ? "opacity-100" : "opacity-50 italic"}>
                        {t.text}
                      </p>
                    ))}
                    <div ref={transcriptEndRef} />
                  </>
                ) : (
                  <p className="text-muted-foreground/60 italic text-[11px] py-6 text-center">
                    {!liveTranscriptionEnabled
                      ? "Live transcription disabled"
                      : isOnCall
                        ? "Waiting for speech…"
                        : isCallActive
                          ? "Waiting for call to connect…"
                          : "No active call"}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ACTIONS — JARVIS booking intents + Quick Actions fallback */}
        <TabsContent value="actions" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <div className="px-3 pb-4 pt-2">
            <IntakeActionCards
              phoneNumber={phoneNumber || undefined}
              callerName={resolvedName}
              customerId={customer?.id}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Redirects tech users to /tech, everyone else sees Dashboard */
function RoleAwareHome() {
  const location = useLocation();
  const { role, loading } = useEffectiveAuth();
  const allowedTabs = useEmployeeTabAccess();
  if (loading) return null;
  if (allowedTabs) {
    const targetRoute = getFirstAllowedRoute(allowedTabs, role);
    if (targetRoute !== location.pathname) {
      return <Navigate to={targetRoute} replace />;
    }
  }
  if (role === "tech" || role === "supervisor") return <Navigate to="/tech" replace />;
  return <ProtectedRoute><Dashboard /></ProtectedRoute>;
}

/** Gentle fade-in on route change — no exit animation to avoid flicker on heavy pages */
function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div
      key={location.pathname}
      style={{
        animation: "page-enter 150ms ease-out both",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Post-Call Actions window — opened by Electron IPC when a call becomes active.
 * Shows CallerInfoCenter + JARVIS ActionItemCards instead of the old CSR Intake form.
 */
function PostCallActionsView() {
  const [searchParams] = useSearchParams();
  const phoneFromUrl = searchParams.get("phone") || "";
  const nameFromUrl = searchParams.get("name") || "";
  const sidFromUrl = searchParams.get("sid") || "";

  // These can be updated by IPC after the popup opens (Twilio assigns the
  // CallSid slightly after the call starts, so the URL may not have it).
  const [phone, setPhone] = useState(phoneFromUrl);
  const [paramName, setParamName] = useState<string | undefined>(nameFromUrl || undefined);
  const [callSid, setCallSid] = useState<string | null>(sidFromUrl || null);
  // The phone window flips this off via `csr-call-ended` IPC.
  const [isLive, setIsLive] = useState(true);

  // Resolve caller from DB so CsrQuickActions gets the real name
  const { data: customer } = useCallerLookup(phone || null);
  const resolvedName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ")
    : paramName;

  // Listen for context updates from the phone window (relayed by Electron main).
  useEffect(() => {
    const unsubUpdate = onMainMessage("csr-update", (_event: any, payload: any) => {
      if (payload?.phone) setPhone(payload.phone);
      if (payload?.callerName) setParamName(payload.callerName);
      if (payload?.callSid) {
        setCallSid(payload.callSid);
        setIsLive(true); // new SID = new active call
      }
    });
    const unsubEnded = onMainMessage("csr-call-ended", (_event: any, _payload: any) => {
      setIsLive(false);
    });
    return () => {
      unsubUpdate();
      unsubEnded();
    };
  }, []);

  // SID-driven live transcription (works across Electron windows)
  const { liveTranscript, transcriptEndRef } = useLiveTranscriptBySid(callSid, isLive);

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      {/* Caller identity — compact header */}
      <CallerInfoCenter phoneNumber={phone || null} callerName={resolvedName} />

      {/* Live transcript — primary section, ~60% height */}
      <div className="flex-1 min-h-0 flex flex-col border-b">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-4 pt-2 pb-1 shrink-0">
          {isLive ? "Live Transcript" : "Last Call Transcript"}
        </p>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 pb-3 space-y-0.5 text-xs text-foreground">
            {liveTranscript.length > 0 ? (
              <>
                {liveTranscript.map((t, i) => (
                  <p key={i} className={t.is_final ? "opacity-100" : "opacity-50 italic"}>
                    {t.text}
                  </p>
                ))}
                <div ref={transcriptEndRef} />
              </>
            ) : (
              <p className="text-muted-foreground/60 italic text-[11px] py-8 text-center">
                {isLive
                  ? callSid
                    ? "Waiting for speech…"
                    : "Waiting for call to connect…"
                  : "No transcript available"}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Dynamic action cards + static fallbacks */}
      <ScrollArea className="max-h-[40%] shrink-0 pb-2">
        <div className="px-4 pb-4">
          <IntakeActionCards phoneNumber={phone} callerName={resolvedName} customerId={customer?.id} />
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Detects ?view=softphone and renders the compact phone UI instead of the full app.
 */
function AppRouter() {
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get("view");

  if (viewParam === "softphone") {
    return (
      <>
        <NotificationListeners />
        <SoftphoneOnlyView />
      </>
    );
  }

  if (viewParam === "csr-intake") {
    return <PostCallActionsView />;
  }

  return (
    <>
      <NotificationListeners />
      <PageTransition>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/form/:token" element={<TechFormPublic />} />
        
        <Route path="/photos/:jobId" element={<JobPhotos />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal/dashboard" element={<PortalDashboard />} />
        <Route path="/refer/:code" element={<ReferralPublic />} />
        <Route path="/presentation/:token" element={<CustomerPresentation />} />
        <Route path="/agreement/:token" element={<AgreementPresentation />} />
        <Route path="/certificate/:token" element={<CertificateView />} />
        <Route path="/invoice/:token" element={<InvoicePublic />} />
        <Route path="/intake/:token" element={<CustomerIntakePublic />} />
        <Route path="/cart/:token" element={<CustomerCart />} />
        <Route path="/q/:token" element={<QuickQuoteCustomerView />} />

        {/* Protected routes */}
        <Route path="/" element={<RoleAwareHome />} />
        <Route path="/tech" element={<ProtectedRoute><TechMySchedule /></ProtectedRoute>} />
        
        <Route path="/tech/jobs/:id" element={<ProtectedRoute><TechJobDetail /></ProtectedRoute>} />
        <Route path="/tech/customers/:id" element={<ProtectedRoute><TechCustomerDetail /></ProtectedRoute>} />
        <Route path="/copilot" element={<ProtectedRoute><CopilotPage /></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
        <Route path="/email" element={<Navigate to="/inbox" replace />} />
        <Route path="/sms" element={<SmsRedirectComponent />} />
        <Route path="/phone" element={<PhoneRedirectComponent />} />
        <Route path="/calls" element={<Navigate to="/inbox?section=calls" replace />} />
        
        <Route path="/jobs" element={<Navigate to="/" replace />} />
        <Route path="/jobs/backlog" element={<ProtectedRoute><UnscheduledJobs /></ProtectedRoute>} />
        <Route path="/jobs/follow-up" element={<Navigate to="/jobs/backlog" replace />} />
        <Route path="/jobs/queue" element={<Navigate to="/jobs/backlog" replace />} />
        <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
        <Route path="/parts" element={<Navigate to="/catalog" replace />} />
        <Route path="/vendors" element={<ProtectedRoute><Vendors /></ProtectedRoute>} />
        <Route path="/vendors/:id" element={<ProtectedRoute><VendorDetail /></ProtectedRoute>} />
        <Route path="/locations" element={<Navigate to="/vendors" replace />} />
        <Route path="/estimates/:id" element={<ProtectedRoute><EstimateDetail /></ProtectedRoute>} />
        <Route path="/settings" element={<Navigate to="/admin?section=company" replace />} />
        <Route path="/agent-training" element={<ProtectedRoute><AgentTraining /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
        <Route path="/sales-presentations" element={<Navigate to="/catalog" replace />} />
        <Route path="/brochure" element={<Navigate to="/catalog" replace />} />
        <Route path="/agreements" element={<ProtectedRoute><Agreements /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/admin/hub" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/email-health" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/vendor-email-mapping" element={<Navigate to="/vendors" replace />} />
        <Route path="/system-log" element={<ProtectedRoute><SystemLog /></ProtectedRoute>} />
        
        <Route path="/portal/preview" element={<Navigate to="/admin?section=tools" replace />} />
        
        <Route path="/ivr-builder" element={<ProtectedRoute><IvrBuilder /></ProtectedRoute>} />
        <Route path="/admin/call-routing" element={<ProtectedRoute><CallRoutingSettings /></ProtectedRoute>} />
        <Route path="/sequence-builder" element={<Navigate to="/agent-training?section=output" replace />} />
        <Route path="/customer-journey" element={<Navigate to="/copilot" replace />} />
        <Route path="/payment-flow" element={<Navigate to="/payments" replace />} />
        <Route path="/agent-pipeline" element={<ProtectedRoute><AgentPipeline /></ProtectedRoute>} />
        <Route path="/agent-network" element={<ProtectedRoute><AgentNetwork /></ProtectedRoute>} />
        <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/repair-catalog" element={<Navigate to="/catalog" replace />} />
        <Route path="/shopping-cart" element={<Navigate to="/catalog" replace />} />
        <Route path="/catalog" element={<ProtectedRoute><Catalog /></ProtectedRoute>} />
        <Route path="/quick-quote" element={<ProtectedRoute><QuickQuote /></ProtectedRoute>} />
        <Route path="/pay" element={<ProtectedRoute><PayPage /></ProtectedRoute>} />

        {/* Redirects */}
        
        <Route path="/estimates" element={<Navigate to="/" replace />} />
        <Route path="/paysheet" element={<Navigate to="/pay" replace />} />
        <Route path="/reports" element={<Navigate to="/admin?section=reports" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </PageTransition>
    </>
  );
}

/**
 * SmsLogGate — Mounts SmsLogProvider only for authenticated users on
 * non-public routes. This keeps the SMS realtime channel + conversation
 * cache warm globally so the SMS feed appears instantly when navigated to,
 * regardless of where the user was when an inbound message arrived.
 */
function SmsLogGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const publicPrefixes = [
    "/login", "/reset-password", "/form/", "/photos/", "/portal/",
    "/refer/", "/presentation/", "/agreement/", "/certificate/",
    "/invoice/", "/intake/", "/cart/", "/q/",
  ];
  const isPublicRoute = publicPrefixes.some((p) =>
    location.pathname === p || location.pathname.startsWith(p)
  );
  if (!user || isPublicRoute) return <>{children}</>;
  return <SmsLogProvider>{children}</SmsLogProvider>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="app-theme" attribute="class" disableTransitionOnChange>
        <TooltipProvider>
          <ConfirmDialogProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <CopilotPanelProvider>
                <ViewAsProvider>
                  <SoftphoneProvider>
                    <AnnouncerProvider>
                      <SmsLogGate>
                        <AppRouter />
                        <AdminViewAsBar />
                        <BookingIntentAlert />
                      </SmsLogGate>
                    </AnnouncerProvider>
                  </SoftphoneProvider>
                </ViewAsProvider>
              </CopilotPanelProvider>
            </BrowserRouter>
          </ConfirmDialogProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
