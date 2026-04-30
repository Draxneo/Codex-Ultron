import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getJobCartPermissions } from "@/lib/jobCartStatus";

export interface JobCart {
  id: string;
  job_id: string;
  status: "draft" | "sent" | "approved" | "paid" | "declined" | "canceled";
  public_token: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_timing: string | null;
  estimate_number: string | null;
  selected_invoice_id: string | null;
  source_presentation_id: string | null;
  selected_option_key: string | null;
  approved_scope_snapshot: Record<string, any> | null;
  payment_due_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number | null;
  discount_code: string | null;
  discount_amount: number | null;
  repair_subtotal?: number | null;
  discount_eligible_subtotal?: number | null;
  cash_discount_percent?: number | null;
  cash_discount_amount?: number | null;
  comfort_club_discount_percent?: number | null;
  comfort_club_discount_amount?: number | null;
  final_cash_total?: number | null;
  financing_monthly_36?: number | null;
  financing_monthly_120?: number | null;
  pricing_summary?: Record<string, any> | null;
  stripe_checkout_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCartItem {
  id: string;
  cart_id: string;
  kind: "equipment" | "repair" | "part" | "custom";
  source_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  tier: "good" | "better" | "best" | "critical" | "recommended" | "reconditioning" | "premium" | null;
  metadata: Record<string, any>;
  sort_order: number;
}

export interface NewCartItem {
  kind: JobCartItem["kind"];
  source_id?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  quantity?: number;
  unit_price: number;
  tier?: JobCartItem["tier"];
  metadata?: Record<string, any>;
}

export function useJobCart(jobId: string | undefined) {
  const queryClient = useQueryClient();

  const cartQuery = useQuery({
    queryKey: ["job_cart", jobId],
    enabled: !!jobId,
    queryFn: async () => {
      // Try to load active cart
      const { data, error } = await (supabase as any)
        .from("job_carts")
        .select("*")
        .eq("job_id", jobId)
        .not("status", "in", "(canceled,declined)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        await (supabase as any).rpc("refresh_job_cart_pricing", { p_cart_id: data.id });
        const { data: refreshed } = await (supabase as any)
          .from("job_carts")
          .select("*")
          .eq("id", data.id)
          .maybeSingle();
        return (refreshed || data) as JobCart;
      }

      // Lazy create if missing (fallback — trigger should auto-create)
      const { data: created, error: createErr } = await (supabase as any)
        .from("job_carts")
        .insert({ job_id: jobId, status: "draft" })
        .select()
        .single();
      if (createErr) throw createErr;
      await (supabase as any).rpc("refresh_job_cart_pricing", { p_cart_id: created.id });
      const { data: refreshed } = await (supabase as any)
        .from("job_carts")
        .select("*")
        .eq("id", created.id)
        .maybeSingle();
      return (refreshed || created) as JobCart;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["job_cart_items", cartQuery.data?.id],
    enabled: !!cartQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("job_cart_items")
        .select("*")
        .eq("cart_id", cartQuery.data!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as JobCartItem[];
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: NewCartItem) => {
      if (!cartQuery.data?.id) throw new Error("No estimate available");
      const permissions = getJobCartPermissions(cartQuery.data, itemCount);
      if (!permissions.canEditItems) throw new Error(permissions.lockedReason || "This estimate cannot be edited.");
      const qty = item.quantity ?? 1;
      const { data, error } = await (supabase as any)
        .from("job_cart_items")
        .insert({
          cart_id: cartQuery.data.id,
          kind: item.kind,
          source_id: item.source_id ?? null,
          name: item.name,
          description: item.description ?? null,
          image_url: item.image_url ?? null,
          quantity: qty,
          unit_price: item.unit_price,
          total_price: qty * item.unit_price,
          tier: item.tier ?? null,
          metadata: item.metadata ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_cart_items", cartQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
      toast.success("Added to estimate");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, quantity, unit_price }: { id: string; quantity?: number; unit_price?: number }) => {
      const updates: any = {};
      const permissions = getJobCartPermissions(cartQuery.data, itemCount);
      if (!permissions.canEditItems) throw new Error(permissions.lockedReason || "This estimate cannot be edited.");
      if (quantity !== undefined) updates.quantity = quantity;
      if (unit_price !== undefined) updates.unit_price = unit_price;
      // Recompute total if either changed — fetch existing first if needed
      if (quantity !== undefined || unit_price !== undefined) {
        const existing = (itemsQuery.data || []).find((i) => i.id === id);
        const q = quantity ?? existing?.quantity ?? 1;
        const p = unit_price ?? existing?.unit_price ?? 0;
        updates.total_price = q * p;
      }
      const { error } = await (supabase as any).from("job_cart_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_cart_items", cartQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const permissions = getJobCartPermissions(cartQuery.data, itemCount);
      if (!permissions.canEditItems) throw new Error(permissions.lockedReason || "This estimate cannot be edited.");
      const { error } = await (supabase as any).from("job_cart_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job_cart_items", cartQuery.data?.id] });
      queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
      toast.success("Removed from cart");
    },
  });

  const sendToCustomer = useMutation({
    mutationFn: async ({ phone, customerName }: { phone?: string | null; customerName?: string | null }) => {
      if (!cartQuery.data?.id) throw new Error("No estimate");
      const permissions = getJobCartPermissions(cartQuery.data, itemCount);
      if (!permissions.canSendForApproval && !permissions.canSendPaymentLink) {
        throw new Error(permissions.lockedReason || "This estimate cannot be sent.");
      }
      if (!phone) {
        throw new Error("Customer phone number is missing. Add a phone number or copy the link instead.");
      }
      const link = `${window.location.origin}/cart/${cartQuery.data.public_token}?present=1`;

      // Send SMS via centralized pipeline
      const greeting = customerName ? `Hi ${customerName.split(" ")[0]}, ` : "";
      const linkLabel = permissions.canSendPaymentLink && !permissions.canSendForApproval ? "payment link" : "estimate";
      const estimateLabel = cartQuery.data.estimate_number ? ` ${cartQuery.data.estimate_number}` : "";
      const { sendSmsImpl } = await import("@/hooks/useSendSms");
      const smsResult = await sendSmsImpl({
        to: phone,
        body: `${greeting}the Carnes family put together your ${linkLabel}${estimateLabel}. You can review it here, and text us back with any questions: ${link}`,
        jobId,
        contactName: customerName || null,
        contactType: "customer",
        source: "job_cart_send",
        hitlApproved: true,
        silent: true,
      });
      if (!smsResult.success) {
        throw new Error(smsResult.error || "SMS could not be sent, so the estimate was not marked sent.");
      }

      if (permissions.canSendForApproval) {
        const { error } = await (supabase as any)
          .from("job_carts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", cartQuery.data.id);
        if (error) throw error;
      }
      (supabase as any).rpc("log_quote_cart_event", {
        p_event_type: "cart_sent",
        p_cart_id: cartQuery.data.id,
        p_job_id: jobId,
        p_actor_type: "staff",
        p_metadata: {
          via: "sms",
          source: "job_cart_send",
          link_label: linkLabel,
          has_customer_phone: true,
        },
      }).then(() => {}, () => {});
      return { link, linkLabel };
    },
    onSuccess: ({ link, linkLabel }) => {
      queryClient.invalidateQueries({ queryKey: ["job_cart", jobId] });
      toast.success(`${linkLabel === "payment link" ? "Payment link" : "Estimate"} sent to customer`, { description: link });
    },
    onError: (e: any) => toast.error(e.message || "Failed to send"),
  });

  const cart = cartQuery.data;
  const items = itemsQuery.data || [];
  const itemCount = items.reduce((s, i) => s + Number(i.quantity), 0);
  const publicLink = cart ? `${window.location.origin}/cart/${cart.public_token}?present=1` : null;

  return {
    cart,
    items,
    itemCount,
    isLoading: cartQuery.isLoading || itemsQuery.isLoading,
    addItem,
    updateItem,
    removeItem,
    sendToCustomer,
    publicLink,
    /** Fullscreen "present mode" link for in-home pitch */
    presentLink: publicLink,
  };
}
