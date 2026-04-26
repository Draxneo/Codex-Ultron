import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  CalendarIcon, UserPlus, Send, ClipboardList, FileText, MessageSquare,
  Star, CreditCard, CheckCircle2, Loader2, MapPin, Camera, Shield,
  Receipt, CalendarCheck, CheckSquare, DollarSign, Phone, FileBarChart,
  CalendarPlus, Play, Truck, BookOpen, Flag, Banknote, AlertTriangle,
  Undo2, ExternalLink, Copy, Building2, Info, Mail as MailIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getStageInfo, isStepComplete } from "@/hooks/useWorkflowStage";
import type { WorkflowStep, ActionLink } from "@/hooks/useWorkflowDefinitions";
import { useLogActivity } from "@/hooks/useActivityLog";
import { sendSmsImpl } from "@/hooks/useSendSms";
import { useAuthorityForZip } from "@/hooks/usePermitAuthorities";
import { useJobEquipment } from "@/hooks/useJobEquipment";
import { generateInstallCertificates } from "@/hooks/useCertificates";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

/* ─── Brand warranty portal URLs ─── */
const BRAND_PORTALS: Record<string, string> = {
  Carrier: "https://productregistration.carrier.com/public/RegistrationForm_Carrier?brand=CARRIER",
  "Day and Night": "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP",
  "Day & Night": "https://productregistration2.icpusa.com/public/RegistrationForm?brand=ICP",
  Goodman: "https://warranty.goodmanmfg.com/newregistration/#/reg-layout",
  Trane: "https://www.trane.com/residential/en/resources/warranty-and-registration/register/",
};

function getWarrantyPortalUrl(brand?: string): string {
  if (!brand) return BRAND_PORTALS["Carrier"];
  const key = Object.keys(BRAND_PORTALS).find((k) => k.toLowerCase() === brand.toLowerCase());
  return BRAND_PORTALS[key || "Carrier"] || BRAND_PORTALS["Carrier"];
}

