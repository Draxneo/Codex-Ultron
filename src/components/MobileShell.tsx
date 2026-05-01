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
import { Link, useLocation } from "react-router-dom";
import {
  LogOut,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Keyboard,
  X,
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
import { createPhoneConsoleChannel, openPhoneConsole, type PhoneConsoleMessage } from "@/lib/phoneConsoleBridge";
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

const DIAL_KEYS: { key: string; sub?: string }[][] = [
  [{ key: "1", sub: "" }, { key: "2", sub: "ABC" }, { key: "3", sub: "DEF" }],
  [{ key: "4", sub: "GHI" }, { key: "5", sub: "JKL" }, { key: "6", sub: "MNO" }],
  [{ key: "7", sub: "PQRS" }, { key: "8", sub: "TUV" }, { key: "9", sub: "WXYZ" }],
  [{ key: "*" }, { key: "0", sub: "+" }, { key: "#" }],
];

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
  const { signOut, role } = useAuth();
  const viewAs = useViewAs();
  const { settings } = useCompanySettings();
  const queryClient = useQueryClient();
  
  const softphone = useSoftphoneContext();
  const companyName = settings.company_name || DEFAULT_COMPANY_NAME;
  const [phoneConsoleState, setPhoneConsoleState] = useState<Extract<PhoneConsoleMessage, { type: "status" }> | null>(null);
  const [callExpanded, setCallExpanded] = useState(false);
  const [showCallKeypad, setShowCallKeypad] = useState(false);
  const phoneChannelRef = useRef<BroadcastChannel | null>(null);

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
  useEffect(() => {
    triggerLightHaptic().catch((error) => {
      console.warn("[MobileShell] Could not pre-warm haptics:", error);
    });
  }, []);

  useEffect(() => {
    const channel = createPhoneConsoleChannel();
    phoneChannelRef.current = channel;
    if (!channel) return;

    channel.onmessage = (event) => {
      const message = event.data as PhoneConsoleMessage;
      if (message?.type === "status") {
        setPhoneConsoleState(message);
      }
    };

    return () => {
      channel.close();
      phoneChannelRef.current = null;
    };
  }, []);

  const sendPhoneCommand = useCallback((command: Extract<PhoneConsoleMessage, { type: "command" }>["command"], digit?: string) => {
    phoneChannelRef.current?.postMessage({ type: "command", command, digit } satisfies PhoneConsoleMessage);
  }, []);

  const status = phoneConsoleState?.status || softphone.status;
  const callerInfo = phoneConsoleState?.callerInfo || softphone.callerInfo;
  const callDuration = phoneConsoleState?.callDuration ?? softphone.callDuration;
  const isMuted = phoneConsoleState?.isMuted ?? softphone.isMuted;
  const hasRemotePhone = !!phoneConsoleState && phoneConsoleState.status !== "offline";
  const isOnCall = status === "on-call";
  const isConnecting = status === "connecting";
  const hasIncoming = status === "ringing" && (!!softphone.incomingCall || hasRemotePhone);
  const showCallBanner = isOnCall || isConnecting || hasIncoming;

  // Fire native Android notification for incoming calls
  useIncomingCallNotification(
    hasIncoming,
    callerInfo?.name || undefined,
    callerInfo?.number || undefined
  );

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const acceptCall = () => {
    if (softphone.incomingCall) softphone.acceptCall();
    else sendPhoneCommand("accept");
  };

  const rejectCall = () => {
    if (softphone.incomingCall) softphone.rejectCall();
    else sendPhoneCommand("reject");
  };

  const hangUp = () => {
    if (softphone.activeCall || softphone.incomingCall) softphone.hangUp();
    else sendPhoneCommand("hangUp");
  };

  const toggleMute = () => {
    if (softphone.activeCall) softphone.toggleMute();
    else sendPhoneCommand("toggleMute");
  };

  const sendDigit = (digit: string) => {
    if (softphone.activeCall) softphone.sendDigit(digit);
    else sendPhoneCommand("sendDigit", digit);
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
        <div className="h-14 px-4 flex items-center justify-between">
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
              className="h-11 w-11 rounded-xl flex items-center justify-center text-primary-foreground/70 hover:text-primary-foreground hover:bg-white/10 transition-colors"
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
          onClick={() => setCallExpanded(true)}
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
                  {callerInfo?.name || callerInfo?.number || "Incoming Call"}
                </p>
                <p className="text-[10px] opacity-80">Tap to answer</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); rejectCall(); }}
                  className="h-8 w-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center active:scale-95"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); acceptCall(); }}
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
                  {callerInfo?.name || callerInfo?.number || (isConnecting ? "Connecting..." : "On Call")}
                </p>
                {isOnCall && (
                  <p className="text-[10px] font-mono opacity-80">{formatDuration(callDuration)}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center active:scale-95",
                    isMuted ? "bg-white/30" : "bg-white/10"
                  )}
                >
                  {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); hangUp(); }}
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
      {showCallBanner && callExpanded && (
        <div className="fixed inset-x-0 bottom-16 z-[70] px-3 pb-3">
          <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
              <div className={cn("h-2.5 w-2.5 rounded-full", hasIncoming ? "animate-pulse bg-[hsl(var(--success))]" : "bg-[hsl(var(--success))]")} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {callerInfo?.name || callerInfo?.number || (hasIncoming ? "Incoming call" : "Active call")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasIncoming ? "Incoming" : isConnecting ? "Connecting" : formatDuration(callDuration)}
                  {callerInfo?.number ? ` - ${callerInfo.number}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCallExpanded(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
                aria-label="Collapse call controls"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {showCallKeypad && !hasIncoming && (
              <div className="border-b bg-muted/20 p-3">
                <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
                  {DIAL_KEYS.flat().map(({ key, sub }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => sendDigit(key)}
                      className="flex h-12 flex-col items-center justify-center rounded-xl bg-background text-foreground shadow-sm active:scale-[0.97]"
                    >
                      <span className="text-base font-semibold leading-none">{key}</span>
                      {sub !== undefined && <span className="mt-0.5 text-[8px] font-medium tracking-widest text-muted-foreground">{sub || "\u00A0"}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 p-3">
              {hasIncoming ? (
                <>
                  <button
                    type="button"
                    onClick={rejectCall}
                    className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-semibold text-destructive-foreground active:scale-[0.98]"
                  >
                    <PhoneOff className="h-4 w-4" /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={acceptCall}
                    className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--success))] text-sm font-semibold text-[hsl(var(--success-foreground))] active:scale-[0.98]"
                  >
                    <Phone className="h-4 w-4" /> Answer
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={cn(
                      "flex h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold active:scale-[0.98]",
                      isMuted ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
                    )}
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCallKeypad((open) => !open)}
                    className={cn(
                      "flex h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold active:scale-[0.98]",
                      showCallKeypad ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
                    )}
                  >
                    <Keyboard className="h-4 w-4" />
                    Keypad
                  </button>
                  <button
                    type="button"
                    onClick={() => openPhoneConsole()}
                    className="flex h-12 flex-col items-center justify-center rounded-xl bg-muted text-xs font-semibold text-foreground active:scale-[0.98]"
                  >
                    <Phone className="h-4 w-4" />
                    Phone
                  </button>
                  <button
                    type="button"
                    onClick={hangUp}
                    className="flex h-12 flex-col items-center justify-center rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground active:scale-[0.98]"
                  >
                    <PhoneOff className="h-4 w-4" />
                    End
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
        <div className="relative flex h-16">
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
                  "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative pt-1 active:bg-muted/50",
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
