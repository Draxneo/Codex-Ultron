/**
 * ProtectedRoute.tsx - auth guard plus role layout wrapper.
 *
 * Intake HQ owns the live call/SMS workflow. This wrapper chooses the right
 * role layout without adding a second global communication slide-out.
 */

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmployeeTabAccess, routeToTabKey, getFirstAllowedRoute } from "@/hooks/useEmployeeTabAccess";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { TechLayout } from "@/components/TechLayout";
import { AdminLayout } from "@/components/AdminLayout";
import { DispatcherLayout } from "@/components/DispatcherLayout";
import { InstallerLayout } from "@/components/InstallerLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { DeviceFrame } from "@/components/DeviceFrame";
import { VIEW_AS_DEVICES } from "@/lib/viewAsDevices";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { role } = useEffectiveAuth();
  const viewAs = useViewAs();
  const isMobile = useIsMobile();
  const location = useLocation();
  const allowedTabs = useEmployeeTabAccess();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedTabs && role !== "admin") {
    const key = routeToTabKey(location.pathname, location.search);
    if (key && !allowedTabs.has(key)) {
      const redirectTo = getFirstAllowedRoute(allowedTabs, role);
      return <Navigate to={redirectTo} replace />;
    }
  }

  let layoutNode: React.ReactNode;
  const isCleanCommunications = location.pathname.startsWith("/communications");

  if (isCleanCommunications) {
    layoutNode = <>{children}</>;
  } else if (viewAs.active) {
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
    layoutNode = <>{children}</>;
  }

  if (viewAs.device !== "none") {
    const deviceSpec = VIEW_AS_DEVICES[viewAs.device];
    return <DeviceFrame device={deviceSpec}>{layoutNode}</DeviceFrame>;
  }

  return <>{layoutNode}</>;
}
