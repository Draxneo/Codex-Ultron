/**
 * TechFormSections — Unified "What's Next" section-based form renderer.
 *
 * Replaces:
 *   - The flat field list in TechFormPublic.tsx (service/install/maintenance)
 *   - EstimateFormWizard.tsx (estimate step wizard)
 *
 * All job types render through this single component. Fields are grouped by
 * `step_group` (admin-configurable) or auto-inferred from field type/label.
 * One section is "active" at a time (first section with incomplete required fields).
 * Completed sections collapse to a single green checkmark row.
 * Future sections show dimmed but are tappable.
 *
 * Props mirror the data TechFormPublic already manages — this is purely a UI renderer.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CheckCircle, Circle, Loader2, AlertCircle, X, ImagePlus, Keyboard, ChevronDown, ChevronRight, ArrowRight, MapPin, Package, Mic, MicOff, Snowflake, Thermometer } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/components/SignaturePad";

/* ────────── Types ────────── */

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

interface PickupInfo {
  supply_house_name?: string;
  supply_house_address?: string;
  po_numbers?: string[];
  items?: { description: string; po_number?: string; supply_house_name?: string }[];
  notes?: string;
}

interface ExtractionResult {
  _type: string;
  [key: string]: unknown;
}

interface TechFormSectionsProps {
  fields: FormField[];
  values: Record<string, string>;
  fieldStatuses: Record<string, FieldStatus>;
  uploadedPhotos: Record<string, UploadedPhoto[]>;
  manualOverrides: Record<string, boolean>;
  /** Per-field extraction status: idle | extracting | done | error */
  extractionStatuses: Record<string, "idle" | "extracting" | "done" | "error">;
  /** Per-field extraction results from AI */
  extractionResults: Record<string, ExtractionResult>;
  onTextChange: (fieldId: string, val: string) => void;
  onSelectChange: (fieldId: string, val: string) => void;
  onPhotoCapture: (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (fieldId: string, photoId: string, filePath: string) => void;
  onToggleManual: (fieldId: string) => void;
  onSubmit: () => void;
  onSignatureSave?: (fieldId: string, dataUrl: string | null) => void;
  submitting: boolean;
  isPhotoFieldComplete: (f: FormField) => boolean;
  /** Display label for submit button, e.g. "Submit Estimate" or "Submit Completion" */
  submitLabel?: string;
  isDemo?: boolean;
  /** Pickup logistics info from office — rendered in the pickup section */
  pickupInfo?: PickupInfo | null;
  /** Force mobile card layout regardless of viewport (for admin preview) */
  forceMobile?: boolean;
}

/* ────────── Auto-infer step_group from field metadata ────────── */

const SECTION_ORDER = [
  "pickup",
  "arrival",
  "before",
  "photos",
  "specs",
  "diagnosis",
  "checklist",
  "conditions",
  "notes",
  "after",
  "completion",
];

const SECTION_LABELS: Record<string, string> = {
  pickup: "Pick Up",
  arrival: "Arrived On-Site",
  before: "Before — Old Equipment",
  photos: "Photos",
  specs: "New Equipment",
  diagnosis: "Diagnosis",
  checklist: "Checklist",
  conditions: "Site Conditions",
  notes: "Notes",
  after: "After — Finished Work",
  completion: "Completion & Submit",
};

function inferStepGroup(field: FormField): string {
  const label = field.label.toLowerCase();
  const type = field.field_type;

  // Signature → completion
  if (type === "signature") return "completion";

  // OCR photo types
  if (type === "photo_gauge" || type === "photo_capacitor" || type === "photo_multimeter" || type === "temp_differential") return "diagnosis";
  if (type === "photo_filter") return "checklist";
  if (type === "photo_before_after") {
    if (label.includes("before")) return "before";
    if (label.includes("after")) return "after";
    return "photos";
  }

  // Photo fields
  if (type === "photo") {
    if (label.includes("data plate") || label.includes("equipment") || label.includes("unit") || label.includes("condenser") || label.includes("furnace") || label.includes("coil") || label.includes("air handler")) return "photos";
    if (label.includes("supply") || label.includes("pickup") || label.includes("ticket")) return "pickup";
    return "photos";
  }

  // Text / select / button_group / multi_button_group
  if (label.includes("diagnos") || label.includes("recommendation") || label.includes("repair")) return "diagnosis";
  if (label.includes("note")) return "notes";
  if (label.includes("arrival") || label.includes("customer home") || label.includes("on site")) return "arrival";
  if (label.includes("model") || label.includes("serial") || label.includes("spec") || label.includes("refrigerant") || label.includes("tonnage")) return "specs";
  if (label.includes("pickup") || label.includes("supply house") || label.includes("pick up")) return "pickup";
  if (label.includes("condition") || label.includes("ductwork") || label.includes("electrical") || label.includes("access")) return "conditions";

  // Checkbox → checklist
  if (type === "checkbox") return "checklist";

  // Button groups → specs
  if (type === "button_group" || type === "multi_button_group") return "specs";

  return "notes";
}

/* ────────── Field status icon ────────── */

function FieldStatusIcon({ status }: { status: FieldStatus }) {
  switch (status) {
    case "saving": return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case "saved": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
    default: return <Circle className="h-4 w-4 text-muted-foreground/30" />;
  }
}

/* ════════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════════ */

export function TechFormSections({
  fields,
  values,
  fieldStatuses,
  uploadedPhotos,
  manualOverrides,
  extractionStatuses,
  extractionResults,
  onTextChange,
  onSelectChange,
  onPhotoCapture,
  onRemovePhoto,
  onToggleManual,
  onSubmit,
  onSignatureSave,
  submitting,
  isPhotoFieldComplete,
  submitLabel = "Submit Completion",
  isDemo = false,
  pickupInfo,
  forceMobile = false,
}: TechFormSectionsProps) {

  /* ── Group fields into sections ── */
  const sections = useMemo(() => {
    // Build groups
    const grouped: Record<string, FormField[]> = {};
    for (const f of fields) {
      const group = f.step_group || inferStepGroup(f);
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(f);
    }

    // Order sections by predefined order, then any extras alphabetically
    const knownKeys = SECTION_ORDER.filter(k => grouped[k]?.length);
    const extraKeys = Object.keys(grouped).filter(k => !SECTION_ORDER.includes(k)).sort();
    const orderedKeys = [...knownKeys, ...extraKeys];

    return orderedKeys.map(key => ({
      key,
      label: SECTION_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      fields: grouped[key],
    }));
  }, [fields]);

  /* ── Section completion tracking ── */
  const sectionCompletion = useMemo(() => {
    return sections.map(sec => {
      const total = sec.fields.length;
      const completed = sec.fields.filter(f => {
        if (f.field_type === "photo" || f.field_type.startsWith("photo_")) return isPhotoFieldComplete(f);
        if (f.field_type === "temp_differential") return !!(values[`${f.id}_supply`] && values[`${f.id}_return`]);
        return fieldStatuses[f.id] === "saved";
      }).length;
      const requiredComplete = sec.fields
        .filter(f => f.is_required)
        .every(f => {
          if (f.field_type === "photo" || f.field_type.startsWith("photo_")) return isPhotoFieldComplete(f);
          if (f.field_type === "temp_differential") return !!(values[`${f.id}_supply`] && values[`${f.id}_return`]);
          return fieldStatuses[f.id] === "saved";
        });
      return { key: sec.key, total, completed, requiredComplete, allComplete: completed === total };
    });
  }, [sections, fieldStatuses, uploadedPhotos, values, isPhotoFieldComplete]);

  /* ── Active section = first with incomplete required fields ── */
  const autoActiveIndex = sectionCompletion.findIndex(s => !s.requiredComplete);
  const activeDefault = autoActiveIndex >= 0 ? autoActiveIndex : sections.length - 1;

  const [expandedIndex, setExpandedIndex] = useState<number>(activeDefault);

  // Auto-advance when a section completes
  const prevCompletion = useRef(sectionCompletion);
  useEffect(() => {
    const prev = prevCompletion.current;
    for (let i = 0; i < sectionCompletion.length; i++) {
      if (!prev[i]?.requiredComplete && sectionCompletion[i]?.requiredComplete && i === expandedIndex) {
        // This section just completed — auto advance to next incomplete
        const nextIncomplete = sectionCompletion.findIndex((s, idx) => idx > i && !s.requiredComplete);
        if (nextIncomplete >= 0) {
          setExpandedIndex(nextIncomplete);
        }
        break;
      }
    }
    prevCompletion.current = sectionCompletion;
  }, [sectionCompletion]);

  /* ── Overall progress across all sections ── */
  const totalFields = useMemo(() => sectionCompletion.reduce((s, c) => s + c.total, 0), [sectionCompletion]);
  const completedFields = useMemo(() => sectionCompletion.reduce((s, c) => s + c.completed, 0), [sectionCompletion]);
  const progressPercent = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  /* ── Next section after expanded ── */
  const nextSectionLabel = useMemo(() => {
    const nextIdx = sectionCompletion.findIndex((s, idx) => idx > expandedIndex && !s.requiredComplete);
    return nextIdx >= 0 ? sections[nextIdx]?.label : null;
  }, [expandedIndex, sectionCompletion, sections]);

  /* ── Only render the active (expanded) section ── */
  const activeSec = sections[expandedIndex];
  const activeComp = sectionCompletion[expandedIndex];
  const isLastSection = expandedIndex === sections.length - 1;

  /* ── Mobile: field-level carousel state ── */
  const isMobileViewport = useIsMobile();
  const isMobile = forceMobile || isMobileViewport;
  const [mobileFieldIdx, setMobileFieldIdx] = useState(0);

  // Reset field index when section changes
  useEffect(() => {
    setMobileFieldIdx(0);
  }, [expandedIndex]);

  // Auto-advance field on mobile when a field is completed
  const prevFieldStatuses = useRef(fieldStatuses);
  useEffect(() => {
    if (!isMobile || !activeSec) return;
    const currentField = activeSec.fields[mobileFieldIdx];
    if (!currentField) return;
    const prev = prevFieldStatuses.current[currentField.id];
    const curr = fieldStatuses[currentField.id];
    if (prev !== "saved" && curr === "saved" && mobileFieldIdx < activeSec.fields.length - 1) {
      const timer = setTimeout(() => setMobileFieldIdx(i => i + 1), 400);
      return () => clearTimeout(timer);
    }
    prevFieldStatuses.current = fieldStatuses;
  }, [fieldStatuses, isMobile, activeSec, mobileFieldIdx]);

  /* ── Mobile field swipe ── */
  const fieldSwipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: () => {
      if (!activeSec) return;
      if (mobileFieldIdx < activeSec.fields.length - 1) {
        setMobileFieldIdx(i => i + 1);
      } else {
        const nextIdx = sectionCompletion.findIndex((s, idx) => idx > expandedIndex && !s.requiredComplete);
        if (nextIdx >= 0) setExpandedIndex(nextIdx);
        else if (expandedIndex < sections.length - 1) setExpandedIndex(expandedIndex + 1);
      }
    },
    onSwipeRight: () => {
      if (mobileFieldIdx > 0) {
        setMobileFieldIdx(i => i - 1);
      } else if (expandedIndex > 0) {
        setExpandedIndex(expandedIndex - 1);
      }
    },
    threshold: 50,
    maxTime: 500,
  });

  /* ── Section swipe (desktop) ── */
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: () => {
      const nextIdx = sectionCompletion.findIndex((s, idx) => idx > expandedIndex && !s.requiredComplete);
      if (nextIdx >= 0) setExpandedIndex(nextIdx);
      else if (expandedIndex < sections.length - 1) setExpandedIndex(expandedIndex + 1);
    },
    onSwipeRight: () => {
      if (expandedIndex > 0) setExpandedIndex(expandedIndex - 1);
    },
    threshold: 50,
    maxTime: 500,
  });

  const renderFieldProps = useCallback((field: FormField) => ({
    key: field.id,
    field,
    value: values[field.id] || "",
    status: (fieldStatuses[field.id] || "empty") as FieldStatus,
    photos: uploadedPhotos[field.id] || [],
    manualOverride: manualOverrides[field.id] || false,
    extractionStatus: (extractionStatuses[field.id] || "idle") as "idle" | "extracting" | "done" | "error",
    extractionResult: extractionResults[field.id] || null,
    allValues: values,
    onTextChange,
    onSelectChange,
    onPhotoCapture,
    onRemovePhoto,
    onToggleManual,
    onSignatureSave,
    isPhotoComplete: isPhotoFieldComplete(field),
    isDemo,
  }), [values, fieldStatuses, uploadedPhotos, manualOverrides, extractionStatuses, extractionResults, onTextChange, onSelectChange, onPhotoCapture, onRemovePhoto, onToggleManual, onSignatureSave, isPhotoFieldComplete, isDemo]);

  return (
    <div ref={isMobile ? fieldSwipeRef : swipeRef} className="space-y-3">
      {/* Section dots */}
      <div className="flex items-center justify-center gap-1.5 py-1">
        {sections.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setExpandedIndex(i)}
            className={cn(
              "rounded-full transition-all",
              i === expandedIndex
                ? "h-2.5 w-2.5 bg-primary"
                : sectionCompletion[i]?.allComplete
                  ? "h-2 w-2 bg-emerald-500"
                  : "h-2 w-2 bg-muted-foreground/25"
            )}
            aria-label={`Go to section ${sections[i]?.label}`}
          />
        ))}
      </div>

      {/* Active section */}
      {activeSec && (
        <div id={`section-${activeSec.key}`} className="rounded-lg border bg-card overflow-hidden">
          {/* Section header */}
          <div className="w-full flex items-center gap-2 px-4 py-3 bg-card">
            {activeComp?.allComplete ? (
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-emerald-500" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {!activeComp?.allComplete && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    ▸ What's Next
                  </span>
                )}
                <span className={cn(
                  "text-sm font-semibold",
                  activeComp?.allComplete ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
                )}>
                  {activeSec.label}
                </span>
              </div>
            </div>
            {isMobile && activeSec.fields.length > 1 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {mobileFieldIdx + 1}/{activeSec.fields.length}
              </span>
            )}
          </div>

          {/* Mobile field dots */}
          {isMobile && activeSec.fields.length > 1 && (
            <div className="flex items-center justify-center gap-1 px-4 pb-2">
              {activeSec.fields.map((f, i) => {
                const isCompleted = f.field_type === "photo" || f.field_type.startsWith("photo_")
                  ? isPhotoFieldComplete(f)
                  : fieldStatuses[f.id] === "saved";
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMobileFieldIdx(i)}
                    className={cn(
                      "rounded-full transition-all",
                      i === mobileFieldIdx
                        ? "h-2 w-4 bg-primary rounded-full"
                        : isCompleted
                          ? "h-1.5 w-1.5 bg-emerald-500"
                          : "h-1.5 w-1.5 bg-muted-foreground/25"
                    )}
                  />
                );
              })}
            </div>
          )}

          {/* Section fields */}
          <div className="px-4 pb-4 space-y-3">
            {/* Pickup logistics info */}
            {activeSec.key === "pickup" && pickupInfo && (pickupInfo.items?.length || pickupInfo.supply_house_name) && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" /> Pickup Instructions
                  </p>
                  {pickupInfo.supply_house_name && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(pickupInfo.supply_house_address || pickupInfo.supply_house_name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <MapPin className="h-4 w-4 shrink-0" /> {pickupInfo.supply_house_name}
                    </a>
                  )}
                  {pickupInfo.po_numbers && pickupInfo.po_numbers.length > 0 && (
                    <p className="text-sm font-mono">PO# {pickupInfo.po_numbers.join(", ")}</p>
                  )}
                  {pickupInfo.items?.map((item, idx) => (
                    <div key={idx} className="text-sm border-t pt-1.5 mt-1.5 first:border-0 first:pt-0 first:mt-0">
                      <p className="font-medium">{item.description}</p>
                      {item.po_number && <p className="text-xs text-muted-foreground">PO# {item.po_number}</p>}
                      {item.supply_house_name && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {item.supply_house_name}
                        </p>
                      )}
                    </div>
                  ))}
                  {pickupInfo.notes && <p className="text-xs text-muted-foreground italic">{pickupInfo.notes}</p>}
                </CardContent>
              </Card>
            )}

            {/* MOBILE: one field at a time */}
            {isMobile ? (
              <>
                <div className="max-h-[55vh] overflow-y-auto">
                  {activeSec.fields[mobileFieldIdx] && (
                    <FieldRenderer {...renderFieldProps(activeSec.fields[mobileFieldIdx])} />
                  )}
                </div>

                {/* Mobile field nav buttons */}
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (mobileFieldIdx > 0) setMobileFieldIdx(i => i - 1);
                      else if (expandedIndex > 0) setExpandedIndex(expandedIndex - 1);
                    }}
                    disabled={mobileFieldIdx === 0 && expandedIndex === 0}
                    className="flex-1 min-h-[40px]"
                  >
                    ← Back
                  </Button>

                  {mobileFieldIdx < activeSec.fields.length - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => setMobileFieldIdx(i => i + 1)}
                      className="flex-1 min-h-[40px]"
                    >
                      Next →
                    </Button>
                  ) : isLastSection ? (
                    <Button
                      onClick={onSubmit}
                      disabled={submitting}
                      className="flex-1 min-h-[44px] font-semibold"
                    >
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                      {submitting ? "Submitting..." : submitLabel}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        const nextIdx = sectionCompletion.findIndex((s, idx) => idx > expandedIndex && !s.requiredComplete);
                        setExpandedIndex(nextIdx >= 0 ? nextIdx : expandedIndex + 1);
                      }}
                      className="flex-1 min-h-[40px]"
                    >
                      Next Section →
                    </Button>
                  )}
                </div>
              </>
            ) : (
              /* DESKTOP: all fields stacked */
              <>
                {activeSec.fields.map(field => (
                  <FieldRenderer {...renderFieldProps(field)} />
                ))}

                {isLastSection ? (
                  <Button
                    onClick={onSubmit}
                    disabled={submitting}
                    className="w-full min-h-[52px] text-base font-semibold mt-2"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                    {submitting ? "Submitting..." : submitLabel}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const nextIdx = sectionCompletion.findIndex((s, idx) => idx > expandedIndex && !s.requiredComplete);
                      setExpandedIndex(nextIdx >= 0 ? nextIdx : expandedIndex + 1);
                    }}
                    className="w-full min-h-[44px] text-sm font-medium"
                  >
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Progress bar + Next up */}
      <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedFields} of {totalFields} completed</span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        {nextSectionLabel && !isLastSection && (
          <p className="text-xs text-muted-foreground">
            Next up: <span className="font-semibold text-foreground">{nextSectionLabel}</span>
          </p>
        )}
        {isLastSection && activeComp?.allComplete && (
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            ✓ All sections complete — ready to submit
          </p>
        )}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════════════════════════
   FieldRenderer — renders a single field by type.
   Handles: text, checkbox, select, photo, button_group,
            multi_button_group, signature.
   ════════════════════════════════════════════════════════════════ */

