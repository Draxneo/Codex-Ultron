/**
 * useEffectiveAuth — Returns auth state with ViewAs override applied.
 * 
 * Use this instead of useAuth when role/employeeId should respect
 * admin impersonation mode. The real auth session is never touched.
 */
import { useContext } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ViewAsContext } from "@/contexts/ViewAsContext";

export function useEffectiveAuth() {
  const auth = useAuth();
  const viewAs = useContext(ViewAsContext);

  if (viewAs?.active && viewAs.role && viewAs.employeeId) {
    return {
      ...auth,
      role: viewAs.role,
      employeeId: viewAs.employeeId,
    };
  }

  return auth;
}
