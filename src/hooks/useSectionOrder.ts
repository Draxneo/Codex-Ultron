/**
 * useSectionOrder.ts — Universal section ordering hook.
 *
 * Lets any page persist a drag-and-drop section order globally via
 * `company_settings` rows keyed `section_order:<scopeKey>`. Mirrors the
 * earlier per-scope hooks but works for any page that opts in.
 *
 * Usage:
 *   const { order, draftOrder, setDraftOrder, editing, setEditing,
 *           dirty, save, reset, cancel, isSaving } =
 *     useSectionOrder("customer_quote", DEFAULT_IDS);
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const settingsKey = (scope: string) => `section_order:${scope}`;

function sanitize<T extends string>(order: string[], allowed: readonly T[]): T[] {
  const valid = order.filter((id): id is T => (allowed as readonly string[]).includes(id));
  const missing = allowed.filter((id) => !valid.includes(id));
  return [...valid, ...missing];
}

export function useSectionOrder<T extends string>(scopeKey: string, defaultIds: readonly T[]) {
  const queryClient = useQueryClient();
  const key = settingsKey(scopeKey);

  const query = useQuery({
    queryKey: ["section_order", scopeKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return [...defaultIds] as T[];
      try {
        return sanitize(JSON.parse(data.value), defaultIds);
      } catch {
        return [...defaultIds] as T[];
      }
    },
  });

  const order = (query.data || defaultIds) as T[];

  const [editing, setEditing] = useState(false);
  const [draftOrder, setDraftOrder] = useState<T[]>(order);
  const [dirty, setDirty] = useState(false);

  // Sync draft when persisted order changes (and not editing)
  useEffect(() => {
    if (!editing) {
      setDraftOrder(order);
      setDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(order), editing]);

  const saveMutation = useMutation({
    mutationFn: async (next: T[]) => {
      const value = JSON.stringify(sanitize(next, defaultIds));
      const { data: existing } = await supabase
        .from("company_settings")
        .select("id")
        .eq("key", key)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from("company_settings")
          .update({ value, updated_at: new Date().toISOString() } as any)
          .eq("key", key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({ key, value } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["section_order", scopeKey] });
      toast({ title: "Layout saved" });
    },
    onError: (e: any) => {
      toast({ title: "Failed to save layout", description: e.message, variant: "destructive" });
    },
  });

  const updateDraft = (updater: (prev: T[]) => T[]) => {
    setDraftOrder((prev) => {
      const next = updater(prev);
      setDirty(true);
      return next;
    });
  };

  const save = () => {
    saveMutation.mutate(draftOrder, {
      onSuccess: () => {
        setDirty(false);
        setEditing(false);
      },
    });
  };

  const reset = () => {
    setDraftOrder([...defaultIds] as T[]);
    setDirty(true);
  };

  const cancel = () => {
    setDraftOrder(order);
    setDirty(false);
    setEditing(false);
  };

  return {
    order,
    draftOrder,
    setDraftOrder: updateDraft,
    isLoading: query.isLoading,
    editing,
    setEditing,
    dirty,
    save,
    reset,
    cancel,
    isSaving: saveMutation.isPending,
    defaultOrder: defaultIds as readonly T[],
  };
}
