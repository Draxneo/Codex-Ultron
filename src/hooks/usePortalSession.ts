import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const PORTAL_TOKEN_KEY = "portal_session_token";
const PORTAL_CUSTOMER_KEY = "portal_customer_id";

export function usePortalSession() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);

  const validate = useCallback(async () => {
    const token = localStorage.getItem(PORTAL_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("portal-auth", {
        body: { action: "validate_session", token },
      });
      if (error || !data?.valid) {
        localStorage.removeItem(PORTAL_TOKEN_KEY);
        localStorage.removeItem(PORTAL_CUSTOMER_KEY);
        setValid(false);
      } else {
        setCustomerId(data.customer_id);
        localStorage.setItem(PORTAL_CUSTOMER_KEY, data.customer_id);
        setValid(true);
      }
    } catch {
      setValid(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { validate(); }, [validate]);

  const login = (token: string) => {
    localStorage.setItem(PORTAL_TOKEN_KEY, token);
    validate();
  };

  const logout = () => {
    localStorage.removeItem(PORTAL_TOKEN_KEY);
    localStorage.removeItem(PORTAL_CUSTOMER_KEY);
    setCustomerId(null);
    setValid(false);
  };

  return { customerId, loading, valid, login, logout };
}
