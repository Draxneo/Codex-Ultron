/**
 * ProtectedRoute.tsx — Auth guard + global layout wrapper
 * 
 * Every authenticated page is wrapped by this component. It handles:
 * 
 * 1. AUTH GUARD: Redirects to /login if no user is logged in
 * 2. GLOBAL LAYOUT: Provides the flex container with:
 *    - Main content area (scrollable, takes remaining width)
 *    - Copilot side panel (30vw, toggleable, slides from right)
 *    - Navy strip on far right with Copilot + Phone toggle buttons
 * 3. CALL AUTO-OPEN: Automatically opens Copilot panel on incoming calls
 * 
 * LAYOUT STRUCTURE:
 * ┌─────────────────────────┬──────────────┬────┐
 * │                         │              │    │
 * │   Main Content Area     │  Copilot     │Navy│
 * │   (scrollable)          │  Side Panel  │Strip│
 * │   = {children}          │  (optional)  │ w-12│
 * │                         │              │    │
 * └─────────────────────────┴──────────────┴────┘
 * 
 * IMPORTANT: Pages should NOT add their own right margin or nav strip.
 * They fill the content area naturally via this wrapper.
 */

import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess, routeToTabKey, getFirstAllowedRoute } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Bot, PanelRightClose, Phone } from "lucide-react";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { CopilotSidePanel } from "@/components/CopilotSidePanel";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { TechLayout } from "@/components/TechLayout";
import { AdminLayout } from "@/components/AdminLayout";
import { DispatcherLayout } from "@/components/DispatcherLayout";
import { InstallerLayout } from "@/components/InstallerLayout";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { sendToMain, isElectron } from "@/lib/electron";
import { useIsMobile } from "@/hooks/use-mobile";
import { DeviceFrame } from "@/components/DeviceFrame";
import { VIEW_AS_DEVICES } from "@/lib/viewAsDevices";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { employeeId, role } = useEffectiveAuth();
  const viewAs = useViewAs();
  const { open, toggle, setOpen } = useCopilotPanel();
  const softphone = useSoftphoneContext();
  const isMobile = useIsMobile();
  const location = useLocation();
  const allowedTabs = useEmployeeTabAccess();

  const isOnCall = softphone.status === "on-call";
  const hasIncoming = softphone.status === "ringing" && !!softphone.incomingCall;

  useEffect(() => {
    if ((hasIncoming || softphone.status === "connecting") && !open) {
      setOpen(true);
    }
  }, [hasIncoming, softphone.status, open, setOpen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ── Route-level access control ──
  // Admin role is never restricted. If no access row exists (allowedTabs === null), allow everything.
  if (allowedTabs && role !== "admin") {
    const key = routeToTabKey(location.pathname, location.search);
    if (key && !allowedTabs.has(key)) {
      // Find first allowed route to redirect to
      const redirectTo = getFirstAllowedRoute(allowedTabs, role);
      return <Navigate to={redirectTo} replace />;
    }
  }

  // Compute the layout the user would normally see
  let layoutNode: React.ReactNode;

  if (viewAs.active) {
    // When admin is impersonating, force the impersonated user's layout,
    // not the admin shell, so page access + navigation stay in sync.
    if (role === "tech" || role === "supervisor") {
      layoutNode = <TechLayout>{children}</TechLayout>;
    } else if (role === "installer") {
      layoutNode = <InstallerLayout>{children}</InstallerLayout>;
    } else if (allowedTabs && !allowedTabs.has("admin")) {
      layoutNode = <DispatcherLayout>{children}</DispatcherLayout>;
    } else {
      layoutNode = <AdminLayout>{children}</AdminLayout>;
    }
  } else if (role === "tech" || role === "supervisor") {
    layoutNode = <TechLayout>{children}</TechLayout>;
  } else if (isMobile && role === "office" && allowedTabs && !allowedTabs.has("admin")) {
    layoutNode = <DispatcherLayout>{children}</DispatcherLayout>;
  } else if (isMobile && (role === "admin" || role === "office")) {
    layoutNode = <AdminLayout>{children}</AdminLayout>;
  } else {
    // Office / Admin desktop layout — unchanged
    layoutNode = (
      <div className="flex h-screen overflow-hidden">
        <div className={cn("min-w-0 overflow-y-auto transition-all", open ? "flex-1" : "flex-1")}>
          {children}
        </div>

        {open && (
          <>
            <Separator orientation="vertical" className="h-full" />
            <div className="w-[30vw] min-w-[280px] max-w-[50vw] shrink-0 h-full overflow-hidden">
              <CopilotSidePanel employeeId={employeeId} />
            </div>
          </>
        )}

        <div className="w-12 shrink-0 bg-gradient-to-b from-[hsl(var(--navy))] to-[hsl(var(--navy-dark))] flex flex-col items-center py-3 gap-2">
          <button
            onClick={toggle}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
              open
                ? "bg-accent text-accent-foreground"
                : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
            )}
            title={open ? "Close JARVIS" : "Open JARVIS (⌘K)"}
            aria-label="Toggle JARVIS"
          >
            {open ? <PanelRightClose className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </button>

          <button
            onClick={() => {
              if (isElectron()) {
                sendToMain("pop-out-phone");
              } else {
                if (!open) setOpen(true);
              }
            }}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-colors relative",
              isOnCall || hasIncoming
                ? "text-[hsl(var(--success))]"
                : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10"
            )}
            title="Phone"
            aria-label="Open phone"
          >
            <Phone className="h-4.5 w-4.5" />
            {(isOnCall || hasIncoming) && (
              <span className={cn(
                "absolute top-1.5 right-1.5 h-2 w-2 rounded-full border border-[hsl(var(--navy))]",
                hasIncoming ? "bg-[hsl(var(--success))] animate-pulse" : "bg-[hsl(var(--success))]"
              )} />
            )}
          </button>
        </div>
      </div>
    );
  }

  // If admin selected a device frame, wrap the layout in the phone bezel
  if (viewAs.device !== "none") {
    const deviceSpec = VIEW_AS_DEVICES[viewAs.device];
    return <DeviceFrame device={deviceSpec}>{layoutNode}</DeviceFrame>;
  }

  return <>{layoutNode}</>;
}
