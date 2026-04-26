/* eslint-disable react-hooks/exhaustive-deps */
/**
 * TechFormSnapAndTalk — "Snap & Talk" tech form renderer.
 *
 * Replaces the 10-section carousel with:
 * 1. Photo grid — big tiles for required photos (reuses existing photo handlers)
 * 2. Voice memo — one mic button, speaks freely
 * 3. JARVIS extraction — maps voice + OCR to form fields
 * 4. Review card — editable summary before submit
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SignaturePad } from "@/components/SignaturePad";
import {
  Camera, CheckCircle, Loader2, Mic, MicOff, ImagePlus,
  Sparkles, Send, X, Edit2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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

interface TechFormSnapAndTalkProps {
  fields: FormField[];
  values: Record<string, string>;
  fieldStatuses: Record<string, FieldStatus>;
  uploadedPhotos: Record<string, UploadedPhoto[]>;
  extractionStatuses: Record<string, "idle" | "extracting" | "done" | "error">;
  extractionResults: Record<string, any>;
  onTextChange: (fieldId: string, val: string) => void;
  onSelectChange: (fieldId: string, val: string) => void;
  onPhotoCapture: (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (fieldId: string, photoId: string, filePath: string) => void;
  onSubmit: () => void;
  onSignatureSave?: (fieldId: string, dataUrl: string | null) => void;
  submitting: boolean;
  isPhotoFieldComplete: (f: FormField) => boolean;
  submitLabel?: string;
  isDemo?: boolean;
  jobContext?: { job_type?: string; system_type?: string; brand?: string; description?: string };
  techFormId?: string | null;
}

/* ────────── Helpers ────────── */

const PHOTO_FIELD_TYPES = ["photo", "photo_data_plate", "photo_before_after", "photo_gauge", "photo_capacitor", "photo_multimeter", "photo_filter"];

function isPhotoField(f: FormField) {
  return PHOTO_FIELD_TYPES.includes(f.field_type) || f.field_type.startsWith("photo_");
}

function isSignatureField(f: FormField) {
  return f.field_type === "signature";
}

/* ────────── Main Component ────────── */

