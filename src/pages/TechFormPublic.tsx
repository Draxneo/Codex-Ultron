import { useState, useEffect, useCallback, useRef } from "react";
import { MobileCallScreen } from "@/components/MobileCallScreen";
import { SoftphoneProvider } from "@/components/SoftphoneProvider";

/** Safely renders MobileCallScreen with its own SoftphoneProvider since /form/:token is outside the main app shell */
function SafeMobileCallScreen() {
  return (
    <SoftphoneProvider>
      <MobileCallScreen />
    </SoftphoneProvider>
  );
}
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { AddressLink } from "@/components/AddressLink";
import { useParams, useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

import ExifReader from "exifreader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Camera, Loader2, Phone, ChevronDown, ChevronUp, Circle, AlertCircle, X, MapPin, ImagePlus, Keyboard, BookOpen, WifiOff, Wifi, Home, MessageSquare, ShieldCheck, Sparkles, Navigation, Wrench } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { launchNavigation } from "@/lib/launchNavigation";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { formatPhone } from "@/lib/formatters";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TechFormCopilot } from "@/components/TechFormCopilot";
import { TechPricebookDrawer } from "@/components/TechPricebookDrawer";
import { TechEstimateCartDrawer } from "@/components/TechEstimateCartDrawer";

import { TechFormSections } from "@/components/TechFormSections";
import { TechFormSnapAndTalk } from "@/components/TechFormSnapAndTalk";
import { PropertyCard } from "@/components/PropertyCard";
import { OnMyWayButton } from "@/components/OnMyWayButton";
import { useOfflineFormSync } from "@/hooks/useOfflineFormSync";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { SignaturePad } from "@/components/SignaturePad";
import { useCustomerDiscovery, saveDiscoveryAnswer } from "@/hooks/useCustomerDiscovery";

interface FormField {
  id: string;
  field_type: string;
  label: string;
  is_required: boolean;
  options: string[] | null;
  sort_order: number;
  condition: string | null;
  step_group?: string | null;
}

type FieldStatus = "empty" | "saving" | "saved" | "error";

interface UploadedPhoto {
  id: string;
  file_path: string;
  status: "uploading" | "done" | "error";
  preview: string;
}

export default function TechFormPublic() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isDemo = false;

  const [job, setJob] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [autoCompletedTasks, setAutoCompletedTasks] = useState<string[]>([]);
  const [preinstallPhotos, setPreinstallPhotos] = useState<{ photo_category: string; file_path: string }[]>([]);
  const [pickupInfo, setPickupInfo] = useState<any>(null);
  const [showPreinstall, setShowPreinstall] = useState(false);
  const [sendBrochures, setSendBrochures] = useState(false);
  const [isServiceAgreement, setIsServiceAgreement] = useState(false);
  const [planPerks, setPlanPerks] = useState<string[]>([]);
  const [showPricebook, setShowPricebook] = useState(false);
  const [showEstimateCart, setShowEstimateCart] = useState(false);

  const [techFormId, setTechFormId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, FieldStatus>>({});
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, UploadedPhoto[]>>({});
  const [extractionStatuses, setExtractionStatuses] = useState<Record<string, "idle" | "extracting" | "done" | "error">>({});
  const [extractionResults, setExtractionResults] = useState<Record<string, any>>({});

  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const [geoStatus, setGeoStatus] = useState<"pending" | "acquired" | "denied" | "error">("pending");
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const saveFieldRef = useRef<(fieldId: string, val: string) => Promise<void>>(async () => {});

  // Offline resilience
  const { isOnline, pendingCount, saveDraft, loadDraft, clearDraft, queueSave, queuePhoto, flushQueue } = useOfflineFormSync(techFormId);

  // KEEP SCREEN ON: Prevent Android from turning off the screen while tech is filling out the form.
  // Without this, Android dims/locks after 30-60s — tech has to unlock and re-navigate constantly.
  // Automatically released when component unmounts (job submitted or tech navigates away).
  useKeepAwake();

  // Fetch prior discovery answers for the customer (shown as collapsible context)
  const { data: priorDiscovery } = useCustomerDiscovery(job?.customer_id);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // SAFE SWIPE NAVIGATION: Edge swipe right navigates home.
  // Added confirmation dialog so accidental pocket swipes don't lose form context.
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeRight: () => {
      // Only prompt if form has been started (has a real techFormId and some progress)
      const hasProgress = Object.values(fieldStatuses).some(s => s === "saved");
      if (hasProgress) {
        if (window.confirm("Go back to dashboard? Your progress is saved.")) {
          navigate("/tech");
        }
      } else {
        navigate("/tech");
      }
    },
    onSwipeDown: () => {
      if (isRefreshing || window.scrollY > 50) return;
      setIsRefreshing(true);
      window.location.reload();
    },
    edgeOnly: true,
    threshold: 80,
    maxTime: 500,
  });

  // Lifecycle guards: flush debounced saves when app hides or closes
  useEffect(() => {
    const flushDebounced = () => {
      Object.entries(debounceTimers.current).forEach(([fieldId, timer]) => {
        clearTimeout(timer);
        delete debounceTimers.current[fieldId];
        const val = values[fieldId];
        if (val?.trim() && techFormId) {
          saveFieldRef.current(fieldId, val);
        }
      });
      saveDraft(values);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDebounced();
    };
    const onBeforeUnload = () => flushDebounced();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [values, techFormId, saveDraft]);

  useEffect(() => {
    if (techFormId && isOnline) {
      flushQueue();
    }
  }, [techFormId, isOnline, flushQueue]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus("acquired");
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy;
        if (techFormId) {
          supabase.from("tech_forms").update({
            latitude: lat, longitude: lng, location_accuracy: acc,
          }).eq("id", techFormId).then(() => {});
        }
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [techFormId]);

  useEffect(() => {
    if (!token) return;
    const sepIdx = token.indexOf("__");
    if (sepIdx < 1) { setLoading(false); return; }
    const jobId = token.slice(0, sepIdx);
    const empId = token.slice(sepIdx + 2);

    Promise.all([
      supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      supabase.from("employees").select("id, name, role, phone, email, is_active").eq("id", empId).single(),
    ]).then(async ([jobRes, empRes]) => {
      let jobData = jobRes.data;

      // Fallback: if not found in jobs, check estimates
      if (!jobData) {
        const { data: estData } = await supabase
          .from("estimates").select("*").eq("id", jobId).maybeSingle();
        if (estData) {
          jobData = {
            ...(estData as any),
            job_type: "estimate",
            estimate_type: (estData as any).estimate_type || null,
            customer_phone: (estData as any).customer_phone,
            job_number: (estData as any).estimate_number,
            hcp_job_number: (estData as any).estimate_number,
          } as any;
        }
      }

      // Fallback: if job has no customer_phone but has a linked customer, fetch phone
      if (jobData && !jobData.customer_phone && jobData.customer_id) {
        const { data: custData } = await supabase
          .from("customers")
          .select("phone, mobile_phone")
          .eq("id", jobData.customer_id)
          .maybeSingle();
        if (custData) {
          const fallbackPhone = custData.mobile_phone || custData.phone;
          if (fallbackPhone) {
            jobData = { ...jobData, customer_phone: fallbackPhone };
          }
        }
      }

      setJob(jobData);
      setEmployee(empRes.data);

      if (!jobData || !empRes.data) { setLoading(false); return; }

      if (jobData.job_type === "maintenance" && jobData.customer_id) {
        const { getCustomerAgreementDiscount } = await import("@/hooks/useServiceAgreements");
        const info = await getCustomerAgreementDiscount(jobData.customer_id);
        setPlanPerks(info.perks || []);
      }

      let fieldData: FormField[] = [];
      if (jobData.job_type) {
        const { data } = await supabase
          .from("tech_form_fields")
          .select("*")
          .eq("job_type", jobData.job_type)
          .order("sort_order");
        fieldData = (data as FormField[]) || [];
        setFields(fieldData);
      }

      const { data: existingForm } = await supabase
        .from("tech_forms")
        .select("*")
        .eq("job_id", jobData.id)
        .eq("employee_id", empRes.data.id)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: submittedForm } = await supabase
        .from("tech_forms")
        .select("id")
        .eq("job_id", jobData.id)
        .eq("employee_id", empRes.data.id)
        .eq("status", "submitted")
        .limit(1)
        .maybeSingle();

      if (submittedForm) {
        setSubmitted(true);
        setLoading(false);
        return;
      }

      if (existingForm) {
        setTechFormId(existingForm.id);
        if (existingForm.is_service_agreement) setIsServiceAgreement(true);
        const { data: responses } = await supabase
          .from("tech_form_responses")
          .select("field_id, value")
          .eq("tech_form_id", existingForm.id);
        if (responses) {
          const savedValues: Record<string, string> = {};
          const savedStatuses: Record<string, FieldStatus> = {};
          responses.forEach(r => {
            if (r.value) {
              savedValues[r.field_id] = r.value;
              savedStatuses[r.field_id] = "saved";
            }
          });
          setValues(savedValues);
          setFieldStatuses(savedStatuses);
        }
        const { data: photos } = await supabase
          .from("tech_form_photos")
          .select("id, file_path, photo_type")
          .eq("tech_form_id", existingForm.id);
        if (photos && photos.length > 0) {
          const photoMap: Record<string, UploadedPhoto[]> = {};
          for (const p of photos) {
            const fieldMatch = fieldData.find(f => f.label === p.photo_type);
            if (fieldMatch) {
              const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(p.file_path);
              if (!photoMap[fieldMatch.id]) photoMap[fieldMatch.id] = [];
              photoMap[fieldMatch.id].push({ id: p.id, file_path: p.file_path, status: "done", preview: urlData.publicUrl });
            }
          }
          setUploadedPhotos(photoMap);
        }
      } else {
        const { data: newForm } = await supabase
          .from("tech_forms")
          .insert({ job_id: jobData.id, employee_id: empRes.data.id, notes: null, status: "draft" })
          .select("id")
          .single();
        if (newForm) {
          setTechFormId(newForm.id);
          try {
            const cached = localStorage.getItem(`techform_draft_${newForm.id}`);
            if (cached) {
              const cachedValues = JSON.parse(cached);
              setValues(cachedValues);
              Object.keys(cachedValues).forEach(fid => {
                if (cachedValues[fid]?.trim()) {
                  setFieldStatuses(prev => ({ ...prev, [fid]: "saving" }));
                }
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }

      if (jobData.id) {
        const allPreinstallPhotos: { photo_category: string; file_path: string }[] = [];


        const { data: preinstallTechForms } = await supabase
          .from("tech_forms")
          .select("id, jobs(job_type)")
          .eq("job_id", jobData.id);
        const preinstallFormIds = (preinstallTechForms || [])
          .filter((f: any) => f.jobs?.job_type === "preinstall")
          .map((f: any) => f.id);
        if (preinstallFormIds.length > 0) {
          const { data: newPhotos } = await supabase
            .from("tech_form_photos")
            .select("photo_type, file_path")
            .in("tech_form_id", preinstallFormIds);
          if (newPhotos) {
            allPreinstallPhotos.push(
              ...newPhotos.map(p => ({ photo_category: p.photo_type || "general", file_path: p.file_path }))
            );
          }
        }

        setPreinstallPhotos(allPreinstallPhotos);

        const { data: partsOrders } = await (supabase
          .from("parts_orders" as any)
          .select("*, supply_houses(id, name, address, phone)") as any)
          .eq("job_id", jobData.id)
          .in("status", ["ordered", "ready_for_pickup"]);
        if (partsOrders && partsOrders.length > 0) {
          const items = partsOrders.map((po: any) => ({
            description: po.description || "Parts",
            po_number: po.po_number,
            supply_house_name: po.supply_houses?.name,
          }));
          const poNumbers = partsOrders.filter((po: any) => po.po_number).map((po: any) => po.po_number);
          const primarySh = partsOrders.find((po: any) => po.supply_houses)?.supply_houses;
          setPickupInfo({
            supply_house_name: primarySh?.name,
            supply_house_address: primarySh?.address,
            po_numbers: poNumbers,
            items,
            notes: (jobData as any).pickup_notes,
          });
        } else if ((jobData as any).pickup_notes) {
          setPickupInfo({ notes: (jobData as any).pickup_notes });
        }
      }

      setLoading(false);
    });
  }, [token]);

  const visibleFields = fields.filter(f => {
    if (!f.condition) return true;
    if (f.condition === "service_agreement") return isServiceAgreement;
    if (f.condition === "!service_agreement") return !isServiceAgreement;
    if (f.condition.startsWith("season:")) {
      const requiredSeason = f.condition.split(":")[1];
      return job?.season === requiredSeason;
    }
    if (f.condition.startsWith("field:")) {
      const match = f.condition.match(/^field:(.+)=(.+)$/);
      if (match) {
        const [, targetLabel, expectedValue] = match;
        const targetField = fields.find(tf => tf.label === targetLabel);
        if (!targetField) return false;
        const currentValue = values[targetField.id] || "";
        if (expectedValue === "true") return currentValue === "true";
        if (expectedValue === "false") return currentValue !== "true";
        return currentValue === expectedValue;
      }
    }
    if (!job?.system_type) return true;
    const conditions = f.condition.split(",").map(c => c.trim());
    return conditions.includes(job.system_type);
  });

  const isPhotoFieldComplete = (f: FormField) => {
    if (f.field_type === "photo_before_after") {
      const beforePhotos = (uploadedPhotos[`${f.id}_before`] || []).filter(p => p.status === "done");
      const afterPhotos = (uploadedPhotos[`${f.id}_after`] || []).filter(p => p.status === "done");
      return beforePhotos.length > 0 && afterPhotos.length > 0;
    }
    const hasPhoto = (uploadedPhotos[f.id]?.filter(p => p.status === "done").length || 0) > 0;
    const hasManualText = !!(values[f.id]?.trim());
    return hasPhoto || hasManualText;
  };

  const totalFields = visibleFields.length;
  const savedFieldsCount = visibleFields.filter(f => {
    if (f.field_type === "photo" || f.field_type.startsWith("photo_")) return isPhotoFieldComplete(f);
    if (f.field_type === "temp_differential") return !!(values[`${f.id}_supply`] && values[`${f.id}_return`]);
    return fieldStatuses[f.id] === "saved";
  }).length;
  const progressPercent = totalFields > 0 ? Math.round((savedFieldsCount / totalFields) * 100) : 0;

  const saveField = useCallback(async (fieldId: string, val: string) => {
    if (!techFormId || !val.trim()) return;
    setFieldStatuses(prev => ({ ...prev, [fieldId]: "saving" }));
    try {
      await supabase
        .from("tech_form_responses")
        .delete()
        .eq("tech_form_id", techFormId)
        .eq("field_id", fieldId);
      const { error } = await supabase
        .from("tech_form_responses")
        .insert({ tech_form_id: techFormId, field_id: fieldId, value: val });
      if (error) throw error;
      setFieldStatuses(prev => ({ ...prev, [fieldId]: "saved" }));

      // Auto-save discovery answers to the customer record
      const field = fields.find(f => f.id === fieldId);
      if (field?.step_group === "discovery" && job?.customer_id) {
        saveDiscoveryAnswer(job.customer_id, job.id, field.label, val);
      }
    } catch {
      setFieldStatuses(prev => ({ ...prev, [fieldId]: "error" }));
      queueSave(fieldId, val);
    }
  }, [techFormId, queueSave, fields, job]);

  useEffect(() => {
    saveFieldRef.current = saveField;
  }, [saveField]);

  const handleTextChange = (fieldId: string, val: string) => {
    const newValues = { ...values, [fieldId]: val };
    setValues(newValues);
    saveDraft(newValues);
    if (debounceTimers.current[fieldId]) clearTimeout(debounceTimers.current[fieldId]);
    if (val.trim()) {
      setFieldStatuses(prev => ({ ...prev, [fieldId]: "saving" }));
      debounceTimers.current[fieldId] = setTimeout(() => saveField(fieldId, val), 800);
    } else {
      setFieldStatuses(prev => ({ ...prev, [fieldId]: "empty" }));
    }
  };

  const handleSelectChange = (fieldId: string, val: string) => {
    const newValues = { ...values, [fieldId]: val };
    setValues(newValues);
    saveDraft(newValues);
    saveField(fieldId, val);
  };

  /**
   * handlePhotoCapture — Upload photos in parallel.
   *
   * PERFORMANCE FIX: Old code uploaded photos one at a time sequentially.
   * On a weak cell signal, 5 photos = 5× the wait time.
   * Now all photos start uploading simultaneously with Promise.all.
   * Each photo still shows its own uploading/done/error state independently.
   */
  const handlePhotoCapture = async (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !techFormId) return;
    const files = Array.from(e.target.files);
    const field = fields.find(f => f.id === fieldId);
    const labelLower = field?.label.toLowerCase() || "";
    const fieldType = field?.field_type || "";
    const isDataPlate = labelLower.includes("data plate");
    const isSupplyTicket = labelLower.includes("supply house") || labelLower.includes("pickup ticket");
    // OCR photo types
    const ocrTypeMap: Record<string, string> = {
      photo_gauge: "gauge",
      photo_capacitor: "capacitor",
      photo_multimeter: "multimeter",
      photo_filter: "filter",
    };
    const ocrType = ocrTypeMap[fieldType] || null;
    const needsExtraction = isDataPlate || isSupplyTicket || !!ocrType;

    // Add all photos to state as "uploading" immediately so the tech
    // sees progress indicators right away
    const tempIds = files.map(() => `temp_${Date.now()}_${Math.random()}`);
    const previews = files.map(f => URL.createObjectURL(f));

    setUploadedPhotos(prev => ({
      ...prev,
      [fieldId]: [
        ...(prev[fieldId] || []),
        ...files.map((_, i) => ({ id: tempIds[i], file_path: "", status: "uploading" as const, preview: previews[i] })),
      ],
    }));

    // Upload all photos simultaneously — much faster on weak signal
    await Promise.all(files.map(async (photo, i) => {
      const tempId = tempIds[i];
      const path = `${techFormId}/${fieldId}_${Date.now()}_${i}_${photo.name}`;

      const { error: uploadErr } = await supabase.storage.from("tech-form-photos").upload(path, photo);

      if (uploadErr) {
        setUploadedPhotos(prev => ({
          ...prev,
          [fieldId]: prev[fieldId].map(p => p.id === tempId ? { ...p, status: "error" as const } : p),
        }));
        queuePhoto(fieldId, photo, field?.label || "general");
        return;
      }

      // Extract EXIF GPS data
      let photoLat: number | null = null;
      let photoLng: number | null = null;
      let photoTakenAt: string | null = null;
      try {
        const arrayBuffer = await photo.arrayBuffer();
        const tags = ExifReader.load(arrayBuffer, { expanded: true });
        if (tags.gps?.Latitude && tags.gps?.Longitude) {
          photoLat = tags.gps.Latitude;
          photoLng = tags.gps.Longitude;
        }
        if (tags.exif?.DateTimeOriginal?.description) {
          const raw = tags.exif.DateTimeOriginal.description;
          const iso = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
          photoTakenAt = new Date(iso).toISOString();
        }
      } catch { /* EXIF not available — skip */ }

      const { data: photoRow, error: photoInsertError } = await supabase.from("tech_form_photos").insert({
        tech_form_id: techFormId,
        file_path: path,
        photo_type: field?.label || "general",
        extraction_status: needsExtraction ? "pending" : "none",
        photo_latitude: photoLat,
        photo_longitude: photoLng,
        photo_taken_at: photoTakenAt,
      }).select("id").single();

      if (photoInsertError || !photoRow?.id) {
        console.error("Photo database save failed:", photoInsertError);
        await supabase.storage.from("tech-form-photos").remove([path]);
        queuePhoto(fieldId, photo, field?.label || "general");
        setUploadedPhotos(prev => ({
          ...prev,
          [fieldId]: prev[fieldId].map(p => p.id === tempId ? { ...p, status: "error" as const } : p),
        }));
        toast({
          title: "Photo needs retry",
          description: "The image uploaded, but it did not attach to the job record. Please tap it again when signal is better.",
          variant: "destructive",
        });
        return;
      }

      const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(path);

      setUploadedPhotos(prev => ({
        ...prev,
        [fieldId]: prev[fieldId].map(p =>
          p.id === tempId ? { ...p, id: photoRow.id, file_path: path, status: "done" as const, preview: urlData.publicUrl } : p
        ),
      }));

      if (needsExtraction && photoRow) {
        const extractionType = ocrType || (isSupplyTicket ? "supply_ticket" : "data_plate");
        // Set extraction status for OCR photo types
        if (ocrType) {
          setExtractionStatuses(prev => ({ ...prev, [fieldId]: "extracting" }));
        }
        supabase.functions.invoke("extract-equipment-photo", {
          body: { photo_id: photoRow.id, image_url: urlData.publicUrl, type: extractionType },
        }).then(({ data, error }) => {
          if (ocrType && data?.extracted) {
            setExtractionStatuses(prev => ({ ...prev, [fieldId]: "done" }));
            setExtractionResults(prev => ({ ...prev, [fieldId]: data.extracted }));
            // Auto-populate sub-fields from extraction
            const ex = data.extracted;
            if (ocrType === "gauge") {
              if (ex.suction_pressure) handleTextChange(`${fieldId}_suction`, ex.suction_pressure);
              if (ex.discharge_pressure) handleTextChange(`${fieldId}_discharge`, ex.discharge_pressure);
            } else if (ocrType === "capacitor") {
              if (ex.capacitance_uf) handleTextChange(`${fieldId}_uf`, ex.capacitance_uf);
              if (ex.voltage_vac) handleTextChange(`${fieldId}_vac`, ex.voltage_vac);
            } else if (ocrType === "multimeter") {
              if (ex.reading_value) handleTextChange(`${fieldId}_value`, ex.reading_value);
              if (ex.reading_unit) handleTextChange(`${fieldId}_unit`, ex.reading_unit);
            } else if (ocrType === "filter") {
              if (ex.filter_size) handleTextChange(`${fieldId}_size`, ex.filter_size);
              if (ex.condition) handleSelectChange(`${fieldId}_condition`, ex.condition);
            }
          } else if (ocrType && error) {
            setExtractionStatuses(prev => ({ ...prev, [fieldId]: "error" }));
          }
        }).catch(err => {
          console.error("Extraction trigger failed:", err);
          if (ocrType) setExtractionStatuses(prev => ({ ...prev, [fieldId]: "error" }));
        });
      }
    }));

    e.target.value = "";
  };

  const removePhoto = async (fieldId: string, photoId: string, filePath: string) => {
    setUploadedPhotos(prev => ({
      ...prev,
      [fieldId]: prev[fieldId].filter(p => p.id !== photoId),
    }));
    if (filePath) {
      await supabase.storage.from("tech-form-photos").remove([filePath]);
      await supabase.from("tech_form_photos").delete().eq("id", photoId);
    }
  };

  const handleSubmit = async () => {
    if (!job || !employee || !techFormId) return;

    if (isDemo) {
      setSubmitted(true);
      toast({ title: "Demo Complete", description: "This was a sandbox preview — nothing was saved." });
      return;
    }

    const missingFields: string[] = [];
    for (const field of visibleFields) {
      if (!field.is_required) continue;
      if (field.field_type === "photo" || field.field_type.startsWith("photo_")) {
        if (!isPhotoFieldComplete(field)) missingFields.push(field.label);
      } else if (field.field_type === "temp_differential") {
        if (!values[`${field.id}_supply`] || !values[`${field.id}_return`]) missingFields.push(field.label);
      } else {
        if (fieldStatuses[field.id] !== "saved") missingFields.push(field.label);
      }
    }
    if (missingFields.length > 0) {
      toast({
        title: "Just a heads up! 👋",
        description: `This form is required for payment on the job. Please fill out: ${missingFields.slice(0, 3).join(", ")}${missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : ""}`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    const submittedAt = new Date().toISOString();
    await supabase.from("tech_forms").update({ status: "submitted", is_service_agreement: isServiceAgreement } as any).eq("id", techFormId);

    if (job.job_type === "estimate") {
      const tierField = fields.find(f => f.field_type === "multi_button_group");
      const selectedTiers = tierField ? (values[tierField.id] || "").split(",").filter(Boolean) : [];

      await supabase.from("estimates" as any).update({
        completion_form_sent_at: submittedAt,
        work_status: "pending_review",
      }).eq("id", job.id);

      await supabase.from("estimate_reviews" as any).insert({
        tech_form_id: techFormId,
        job_id: job.id,
        employee_id: employee.id,
        selected_tiers: selectedTiers,
        status: "pending_review",
        payment_preference: null,
      });

      setSubmitting(false);
      setSubmitted(true);
      toast({ title: "Estimate submitted!", description: "Your estimate has been sent for admin review." });
      return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // Resolve pay category from job + equipment data
    const payCategory = (job as any).pay_category || job.job_type || "service";

    const { data: empRate } = await supabase
      .from("employee_pay_rates")
      .select("rate, rate_type")
      .eq("employee_id", employee.id)
      .eq("job_type", payCategory)
      .single();

    let finalRate = empRate?.rate;
    let rateType = (empRate as any)?.rate_type || "flat";
    if (finalRate == null) {
      const { data: defaultRate } = await supabase
        .from("pay_rates" as any)
        .select("rate, rate_type")
        .eq("job_type", payCategory)
        .single();
      finalRate = (defaultRate as any)?.rate ?? 0;
      rateType = (defaultRate as any)?.rate_type || "flat";
    }

    // Calculate amount: percentage rates need invoice total
    let payAmount = finalRate;
    if (rateType === "percentage" && finalRate > 0) {
      const { data: invoiceData } = await supabase
        .from("customer_invoices")
        .select("total")
        .eq("job_id", job.id)
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1);
      const invoiceTotal = invoiceData?.[0]?.total || 0;
      payAmount = invoiceTotal > 0 ? (finalRate / 100) * invoiceTotal : 0;
    }

    // Insert commission entry as "held" — released when customer pays
    await supabase.from("paysheet_entries").insert({
      employee_id: employee.id,
      job_id: job.id,
      tech_form_id: techFormId,
      amount: payAmount,
      commission_amount: payAmount,
      pay_week_start: monday.toISOString().split("T")[0],
      pay_week_end: sunday.toISOString().split("T")[0],
      status: "held",
      pay_category: payCategory,
      rate_type: rateType,
    } as any);

    // --- Time tracking + hourly pay ---
    // Get the tech_form created_at as arrival time
    const { data: techFormData } = await supabase
      .from("tech_forms")
      .select("created_at")
      .eq("id", techFormId)
      .single();

    const arrivedAt = techFormData?.created_at || now.toISOString();
    const departedAt = now.toISOString();
    const timeOnSiteMin = Math.max(0, (new Date(departedAt).getTime() - new Date(arrivedAt).getTime()) / 60000);
    const workDate = (job.scheduled_date || now.toISOString().split("T")[0]);

    // Calculate drive time from previous job's departure
    let driveTimeMin: number | null = null;
    const { data: prevEntry } = await supabase
      .from("time_entries" as any)
      .select("departed_at")
      .eq("employee_id", employee.id)
      .eq("work_date", workDate)
      .order("departed_at", { ascending: false })
      .limit(1)
      .single();
    if ((prevEntry as any)?.departed_at) {
      driveTimeMin = Math.max(0, (new Date(arrivedAt).getTime() - new Date((prevEntry as any).departed_at as string).getTime()) / 60000);
    }

    // Insert time entry
    await supabase.from("time_entries" as any).insert({
      employee_id: employee.id,
      job_id: job.id,
      tech_form_id: techFormId,
      work_date: workDate,
      arrived_at: arrivedAt,
      departed_at: departedAt,
      time_on_site_min: Math.round(timeOnSiteMin * 100) / 100,
      drive_time_min: driveTimeMin != null ? Math.round(driveTimeMin * 100) / 100 : null,
      source: "form",
    });

    // If employee has hourly pay model, insert a separate hourly paysheet entry
    const { data: empData } = await supabase
      .from("employees")
      .select("hourly_rate, pay_model")
      .eq("id", employee.id)
      .single();

    if (empData && (empData as any).pay_model !== "commission" && ((empData as any).hourly_rate || 0) > 0) {
      const hoursWorked = Math.round((timeOnSiteMin / 60) * 100) / 100;
      const hourlyAmount = Math.round(hoursWorked * ((empData as any).hourly_rate || 0) * 100) / 100;

      await supabase.from("paysheet_entries").insert({
        employee_id: employee.id,
        job_id: job.id,
        tech_form_id: techFormId,
        amount: hourlyAmount,
        hourly_amount: hourlyAmount,
        hours_worked: hoursWorked,
        pay_week_start: monday.toISOString().split("T")[0],
        pay_week_end: sunday.toISOString().split("T")[0],
        status: "pending",
        pay_category: payCategory,
        rate_type: "hourly",
      } as any);
    }

    await supabase.from("jobs").update({
      completion_form_sent_at: submittedAt,
      completed_at: job.completed_at || submittedAt,
      status: ["done", "completed", "complete", "closed", "invoiced"].includes(String(job.status || "").toLowerCase())
        ? job.status
        : "done",
    } as any).eq("id", job.id);

    await supabase.from("activity_log").insert({
      job_id: job.id,
      action: "tech_form_submitted",
      performed_by: employee.name || "Technician",
      details: `${employee.name || "Technician"} submitted the ${job.job_type || "service"} completion form.`,
    } as any);

    const completedTaskTitles: string[] = ["Tech form submitted"];
    setAutoCompletedTasks(completedTaskTitles);

    clearDraft();
    setSubmitting(false);
    setSubmitted(true);
    toast({ title: "Form submitted!", description: "Your job completion has been recorded." });

  };

  const FieldStatusIcon = ({ status }: { status: FieldStatus }) => {
    switch (status) {
      case "saving": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case "saved": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Circle className="h-4 w-4 text-muted-foreground/30" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job || !employee) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Invalid form link. Please contact your office.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleUndo = async () => {
    if (!techFormId || !job || !employee || isDemo) return;
    setSubmitting(true);

    const { data: currentResponses } = await supabase
      .from("tech_form_responses")
      .select("field_id, value")
      .eq("tech_form_id", techFormId);
    if (currentResponses && currentResponses.length > 0) {
      const responseMap: Record<string, string> = {};
      currentResponses.forEach((r: any) => { if (r.value) responseMap[r.field_id] = r.value; });
      await supabase.from("tech_form_versions" as any).insert({
        tech_form_id: techFormId,
        responses: responseMap,
        snapshot_reason: "undo",
      });
    }

    await supabase.from("tech_forms").update({ status: "draft" }).eq("id", techFormId);
    await supabase.from("paysheet_entries").delete().eq("tech_form_id", techFormId);
    await supabase.from("time_entries" as any).delete().eq("tech_form_id", techFormId);
    await supabase.from("estimate_reviews" as any).delete().eq("tech_form_id", techFormId);
    if (job.job_type === "estimate") {
      await supabase.from("estimates" as any).update({
        completion_form_sent_at: null,
        work_status: "in_progress",
      }).eq("id", job.id);
    } else {
      await supabase.from("jobs").update({
        completion_form_sent_at: null,
        completed_at: null,
        status: "in_progress",
      } as any).eq("id", job.id);
    }

    setSubmitting(false);
    setSubmitted(false);
    setAutoCompletedTasks([]);
    toast({ title: "Submission undone", description: "Form is back to draft — you can make changes." });
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold">All Done!</h2>
            <p className="text-muted-foreground">Your form has been submitted.</p>
            {autoCompletedTasks.length > 0 && (
              <div className="rounded-lg bg-muted p-3 text-left space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Tasks auto-completed:</p>
                {autoCompletedTasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
            {!isDemo && (
              <Button
                variant="outline"
                onClick={handleUndo}
                disabled={submitting}
                className="w-full mt-2"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submitted by mistake? Undo
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={swipeRef} className="min-h-screen bg-muted/30">
      {isDemo && (
        <div className="bg-amber-500 text-amber-950 text-center text-xs font-semibold py-1.5 px-4">
          🔍 SANDBOX PREVIEW — No data will be saved
        </div>
      )}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-2.5 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const hasProgress = Object.values(fieldStatuses).some(s => s === "saved");
                if (hasProgress) {
                  if (window.confirm("Go back to dashboard? Your progress is saved.")) navigate("/tech");
                } else {
                  navigate("/tech");
                }
              }}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-muted hover:bg-accent active:bg-accent transition-colors -ml-1 mr-0.5"
              aria-label="Back to dashboard"
            >
              <Home className="h-5 w-5 text-foreground" />
            </button>
            {isOnline ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-destructive" />}
            {savedFieldsCount} of {totalFields} completed
            {!isOnline && <span className="text-destructive font-medium">· Offline</span>}
            {pendingCount > 0 && isOnline && <span className="text-amber-500 font-medium">· Syncing {pendingCount}…</span>}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {!isDemo && (job?.customer_phone || job?.address) && (
        <div className="sticky top-[52px] z-[9] bg-background border-b px-4 py-2 flex gap-2 overflow-hidden">
          {job?.customer_phone && (
            <OnMyWayButton
              jobId={job.id}
              customerPhone={job.customer_phone}
              customerName={job.customer_name}
              jobAddress={job.address}
              employeeName={employee?.name}
              employeeAddress={employee?.home_address}
              alreadySent={job.on_my_way_sent_at}
              className="flex-1 h-9 text-xs justify-center"
            />
          )}
          {job?.customer_phone && (
            <ClickToCall
              phone={job.customer_phone}
              contactName={job.customer_name}
              className="flex-1 inline-flex items-center justify-center h-9 rounded-md border border-primary/30 bg-background text-[hsl(var(--primary))] hover:bg-primary/10 transition-colors gap-1 text-xs font-medium"
              iconClassName="h-4 w-4"
            >
              Call
            </ClickToCall>
          )}
          {job?.customer_phone && (
            <Button
              variant="outline"
              className="flex-1 h-9 gap-1 text-xs text-[hsl(var(--primary))] border-primary/30 hover:bg-primary/10"
              onClick={() => {
                openSmsComposer(job.customer_phone, {
                  contactName: job.customer_name || undefined,
                  jobId: job.id,
                  customerId: job.customer_id || undefined,
                });
              }}
            >
              <MessageSquare className="h-4 w-4" />
              SMS
            </Button>
          )}
          {job?.address && (
            <Button
              variant="outline"
              className="flex-1 h-9 gap-1 text-xs text-[hsl(var(--primary))] border-primary/30 hover:bg-primary/10"
              onClick={() => launchNavigation(job.address)}
            >
              <Navigation className="h-4 w-4" />
              Nav
            </Button>
          )}
        </div>
      )}
      <SafeMobileCallScreen />
      <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">
        <Card className="overflow-hidden">
          <div className="bg-primary/10 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold tracking-tight">
                JOB #{job.job_number || job.hcp_job_number || "—"}
              </span>
              <Badge variant="secondary" className="uppercase text-[10px] font-bold tracking-wider">
                {(job as any).estimate_type
                  ? `Estimate – ${((job as any).estimate_type as string).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`
                  : job.job_type || "service"}
              </Badge>
              {job.season && (
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {job.season === "winter" ? "❄️ Winter" : "☀️ Spring"}
                </Badge>
              )}
            </div>
            <p className="font-semibold text-foreground">{job.customer_name || "Unknown Customer"}</p>
            {job.description && <p className="text-sm text-muted-foreground">{job.description}</p>}
            <div className="flex flex-col gap-1.5 pt-1">
              {job.address && (
                <AddressLink address={job.address} className="text-sm text-foreground" iconClassName="h-3.5 w-3.5" />
              )}
              {job.customer_phone && (
                <span className="text-sm text-foreground">{formatPhone(job.customer_phone) || job.customer_phone}</span>
              )}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-primary/10">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Tech:</span>
                <span className="text-xs font-semibold">{employee.name}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {geoStatus === "acquired" && <span className="text-emerald-600">Location ✓</span>}
                {geoStatus === "pending" && <span>Locating…</span>}
                {geoStatus === "denied" && <span className="text-destructive">Denied</span>}
                {geoStatus === "error" && <span className="text-destructive">Unavailable</span>}
              </div>
            </div>
            {job.system_type && (
              <Badge variant="outline" className="text-[10px] mt-1">{job.system_type.replace(/_/g, " ")}</Badge>
            )}
          </div>
        </Card>

        {job.job_type === "maintenance" && (
          job.is_service_agreement ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  🛡️ Active Service Plan Member
                </span>
              </div>
              <ul className="text-xs text-emerald-700 dark:text-emerald-400 space-y-0.5 pl-7">
                {planPerks.length > 0
                  ? planPerks.map((p, i) => <li key={i}>✓ {p}</li>)
                  : <li>✓ Active member benefits apply</li>}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  ⚡ Sales Opportunity — Mention the Service Plan!
                </span>
              </div>
              <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 pl-7">
                {planPerks.length > 0
                  ? planPerks.map((p, i) => <li key={i}>• {p}</li>)
                  : <li>• Ask about our service plans!</li>}
              </ul>
            </div>
          )
        )}

        {job.address && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors min-h-[48px]">
                <Home className="h-4 w-4" />
                Property Details
                <ChevronDown className="h-3.5 w-3.5 ml-auto" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <PropertyCard address={job.address} />
            </CollapsibleContent>
          </Collapsible>
        )}

        {preinstallPhotos.length > 0 && (
          <Card>
            <CardContent className="p-3">
              <button
                type="button"
                onClick={() => setShowPreinstall(!showPreinstall)}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary w-full min-h-[44px]"
              >
                <Camera className="h-4 w-4" />
                Install Checklist Photos ({preinstallPhotos.length})
                {showPreinstall ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
              </button>
              {showPreinstall && (
                <div className="space-y-3 mt-2">
                  {["indoor_unit", "coil", "outdoor_unit", "air_handler", "electrical_panel", "thermostat", "access_path", "job_site"].map(cat => {
                    const catPhotos = preinstallPhotos.filter(p => p.photo_category === cat);
                    if (catPhotos.length === 0) return null;
                    const catLabel = cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                    return (
                      <div key={cat}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{catLabel}</p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {catPhotos.map((p, i) => {
                            const { data } = supabase.storage.from("preinstall-photos").getPublicUrl(p.file_path);
                            return (
                              <a key={i} href={data.publicUrl} target="_blank" rel="noopener">
                                <img src={data.publicUrl} alt={catLabel} className="h-20 w-20 object-cover rounded border shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {job?.job_type === "estimate" && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Send manufacturer brochures?</p>
                    <p className="text-xs text-muted-foreground">Email equipment info to this customer</p>
                  </div>
                </div>
                <Switch
                  checked={sendBrochures}
                  onCheckedChange={setSendBrochures}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prior discovery notes for returning customers */}
        {priorDiscovery && priorDiscovery.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-foreground hover:bg-primary/10 active:bg-primary/15 transition-colors min-h-[48px]">
                <MessageSquare className="h-4 w-4 text-primary" />
                Previous Visit Notes ({priorDiscovery.length})
                <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-1">
                <CardContent className="p-3 space-y-1">
                  {priorDiscovery.map(a => (
                    <div key={a.id} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0">•</span>
                      <span><span className="font-medium">{a.field_label}:</span> {a.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {visibleFields.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No form fields configured for this job type.
            </CardContent>
          </Card>
        ) : (
          <TechFormSnapAndTalk
            fields={visibleFields}
            values={values}
            fieldStatuses={fieldStatuses}
            uploadedPhotos={uploadedPhotos}
            extractionStatuses={extractionStatuses}
            extractionResults={extractionResults}
            onTextChange={handleTextChange}
            onSelectChange={handleSelectChange}
            onPhotoCapture={handlePhotoCapture}
            onRemovePhoto={removePhoto}
            onSubmit={handleSubmit}
            onSignatureSave={async (fieldId, dataUrl) => {
              if (!dataUrl) {
                setValues(prev => ({ ...prev, [fieldId]: "" }));
                setFieldStatuses(prev => ({ ...prev, [fieldId]: "empty" }));
                return;
              }
              if (isDemo) {
                setValues(prev => ({ ...prev, [fieldId]: dataUrl }));
                setFieldStatuses(prev => ({ ...prev, [fieldId]: "saved" }));
                return;
              }
              setFieldStatuses(prev => ({ ...prev, [fieldId]: "saving" }));
              try {
                const blob = await (await fetch(dataUrl)).blob();
                const path = `${techFormId}/sig_${fieldId}_${Date.now()}.png`;
                const { error: upErr } = await supabase.storage.from("tech-form-photos").upload(path, blob);
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(path);
                handleSelectChange(fieldId, urlData.publicUrl);
              } catch {
                setFieldStatuses(prev => ({ ...prev, [fieldId]: "error" }));
              }
            }}
            submitting={submitting}
            isPhotoFieldComplete={isPhotoFieldComplete}
            submitLabel={job?.job_type === "estimate" ? "Submit Estimate" : "Submit Completion"}
            isDemo={isDemo}
            jobContext={{ job_type: job?.job_type, system_type: job?.system_type, brand: job?.brand, description: job?.description }}
            techFormId={techFormId}
          />
        )}
      </div>

      {job?.id && (
        <div className="fixed bottom-4 right-4 z-20 flex items-end gap-2">
          {/* Estimate Cart FAB — only for estimate jobs */}
          {job?.job_type === "estimate" && (
            <button
              onClick={() => setShowEstimateCart(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 transition-colors"
            >
              <ShieldCheck className="h-5 w-5" />
            </button>
          )}

          {/* Pricebook FAB */}
          <button
            onClick={() => setShowPricebook(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg hover:bg-accent/90 transition-colors"
          >
            <Wrench className="h-5 w-5" />
          </button>

          {/* JARVIS Chat FAB */}
          <Collapsible>
            <CollapsibleContent className="mb-2 w-[340px] max-w-[calc(100vw-2rem)] origin-bottom-right">
              <TechFormCopilot jobId={job.id} employeeId={employee?.id} />
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <button className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors">
                <MessageSquare className="h-5 w-5" />
              </button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      )}

      {/* Pricebook Drawer */}
      {job?.id && (
        <TechPricebookDrawer
          open={showPricebook}
          onOpenChange={setShowPricebook}
          jobId={job.id}
          techName={employee?.name}
        />
      )}

      {/* Estimate Cart Drawer */}
      {job?.id && (
        <TechEstimateCartDrawer
          open={showEstimateCart}
          onOpenChange={setShowEstimateCart}
          jobId={job.id}
          estimateId={job.estimate_id || job.id}
          customerId={job.customer_id}
          customerName={job.customer_name}
          customerPhone={job.customer_phone}
          techName={employee?.name}
        />
      )}

    </div>
  );
}
