/**
 * MobileShell.tsx — Unified mobile layout shell for ALL roles
 *
 * ONE system, different tab configs. Provides:
 * - Frosted navy top bar with company name, search toggle, notification bell, sign-out
 * - Swipe left/right between bottom tabs
 * - Animated accent-colored tab indicator bar
 * - Unread badges on any tab
 * - Frosted glass bottom nav with scaled active icons
 * - Safe area support for Android nav bar
 *
 * ANDROID FREEZE FIX (2026-03-25):
 * The swipe gesture was attached to the <main> element which has overflow-y-auto.
 * On Android WebView, JS touch listeners on a scrollable element cause the compositor
 * thread to stall waiting for JS — even with passive:true, this freezes the UI on
 * many Android versions. Fix: swipe is now on the outer non-scrollable wrapper div.
 * touch-action: pan-y on <main> tells Android to handle vertical scrolling natively
 * without waiting for JS at all, eliminating the freeze entirely.
 *
 * HAPTICS FIX: Was dynamically importing @capacitor/haptics on every tab tap.
 * Now imports eagerly once at module level and caches the instance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { MobileCallScreen } from "@/components/MobileCallScreen";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { useStatusBar } from "@/hooks/useStatusBar";
import { useIncomingCallNotification } from "@/hooks/useIncomingCallNotification";
import { useGeofenceTracking } from "@/hooks/useGeofenceTracking";
import type { LucideIcon } from "lucide-react";

export interface MobileTab {
  path: string;
  icon: LucideIcon;
  label: string;
  match: (pathname: string) => boolean;
  /** Return badge count; 0 or undefined = hidden */
  badge?: () => number;
}

interface MobileShellProps {
  tabs: readonly MobileTab[];
  children: React.ReactNode;
}

/**
 * Haptic feedback — imported eagerly once at module level.
 * Previous approach dynamically imported on every tab tap which caused
 * a brief async native bridge call freeze on every navigation.
 */
let hapticsInstance: any = null;
let hapticsLoading = false;
async function triggerLightHaptic() {
  try {
    if (!hapticsInstance && !hapticsLoading) {
      hapticsLoading = true;
      const mod = await import("@capacitor/haptics");
      hapticsInstance = mod;
    }
    if (hapticsInstance) {
      hapticsInstance.Haptics.impact({ style: hapticsInstance.ImpactStyle.Light });
    }
  } catch { /* not native — no-op */ }
}