/* ─── Inline copy helper ─── */
function ActionCopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-24 shrink-0">{label}</span>
      <span className={cn("text-xs font-mono truncate flex-1", !value && "text-muted-foreground italic")}>
        {value || "—"}
      </span>
      {value && (
        <button onClick={copy} className="shrink-0 h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-accent">
          <Copy className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

interface WorkflowActionBarProps {
  job: any;
  jobId: string;
  employees: any[] | undefined;
  onSendForm: (type: "install_checklist" | "techform") => void;
  onDispatch: () => void;
  dispatching: boolean;
  workflowSteps?: WorkflowStep[];
  /** Which table to update — defaults to "jobs" */
  tableName?: "jobs" | "estimates";
}

import { WORKFLOW_ICON_MAP } from "@/lib/workflowIcons";

export function WorkflowActionBar({ job, jobId, employees, onSendForm, onDispatch, dispatching, workflowSteps, tableName = "jobs" }: WorkflowActionBarProps) {
  const queryClient = useQueryClient();
  const { confirm: confirmDialog } = useConfirm();
  const [scheduling, setScheduling] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [undoLoading, setUndoLoading] = useState(false);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const logActivity = useLogActivity();
  const isEstimate = tableName === "estimates";

  /* ─── External context lookups ─── */
  const jobZip = job.address?.match(/\b(\d{5})\b/)?.[1] || job.zip;
  const authority = useAuthorityForZip(jobZip);
  const { data: jobEquipment } = useJobEquipment(jobId);
  const equipBrand = jobEquipment?.brands?.[0] || job.brand;

  /* ─── Brand → supply house lookup ─── */
  const { data: supplyHouses } = useQuery({
    queryKey: ["supply_houses_brand"],
    queryFn: async () => {
      const { data } = await supabase
        .from("supply_houses")
        .select("id, name, ordering_url, brand_affinity, contact_email, contact_phone")
        .eq("is_active", true);
      return (data || []) as any[];
    },
  });

  const brandSupplyHouse = useMemo(() => {
    if (!equipBrand || !supplyHouses?.length) return null;
    const brand = equipBrand.toLowerCase();
    return supplyHouses.find((sh: any) =>
      (sh.brand_affinity || []).some((b: string) => b.toLowerCase() === brand)
    ) || null;
  }, [equipBrand, supplyHouses]);

  const stageInfo = getStageInfo(job, workflowSteps);
  const currentStep = stageInfo.step;
  const hasPhone = !!job.customer_phone;

  /* ─── Financing portal URL from company_settings ─── */
  const { data: financingPortalUrl } = useQuery({
    queryKey: ["company_settings_financing_portal"],
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("value").eq("key", "financing_portal_url").maybeSingle();
      return data?.value || "";
    },
    staleTime: 10 * 60 * 1000,
  });

  /* ─── Resolve template URLs in action_links ─── */
  const resolvedActionLinks = useMemo((): ActionLink[] => {
    if (!currentStep.action_links?.length) return [];
    return currentStep.action_links.map((link) => {
      let url = link.url;
      if (url === "{{warranty_portal}}") {
        url = getWarrantyPortalUrl(equipBrand);
      } else if (url === "{{permit_portal}}") {
        url = authority?.permit_portal_url || "";
      } else if (url === "{{inspection_portal}}") {
        url = authority?.inspection_url || authority?.permit_portal_url || "";
      } else if (url === "{{supply_house_order}}") {
        url = brandSupplyHouse?.ordering_url || "";
      } else if (url === "{{financing_portal}}") {
        url = financingPortalUrl || "https://www.mysynchrony.com/mysyf/home.html";
      }
      return { ...link, url };
    }).filter((l) => l.url);
  }, [currentStep.action_links, equipBrand, authority, brandSupplyHouse, financingPortalUrl]);

  /* ─── Find last completed step (for undo) ─── */
  const lastCompletedIdx = (() => {
    const allSteps = stageInfo.allSteps;
    // Walk backwards from current to find the last step the user completed
    const startIdx = stageInfo.isComplete ? allSteps.length - 1 : stageInfo.stepIndex - 1;
    for (let i = startIdx; i >= 0; i--) {
      const s = allSteps[i];
      if (s.completed && !s.skip_when) return i; // only allow undo on non-auto-skipped steps
    }
    return -1;
  })();

  const undoableStep = lastCompletedIdx >= 0 ? stageInfo.allSteps[lastCompletedIdx] : null;

  /* ─── Resolve dynamic label with target name ─── */
  const TECH_ACTIONS = new Set(["dispatch", "send_form", "send_install_checklist", "assign", "mark_in_progress"]);
  const CUSTOMER_ACTIONS = new Set(["send_confirmation", "send_eta", "send_invoice", "request_review", "collect_deposit", "send_brochure", "send_maint_report", "mark_paid"]);

  const resolveDynamicLabel = (step: WorkflowStep): string => {
    const label = step.label;
    const techName = job.assigned_to;
    const customerFirst = job.customer_name?.split(" ")[0];

    if (TECH_ACTIONS.has(step.primary_action) && techName) {
      // Append tech name: "Text Job Details to Tech" → "Text Job Details to Mike"
      return label
        .replace(/\bto Tech\b/i, `to ${techName}`)
        .replace(/\bto Installer\b/i, `to ${techName}`)
        .replace(/\bto Sales Tech\b/i, `to ${techName}`)
        .replace(/\bInstaller Crew\b/i, techName)
        .replace(/\bTech On-Site\b/i, `${techName} On-Site`)
        .replace(/\bCrew On-Site\b/i, `${techName} On-Site`);
    }

    if (CUSTOMER_ACTIONS.has(step.primary_action) && customerFirst) {
      // Append customer name: "Text ETA to Customer" → "Text ETA to John"
      return label
        .replace(/\bto Customer\b/i, `to ${customerFirst}`)
        .replace(/\bCustomer Appointment Reminder\b/i, `${customerFirst} Appointment Reminder`);
    }

    return label;
  };

  const dynamicLabel = resolveDynamicLabel(currentStep);

  /* ─── Handoff detection ─── */
  const checkHandoff = () => {
    const nextStepIdx = stageInfo.stepIndex + 1;
    const allSteps = stageInfo.allSteps;
    if (nextStepIdx >= allSteps.length) return;
    const nextStep = allSteps[nextStepIdx];
    const currentOwner = currentStep.owner || "office";
    const nextOwner = nextStep.owner || "office";
    if (currentOwner !== nextOwner) {
      const ownerLabels: Record<string, string> = { office: "Office", tech: "Tech", customer: "Customer", system: "System" };
      toast({
        title: `🔄 Handoff → ${ownerLabels[nextOwner]}`,
        description: `"${nextStep.label}" is now ${ownerLabels[nextOwner]}'s responsibility`,
      });
      logActivity.mutate({
        job_id: jobId,
        action: "handoff",
        performed_by: ownerLabels[currentOwner],
        details: `Handoff from ${ownerLabels[currentOwner]} → ${ownerLabels[nextOwner]}: "${nextStep.label}"`,
      });
    }
  };

  const invalidateJob = () => {
    if (isEstimate) {
      queryClient.invalidateQueries({ queryKey: ["estimates", jobId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    } else {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }
    queryClient.invalidateQueries({ queryKey: ["activity_log"] });
    // Check for handoffs after invalidation
    checkHandoff();
    // Trigger auto-advance chain for non-estimate jobs
    if (!isEstimate) {
      triggerAutoAdvance();
    }
  };

  /* ─── Auto-advance chain trigger ─── */
  const triggerAutoAdvance = async () => {
    try {
      const nextStepIdx = stageInfo.stepIndex + 1;
      const allSteps = stageInfo.allSteps;
      if (nextStepIdx >= allSteps.length) return;
      const nextStep = allSteps[nextStepIdx];
      // Only trigger if next step is auto-completable
      if (!nextStep.auto_completable) return;
      
      await supabase.functions.invoke("auto-advance-workflow", {
        body: { job_id: jobId, trigger_step: currentStep.id },
      });
      // Re-fetch job after chain completes
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
      }, 3000);
    } catch (e) {
      console.warn("Auto-advance chain error:", e);
    }
  };

  /* ─── Error logging helper ─── */
  const logWorkflowError = (action: string, errorMsg: string) => {
    logActivity.mutate({
      job_id: jobId,
      action: "workflow_error",
      performed_by: "System",
      details: `Action "${action}" failed: ${errorMsg}`,
    });
  };

  /* ─── Post-action verification (BLOCKING — must confirm before advancing) ─── */
  const verifyField = async (field: string, actionLabel: string): Promise<boolean> => {
    // Wait for DB propagation
    await new Promise((r) => setTimeout(r, 1500));
    const { data, error } = await supabase.from(tableName as any).select(field).eq("id", jobId).single();
    if (error || !data || !(data as any)[field]) {
      // Retry once after another second
      await new Promise((r) => setTimeout(r, 1500));
      const { data: d2 } = await supabase.from(tableName as any).select(field).eq("id", jobId).single();
      if (!d2 || !(d2 as any)[field]) {
        const msg = `"${actionLabel}" may not have saved — please retry`;
        toast({ title: "Verification failed", description: msg, variant: "destructive", duration: 10000 });
        logWorkflowError(actionLabel, "Post-action verification found field still null after 2 attempts");
        return false;
      }
    }
    return true;
  };

  /* ─── Safe timestamp stamper (blocks until backend confirms) ─── */
  const stampTimestamp = async (field: string, label?: string) => {
    const actionLabel = label || field;
    try {
      const { error } = await supabase.from(tableName as any).update({ [field]: new Date().toISOString() } as any).eq("id", jobId);
      if (error) throw error;
      // BLOCK: wait for backend confirmation before invalidating queries
      const confirmed = await verifyField(field, actionLabel);
      if (confirmed) {
        invalidateJob();
      }
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message || "Unknown error", variant: "destructive" });
      logWorkflowError(actionLabel, e.message || "Unknown error");
      throw e; // re-throw so callers know it failed
    }
  };

  /* ─── Undo last step ─── */
  const handleUndo = useCallback(async () => {
    if (!undoableStep) return;
    setUndoLoading(true);
    try {
      const field = undoableStep.timestamp_field || undoableStep.field_check?.field;
      if (!field) {
        toast({ title: "Cannot undo", description: "This step type doesn't support undo", variant: "destructive" });
        return;
      }

      // For status-based steps, revert to previous status
      if (undoableStep.completion_check === "status") {
        const prevStatus = undoableStep.field_check?.value === "in_progress" ? "scheduled" : "new";
        const { error } = await supabase.from(tableName as any).update({ status: prevStatus } as any).eq("id", jobId);
        if (error) throw error;
      } else {
        // Clear the timestamp/field
        const { error } = await supabase.from(tableName as any).update({ [field]: null } as any).eq("id", jobId);
        if (error) throw error;
      }

      // Verify the undo took effect
      await new Promise((r) => setTimeout(r, 1000));
      const { data } = await supabase.from(tableName as any).select(field).eq("id", jobId).single();
      if (data && (data as any)[field]) {
        toast({ title: "Undo may not have saved", description: "Please try again", variant: "destructive" });
      } else {
        logActivity.mutate({
          job_id: jobId,
          action: "workflow_undo",
          performed_by: "Office",
          details: `Undid step "${undoableStep.label}" — cleared ${field}`,
        });
        invalidateJob();
        toast({ title: "Step undone", description: `"${undoableStep.label}" has been rolled back` });
      }
    } catch (e: any) {
      toast({ title: "Undo failed", description: e.message, variant: "destructive" });
      logWorkflowError("undo", e.message);
    } finally {
      setUndoLoading(false);
      setShowUndoConfirm(false);
    }
  }, [undoableStep, jobId, tableName]);

  /* ─── Action handlers mapped by primary_action ─── */

  const handlers: Record<string, () => Promise<void> | void> = {
    schedule: () => setScheduling(true),
    assign: () => setAssigning(true),

    collect_deposit: async () => {
      const depositAmt = prompt("Enter deposit amount ($):");
      if (!depositAmt || isNaN(Number(depositAmt))) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("stripe-checkout", {
          body: { type: "deposit", job_id: jobId, amount: Number(depositAmt), customer_name: job.customer_name, customer_email: job.customer_email, success_url: `${window.location.origin}/jobs/${jobId}?deposit=paid`, cancel_url: `${window.location.origin}/jobs/${jobId}` },
        });
        if (error) throw error;
        if (data?.url) { navigator.clipboard.writeText(data.url); toast({ title: "Deposit link copied!", description: `$${depositAmt} deposit link ready to share.` }); }
      } catch (e: any) {
        toast({ title: "Stripe error", description: e.message, variant: "destructive" });
        logWorkflowError("collect_deposit", e.message);
      }
      setLoading(false);
    },

    send_confirmation: async () => {
      if (!hasPhone) { toast({ title: "No phone number", variant: "destructive" }); return; }
      setLoading(true);
      try {
        const { error } = await supabase.functions.invoke("send-job-reminders", { body: { manual_job_id: jobId } });
        if (error) throw error;
        await stampTimestamp("confirmation_sent_at", "Send Confirmation");
        logActivity.mutate({ job_id: jobId, action: "confirmation_sent", performed_by: "Office", details: "Confirmation SMS sent to customer" });
        toast({ title: "Confirmation sent", description: `SMS sent to ${job.customer_name}` });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("send_confirmation", e.message);
      }
      setLoading(false);
    },

    send_install_checklist: () => onSendForm("install_checklist"),

    dispatch: async () => {
      // Gap detection: warn if site_visit_missing and no photos
      if (job.site_visit_missing && !job.photos_uploaded_at) {
        const proceed = await confirmDialog({
          title: "⚠️ No site visit on file",
          description: "This job has no site visit — photos and equipment data may be missing. Request customer photos before dispatching, or proceed anyway.",
          confirmText: "Dispatch Anyway",
          cancelText: "Hold Off",
          destructive: true,
        });
        if (!proceed) return;
        logActivity.mutate({
          job_id: jobId,
          action: "dispatch_missing_data_override",
          performed_by: "Office",
          details: "Dispatched despite missing site visit data",
        });
      }
      try {
        // Query parts_orders for pickup info to append to dispatch SMS
        let pickupSuffix = "";
        try {
          const { data: partsOrders } = await supabase
            .from("parts_orders" as any)
            .select("po_number, description, supply_houses:supply_house_id(name)")
            .eq("job_id", jobId)
            .eq("status", "ready_for_pickup");
          if (partsOrders && partsOrders.length > 0) {
            const lines = (partsOrders as any[]).map((po: any) => {
              const houseName = po.supply_houses?.name || "Supply house";
              return `📦 Pick up at: ${houseName}${po.po_number ? `\nPO# ${po.po_number}` : ""}${po.description ? ` — ${po.description}` : ""}`;
            });
            pickupSuffix = "\n\n" + lines.join("\n");
          }
        } catch (e) {
          console.warn("Failed to query parts_orders for dispatch:", e);
        }

        // Pass pickup info via a custom header or append to the dispatch flow
        if (pickupSuffix) {
          // Store pickup suffix temporarily so the dispatch SMS can include it
          (window as any).__dispatchPickupSuffix = pickupSuffix;
        }

        onDispatch();
        setTimeout(async () => {
          try {
            await stampTimestamp("dispatch_sent_at", "Dispatch");
            logActivity.mutate({ job_id: jobId, action: "dispatched", performed_by: "Office", details: `Dispatched to ${job.assigned_to || "tech"}` });
          } catch { /* already handled inside stampTimestamp */ }
          delete (window as any).__dispatchPickupSuffix;
        }, 1000);
      } catch (e: any) {
        toast({ title: "Dispatch failed", description: e.message, variant: "destructive" });
        logWorkflowError("dispatch", e.message);
      }
    },

    send_eta: async () => {
      if (!hasPhone) { toast({ title: "No phone number", variant: "destructive" }); return; }
      setLoading(true);
      try {
        const techName = job.assigned_to || "Your technician";
        const body = `Hi ${job.customer_name || ""}, ${techName} is on the way to ${job.address || "your location"}. See you soon!`;
        const result = await sendSmsImpl({
          to: job.customer_phone, body, jobId,
          contactName: job.customer_name, contactType: "customer",
          relatedCustomerId: job.customer_id, source: "workflow_send_eta",
        });
        if (!result.success) throw new Error(result.error || "Send failed");
        await stampTimestamp("on_my_way_sent_at", "Send ETA");
        logActivity.mutate({ job_id: jobId, action: "eta_sent", performed_by: "Office", details: "ETA SMS sent to customer" });
        toast({ title: "ETA text sent" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("send_eta", e.message);
      }
      setLoading(false);
    },

    mark_in_progress: async () => {
      try {
        const updateField = isEstimate ? { work_status: "in_progress" } : { status: "in_progress" };
        const { error } = await supabase.from(tableName as any).update(updateField as any).eq("id", jobId);
        if (error) throw error;
        if (!isEstimate) {
          logActivity.mutate({ job_id: jobId, action: "marked_in_progress", performed_by: "Office", details: "Job marked in progress" });
        }
        invalidateJob();
        toast({ title: isEstimate ? "Estimate marked in progress" : "Job marked in progress" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("mark_in_progress", e.message);
      }
    },

    send_form: () => onSendForm("techform"),

    confirm_photos: async () => {
      try {
        await stampTimestamp("photos_uploaded_at", "Confirm Photos");
        logActivity.mutate({ job_id: jobId, action: "photos_confirmed", performed_by: "Office" });
        toast({ title: "Photos confirmed" });
      } catch { /* handled */ }
    },

    register_warranty: async () => {
      try {
        await stampTimestamp("warranty_registered_at", "Register Warranty");
        logActivity.mutate({ job_id: jobId, action: "warranty_registered", performed_by: "Office" });
        toast({ title: "Warranty registered" });
        // Auto-generate certificates if we have equipment data
        if (job.customer_id && jobEquipment?.records?.length) {
          try {
            const eq = jobEquipment.records[0];
            await generateInstallCertificates({
              customer_id: job.customer_id,
              job_id: jobId,
              customerName: job.customer_name || "",
              brand: eq.brand || equipBrand || "",
              model: eq.model_number || "",
              serialNumber: eq.serial_number || "",
              installDate: job.scheduled_date || new Date().toISOString().split("T")[0],
              equipmentDescription: `${eq.brand || ""} ${eq.model_number || ""}`.trim(),
            });
            queryClient.invalidateQueries({ queryKey: ["customer_certificates", job.customer_id] });
            toast({ title: "Certificates generated", description: "Warranty, labor warranty, and no-lemon certificates created" });

            // Auto-create Comfort Club agreement (included with install)
            try {
              const installDate = job.scheduled_date || new Date().toISOString().split("T")[0];
              const endDate = new Date(installDate);
              endDate.setFullYear(endDate.getFullYear() + 2);

              // Check if active agreement already exists
              const { data: existingAgreement } = await supabase
                .from("service_agreements" as any)
                .select("id")
                .eq("customer_id", job.customer_id!)
                .eq("status", "active")
                .gte("end_date", installDate)
                .limit(1);

              if (!existingAgreement?.length) {
                await supabase.from("service_agreements" as any).insert({
                  customer_id: job.customer_id,
                  plan_name: "Comfort Club",
                  plan_type: "maintenance",
                  frequency: "biannual",
                  price: 0,
                  start_date: installDate,
                  end_date: endDate.toISOString().split("T")[0],
                  status: "active",
                  agreement_discount_percent: 15,
                  total_visits: 4,
                  visits_used: 0,
                  plan_source: "install_included",
                } as any);
                queryClient.invalidateQueries({ queryKey: ["service_agreements"] });
                toast({ title: "Comfort Club activated", description: "2-year membership included with install" });
              }
            } catch (agErr: any) {
              console.warn("Comfort Club agreement creation failed:", agErr);
            }
          } catch (certErr: any) {
            console.warn("Certificate generation failed:", certErr);
          }
        }
      } catch { /* handled */ }
    },

    submit_rebate: async () => {
      setLoading(true);
      try {
        const { error } = await supabase.functions.invoke("send-rebate-email", { body: { job_id: jobId } });
        if (error) throw error;
        await stampTimestamp("rebate_submitted_at", "Submit Rebate");
        logActivity.mutate({ job_id: jobId, action: "rebate_submitted", performed_by: "Office" });
        toast({ title: "Rebate submitted" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("submit_rebate", e.message);
      }
      setLoading(false);
    },

    schedule_inspection: async () => {
      try {
        await stampTimestamp("inspection_scheduled_at", "Schedule Inspection");
        logActivity.mutate({ job_id: jobId, action: "inspection_scheduled", performed_by: "Office" });
        toast({ title: "Inspection scheduled" });
      } catch { /* handled */ }
    },

    lookup_jurisdiction: async () => {
      setLoading(true);
      try {
        const { error } = await supabase.functions.invoke("lookup-jurisdiction", { body: { job_id: jobId } });
        if (error) throw error;
        await stampTimestamp("jurisdiction_looked_up_at", "Lookup Jurisdiction");
        logActivity.mutate({ job_id: jobId, action: "jurisdiction_lookup", performed_by: "Autopilot" });
        toast({ title: "Jurisdiction lookup complete", description: "Check job details for result" });
      } catch (e: any) {
        toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
        logWorkflowError("lookup_jurisdiction", e.message);
      }
      setLoading(false);
    },

    pull_permit: async () => {
      try {
        await stampTimestamp("permit_pulled_at", "Pull Permit");
        logActivity.mutate({ job_id: jobId, action: "permit_pulled", performed_by: "Office" });
        // Resolve any permit override alert
        await supabase.from("workflow_alerts" as any)
          .update({ resolved_at: new Date().toISOString() } as any)
          .eq("job_id", jobId)
          .eq("alert_type", "permit_override");
        toast({ title: "Permit marked as pulled" });
      } catch { /* handled */ }
    },

    mark_inspection_passed: async () => {
      try {
        await stampTimestamp("inspection_passed_at", "Mark Inspection Passed");
        logActivity.mutate({ job_id: jobId, action: "inspection_passed", performed_by: "Office" });
        toast({ title: "Inspection passed" });
      } catch { /* handled */ }
    },

    send_invoice: async () => {
      try {
        await stampTimestamp("invoice_sent_at", "Send Invoice");
        // Bridge: also mark the latest draft customer_invoice as "sent"
        const { data: drafts } = await supabase
          .from("customer_invoices")
          .select("id")
          .eq("job_id", jobId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(1);
        if (drafts?.[0]) {
          await supabase.from("customer_invoices").update({
            status: "sent",
            sent_at: new Date().toISOString(),
          }).eq("id", drafts[0].id);
          queryClient.invalidateQueries({ queryKey: ["customer_invoices", jobId] });
        }
        logActivity.mutate({ job_id: jobId, action: "invoice_sent", performed_by: "Office" });
        toast({ title: "Invoice marked as sent" });
      } catch { /* handled */ }
    },

    mark_paid: async () => {
      try {
        await stampTimestamp("payment_collected_at", "Mark Paid");
        // Clear any payment errors and set status to invoiced
        await supabase.from(tableName as any).update({
          last_payment_error: null,
          last_payment_error_at: null,
          status: "invoiced",
        } as any).eq("id", jobId);
        logActivity.mutate({ job_id: jobId, action: "payment_collected", performed_by: "Office" });
        invalidateJob();
        toast({ title: "Payment collected" });
      } catch { /* handled */ }
    },

    request_review: async () => {
      if (!hasPhone) { toast({ title: "No phone number", variant: "destructive" }); return; }
      setLoading(true);
      try {
        const { error } = await supabase.functions.invoke("send-review-request", { body: { job_id: jobId } });
        if (error) throw error;
        // Edge function stamps review_request_sent_at — no need to double-stamp here
        invalidateJob();
        toast({ title: "Review request sent" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("request_review", e.message);
      }
      setLoading(false);
    },

    complete_follow_up: async () => {
      try {
        await stampTimestamp("follow_up_completed_at", "Complete Follow-up");
        // FIX #2: Auto-set status to "done" on last workflow step
        await supabase.from(tableName as any).update({ status: "done" } as any).eq("id", jobId);
        logActivity.mutate({ job_id: jobId, action: "follow_up_completed", performed_by: "Office", details: "Job marked done" });
        invalidateJob();
        toast({ title: "Follow-up completed — job done!" });
      } catch { /* handled */ }
    },

    send_maint_report: async () => {
      try {
        await stampTimestamp("maint_report_sent_at", "Send Maintenance Report");
        logActivity.mutate({ job_id: jobId, action: "maint_report_sent", performed_by: "Office" });
        toast({ title: "Maintenance report sent" });
      } catch { /* handled */ }
    },

    schedule_next_visit: async () => {
      try {
        await stampTimestamp("next_visit_scheduled_at", "Schedule Next Visit");
        // FIX #2: Auto-set status to "done" on last maintenance step
        await supabase.from(tableName as any).update({ status: "done" } as any).eq("id", jobId);

        // FIX #4: Log agreement visit if this is a maintenance job
        if (job.job_type === "maintenance" && job.customer_id) {
          try {
            const { data: agreements } = await supabase
              .from("service_agreements")
              .select("id")
              .eq("customer_id", job.customer_id)
              .eq("status", "active")
              .limit(1);
            if (agreements?.[0]) {
              await supabase.from("agreement_visits").insert({
                agreement_id: agreements[0].id,
                job_id: jobId,
                visit_date: new Date().toISOString().split("T")[0],
                notes: "Auto-logged from workflow completion",
              });
            }
          } catch (e) {
            console.warn("Failed to log agreement visit:", e);
          }
        }

        logActivity.mutate({ job_id: jobId, action: "next_visit_scheduled", performed_by: "Office", details: "Job marked done" });
        invalidateJob();
        toast({ title: "Next visit scheduled — job done!" });
      } catch { /* handled */ }
    },

    review_estimate: async () => {
      const reviewEl = document.querySelector('[data-section="estimate-review"]');
      if (reviewEl) {
        reviewEl.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        toast({ title: "Scroll down to the Overview tab to review this estimate" });
      }
    },

    submit_tech_proposal: async () => {
      // When tech submits a proposal, the estimate should be linked to this source job
      // The actual estimate creation happens in the tech form — here we just remind
      toast({ title: "Open the service form to submit repair tiers and pricing" });
      // If an estimate is created from this step, source_job_id will be set to this job's ID
    },

    review_repair_estimate: async () => {
      const reviewEl = document.querySelector('[data-section="estimate-review"]');
      if (reviewEl) {
        reviewEl.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        toast({ title: "Check the Tech Proposal Queue to review this repair estimate" });
      }
    },

    send_repair_presentation: async () => {
      setLoading(true);
      try {
        // Query the estimate to build a presentation record
        const { data: est } = await supabase
          .from("estimates" as any)
          .select("id, customer_name, customer_email, customer_phone, description, repair_tiers, estimate_type, source_job_id, selected_tiers")
          .eq("id", jobId)
          .single();
        if (est) {
          const estData = est as any;
          const snapshot = { description: estData.description, repair_tiers: estData.repair_tiers, estimate_type: estData.estimate_type };
          const { data: pres } = await supabase
            .from("estimate_presentations" as any)
            .insert({
              estimate_id: jobId,
              customer_email: estData.customer_email,
              pricing_snapshot: snapshot,
              selected_tiers: estData.selected_tiers || ["necessary", "recommended", "deluxe"],
            } as any)
            .select("token")
            .single();
          if (pres) {
            const link = `${window.location.origin}/presentation/${(pres as any).token}`;
            navigator.clipboard.writeText(link);
            toast({ title: "Repair presentation link copied!" });
            // Send SMS if phone available
            if (estData.customer_phone) {
              const firstName = estData.customer_name?.split(" ")[0] || "there";
              const smsBody = `Hi ${firstName}! Your repair diagnosis and options are ready: ${link}`;
              await sendSmsImpl({
                to: estData.customer_phone, body: smsBody, jobId,
                contactName: estData.customer_name, contactType: "customer",
                relatedCustomerId: estData.customer_id, source: "workflow_repair_presentation",
              });
              toast({ title: "Repair presentation sent via SMS" });
            }
          }
        }
        await stampTimestamp("presentation_sent_at", "Send Repair Presentation");
        logActivity.mutate({ job_id: jobId, action: "repair_presentation_sent", performed_by: "Office" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("send_repair_presentation", e.message);
      }
      setLoading(false);
    },

    offer_agreement: async () => {
      try {
        // Create agreement presentation record
        if (job.customer_id) {
          try {
            const { data: templates } = await supabase
              .from("maintenance_plan_templates" as any)
              .select("*")
              .eq("is_active", true)
              .order("sort_order");
            const planOptions = (templates || []).map((t: any) => ({
              name: t.name, price: t.price, frequency: t.frequency,
              visits: t.visits_per_year, features: t.features,
            }));
            const { data: pres } = await supabase
              .from("agreement_presentations" as any)
              .insert({ customer_id: job.customer_id, plan_options: planOptions } as any)
              .select("token")
              .single();
            if (pres) {
              const link = `${window.location.origin}/agreement/${(pres as any).token}`;
              navigator.clipboard.writeText(link);
              toast({ title: "Agreement link copied!", description: "Send this to the customer" });
              // Send via SMS if phone available
              if (job.customer_phone) {
                const body = `Hi ${job.customer_name?.split(" ")[0] || "there"}! Protect your investment with a maintenance plan: ${link}`;
                await sendSmsImpl({
                  to: job.customer_phone, body, jobId,
                  contactName: job.customer_name, contactType: "customer",
                  relatedCustomerId: job.customer_id, source: "workflow_offer_agreement",
                });
              }
            }
          } catch (e) {
            console.warn("Agreement presentation creation failed:", e);
          }
        }
        await stampTimestamp("agreement_offered_at", "Offer Agreement");
        logActivity.mutate({ job_id: jobId, action: "agreement_offered", performed_by: "Office" });
      } catch { /* handled */ }
    },

    send_presentation: async () => {
      setLoading(true);
      try {
        // Query the estimate to build a presentation record with pricing snapshot
        const { data: est } = await supabase
          .from("estimates" as any)
          .select("id, customer_name, customer_email, customer_phone, description, total_price, estimate_type, selected_tiers, line_items, brand, tonnage, system_type")
          .eq("id", jobId)
          .single();
        if (est) {
          const estData = est as any;

          // Build price blocks from equipment_matchups — the single source of truth
          let priceBlocks: Record<string, any> = {};
          try {
            let matchupQuery = supabase
              .from("equipment_matchups" as any)
              .select("*")
              .order("sort_order");

            // Filter by brand if available on the estimate or job equipment
            const matchBrand = estData.brand || equipBrand;
            if (matchBrand) matchupQuery = matchupQuery.eq("brand", matchBrand);

            // Filter by tonnage if available
            if (estData.tonnage) matchupQuery = matchupQuery.eq("tonnage", estData.tonnage);

            // Filter by system_type if available
            if (estData.system_type) matchupQuery = matchupQuery.eq("system_type", estData.system_type);

            const { data: allMatchups } = await matchupQuery;
            // Prefer Multiposition; include H/V only when no Multi exists for that combo
            const multiKeys = new Set((allMatchups || []).filter((m: any) => (m as any).application === "Multiposition").map((m: any) => `${(m as any).brand}|${(m as any).system_type}|${(m as any).tonnage}|${(m as any).tier}`));
            const matchups = (allMatchups || []).filter((m: any) => {
              const app = (m as any).application;
              if (app === "Multiposition" || !app) return true;
              return !multiKeys.has(`${(m as any).brand}|${(m as any).system_type}|${(m as any).tonnage}|${(m as any).tier}`);
            });
            if (matchups && matchups.length > 0) {
              for (const m of matchups as any[]) {
                if (m.tier) {
                  priceBlocks[m.tier.toLowerCase()] = {
                    total_price: m.total_price,
                    factory_rebate_price: m.factory_rebate_price,
                    monthly_payment: m.monthly_payment,
                    early_rebate: m.early_rebate,
                    burnout_rebate: m.burnout_rebate,
                    component_price: m.component_price,
                    condenser_model: m.condenser_model,
                    furnace_model: m.furnace_model,
                    coil_model: m.coil_model,
                    seer2: m.seer2,
                    eer2: m.eer2,
                    hspf2: m.hspf2,
                    tonnage: m.tonnage,
                    ahri_number: m.ahri_number,
                    cps_tonnage: m.cps_tonnage,
                  };
                }
              }
            }
          } catch (matchErr) {
            console.warn("Failed to fetch equipment matchups for price blocks:", matchErr);
          }

          const snapshot = {
            description: estData.description,
            total_price: estData.total_price,
            line_items: estData.line_items,
            estimate_type: estData.estimate_type,
            priceBlocks,
          };
          const { data: pres } = await supabase
            .from("estimate_presentations" as any)
            .insert({
              estimate_id: jobId,
              customer_email: estData.customer_email,
              pricing_snapshot: snapshot,
              selected_tiers: estData.selected_tiers || ["good", "better", "best"],
            } as any)
            .select("token")
            .single();
          if (pres) {
            const link = `${window.location.origin}/presentation/${(pres as any).token}`;
            navigator.clipboard.writeText(link);
            toast({ title: "Presentation link copied!" });
            // Send SMS if phone available
            if (estData.customer_phone) {
              const firstName = estData.customer_name?.split(" ")[0] || "there";
              const smsBody = `Hi ${firstName}! Your custom system options are ready to view: ${link}`;
              await sendSmsImpl({
                to: estData.customer_phone, body: smsBody, jobId,
                contactName: estData.customer_name, contactType: "customer",
                relatedCustomerId: estData.customer_id, source: "workflow_send_presentation",
              });
              toast({ title: "Presentation sent via SMS" });
            }
          }
        }
        await stampTimestamp("presentation_sent_at", "Send Presentation");
        logActivity.mutate({ job_id: jobId, action: "presentation_sent", performed_by: "Office" });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("send_presentation", e.message);
      }
      setLoading(false);
    },

    // Legacy alias
    send_brochure: async () => {
      await handlers.send_presentation();
    },

    mark_won_lost: async () => {
      toast({ title: "Use the estimate status dropdown to mark Won or Lost" });
    },

    complete_finance_paperwork: async () => {
      const email = prompt("DocuSign email for the financing applicant:");
      if (!email) return;
      const dob = prompt("Applicant date of birth (MM/DD/YYYY):");
      if (!dob) return;
      setLoading(true);
      try {
        const { error } = await supabase.from("jobs").update({
          finance_email: email,
          finance_dob: dob,
          finance_paperwork_at: new Date().toISOString(),
        } as any).eq("id", jobId);
        if (error) throw error;
        invalidateJob();
        logActivity.mutate({ job_id: jobId, action: "finance_paperwork_completed", performed_by: "Office", details: `DocuSign email: ${email}` });
        toast({ title: "Finance paperwork complete", description: `DocuSign email: ${email}` });
      } catch (e: any) {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
        logWorkflowError("complete_finance_paperwork", e.message);
      }
      setLoading(false);
    },

    set_payment_method: async () => {
      // This is a secondary action, not a workflow step handler
    },

    none: () => {},
  };

  const handleSchedule = async (date: Date | undefined) => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    try {
      const { error } = await supabase.from(tableName as any).update({ scheduled_date: dateStr } as any).eq("id", jobId);
      if (error) throw error;
      const confirmed = await verifyField("scheduled_date", "Schedule");
      if (confirmed) {
        invalidateJob();
        toast({ title: isEstimate ? "Estimate scheduled" : "Job scheduled", description: format(date, "EEEE, MMM d") });
      }
      setScheduling(false);
    } catch (e: any) {
      toast({ title: "Failed to schedule", description: e.message, variant: "destructive" });
      logWorkflowError("schedule", e.message);
    }
  };

  const handleAssign = async (techName: string) => {
    try {
      const { error } = await supabase.from(tableName as any).update({ assigned_to: techName } as any).eq("id", jobId);
      if (error) throw error;
      // Fire-and-forget sync to HCP
      supabase.functions.invoke("sync-job-to-hcp", {
        body: { [tableName === "estimates" ? "estimate_id" : "job_id"]: jobId },
      }).catch((err) => console.warn("HCP sync failed:", err));

      const confirmed = await verifyField("assigned_to", "Assign Tech");
      if (confirmed) {
        invalidateJob();
        toast({ title: "Tech assigned", description: techName });
      }
      setAssigning(false);
    } catch (e: any) {
      toast({ title: "Failed to assign", description: e.message, variant: "destructive" });
      logWorkflowError("assign", e.message);
    }
  };

  const loaderIcon = <Loader2 className="h-4 w-4 animate-spin" />;
  const activeEmps = (employees || []).filter((e: any) => e.is_active !== false);

  const handlePrimaryClick = () => {
    const handler = handlers[currentStep.primary_action];
    if (handler) handler();
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Payment failure alert */}
      {job.last_payment_error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">Payment Failed</p>
            <p className="text-muted-foreground">{job.last_payment_error}</p>
            {job.last_payment_error_at && (
              <p className="text-muted-foreground mt-0.5">
                {new Date(job.last_payment_error_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Primary action — large, high-contrast, easy to click */}
      {!stageInfo.isComplete ? (
        <Button
          size="lg"
          className={cn(
            "h-12 px-6 text-sm font-bold rounded-xl gap-2 w-full",
            job.last_payment_error && (currentStep.primary_action === "mark_paid" || currentStep.primary_action === "collect_deposit")
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/85"
              : "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] hover:bg-[hsl(var(--success)/0.85)]",
            "shadow-md hover:shadow-lg transition-all duration-150",
          )}
          disabled={loading || dispatching}
          onClick={handlePrimaryClick}
        >
          {loading ? loaderIcon : (
            job.last_payment_error && (currentStep.primary_action === "mark_paid" || currentStep.primary_action === "collect_deposit")
              ? <AlertTriangle className="h-4 w-4" />
              : (WORKFLOW_ICON_MAP[currentStep.icon] || WORKFLOW_ICON_MAP["check-circle"])
          )}
          {job.last_payment_error && currentStep.primary_action === "collect_deposit" ? "Retry Deposit" : 
           job.last_payment_error && currentStep.primary_action === "mark_paid" ? "Retry Payment" : 
           dynamicLabel}
        </Button>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium py-1">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--complete))]" />
          All Steps Complete
        </div>
      )}

      {/* ─── Contextual action panel — shows everything you need for this step ─── */}
      {!stageInfo.isComplete && (resolvedActionLinks.length > 0 || currentStep.primary_action === "register_warranty" || currentStep.primary_action === "pull_permit" || currentStep.primary_action === "schedule_inspection" || currentStep.primary_action === "mark_inspection_passed" || currentStep.primary_action === "submit_rebate" || currentStep.primary_action === "complete_finance_paperwork") && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          {/* Contextual info per step type */}
          {currentStep.primary_action === "register_warranty" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Warranty Registration — {equipBrand || "Unknown Brand"}
              </div>
              <ActionCopyField label="Customer" value={job.customer_name || ""} />
              <ActionCopyField label="Address" value={job.address || ""} />
              <ActionCopyField label="Phone" value={job.customer_phone || ""} />
              <ActionCopyField label="Email" value={job.customer_email || ""} />
              {jobEquipment?.records?.map((eq: any, i: number) => (
                <div key={i} className="space-y-1 pt-1 border-t border-border/50">
                  <ActionCopyField label="Brand" value={eq.brand || ""} />
                  <ActionCopyField label="Model" value={eq.model_number || ""} />
                  <ActionCopyField label="Serial" value={eq.serial_number || ""} />
                  <ActionCopyField label="Install Date" value={job.scheduled_date || ""} />
                </div>
              ))}
            </div>
          )}

          {currentStep.primary_action === "pull_permit" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Permit — {authority ? authority.name : "Jurisdiction Not Found"}
              </div>
              <ActionCopyField label="Customer" value={job.customer_name || ""} />
              <ActionCopyField label="Address" value={job.address || ""} />
              <ActionCopyField label="Phone" value={job.customer_phone || ""} />
              <ActionCopyField label="Zip" value={jobZip || ""} />
              {jobEquipment?.records?.map((eq: any, i: number) => (
                <div key={i} className="space-y-1 pt-1 border-t border-border/50">
                  <ActionCopyField label="Brand" value={eq.brand || ""} />
                  <ActionCopyField label="Model" value={eq.model_number || ""} />
                </div>
              ))}
              {authority?.permit_portal_url && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1.5 border-primary/30 text-primary hover:bg-primary/5 w-full"
                  onClick={() => window.open(authority.permit_portal_url!, "_blank", "noopener")}
                >
                  <ExternalLink className="h-3 w-3" /> Open {authority.name} Portal
                </Button>
              )}
              {authority?.inspection_phone && (
                <ActionCopyField label="Phone" value={authority.inspection_phone} />
              )}
              {!authority && (
                <p className="text-[10px] text-destructive">No authority found for zip {jobZip}. Add one in Admin → Config → Permit Authorities.</p>
              )}
            </div>
          )}

          {/* Pull Permit — show jurisdiction + override button */}
          {currentStep.primary_action === "pull_permit" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {job.jurisdiction ? `Jurisdiction: ${job.jurisdiction}` : "Jurisdiction Pending"}
              </div>
              <ActionCopyField label="Customer" value={job.customer_name || ""} />
              <ActionCopyField label="Address" value={job.address || ""} />
              {(job.permit_portal_url || authority?.permit_portal_url) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1.5 border-primary/30 text-primary hover:bg-primary/5 w-full"
                  onClick={() => window.open(job.permit_portal_url || authority?.permit_portal_url!, "_blank", "noopener")}
                >
                  <ExternalLink className="h-3 w-3" /> Open Permit Portal
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 w-full"
                onClick={async () => {
                  const confirmed = await confirmDialog({
                    title: "Skip permit step?",
                    description: "This will create a Mission Control alert so you can circle back later.",
                    confirmText: "Skip Permit",
                    destructive: true,
                  });
                  if (!confirmed) return;
                  try {
                    // Create workflow alert for override
                    await supabase.from("workflow_alerts" as any).insert({
                      job_id: jobId,
                      step_id: "pull_permit",
                      alert_type: "permit_override",
                      details: `Permit step overridden for ${job.customer_name || "Unknown"} at ${job.address || "Unknown address"}`,
                    } as any);
                    // Stamp the field to advance
                    await stampTimestamp("permit_pulled_at", "Permit Override");
                    logActivity.mutate({ job_id: jobId, action: "permit_override", performed_by: "Office", details: "Permit step skipped — override alert created" });
                    
                    toast({ title: "Permit step skipped", description: "Mission Control alert created — circle back when ready" });
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  }
                }}
              >
                <AlertTriangle className="h-3 w-3" /> Skip — Not Needed / Override
              </Button>
            </div>
          )}

          {(currentStep.primary_action === "schedule_inspection" || currentStep.primary_action === "mark_inspection_passed") && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {authority ? authority.name : "Jurisdiction Not Found"}
              </div>
              {authority?.inspection_phone && (
                <ActionCopyField label="Phone" value={authority.inspection_phone} />
              )}
              {authority?.contact_email && (
                <ActionCopyField label="Email" value={authority.contact_email} />
              )}
              <ActionCopyField label="Job Address" value={job.address || ""} />
              <ActionCopyField label="Zip" value={jobZip || ""} />
              {authority?.notes && (
                <p className="text-[10px] text-muted-foreground italic">{authority.notes}</p>
              )}
              {!authority && (
                <p className="text-[10px] text-destructive">No authority found for zip {jobZip}. Add one in Admin → Config → Permit Authorities.</p>
              )}
            </div>
          )}

          {currentStep.primary_action === "submit_rebate" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Receipt className="h-3.5 w-3.5 text-primary" />
                CPS Energy Rebate
              </div>
              <ActionCopyField label="Customer" value={job.customer_name || ""} />
              <ActionCopyField label="Address" value={job.address || ""} />
              {jobEquipment?.records?.map((eq: any, i: number) => (
                <div key={i} className="space-y-1 pt-1 border-t border-border/50">
                  <ActionCopyField label="Model" value={eq.model_number || ""} />
                  <ActionCopyField label="Serial" value={eq.serial_number || ""} />
                </div>
              ))}
            </div>
          )}

          {currentStep.primary_action === "complete_finance_paperwork" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CreditCard className="h-3.5 w-3.5 text-primary" />
                Synchrony Financing
              </div>
              <ActionCopyField label="Customer" value={job.customer_name || ""} />
              <ActionCopyField label="Phone" value={job.customer_phone || ""} />
              <ActionCopyField label="Email" value={job.customer_email || ""} />
              <p className="text-[10px] text-muted-foreground">Open the Synchrony portal below, then enter the DocuSign email and DOB to complete this step.</p>
            </div>
          )}

          {/* Action link buttons — open external portals in new tabs */}
          {resolvedActionLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {resolvedActionLinks.map((link, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => window.open(link.url, "_blank", "noopener")}
                >
                  <ExternalLink className="h-3 w-3" />
                  {link.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick access secondary actions */}
      {!stageInfo.isComplete && (
        <div className="flex flex-wrap gap-1.5">
          {/* Undo last step */}
          {undoableStep && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={undoLoading}
              onClick={() => setShowUndoConfirm(true)}
            >
              {undoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Undo: {undoableStep.label.length > 20 ? undoableStep.label.slice(0, 20) + "…" : undoableStep.label}
            </Button>
          )}
        </div>
      )}

      {/* Inline Schedule popover */}
      <Popover open={scheduling} onOpenChange={setScheduling}>
        <PopoverTrigger asChild><span /></PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00") : undefined}
            onSelect={handleSchedule}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {/* Inline Assign select */}
      {assigning && (
        <div className="flex gap-2 items-center">
          <Select onValueChange={(val) => handleAssign(val)}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="Select a tech…" />
            </SelectTrigger>
            <SelectContent>
              {activeEmps.map((emp: any) => (
                <SelectItem key={emp.id} value={emp.name}>{emp.name} — {emp.role || "Tech"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setAssigning(false)}>Cancel</Button>
        </div>
      )}

      {/* Undo confirmation dialog */}
      <AlertDialog open={showUndoConfirm} onOpenChange={setShowUndoConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo workflow step?</AlertDialogTitle>
            <AlertDialogDescription>
              This will roll back <strong>"{undoableStep?.label}"</strong> and move the workflow back one step. 
              Any external actions (like sent SMS or Stripe links) cannot be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUndo}
              className="bg-amber-600 hover:bg-amber-700"
              disabled={undoLoading}
            >
              {undoLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Undo2 className="h-4 w-4 mr-1" />}
              Undo Step
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
