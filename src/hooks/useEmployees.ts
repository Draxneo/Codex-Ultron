import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const EMPLOYEE_SELECT =
  "id, name, role, phone, home_address, email, is_active, profile_id, desktop_calls_enabled, hcp_employee_id, hourly_rate, pay_model";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    staleTime: 30 * 60 * 1000, // 30 min — employee roster rarely changes
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select(EMPLOYEE_SELECT).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, role, phone, home_address, email }: { name: string; role: string; phone?: string | null; home_address?: string | null; email?: string | null }) => {
      const { error } = await supabase.from("employees").insert({ name, role, phone, home_address, email } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, role, phone, home_address, email }: { id: string; name: string; role: string; phone?: string | null; home_address?: string | null; email?: string | null }) => {
      const updates: any = { name, role, phone, home_address, email };
      const { error } = await supabase.from("employees").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password, employee_id, role, full_name }: { email: string; password: string; employee_id: string; role: string; full_name: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email, password, employee_id, role, full_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useToggleEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("employees").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}