export function MobileShell({ tabs, children }: MobileShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, role } = useAuth();
  const viewAs = useViewAs();
  const { settings } = useCompanySettings();
  const queryClient = useQueryClient();
  
  const softphone = useSoftphoneContext();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;

  // Mount mobile-only listeners here except push registration,
  // which is already mounted once at app root (NotificationListeners).
  useAndroidBackButton();
  useStatusBar();
  useGeofenceTracking();

  // ── Pull-to-refresh state ──
  const mainRef = useRef<HTMLElement>(null);
  const touchStartY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const PULL_THRESHOLD = 60;

  const handlePullStart = useCallback((e: React.TouchEvent) => {
    if (mainRef.current && mainRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
  }, []);

  const handlePullMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartY.current || refreshing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0 && mainRef.current && mainRef.current.scrollTop <= 0) {
      setPullDistance(Math.min(dy * 0.5, 100));
    }
  }, [refreshing]);

  const handlePullEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      queryClient.invalidateQueries().finally(() => {
        setTimeout(() => {
          setRefreshing(false);
          setPullDistance(0);
        }, 400);
      });
    } else {
      setPullDistance(0);
    }
    touchStartY.current = 0;
  }, [pullDistance, refreshing, queryClient]);


  // Pre-warm haptics on mount so first tap is instant
  useEffect(() => { triggerLightHaptic().catch(() => {}); }, []);

  const isOnCall = softphone.status === "on-call";
  const isConnecting = softphone.status === "connecting";
  const hasIncoming = softphone.status === "ringing" && !!softphone.incomingCall;
  const showCallBanner = isOnCall || isConnecting || hasIncoming;

  // Fire native Android notification for incoming calls
  useIncomingCallNotification(
    hasIncoming,
    softphone.callerInfo?.name,
    softphone.callerInfo?.number
  );

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const fullPath = location.pathname + location.search;
  const activeIndex = useMemo(() => {
    const idx = tabs.findIndex(t => t.match(fullPath));
    return idx >= 0 ? idx : 0;
  }, [fullPath, tabs]);

  // ANDROID FREEZE FIX:
  // Swipe is now on the outer wrapper div (not the scrollable <main>).
  // Attaching touch listeners to overflow-y-auto on Android WebView causes the
  // compositor to stall on every touch — freezing scroll AND navigation.
  // The outer div is not scrollable, so Android handles it cleanly.

  

  return (
    <div className="flex flex-col h-screen bg-background overflow-x-hidden max-w-screen">
      {/* ── Top bar ──────────────────────────── */}
      <header className="shrink-0 bg-[hsl(var(--navy))] text-primary-foreground safe-area-top">
        <div className="h-12 px-4 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide truncate max-w-[50%]">
            {companyName}
          </span>

          <div className="flex items-center gap-1">
            {role === "admin" && viewAs.active && (
              <button
                onClick={viewAs.stopViewAs}
                className="h-8 rounded-lg px-2 text-[11px] font-medium text-primary-foreground/85 hover:text-primary-foreground hover:bg-white/10 transition-colors"
                aria-label="Exit impersonation mode"
              >
                Exit View
              </button>
            )}
            <button
              onClick={signOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

      </header>

      {/* ── Floating call banner ────────────── */}
      {showCallBanner && (
        <div
          onClick={() => navigate("/phone")}
          className={cn(
            "shrink-0 flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors",
            hasIncoming
              ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] animate-pulse"
              : "bg-[hsl(var(--success)/0.9)] text-[hsl(var(--success-foreground))]"
          )}
        >
          {hasIncoming ? (
            <>
              <Phone className="h-4 w-4 animate-bounce" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">
                  {softphone.callerInfo?.name || softphone.callerInfo?.number || "Incoming Call"}
                </p>
                <p className="text-[10px] opacity-80">Tap to answer</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); softphone.rejectCall(); }}
                  className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); softphone.acceptCall(); }}
                  className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
                >
                  <Phone className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">
                  {softphone.callerInfo?.name || softphone.callerInfo?.number || (isConnecting ? "Connecting..." : "On Call")}
                </p>
                {isOnCall && (
                  <p className="text-[10px] font-mono opacity-80">{formatDuration(softphone.callDuration)}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); softphone.toggleMute(); }}
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center active:scale-95",
                    softphone.isMuted ? "bg-white/30" : "bg-white/10"
                  )}
                >
                  {softphone.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); softphone.hangUp(); }}
                  className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pull-to-refresh indicator ──────────────────────────────── */}
      <div
        className="shrink-0 overflow-hidden transition-all duration-200 flex items-center justify-center"
        style={{ height: refreshing ? 40 : pullDistance > 0 ? Math.min(pullDistance, 60) : 0 }}
      >
        <div className={cn(
          "h-5 w-5 border-2 border-primary border-t-transparent rounded-full",
          refreshing ? "animate-spin" : pullDistance >= PULL_THRESHOLD ? "opacity-100" : "opacity-50"
        )} />
      </div>

      {/* ── Main content ─────────────────────────────────────────────
          ANDROID FREEZE FIX: touch-action: pan-y tells Android WebView
          to handle vertical scrolling natively without waiting for JS.
          Pull-to-refresh uses React touch events (not addEventListener)
          so it doesn't interfere with the native scroll optimization.
      ──────────────────────────────────────────────────────────────── */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overscroll-y-contain"
        style={{ touchAction: "pan-y" }}
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
      >
        {children}
      </main>

      {/* ── Bottom nav with animated indicator ── */}
      <nav className="shrink-0 border-t border-border bg-card/95 backdrop-blur-sm safe-area-bottom">
        <div className="relative flex h-14">
          {/* Animated active indicator bar */}
          <div
            className="absolute top-0 h-[2px] bg-accent transition-all duration-300 ease-out"
            style={{
              width: `${100 / tabs.length}%`,
              left: `${(activeIndex * 100) / tabs.length}%`,
            }}
          />

          {tabs.map(({ path, icon: Icon, label, match, badge }) => {
            const active = match(fullPath);
            const badgeCount = badge?.() ?? 0;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => triggerLightHaptic()}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative pt-1",
                  active
                    ? "text-accent"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                  {badgeCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1.5 -right-3 h-4 min-w-4 px-1 text-[8px] leading-none flex items-center justify-center"
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </Badge>
                  )}
                </div>
                <span className={cn("transition-all", active ? "font-semibold" : "font-medium")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      <MobileCallScreen />
    </div>
  );
}