export function TechFormSnapAndTalk({
  fields, values, fieldStatuses, uploadedPhotos, extractionStatuses, extractionResults,
  onTextChange, onSelectChange, onPhotoCapture, onRemovePhoto, onSubmit, onSignatureSave,
  submitting, isPhotoFieldComplete, submitLabel = "Submit", isDemo, jobContext, techFormId,
}: TechFormSnapAndTalkProps) {
  const { toast } = useToast();
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Record<string, string> | null>(null);
  const [editingExtraction, setEditingExtraction] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  const [autoExtractPending, setAutoExtractPending] = useState(false);

  const { isRecording, loading: voiceLoading, start: startRecording, stop: stopRecording } = useVoiceToText({
    onTranscript: (text) => {
      setVoiceTranscript(prev => prev ? `${prev}\n${text}` : text);
      setAutoExtractPending(true);
    },
    onError: (err) => toast({ title: "Voice Error", description: err, variant: "destructive" }),
    silenceTimeout: 4000,
  });

  // Separate photo fields and non-photo fields
  const photoFields = useMemo(() => fields.filter(f => isPhotoField(f)), [fields]);
  const signatureFields = useMemo(() => fields.filter(f => isSignatureField(f)), [fields]);
  const textFields = useMemo(() => fields.filter(f => !isPhotoField(f) && !isSignatureField(f)), [fields]);

  // Count completed photos
  const photosDone = photoFields.filter(f => isPhotoFieldComplete(f)).length;
  const photosTotal = photoFields.length;

  // Prioritized photo fields: required first, then show remaining
  const priorityPhotos = useMemo(() => {
    const required = photoFields.filter(f => f.is_required);
    const optional = photoFields.filter(f => !f.is_required);
    return [...required, ...optional];
  }, [photoFields]);

  const visiblePhotos = showAllPhotos ? priorityPhotos : priorityPhotos.slice(0, 6);

  // Gather OCR results from photos for extraction context
  const ocrContext = useMemo(() => {
    const results: Record<string, any> = {};
    Object.entries(extractionResults).forEach(([fieldId, result]) => {
      const field = fields.find(f => f.id === fieldId);
      if (field) results[field.label] = result;
    });
    return results;
  }, [extractionResults, fields]);

  /** Call JARVIS to extract structured form data from voice + photos */
  const handleExtract = useCallback(async () => {
    if (!voiceTranscript.trim() && Object.keys(ocrContext).length === 0) {
      toast({ title: "Nothing to extract", description: "Record a voice note or take photos first.", variant: "destructive" });
      return;
    }

    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-form-from-voice", {
        body: {
          transcript: voiceTranscript,
          ocr_results: ocrContext,
          job_context: jobContext || {},
          fields: textFields.map(f => ({
            id: f.id,
            label: f.label,
            field_type: f.field_type,
            options: f.options,
            is_required: f.is_required,
          })),
        },
      });

      if (error) throw error;

      const extractedFields = data?.fields || {};
      setExtracted(extractedFields);

      // Auto-populate fields
      Object.entries(extractedFields).forEach(([fieldId, value]) => {
        if (value && typeof value === "string" && value.trim()) {
          const field = textFields.find(f => f.id === fieldId);
          if (field) {
            if (field.options) {
              onSelectChange(fieldId, value);
            } else {
              onTextChange(fieldId, value);
            }
          }
        }
      });

      toast({ title: "JARVIS extracted your data", description: "Review the summary below and edit if needed." });
    } catch (err: any) {
      console.error("Extraction failed:", err);
      toast({ title: "Extraction failed", description: err?.message || "Try again or fill fields manually.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  }, [voiceTranscript, ocrContext, jobContext, textFields, onTextChange, onSelectChange, toast]);

  // Auto-extract when voice transcript arrives
  const handleExtractRef = useRef(handleExtract);
  handleExtractRef.current = handleExtract;

  useEffect(() => {
    if (autoExtractPending && !voiceLoading && !extracting) {
      setAutoExtractPending(false);
      handleExtractRef.current();
    }
  }, [autoExtractPending, voiceLoading, extracting]);

  const requiredPhotosDone = photoFields.filter(f => f.is_required).every(f => isPhotoFieldComplete(f));

  return (
    <div className="space-y-4">
      {/* ── Photo Grid ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Photos
              <span className="text-xs font-normal text-muted-foreground">
                {photosDone}/{photosTotal}
              </span>
            </h3>
            {priorityPhotos.length > 6 && (
              <button
                onClick={() => setShowAllPhotos(!showAllPhotos)}
                className="text-xs text-primary flex items-center gap-1"
              >
                {showAllPhotos ? "Show less" : `Show all (${photosTotal})`}
                {showAllPhotos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {visiblePhotos.map(field => (
              <PhotoTile
                key={field.id}
                field={field}
                photos={uploadedPhotos[field.id] || []}
                isComplete={isPhotoFieldComplete(field)}
                onCapture={onPhotoCapture}
                onRemove={onRemovePhoto}
                extractionStatus={extractionStatuses[field.id]}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Voice Memo ── */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Mic className="h-4 w-4 text-primary" />
            Voice Note
          </h3>

          <p className="text-xs text-muted-foreground mb-4">
            Describe the job: what you found, what you did, parts used, recommendations.
          </p>

          {/* Big mic button */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={voiceLoading}
              className={cn(
                "h-20 w-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95",
                isRecording
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
                voiceLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {voiceLoading ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
            <span className="text-xs text-muted-foreground">
              {isRecording ? "Listening... tap to stop" : voiceLoading ? "Transcribing..." : extracting ? "JARVIS is reading..." : "Tap to talk"}
            </span>
          </div>

          {/* Transcript preview */}
          {voiceTranscript && (
            <div className="mt-4">
              <Textarea
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
                rows={3}
                className="text-sm"
                placeholder="Your voice note will appear here..."
              />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVoiceTranscript("")}
                  className="text-xs"
                >
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Extracting indicator (between voice and summary) ── */}
      {extracting && !extracted && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">JARVIS is reading your notes...</span>
        </div>
      )}

      {/* ── Extraction Summary / Review ── */}
      {extracted && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                JARVIS Summary
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingExtraction(!editingExtraction)}
                className="text-xs h-7"
              >
                <Edit2 className="h-3 w-3 mr-1" />
                {editingExtraction ? "Done editing" : "Edit"}
              </Button>
            </div>

            <div className="space-y-2">
              {textFields.map(field => {
                const val = values[field.id] || "";
                if (!val && !editingExtraction) return null;

                return (
                  <div key={field.id} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{field.label}</Label>
                    {editingExtraction ? (
                      field.field_type === "textarea" || field.field_type === "text" ? (
                        <Textarea
                          value={val}
                          onChange={(e) => onTextChange(field.id, e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      ) : (
                        <Input
                          value={val}
                          onChange={(e) => onTextChange(field.id, e.target.value)}
                          className="text-sm h-9"
                        />
                      )
                    ) : (
                      <p className="text-sm bg-muted/50 rounded px-2 py-1.5">{val}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Re-extract button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setExtracted(null); handleExtract(); }}
              disabled={extracting}
              className="mt-3 text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1" /> Re-extract
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Signature (if any signature fields) ── */}
      {signatureFields.map(field => (
        <Card key={field.id}>
          <CardContent className="p-4">
            <Label className="text-sm font-semibold mb-2 block">{field.label}</Label>
            {values[field.id] ? (
              <div className="space-y-2">
                <img src={values[field.id]} alt="Signature" className="h-20 border rounded" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSignatureSave?.(field.id, null)}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <SignaturePad
                onSave={(dataUrl) => onSignatureSave?.(field.id, dataUrl)}
              />
            )}
          </CardContent>
        </Card>
      ))}

      {/* ── Submit Bar ── */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t p-4 -mx-4 mt-4">
        <Button
          onClick={onSubmit}
          disabled={submitting || !requiredPhotosDone}
          className="w-full h-12 text-base gap-2"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              {submitLabel}
            </>
          )}
        </Button>
        {!requiredPhotosDone && (
          <p className="text-xs text-muted-foreground text-center mt-1">
            Take all required photos to submit
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────── Photo Tile ────────── */

function PhotoTile({
  field, photos, isComplete, onCapture, onRemove, extractionStatus,
}: {
  field: FormField;
  photos: UploadedPhoto[];
  isComplete: boolean;
  onCapture: (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (fieldId: string, photoId: string, filePath: string) => void;
  extractionStatus?: "idle" | "extracting" | "done" | "error";
}) {
  const donePhotos = photos.filter(p => p.status === "done");
  const isUploading = photos.some(p => p.status === "uploading");

  return (
    <div className="relative">
      {donePhotos.length > 0 ? (
        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-primary/30 bg-muted">
          <img
            src={donePhotos[donePhotos.length - 1].preview}
            alt={field.label}
            className="w-full h-full object-cover"
          />
          {/* Status overlay */}
          <div className="absolute top-1 right-1">
            {extractionStatus === "extracting" ? (
              <div className="bg-primary/90 rounded-full p-1">
                <Loader2 className="h-3 w-3 text-primary-foreground animate-spin" />
              </div>
            ) : isComplete ? (
              <div className="bg-primary rounded-full p-1">
                <CheckCircle className="h-3 w-3 text-primary-foreground" />
              </div>
            ) : null}
          </div>
          {/* Remove button */}
          <button
            onClick={() => {
              const last = donePhotos[donePhotos.length - 1];
              onRemove(field.id, last.id, last.file_path);
            }}
            className="absolute top-1 left-1 bg-background/80 rounded-full p-1"
          >
            <X className="h-3 w-3" />
          </button>
          {/* Add more photos overlay */}
          <label className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur-sm py-1.5 flex items-center justify-center gap-1 text-xs font-medium cursor-pointer">
            <ImagePlus className="h-3 w-3" /> Add more
            <input type="file" accept="image/*" capture="environment" onChange={e => onCapture(field.id, e)} className="hidden" />
          </label>
          {/* Photo count badge */}
          {donePhotos.length > 1 && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-background/80 rounded-full px-2 py-0.5 text-[10px] font-medium">
              {donePhotos.length} photos
            </div>
          )}
        </div>
      ) : (
        <label
          className={cn(
            "aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors active:bg-muted",
            field.is_required
              ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
              : "border-muted-foreground/30 bg-muted/30 hover:bg-muted/50"
          )}
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          ) : (
            <Camera className={cn("h-6 w-6", field.is_required ? "text-primary" : "text-muted-foreground")} />
          )}
          <span className="text-[11px] font-medium text-center px-1 leading-tight">
            {field.label}
          </span>
          {field.is_required && (
            <span className="text-[9px] text-primary font-medium">Required</span>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={e => onCapture(field.id, e)} className="hidden" />
        </label>
      )}
    </div>
  );
}
