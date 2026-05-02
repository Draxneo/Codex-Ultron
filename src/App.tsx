import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployeeTabAccess, getFirstAllowedRoute } from "@/hooks/useEmployeeTabAccess";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
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
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useLiveTranscriptBySid } from "@/hooks/useLiveTranscript";
import { isElectronMain, onMainMessage } from "@/lib/electron";
import { SmsComposerPopup } from "./components/SmsComposerPopup";

/** Redirect legacy /inbox sections to their split communication routes. */
function InboxRedirectComponent() {
  const [sp] = useSearchParams();
  const section = sp.get("section");
  const params = new URLSearchParams(sp);
  params.delete("section");
  const targetPath = section === "calls" || section === "voicemail" ? "/phone" : "/sms";
  if (section === "voicemail") params.set("tab", "voicemail");
  const query = params.toString();
  return <Navigate to={`${targetPath}${query ? `?${query}` : ""}`} replace />;
}

function CallsRedirectComponent() {
  const location = useLocation();
  return <Navigate to={`/phone${location.search}`} replace />;
}

import { SoftphoneProvider } from "./components/SoftphoneProvider";
import { ViewAsProvider } from "./contexts/ViewAsContext";
import { AdminViewAsBar } from "./components/AdminViewAsBar";
import { PHONE_CONSOLE_OPEN_EVENT, type PhoneConsoleOpenDetail } from "@/lib/phoneConsoleBridge";

