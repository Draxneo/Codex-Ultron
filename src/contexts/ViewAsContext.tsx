/**
 * ViewAsContext — Admin impersonation mode + device frame emulation.
 *
 * Lets an admin preview the app as any employee/role AND inside a phone bezel
 * (Samsung S23, iPhone 15, etc.). State is persisted to sessionStorage so HMR
 * / page reloads during dev don't drop the impersonation session and strip
 * the mobile layout out from under the admin.
 *
 * sessionStorage (not localStorage) keeps it tab-scoped: closing the tab ends
 * impersonation, and it never leaks to Electron / the dispatcher's tab.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ViewAsDeviceKey } from "@/lib/viewAsDevices";

type AppRole = "admin" | "office" | "tech" | "supervisor" | "installer";

interface ViewAsState {
  active: boolean;
  employeeId: string | null;
  employeeName: string | null;
  role: AppRole | null;
  device: ViewAsDeviceKey;
}

interface ViewAsContextValue extends ViewAsState {
  startViewAs: (employeeId: string, employeeName: string, role: AppRole) => void;
  stopViewAs: () => void;
  setDevice: (device: ViewAsDeviceKey) => void;
}

export const ViewAsContext = createContext<ViewAsContextValue | null>(null);

const STORAGE_KEY = "viewAs:state:v1";

function loadInitial(): ViewAsState {
  const fallback: ViewAsState = {
    active: false,
    employeeId: null,
    employeeName: null,
    role: null,
    device: "none",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ViewAsState>;
    return {
      active: !!parsed.active,
      employeeId: parsed.employeeId ?? null,
      employeeName: parsed.employeeName ?? null,
      role: (parsed.role ?? null) as AppRole | null,
      device: (parsed.device ?? "none") as ViewAsDeviceKey,
    };
  } catch {
    return fallback;
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewAsState>(loadInitial);

  // Persist to sessionStorage so HMR / accidental reloads keep the session
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota errors */
    }
  }, [state]);

  const startViewAs = (employeeId: string, employeeName: string, role: AppRole) => {
    setState((s) => ({ ...s, active: true, employeeId, employeeName, role }));
  };

  const stopViewAs = () => {
    setState((s) => ({
      ...s,
      active: false,
      employeeId: null,
      employeeName: null,
      role: null,
      device: "none",
    }));
    if (typeof window !== "undefined") {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  };

  const setDevice = (device: ViewAsDeviceKey) => {
    setState((s) => ({ ...s, device }));
  };

  return (
    <ViewAsContext.Provider value={{ ...state, startViewAs, stopViewAs, setDevice }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const ctx = useContext(ViewAsContext);
  if (!ctx) throw new Error("useViewAs must be used within ViewAsProvider");
  return ctx;
}
