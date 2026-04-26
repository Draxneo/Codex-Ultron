/**
 * useAuth.ts — Authentication hook
 * 
 * Manages the current user's auth state, role, and linked employee ID.
 * 
 * HOW IT WORKS:
 * 1. Listens to Supabase auth state changes (login, logout, token refresh)
 * 2. On login, fetches the user's role from user_roles table and employee_id from profiles
 * 3. Role determines navigation access (admin sees everything, tech sees limited nav)
 * 
 * ROLES (stored in user_roles table, NOT on profiles):
 * - "admin": Full access to all pages including settings, agent training
 * - "office": Access to operational pages (jobs, customers, invoices)
 * - "tech": Limited access (dashboard defaults to paysheet, can see assigned jobs)
 * 
 * EMPLOYEE LINKING:
 * - profiles.employee_id links the auth user to an employee record
 * - This is used to scope the Copilot to the correct employee context
 * - Also used for paysheet calculations and tech-specific filtering
 * 
 * USED BY: ProtectedRoute (guards pages), AppHeader (filters nav), CopilotSidePanel
 */

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "office" | "tech" | "supervisor" | "installer";

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  /** Links to employees table — used for paysheet, copilot scoping */
  employeeId: string | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  session: null,
  role: null,
  employeeId: null,
  loading: true,
};

let authState: AuthState = initialState;
let initialized = false;
let safetyTimer: ReturnType<typeof setTimeout> | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;
let lastSessionToken: string | null = null;
const listeners = new Set<() => void>();

const signedOutState: AuthState = {
  user: null,
  session: null,
  role: null,
  employeeId: null,
  loading: false,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function setAuthState(next: AuthState | ((prev: AuthState) => AuthState)) {
  authState = typeof next === "function" ? next(authState) : next;
  emit();
}

async function loadUserContext(session: Session) {
  try {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      supabase.from("profiles").select("employee_id").eq("id", session.user.id).single(),
    ]);

    setAuthState({
      user: session.user,
      session,
      role: (rolesRes.data?.[0]?.role as AppRole) ?? null,
      employeeId: profileRes.data?.employee_id ?? null,
      loading: false,
    });
  } catch (err) {
    console.error("[useAuth] Failed to fetch role/profile:", err);
    setAuthState({
      user: session.user,
      session,
      role: null,
      employeeId: null,
      loading: false,
    });
  }
}

function applySignedOutState() {
  lastSessionToken = null;
  setAuthState(signedOutState);
}

function beginUserBootstrap(session: Session) {
  const nextToken = session.access_token ?? null;
  const sameSession =
    !!nextToken &&
    lastSessionToken === nextToken &&
    authState.user?.id === session.user.id &&
    authState.session?.access_token === nextToken;

  if (sameSession && !authState.loading) {
    return;
  }

  lastSessionToken = nextToken;

  setAuthState((prev) => ({
    user: session.user,
    session,
    role: prev.user?.id === session.user.id ? prev.role : null,
    employeeId: prev.user?.id === session.user.id ? prev.employeeId : null,
    loading: true,
  }));

  void loadUserContext(session);
}

async function recoverInvalidStoredSession(err: unknown) {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code?: string }).code) : "";
  const message = err instanceof Error ? err.message : String(err ?? "");
  const isInvalidRefresh = code === "refresh_token_not_found" || /Invalid Refresh Token/i.test(message);

  if (!isInvalidRefresh) {
    return false;
  }

  console.warn("[useAuth] Clearing stale local session after invalid refresh token");
  applySignedOutState();

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (signOutErr) {
    console.warn("[useAuth] Local sign-out cleanup failed:", signOutErr);
  }

  return true;
}

function initializeAuth() {
  if (initialized) return;
  initialized = true;

  safetyTimer = setTimeout(() => {
    setAuthState((state) => {
      if (state.loading) {
        console.warn("[useAuth] Safety timeout — clearing stale auth loading state");
        return { ...state, loading: false };
      }
      return state;
    });
  }, 8000);

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      applySignedOutState();
      return;
    }

    setTimeout(() => {
      beginUserBootstrap(session);
    }, 0);
  });

  authSubscription = subscription;

  supabase.auth.getSession()
    .then(({ data: { session } }) => {
      if (session?.user) {
        beginUserBootstrap(session);
        return;
      }

      applySignedOutState();
    })
    .catch(async (err) => {
      const recovered = await recoverInvalidStoredSession(err);
      if (!recovered) {
        console.error("[useAuth] getSession failed:", err);
        applySignedOutState();
      }
    });
}

function subscribe(listener: () => void) {
  initializeAuth();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      initialized = false;
    }
  };
}

function getSnapshot() {
  return authState;
}

export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    initializeAuth();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signOut };
}