const TechMySchedule = lazy(() => import("./pages/TechMySchedule"));
const TechTeamSchedule = lazy(() => import("./pages/TechTeamSchedule"));
const TechSms = lazy(() => import("./pages/TechSms"));
const TechJobDetail = lazy(() => import("./pages/TechJobDetail"));
const TechJobCart = lazy(() => import("./pages/TechJobCart"));
const TechCustomers = lazy(() => import("./pages/TechCustomers"));
const TechCustomerDetail = lazy(() => import("./pages/TechCustomerDetail"));
const TechPay = lazy(() => import("./pages/TechPay"));
const ScheduleV2 = lazy(() => import("./pages/ScheduleV2"));
const DispatchCalendar = lazy(() => import("./pages/DispatchCalendar"));
const NowHQ = lazy(() => import("./pages/NowHQ"));
const WorkflowMaps = lazy(() => import("./pages/WorkflowMaps"));
const OperationsDeskV2 = lazy(() => import("./pages/OperationsDeskV2"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const RecordDocument = lazy(() => import("./pages/RecordDocument"));
const CopilotPage = lazy(() => import("./pages/CopilotPage"));
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TechFormPublic = lazy(() => import("./pages/TechFormPublic"));
const EstimateDetail = lazy(() => import("./pages/EstimateDetail"));
const JobPhotos = lazy(() => import("./pages/JobPhotos"));
const AgentTraining = lazy(() => import("./pages/AgentTraining"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Agreements = lazy(() => import("./pages/Agreements"));
const Payments = lazy(() => import("./pages/Payments"));
const Reports = lazy(() => import("./pages/Reports"));
const SmsPage = lazy(() => import("./pages/SmsPage"));
const CallsPage = lazy(() => import("./pages/CallsPage"));
const CommunicationsOnly = lazy(() => import("./pages/CommunicationsOnly"));
const TeamCommunications = lazy(() => import("./pages/TeamCommunications"));
const PhoneConsole = lazy(() => import("./pages/PhoneConsole"));
const PhoneOnlySoftphone = lazy(() =>
  import("./components/PhoneOnlySoftphone").then((module) => ({ default: module.PhoneOnlySoftphone }))
);
const CallerInfoCenter = lazy(() =>
  import("./components/softphone/CallerInfoCenter").then((module) => ({ default: module.CallerInfoCenter }))
);
const IntakeActionCards = lazy(() =>
  import("./components/softphone/IntakeActionCards").then((module) => ({ default: module.IntakeActionCards }))
);
const BookingIntentAlert = lazy(() =>
  import("./components/BookingIntentAlert").then((module) => ({ default: module.BookingIntentAlert }))
);
const Admin = lazy(() => import("./pages/Admin"));
const SystemLog = lazy(() => import("./pages/SystemLog"));
const ReferralPublic = lazy(() => import("./pages/ReferralPublic"));
const CertificateView = lazy(() => import("./pages/CertificateView"));
const InvoicePublic = lazy(() => import("./pages/InvoicePublic"));
const CustomerCart = lazy(() => import("./pages/CustomerCart"));
const EstimatePresentationPublic = lazy(() => import("./pages/EstimatePresentationPublic"));
const UnscheduledJobs = lazy(() => import("./pages/UnscheduledJobs"));
const CustomerIntakePublic = lazy(() => import("./pages/CustomerIntakePublic"));
const NotFound = lazy(() => import("./pages/NotFound"));
const IvrBuilder = lazy(() => import("./pages/IvrBuilder"));
const CallRoutingSettings = lazy(() => import("./pages/CallRoutingSettings"));
const Leads = lazy(() => import("./pages/Leads"));
const Catalog = lazy(() => import("./pages/Catalog"));
const QuickQuote = lazy(() => import("./pages/QuickQuote"));
const QuoteHeadquarters = lazy(() => import("./pages/QuoteHeadquarters"));
const QuickQuoteCustomerView = lazy(() => import("./pages/QuickQuoteCustomerView"));
const SubcontractorJobPublic = lazy(() => import("./pages/SubcontractorJobPublic"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: 1,
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

function RouteLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
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
    "/refer/",
    "/certificate/",
    "/invoice/",
    "/presentation/",
    "/intake/",
    "/subcontractor/",
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

function SoftphoneOnlyView() {
  const [searchParams] = useSearchParams();
  const bootDialNumber = searchParams.get("dial") || "";
  const bootJobId = searchParams.get("jobId") || undefined;
  const bootCustomerId = searchParams.get("customerId") || undefined;

  return (
    <Suspense fallback={<RouteLoading />}>
      <PhoneOnlySoftphone
        initialNumber={bootDialNumber}
        contactName={searchParams.get("name") || undefined}
        jobId={bootJobId}
        customerId={bootCustomerId}
      />
    </Suspense>
  );
}

/** Redirects tech users to /tech, everyone else to Dispatch HQ. */
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
  return <Navigate to="/dispatch" replace />;
}

/** Top nav opens Quote HQ. Existing quote-building links with query context still open the builder. */
function QuoteRoute() {
  const [searchParams] = useSearchParams();
  const builderParams = ["estimate_id", "job_id", "customer_name", "customer_phone", "customer_email"];
  const shouldOpenBuilder = builderParams.some((key) => Boolean(searchParams.get(key)));
  return shouldOpenBuilder ? <QuickQuote /> : <QuoteHeadquarters />;
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
 * CSR call window - opened by Electron IPC when a call becomes active.
 * Keeps the popup to caller context, live transcript, and handoff links into Intake/Now.
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
      <Suspense fallback={<div className="h-24 shrink-0 border-b bg-card" />}>
        <CallerInfoCenter phoneNumber={phone || null} callerName={resolvedName} />
      </Suspense>

      {/* Live transcript — primary section, ~60% height */}
      <div className="flex-1 min-h-0 flex flex-col border-b">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-4 pt-2 pb-1 shrink-0">
          {isLive ? "Live Transcript" : "Last Call Transcript"}
        </p>
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        </div>
      </div>

      {/* Intake/Now handoff links only; booking stays in Intake/Now. */}
      <div className="max-h-[40%] shrink-0 overflow-y-auto pb-2">
        <div className="px-4 pb-4">
          <Suspense fallback={<div className="rounded-lg border p-3 text-xs text-muted-foreground">Loading call actions...</div>}>
            <IntakeActionCards
              phoneNumber={phone}
              callerName={resolvedName}
              customerId={customer?.id}
              callSid={callSid}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function PhoneConsolePopup() {
  const isDesktopMainWindow = isElectronMain();
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 24, y: 88 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const clampPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const panelWidth = Math.min(420, window.innerWidth - 24);
    const panelHeight = Math.min(720, window.innerHeight - 24);
    return {
      x: Math.max(12, Math.min(x, window.innerWidth - panelWidth - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - panelHeight - 12)),
    };
  }, []);

  useEffect(() => {
    if (isDesktopMainWindow) return;

    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<PhoneConsoleOpenDetail>;
      event.preventDefault();
      setPhoneUrl((current) => current ?? customEvent.detail.url);
      setPosition((current) => clampPosition(current.x, current.y));
    };

    window.addEventListener(PHONE_CONSOLE_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(PHONE_CONSOLE_OPEN_EVENT, handleOpen);
  }, [clampPosition, isDesktopMainWindow]);

  useEffect(() => {
    if (isDesktopMainWindow) return;

    const handleResize = () => setPosition((current) => clampPosition(current.x, current.y));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition, isDesktopMainWindow]);

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [position.x, position.y]);

  const moveDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = clampPosition(
      event.clientX - dragOffsetRef.current.x,
      event.clientY - dragOffsetRef.current.y,
    );
    setPosition(next);
  }, [clampPosition]);

  const stopDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already be released if the user drags fast outside the panel.
    }
  }, []);

  if (isDesktopMainWindow || !phoneUrl) return null;

  return (
    <div
      className="fixed z-[70] overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        width: "min(420px, calc(100vw - 24px))",
        height: "min(720px, calc(100vh - 24px))",
      }}
    >
      <div
        className="flex h-10 cursor-move select-none items-center justify-between border-b bg-card px-3 text-sm font-semibold text-foreground"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span>Phone</span>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setPhoneUrl(null)}
          aria-label="Close phone"
        >
          ×
        </button>
      </div>
      <iframe
        title="Phone"
        src={phoneUrl}
        className="h-[calc(100%-2.5rem)] w-full border-0 bg-background"
        allow="microphone; autoplay"
      />
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
      <PhoneConsolePopup />
      <SmsComposerPopup />
      <PageTransition>
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/form/:token" element={<TechFormPublic />} />
        
        <Route path="/photos/:jobId" element={<JobPhotos />} />
        <Route path="/refer/:code" element={<ReferralPublic />} />
        <Route path="/certificate/:token" element={<CertificateView />} />
        <Route path="/invoice/:token" element={<InvoicePublic />} />
        <Route path="/presentation/:token" element={<EstimatePresentationPublic />} />
        <Route path="/intake/:token" element={<CustomerIntakePublic />} />
        <Route path="/subcontractor/:token" element={<SubcontractorJobPublic />} />
        <Route path="/cart/:token" element={<CustomerCart />} />
        <Route path="/q/:token" element={<QuickQuoteCustomerView />} />

        {/* Protected routes */}
        <Route path="/" element={<RoleAwareHome />} />
        <Route path="/intake" element={<ProtectedRoute><OperationsDeskV2 /></ProtectedRoute>} />
        <Route path="/now" element={<ProtectedRoute><NowHQ /></ProtectedRoute>} />
        <Route path="/workflows" element={<ProtectedRoute><WorkflowMaps /></ProtectedRoute>} />
        <Route path="/dispatch" element={<ProtectedRoute><ScheduleV2 /></ProtectedRoute>} />
        <Route path="/dispatch/calendar" element={<ProtectedRoute><DispatchCalendar /></ProtectedRoute>} />
        <Route path="/operations-v2" element={<Navigate to="/intake" replace />} />
        <Route path="/dispatch-v2" element={<Navigate to="/dispatch" replace />} />
        <Route path="/schedule-v2" element={<Navigate to="/dispatch" replace />} />
        <Route path="/tech" element={<ProtectedRoute><TechMySchedule /></ProtectedRoute>} />
        <Route path="/tech/team-schedule" element={<ProtectedRoute><TechTeamSchedule /></ProtectedRoute>} />
        <Route path="/tech/sms" element={<ProtectedRoute><TechSms /></ProtectedRoute>} />
        
        <Route path="/tech/jobs/:id" element={<ProtectedRoute><TechJobDetail /></ProtectedRoute>} />
        <Route path="/tech/jobs/:id/cart" element={<ProtectedRoute><TechJobCart /></ProtectedRoute>} />
        <Route path="/tech/customers" element={<ProtectedRoute><TechCustomers /></ProtectedRoute>} />
        <Route path="/tech/customers/:id" element={<ProtectedRoute><TechCustomerDetail /></ProtectedRoute>} />
        <Route path="/copilot" element={<ProtectedRoute><CopilotPage /></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><InboxRedirectComponent /></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute><TeamCommunications /></ProtectedRoute>} />
        <Route path="/phone-console" element={<ProtectedRoute><PhoneConsole /></ProtectedRoute>} />
        <Route path="/email" element={<Navigate to="/sms" replace />} />
        <Route path="/communications" element={<ProtectedRoute><CommunicationsOnly /></ProtectedRoute>} />
        <Route path="/sms" element={<ProtectedRoute><SmsPage /></ProtectedRoute>} />
        <Route path="/phone" element={<ProtectedRoute><CallsPage /></ProtectedRoute>} />
        <Route path="/calls" element={<CallsRedirectComponent />} />
        
        <Route path="/jobs" element={<Navigate to="/dispatch" replace />} />
        <Route path="/jobs/backlog" element={<ProtectedRoute><UnscheduledJobs /></ProtectedRoute>} />
        <Route path="/jobs/follow-up" element={<Navigate to="/jobs/backlog" replace />} />
        <Route path="/jobs/queue" element={<Navigate to="/jobs/backlog" replace />} />
        <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
        <Route path="/records/:type/:id" element={<ProtectedRoute><RecordDocument /></ProtectedRoute>} />
        <Route path="/parts" element={<Navigate to="/catalog" replace />} />
        <Route path="/vendors" element={<Navigate to="/catalog" replace />} />
        <Route path="/vendors/:id" element={<Navigate to="/catalog" replace />} />
        <Route path="/locations" element={<Navigate to="/catalog" replace />} />
        <Route path="/estimates/:id" element={<ProtectedRoute><EstimateDetail /></ProtectedRoute>} />
        <Route path="/settings" element={<Navigate to="/admin?section=company" replace />} />
        <Route path="/agent-training" element={<ProtectedRoute><AgentTraining /></ProtectedRoute>} />
        <Route path="/jarvis-core" element={<Navigate to="/agent-training?section=core" replace />} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
        <Route path="/sales-presentations" element={<Navigate to="/catalog" replace />} />
        <Route path="/brochure" element={<Navigate to="/catalog" replace />} />
        <Route path="/agreements" element={<ProtectedRoute><Agreements /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/admin/hub" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/email-health" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/vendor-email-mapping" element={<Navigate to="/admin" replace />} />
        <Route path="/system-log" element={<ProtectedRoute><SystemLog /></ProtectedRoute>} />
        
        <Route path="/portal/preview" element={<Navigate to="/admin" replace />} />
        
        <Route path="/ivr-builder" element={<ProtectedRoute><IvrBuilder /></ProtectedRoute>} />
        <Route path="/admin/call-routing" element={<ProtectedRoute><CallRoutingSettings /></ProtectedRoute>} />
        <Route path="/sequence-builder" element={<Navigate to="/copilot" replace />} />
        <Route path="/customer-journey" element={<Navigate to="/copilot" replace />} />
        <Route path="/payment-flow" element={<Navigate to="/payments" replace />} />
        <Route path="/agent-pipeline" element={<Navigate to="/copilot" replace />} />
        <Route path="/agent-network" element={<Navigate to="/copilot" replace />} />
        <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/repair-catalog" element={<Navigate to="/catalog" replace />} />
        <Route path="/shopping-cart" element={<Navigate to="/catalog" replace />} />
        <Route path="/catalog" element={<ProtectedRoute><Catalog /></ProtectedRoute>} />
        <Route path="/quick-quote" element={<ProtectedRoute><QuoteRoute /></ProtectedRoute>} />
        <Route path="/quote-builder" element={<ProtectedRoute><QuickQuote /></ProtectedRoute>} />
        <Route path="/pay" element={<ProtectedRoute><TechPay /></ProtectedRoute>} />

        {/* Redirects */}
        
        <Route path="/estimates" element={<Navigate to="/quick-quote" replace />} />
        <Route path="/paysheet" element={<Navigate to="/admin?section=employees&employeeTab=pay" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
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
    "/login", "/reset-password", "/form/", "/photos/",
    "/refer/", "/certificate/",
    "/invoice/", "/presentation/", "/intake/", "/subcontractor/", "/cart/", "/q/",
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
                        <Suspense fallback={null}>
                          <BookingIntentAlert />
                        </Suspense>
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