interface FieldRendererProps {
  field: FormField;
  value: string;
  status: FieldStatus;
  photos: UploadedPhoto[];
  manualOverride: boolean;
  isPhotoComplete: boolean;
  isDemo: boolean;
  extractionStatus: "idle" | "extracting" | "done" | "error";
  extractionResult: ExtractionResult | null;
  allValues: Record<string, string>;
  onTextChange: (fieldId: string, val: string) => void;
  onSelectChange: (fieldId: string, val: string) => void;
  onPhotoCapture: (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (fieldId: string, photoId: string, filePath: string) => void;
  onToggleManual: (fieldId: string) => void;
  onSignatureSave?: (fieldId: string, dataUrl: string | null) => void;
}

/* ── AI Read badge ── */
function AiBadge({ fieldId, suffix, value, extractionResult, extractedKey }: {
  fieldId: string; suffix: string; value: string;
  extractionResult: ExtractionResult | null; extractedKey: string;
}) {
  if (!extractionResult) return null;
  const aiValue = String(extractionResult[extractedKey] || "");
  if (!aiValue) return null;
  const isEdited = value !== aiValue;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      isEdited
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    )}>
      {isEdited ? "Edited" : "AI Read ✓"}
    </span>
  );
}

/* ── Shared photo upload UI ── */
function PhotoUploadButtons({
  fieldId, photos, isPhotoComplete,
  onPhotoCapture, onRemovePhoto, label,
}: {
  fieldId: string; photos: UploadedPhoto[]; isPhotoComplete: boolean;
  onPhotoCapture: (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (fieldId: string, photoId: string, filePath: string) => void;
  label?: string;
}) {
  return (
    <>
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {photos.map(photo => (
            <div key={photo.id} className="relative h-20 w-20 rounded border overflow-hidden">
              <img src={photo.preview} alt="" className="h-full w-full object-cover" />
              {photo.status === "uploading" && (
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
              {photo.status === "error" && (
                <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              )}
              {photo.status === "done" && (
                <button type="button" onClick={() => onRemovePhoto(fieldId, photo.id, photo.file_path)}
                  className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/50 text-sm font-medium text-muted-foreground cursor-pointer active:bg-muted">
          <Camera className="h-4 w-4" /> Camera
          <input type="file" accept="image/*" capture="environment" onChange={e => onPhotoCapture(fieldId, e)} className="hidden" />
        </label>
        <label className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-md border-2 border-dashed border-muted-foreground/30 bg-muted/50 text-sm font-medium text-muted-foreground cursor-pointer active:bg-muted">
          <ImagePlus className="h-4 w-4" /> Gallery
          <input type="file" accept="image/*" multiple onChange={e => onPhotoCapture(fieldId, e)} className="hidden" />
        </label>
      </div>
    </>
  );
}

/* ── Voice-first labels ── */
const VOICE_LABELS_RE = /diagnos|note|notes|recommendation|findings|observation|description/i;

/* ── Voice-First Textarea sub-component ── */
function VoiceFirstTextarea({ fieldId, value, onTextChange, isDemo }: {
  fieldId: string; value: string;
  onTextChange: (fieldId: string, val: string) => void;
  isDemo: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isRecording, loading, start, stop } = useVoiceToText({
    onTranscript: (text) => {
      const existing = value.trim();
      const combined = existing ? `${existing} ${text}` : text;
      onTextChange(fieldId, combined);
    },
    onError: (err) => console.error("Voice error:", err),
    silenceTimeout: 3000,
  });

  return (
    <div className="space-y-2">
      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={isRecording ? stop : start}
          disabled={isDemo || loading}
          className={cn(
            "flex-[1.3] flex items-center justify-center gap-2 min-h-[56px] rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.97]",
            isRecording
              ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
              : "border-primary bg-primary/5 text-primary hover:bg-primary/10"
          )}
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Transcribing...</>
          ) : isRecording ? (
            <><MicOff className="h-5 w-5" /> Stop</>
          ) : (
            <><Mic className="h-5 w-5" /> {value.trim() ? "Add More" : "Dictate"}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => textareaRef.current?.focus()}
          className="flex-[0.7] flex items-center justify-center gap-2 min-h-[56px] rounded-xl border-2 border-border bg-card text-sm font-medium text-muted-foreground hover:border-primary/40 transition-all active:scale-[0.97]"
        >
          <Keyboard className="h-4 w-4" /> Type
        </button>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
          </span>
          <span className="text-sm font-medium text-destructive">Listening…</span>
          <div className="flex-1 flex items-center gap-0.5 justify-end">
            {[...Array(5)].map((_, i) => (
              <span
                key={i}
                className="w-1 bg-destructive/60 rounded-full animate-pulse"
                style={{
                  height: `${8 + Math.random() * 16}px`,
                  animationDelay: `${i * 150}ms`,
                  animationDuration: `${600 + Math.random() * 400}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Always-visible textarea */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={e => onTextChange(fieldId, e.target.value)}
        rows={3}
        className="min-h-[44px] text-base"
        placeholder="Tap Dictate to speak, or type here…"
      />
    </div>
  );
}

/* ── Temperature Differential sub-component ── */
function TempDifferentialField({ fieldId, allValues, onTextChange }: {
  fieldId: string; allValues: Record<string, string>;
  onTextChange: (fieldId: string, val: string) => void;
}) {
  const supplyStr = allValues[`${fieldId}_supply`] || "";
  const returnStr = allValues[`${fieldId}_return`] || "";
  const supply = parseFloat(supplyStr);
  const ret = parseFloat(returnStr);
  const hasBoth = !isNaN(supply) && !isNaN(ret);
  const deltaT = hasBoth ? Math.abs(ret - supply) : null;

  // Auto-save delta_t whenever both are present
  useEffect(() => {
    if (deltaT !== null) {
      onTextChange(`${fieldId}_delta_t`, deltaT.toFixed(1));
    }
  }, [deltaT, fieldId]);

  const getColor = (dt: number) => {
    if (dt >= 16 && dt <= 22) return "emerald";
    if ((dt >= 14 && dt < 16) || (dt > 22 && dt <= 25)) return "amber";
    return "red";
  };

  const color = deltaT !== null ? getColor(deltaT) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Snowflake className="h-3.5 w-3.5 text-blue-500" /> Supply Temp (°F)
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={supplyStr}
            onChange={e => onTextChange(`${fieldId}_supply`, e.target.value)}
            placeholder="—"
            className="min-h-[52px] text-xl font-bold text-center"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Thermometer className="h-3.5 w-3.5 text-orange-500" /> Return Temp (°F)
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={returnStr}
            onChange={e => onTextChange(`${fieldId}_return`, e.target.value)}
            placeholder="—"
            className="min-h-[52px] text-xl font-bold text-center"
          />
        </div>
      </div>

      {/* ΔT display */}
      {deltaT !== null && color && (
        <div className={cn(
          "rounded-xl border-2 p-3 text-center space-y-1",
          color === "emerald" && "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800",
          color === "amber" && "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800",
          color === "red" && "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800",
        )}>
          <p className={cn(
            "text-2xl font-black",
            color === "emerald" && "text-emerald-700 dark:text-emerald-400",
            color === "amber" && "text-amber-700 dark:text-amber-400",
            color === "red" && "text-red-700 dark:text-red-400",
          )}>
            ΔT: {deltaT.toFixed(1)}°F
          </p>
          <p className={cn(
            "text-xs font-medium",
            color === "emerald" && "text-emerald-600 dark:text-emerald-400",
            color === "amber" && "text-amber-600 dark:text-amber-400",
            color === "red" && "text-red-600 dark:text-red-400",
          )}>
            {color === "emerald" && "✓ Normal range (16–22°F)"}
            {color === "amber" && "⚠ Marginal — check refrigerant charge and airflow"}
            {color === "red" && "🔴 Outside normal range — document findings in diagnosis"}
          </p>
        </div>
      )}

      {!hasBoth && (
        <p className="text-xs text-muted-foreground text-center">Enter both temperatures to see ΔT</p>
      )}
    </div>
  );
}

function FieldRenderer({
  field, value, status, photos, manualOverride, isPhotoComplete, isDemo,
  extractionStatus, extractionResult, allValues,
  onTextChange, onSelectChange, onPhotoCapture, onRemovePhoto, onToggleManual, onSignatureSave,
}: FieldRendererProps) {

  const isOcrPhotoType = ["photo_gauge", "photo_capacitor", "photo_multimeter", "photo_filter"].includes(field.field_type);
  const isVoiceField = field.field_type === "text" && VOICE_LABELS_RE.test(field.label);

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        {/* ── Button Group (single select) ── */}
        {field.field_type === "button_group" && (
          <>
            <Label className="text-base font-bold text-center block mb-3">
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(field.options as string[] || []).map(opt => {
                const selected = value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelectChange(field.id, opt)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-4 text-center text-sm font-semibold transition-all",
                      "min-h-[56px] active:scale-[0.97]",
                      selected
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Multi Button Group (multi-select) ── */}
        {field.field_type === "multi_button_group" && (
          <>
            <Label className="text-base font-bold text-center block mb-3">
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(field.options as string[] || []).map(opt => {
                const currentVals = (value || "").split(",").filter(Boolean);
                const selected = currentVals.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const curr = (value || "").split(",").filter(Boolean);
                      const next = selected ? curr.filter(v => v !== opt) : [...curr, opt];
                      onSelectChange(field.id, next.join(","));
                    }}
                    className={cn(
                      "rounded-xl border-2 px-3 py-4 text-center text-sm font-semibold transition-all relative",
                      "min-h-[56px] active:scale-[0.97]",
                      selected
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    )}
                  >
                    {selected && <CheckCircle className="absolute top-2 right-2 h-4 w-4 text-primary" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            {(value || "").split(",").filter(Boolean).length > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                {(value || "").split(",").filter(Boolean).length} option(s) selected
              </p>
            )}
          </>
        )}

        {/* ── Text (voice-first for diagnosis/notes) ── */}
        {field.field_type === "text" && isVoiceField && (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor={field.id} className="text-sm font-semibold">
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              <FieldStatusIcon status={status} />
            </div>
            <VoiceFirstTextarea
              fieldId={field.id}
              value={value}
              onTextChange={onTextChange}
              isDemo={isDemo}
            />
          </>
        )}

        {/* ── Text (standard) ── */}
        {field.field_type === "text" && !isVoiceField && (
          <>
            <div className="flex items-center justify-between">
              <Label htmlFor={field.id} className="text-sm font-semibold">
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              <FieldStatusIcon status={status} />
            </div>
            <Input
              id={field.id}
              value={value}
              onChange={e => onTextChange(field.id, e.target.value)}
              className="min-h-[44px] text-base"
            />
          </>
        )}

        {/* ── Temperature Differential ── */}
        {field.field_type === "temp_differential" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                {field.label || "Temperature Differential (ΔT)"} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              {!!(allValues[`${field.id}_supply`] && allValues[`${field.id}_return`]) && (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              )}
            </div>
            <TempDifferentialField
              fieldId={field.id}
              allValues={allValues}
              onTextChange={onTextChange}
            />
          </>
        )}

        {/* ── Checkbox ── */}
        {field.field_type === "checkbox" && (
          <div className="flex items-center justify-between min-h-[44px]">
            <div className="flex items-center gap-3">
              <Checkbox
                id={field.id}
                checked={value === "true"}
                onCheckedChange={(checked) => onSelectChange(field.id, checked ? "true" : "false")}
                className="h-6 w-6"
              />
              <Label htmlFor={field.id} className="text-sm font-semibold cursor-pointer">
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
            </div>
            <FieldStatusIcon status={status} />
          </div>
        )}

        {/* ── Select ── */}
        {field.field_type === "select" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              <FieldStatusIcon status={status} />
            </div>
            <Select value={value} onValueChange={v => onSelectChange(field.id, v)}>
              <SelectTrigger className="min-h-[44px] text-base">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {(field.options as string[] || []).map(opt => (
                  <SelectItem key={opt} value={opt} className="min-h-[44px] text-base">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {/* ── Photo (standard) ── */}
        {field.field_type === "photo" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Camera className="h-4 w-4" />
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              {isPhotoComplete && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>

            <PhotoUploadButtons
              fieldId={field.id}
              photos={photos}
              isPhotoComplete={isPhotoComplete}
              onPhotoCapture={onPhotoCapture}
              onRemovePhoto={onRemovePhoto}
            />

            {/* Manual entry toggle — only for data plate photos */}
            {/data plate|serial|model/i.test(field.label) && (
              <>
                <button type="button" onClick={() => onToggleManual(field.id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-2 -mx-2">
                  <Keyboard className="h-4 w-4" />
                  {manualOverride ? "Hide manual entry" : "Can't read plate? Enter manually"}
                </button>
                {manualOverride && (
                  <div className="space-y-1.5">
                    <Input
                      placeholder="Type model/serial info you can read…"
                      value={value}
                      onChange={e => onTextChange(field.id, e.target.value)}
                      className="min-h-[44px] text-base"
                    />
                    {status === "saved" && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Manual entry saved
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── OCR Photo Fields (gauge, capacitor, multimeter, filter) ── */}
        {isOcrPhotoType && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-2">
                <Camera className="h-4 w-4" />
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              {isPhotoComplete && <CheckCircle className="h-4 w-4 text-emerald-500" />}
            </div>

            <PhotoUploadButtons
              fieldId={field.id}
              photos={photos}
              isPhotoComplete={isPhotoComplete}
              onPhotoCapture={onPhotoCapture}
              onRemovePhoto={onRemovePhoto}
            />

            {/* Extraction spinner */}
            {extractionStatus === "extracting" && (
              <div className="flex items-center gap-2 text-sm text-primary py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {field.field_type === "photo_gauge" && "Reading gauge pressures..."}
                {field.field_type === "photo_capacitor" && "Reading capacitor label..."}
                {field.field_type === "photo_multimeter" && "Reading multimeter display..."}
                {field.field_type === "photo_filter" && "Assessing filter condition..."}
              </div>
            )}

            {extractionStatus === "error" && (
              <p className="text-xs text-destructive">AI extraction failed — enter values manually below.</p>
            )}

            {/* Auto-populated sub-fields */}
            {field.field_type === "photo_gauge" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Suction (psig)</Label>
                    <AiBadge fieldId={field.id} suffix="_suction" value={allValues[`${field.id}_suction`] || ""} extractionResult={extractionResult} extractedKey="suction_pressure" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_suction`] || ""}
                    onChange={e => onTextChange(`${field.id}_suction`, e.target.value)}
                    placeholder="—"
                    className="min-h-[44px] text-base"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Discharge (psig)</Label>
                    <AiBadge fieldId={field.id} suffix="_discharge" value={allValues[`${field.id}_discharge`] || ""} extractionResult={extractionResult} extractedKey="discharge_pressure" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_discharge`] || ""}
                    onChange={e => onTextChange(`${field.id}_discharge`, e.target.value)}
                    placeholder="—"
                    className="min-h-[44px] text-base"
                  />
                </div>
              </div>
            )}

            {field.field_type === "photo_capacitor" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Rating (µF)</Label>
                    <AiBadge fieldId={field.id} suffix="_uf" value={allValues[`${field.id}_uf`] || ""} extractionResult={extractionResult} extractedKey="capacitance_uf" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_uf`] || ""}
                    onChange={e => onTextChange(`${field.id}_uf`, e.target.value)}
                    placeholder="e.g. 45+5"
                    className="min-h-[44px] text-base"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Voltage (VAC)</Label>
                    <AiBadge fieldId={field.id} suffix="_vac" value={allValues[`${field.id}_vac`] || ""} extractionResult={extractionResult} extractedKey="voltage_vac" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_vac`] || ""}
                    onChange={e => onTextChange(`${field.id}_vac`, e.target.value)}
                    placeholder="e.g. 440"
                    className="min-h-[44px] text-base"
                  />
                </div>
              </div>
            )}

            {field.field_type === "photo_multimeter" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Reading</Label>
                    <AiBadge fieldId={field.id} suffix="_value" value={allValues[`${field.id}_value`] || ""} extractionResult={extractionResult} extractedKey="reading_value" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_value`] || ""}
                    onChange={e => onTextChange(`${field.id}_value`, e.target.value)}
                    placeholder="—"
                    className="min-h-[44px] text-base"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Unit</Label>
                    <AiBadge fieldId={field.id} suffix="_unit" value={allValues[`${field.id}_unit`] || ""} extractionResult={extractionResult} extractedKey="reading_unit" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_unit`] || ""}
                    onChange={e => onTextChange(`${field.id}_unit`, e.target.value)}
                    placeholder="V, A, Ω…"
                    className="min-h-[44px] text-base"
                  />
                </div>
              </div>
            )}

            {field.field_type === "photo_filter" && (
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Filter Size</Label>
                    <AiBadge fieldId={field.id} suffix="_size" value={allValues[`${field.id}_size`] || ""} extractionResult={extractionResult} extractedKey="filter_size" />
                  </div>
                  <Input
                    value={allValues[`${field.id}_size`] || ""}
                    onChange={e => onTextChange(`${field.id}_size`, e.target.value)}
                    placeholder="e.g. 16x25x1"
                    className="min-h-[44px] text-base"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-medium">Condition</Label>
                    <AiBadge fieldId={field.id} suffix="_condition" value={allValues[`${field.id}_condition`] || ""} extractionResult={extractionResult} extractedKey="condition" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {["Clean", "Dirty", "Very Dirty", "Needs Replacement"].map(opt => {
                      const selected = allValues[`${field.id}_condition`] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => onSelectChange(`${field.id}_condition`, opt)}
                          className={cn(
                            "rounded-xl border-2 px-3 py-3 text-center text-sm font-semibold transition-all",
                            "min-h-[44px] active:scale-[0.97]",
                            selected
                              ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                              : "border-border bg-card text-foreground hover:border-primary/40"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Before / After Photo ── */}
        {field.field_type === "photo_before_after" && (
          <>
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4" />
              {field.label} {field.is_required && <span className="text-destructive">*</span>}
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <PhotoUploadButtons
                  fieldId={`${field.id}_before`}
                  photos={photos.filter(p => p.file_path.includes("_before_"))}
                  isPhotoComplete={false}
                  onPhotoCapture={onPhotoCapture}
                  onRemovePhoto={onRemovePhoto}
                  label="Before"
                />
              </div>
              <div className="space-y-1.5">
                <PhotoUploadButtons
                  fieldId={`${field.id}_after`}
                  photos={photos.filter(p => p.file_path.includes("_after_"))}
                  isPhotoComplete={false}
                  onPhotoCapture={onPhotoCapture}
                  onRemovePhoto={onRemovePhoto}
                  label="After"
                />
              </div>
            </div>
            {isPhotoComplete && (
              <p className="text-xs text-emerald-600 flex items-center gap-1 justify-center">
                <CheckCircle className="h-3 w-3" /> Both photos captured
              </p>
            )}
          </>
        )}

        {/* ── Signature ── */}
        {field.field_type === "signature" && (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                {field.label} {field.is_required && <span className="text-destructive">*</span>}
              </Label>
              <FieldStatusIcon status={status} />
            </div>
            <SignaturePad
              existingUrl={value || undefined}
              disabled={isDemo}
              onSave={(dataUrl) => {
                if (onSignatureSave) {
                  onSignatureSave(field.id, dataUrl);
                }
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
