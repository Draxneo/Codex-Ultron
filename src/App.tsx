import { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployeeTabAccess, getFirstAllowedRoute } from "@/hooks/useEmployeeTabAccess";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { onMainMessage } from "@/lib/electron";
import { PhoneOnlySoftphone } from "./components/PhoneOnlySoftphone";
import { CallerInfoCenter } from "./components/softphone/CallerInfoCenter";
import { IntakeActionCards } from "./components/softphone/IntakeActionCards";
import { ScrollArea } from "./components/ui/scroll-area";

import TechMySchedule from "./pages/TechMySchedule";
import TechJobDetail from "./pages/TechJobDetail";
import TechJobCart from "./pages/TechJobCart";
import TechCustomerDetail from "./pages/TechCustomerDetail";
import Jobs from "./pages/Jobs";
import ScheduleV2 from "./pages/ScheduleV2";
import OperationsDeskV2 from "./pages/OperationsDeskV2";
import JobDetail from "./pages/JobDetail";
import RecordDocument from "./pages/RecordDocument";


import CopilotPage from "./pages/CopilotPage";
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
import Reports from "./pages/Reports";
import SmsPage from "./pages/SmsPage";
import CallsPage from "./pages/CallsPage";
import TeamCommunications from "./pages/TeamCommunications";
import PhoneConsole from "./pages/PhoneConsole";
import Admin from "./pages/Admin";
import SystemLog from "./pages/SystemLog";
import ReferralPublic from "./pages/ReferralPublic";
import CertificateView from "./pages/CertificateView";
import InvoicePublic from "./pages/InvoicePublic";
import CustomerCart from "./pages/CustomerCart";
import EstimatePresentationPublic from "./pages/EstimatePresentationPublic";

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

import UnscheduledJobs from "./pages/UnscheduledJobs";
import CustomerIntakePublic from "./pages/CustomerIntakePublic";
import NotFound from "./pages/NotFound";

import IvrBuilder from "./pages/IvrBuilder";
import CallRoutingSettings from "./pages/CallRoutingSettings";
import Leads from "./pages/Leads";
import RepairCatalog from "./pages/RepairCatalog";
import Catalog from "./pages/Catalog";
import QuickQuote from "./pages/QuickQuote";
import QuoteHeadquarters from "./pages/QuoteHeadquarters";
import QuickQuoteCustomerView from "./pages/QuickQuoteCustomerView";
import { SoftphoneProvider } from "./components/SoftphoneProvider";
import { ViewAsProvider } from "./contexts/ViewAsContext";
import { AdminViewAsBar } from "./components/AdminViewAsBar";
import { SmsPanel } from "./components/SmsPanel";
import { useUnreadSmsCount } from "./hooks/useUnreadSmsCount";
import { PHONE_CONSOLE_OPEN_EVENT, type PhoneConsoleOpenDetail } from "@/lib/phoneConsoleBridge";

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
    "/refer/",
    "/certificate/",
    "/invoice/",
    "/presentation/",
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

function SoftphoneOnlyView() {
  const [searchParams] = useSearchParams();
  const bootDialNumber = searchParams.get("dial") || "";
  const bootJobId = searchParams.get("jobId") || undefined;
  const bootCustomerId = searchParams.get("customerId") || undefined;

  return (
    <PhoneOnlySoftphone
      initialNumber={bootDialNumber}
      contactName={searchParams.get("name") || undefined}
      jobId={bootJobId}
      customerId={bootCustomerId}
    />
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

function PhoneConsolePopup() {
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<PhoneConsoleOpenDetail>;
      event.preventDefault();
      setPhoneUrl(customEvent.detail.url);
    };

    window.addEventListener(PHONE_CONSOLE_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(PHONE_CONSOLE_OPEN_EVENT, handleOpen);
  }, []);

  return (
    <Dialog open={!!phoneUrl} onOpenChange={(open) => !open && setPhoneUrl(null)}>
      <DialogContent className="h-[720px] max-h-[92vh] w-[420px] max-w-[95vw] gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Phone</DialogTitle>
          <DialogDescription>Softphone dialer</DialogDescription>
        </DialogHeader>
        {phoneUrl && (
          <iframe
            key={phoneUrl}
            title="Phone"
            src={phoneUrl}
            className="h-full w-full border-0 bg-background"
            allow="microphone; autoplay"
          />
        )}
      </DialogContent>
    </Dialog>
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
      <PageTransition>
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
        <Route path="/cart/:token" element={<CustomerCart />} />
        <Route path="/q/:token" element={<QuickQuoteCustomerView />} />

        {/* Protected routes */}
        <Route path="/" element={<RoleAwareHome />} />
        <Route path="/intake" element={<ProtectedRoute><OperationsDeskV2 /></ProtectedRoute>} />
        <Route path="/dispatch" element={<ProtectedRoute><ScheduleV2 /></ProtectedRoute>} />
        <Route path="/operations-v2" element={<Navigate to="/intake" replace />} />
        <Route path="/dispatch-v2" element={<Navigate to="/dispatch" replace />} />
        <Route path="/schedule-v2" element={<Navigate to="/dispatch" replace />} />
        <Route path="/tech" element={<ProtectedRoute><TechMySchedule /></ProtectedRoute>} />
        
        <Route path="/tech/jobs/:id" element={<ProtectedRoute><TechJobDetail /></ProtectedRoute>} />
        <Route path="/tech/jobs/:id/cart" element={<ProtectedRoute><TechJobCart /></ProtectedRoute>} />
        <Route path="/tech/customers/:id" element={<ProtectedRoute><TechCustomerDetail /></ProtectedRoute>} />
        <Route path="/copilot" element={<ProtectedRoute><CopilotPage /></ProtectedRoute>} />
        <Route path="/inbox" element={<ProtectedRoute><InboxRedirectComponent /></ProtectedRoute>} />
        <Route path="/team" element={<ProtectedRoute><TeamCommunications /></ProtectedRoute>} />
        <Route path="/phone-console" element={<ProtectedRoute><PhoneConsole /></ProtectedRoute>} />
        <Route path="/email" element={<Navigate to="/sms" replace />} />
        <Route path="/sms" element={<ProtectedRoute><SmsPage /></ProtectedRoute>} />
        <Route path="/phone" element={<ProtectedRoute><CallsPage /></ProtectedRoute>} />
        <Route path="/calls" element={<CallsRedirectComponent />} />
        
        <Route path="/jobs" element={<Navigate to="/" replace />} />
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
        <Route path="/pay" element={<Navigate to="/admin?section=employees&employeeTab=pay" replace />} />

        {/* Redirects */}
        
        <Route path="/estimates" element={<Navigate to="/" replace />} />
        <Route path="/paysheet" element={<Navigate to="/admin?section=employees&employeeTab=pay" replace />} />

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
    "/login", "/reset-password", "/form/", "/photos/",
    "/refer/", "/certificate/",
    "/invoice/", "/presentation/", "/intake/", "/cart/", "/q/",
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
