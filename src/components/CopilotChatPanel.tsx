import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useComposerIntelligence } from "@/hooks/useComposerIntelligence";
import { GrammarPreview } from "@/components/ui/GrammarPreview";
import { ActionButtons } from "@/components/copilot/ActionButtons";
import { InlineBookingWizard } from "@/components/copilot/InlineBookingWizard";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { Bot, Loader2, Send, Plus, Mic, MicOff, ChevronDown, Phone as PhoneIcon, PhoneCall, PhoneOff, FileText, Download, Eye, X, MessageSquare, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedModel } from "@/components/CopilotModelSelector";
import { OverrideRequestCard, parseOverrideRequest } from "@/components/OverrideRequestCard";
import { toast } from "@/hooks/use-toast";
import { useCopilotMessages } from "@/hooks/useCopilotMessages";
import { useCopilotSessions } from "@/hooks/useCopilotSessions";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { useSoftphoneContext } from "@/components/SoftphoneProvider";
import { toE164 } from "@/lib/formatters";
import { useCapacitor } from "@/hooks/useCapacitor";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { EquipmentPickerCard } from "@/components/copilot/EquipmentPickerCard";
import { ContextPicker } from "@/components/copilot/ContextPicker";
import { SmartSuggestions } from "@/components/copilot/SmartSuggestions";
import { openSmsComposer } from "@/lib/smsComposerBridge";

interface ActiveContext {
  contextType: "customer" | "job" | "call" | "sms";
  contextSubtype?: string;
  customerId: string | null;
  jobId: string | null;
  phone: string | null;
  summary: string;
  contactName: string;
}

type ChatImageContent = {
  type: "image_url";
  image_url: { url: string };
};

type ChatTextContent = {
  type: "text";
  text: string;
};

type ChatApiContent = string | Array<ChatTextContent | ChatImageContent>;

import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MediaViewer } from "@/components/ui/media-viewer";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import jsPDF from "jspdf";
import logoSrc from "@/assets/logo.png";

// Brand colors for letterhead PDF
const NAVY = { r: 25, g: 42, b: 70 };
const ACCENT = { r: 247, g: 165, b: 18 };
const SLATE = { r: 100, g: 116, b: 139 };

/** Build a letterhead jsPDF doc (does not save — caller decides) */
async function buildLetterheadDoc(bodyText: string, settings: any): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 60;

  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 0, pageW, 6, "F");
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(0, 6, pageW, 2, "F");

  const logoImg = await new Promise<HTMLImageElement>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = logoSrc;
  });
  const logoH = 50;
  const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
  doc.addImage(logoImg, "PNG", margin, 20, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text(settings.company_name || "Company Name", pageW - margin, 42, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);
  const addressLines = [
    settings.company_address,
    [settings.company_city, settings.company_state, settings.company_zip].filter(Boolean).join(", "),
  ].filter(Boolean);
  let headerY = 56;
  addressLines.forEach((line: string) => {
    doc.text(line, pageW - margin, headerY, { align: "right" });
    headerY += 13;
  });
  const contactParts = [settings.company_phone, settings.company_email].filter(Boolean);
  if (contactParts.length > 0) {
    doc.text(contactParts.join("  •  "), pageW - margin, headerY, { align: "right" });
    headerY += 13;
  }

  const dividerY = Math.max(headerY + 10, 95);
  doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
  doc.setLineWidth(1);
  doc.line(margin, dividerY, pageW - margin, dividerY);
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(margin, dividerY - 2, 20, 4, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(today, margin, dividerY + 36);

  let bodyY = dividerY + 60;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  const maxWidth = pageW - margin * 2;
  const lines = doc.splitTextToSize(bodyText, maxWidth);
  const lineHeight = 16;

  for (const line of lines) {
    if (bodyY > pageH - 80) {
      doc.addPage();
      bodyY = 60;
    }
    doc.text(line, margin, bodyY);
    bodyY += lineHeight;
  }

  const footerY = pageH - 55;
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, footerY, pageW, 1.5, "F");
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(0, footerY + 1.5, pageW, 1, "F");

  doc.setFontSize(8);
  doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);
  const footerLeft = settings.tacla_number ? `TACLA# ${settings.tacla_number}` : "";
  const footerCenter = settings.company_name || "";
  const footerRight = [settings.company_phone, settings.company_email].filter(Boolean).join("  •  ");
  const footerTextY = footerY + 18;
  doc.text(footerLeft, margin, footerTextY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text(footerCenter, pageW / 2, footerTextY, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);
  doc.text(footerRight, pageW - margin, footerTextY, { align: "right" });

  return doc;
}

/** Letterhead preview/download helpers */
function LetterheadBlock({ bodyText }: { bodyText: string }) {
  const { settings } = useCompanySettings();
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const doc = await buildLetterheadDoc(bodyText, settings);
      doc.save("Company_Letter.pdf");
      toast({ title: "PDF Generated", description: "Your letterhead document has been downloaded." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-l-4 border-l-accent bg-card shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FileText className="h-4 w-4 text-primary" />
        Company Letterhead Document
      </div>
      <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap border rounded p-2 bg-muted/30">
        {bodyText.slice(0, 500)}{bodyText.length > 500 ? "..." : ""}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={async () => {
          setPreviewing(true);
          try {
            const doc = await buildLetterheadDoc(bodyText, settings);
            const blob = doc.output("blob");
            const path = `letterheads/preview-${Date.now()}.pdf`;
            const { error } = await supabase.storage.from("invoices").upload(path, blob, { contentType: "application/pdf", upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from("invoices").getPublicUrl(path);
            setPreviewUrl(publicUrl);
          } catch (e: any) {
            toast({ title: "Preview failed", description: e.message, variant: "destructive" });
          } finally {
            setPreviewing(false);
          }
        }} disabled={previewing} className="gap-1.5">
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          Preview
        </Button>
        <Button size="sm" onClick={handleDownload} disabled={generating} className="gap-1.5">
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download PDF
        </Button>
      </div>
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Letterhead Preview</DialogTitle>
          <DialogDescription>Preview of the generated document.</DialogDescription>
          {previewUrl && <MediaViewer url={previewUrl} fileName="letterhead.pdf" category="pdf" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Splits assistant message into text segments, :::equipment-card blocks, :::letterhead blocks, and :::equipment-picker blocks */
function EquipmentCardRenderer({ content, onPickerComplete }: { content: string; onPickerComplete?: (summary: string) => void }) {
  const segments: { type: "text" | "card" | "letterhead" | "picker"; content: string }[] = [];

  // Extract :::equipment-picker blocks
  function extractPickers(text: string): string {
    const pickerParts = text.split(/:::equipment-picker\s*\n?/);
    let result = "";
    pickerParts.forEach((part, i) => {
      if (i === 0) { result += part; return; }
      const endIdx = part.indexOf(":::");
      if (endIdx !== -1) {
        const pickerContent = part.slice(0, endIdx).trim();
        const after = part.slice(endIdx + 3).trim();
        if (pickerContent) segments.push({ type: "picker", content: pickerContent });
        result += after;
      } else {
        if (part.trim()) segments.push({ type: "picker", content: part.trim() });
      }
    });
    return result;
  }

  function parseEquipmentCards(text: string) {
    const cleaned = extractPickers(text);
    const parts = cleaned.split(/:::equipment-card\s*\n?/);
    parts.forEach((part, i) => {
      if (i === 0) {
        if (part.trim()) segments.push({ type: "text", content: part });
        return;
      }
      const endIdx = part.indexOf(":::");
      if (endIdx !== -1) {
        const cardContent = part.slice(0, endIdx).trim();
        const after = part.slice(endIdx + 3).trim();
        if (cardContent) segments.push({ type: "card", content: cardContent });
        if (after) segments.push({ type: "text", content: after });
      } else {
        if (part.trim()) segments.push({ type: "card", content: part.trim() });
      }
    });
  }

  const letterheadParts = content.split(/:::letterhead\s*\n?/);
  letterheadParts.forEach((part, i) => {
    if (i === 0) {
      parseEquipmentCards(part);
      return;
    }
    const endIdx = part.indexOf(":::");
    if (endIdx !== -1) {
      const letterContent = part.slice(0, endIdx).trim();
      const after = part.slice(endIdx + 3).trim();
      if (letterContent) segments.push({ type: "letterhead", content: letterContent });
      if (after) parseEquipmentCards(after);
    } else {
      if (part.trim()) segments.push({ type: "letterhead", content: part.trim() });
    }
  });

  if (segments.length === 0) return <MarkdownContent content={content} />;

  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.type === "card" ? (
          <Card key={i} className="border-l-4 border-l-primary bg-card shadow-sm p-4 space-y-1">
            <MarkdownContent content={seg.content} />
          </Card>
        ) : seg.type === "letterhead" ? (
          <LetterheadBlock key={i} bodyText={seg.content} />
        ) : seg.type === "picker" ? (
          <EquipmentPickerCard
            key={i}
            initialOptions={(() => {
              try { const parsed = JSON.parse(seg.content); return parsed.options || []; } catch { return []; }
            })()}
            onComplete={onPickerComplete || (() => {})}
          />
        ) : (
          <MarkdownContent key={i} content={seg.content} />
        )
      )}
    </div>
  );
}

import { EmojiPicker } from "@/components/chat/EmojiPicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggestedActions?: any[];
};

interface CopilotChatPanelProps {
  pageContext?: string;
  compact?: boolean;
  employeeId?: string | null;
  routeKey?: string;
}

export default function CopilotChatPanel({ pageContext, compact = false, employeeId, routeKey }: CopilotChatPanelProps) {
  const { consumePendingQuery, consumePendingCallSession, activeCallPreview, consumePendingSmsSession, consumePendingVoicemailSession, consumePendingContext, peekPendingContext, pendingVersion, startCallSession } = useCopilotPanel();
  const softphone = useSoftphoneContext();
  const navigate = useNavigate();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    createCallSession,
    endSession,
    ensureActiveSession,
    loading: sessionsLoading,
  } = useCopilotSessions(employeeId);

  const { messages, setMessages, addMessages, updateMessageAt, clearMessages, loading: messagesLoading, persistMessage } = useCopilotMessages(employeeId, activeSessionId);
  const pendingQueryConsumed = useRef(false);
  const lastProcessedVersion = useRef(-1);
  const pendingSessionCreation = useRef(false);
  const [input, setInput] = useState("");
  const [pastedImage, setPastedImage] = useState<{ file: File; preview: string } | null>(null);
  const composer = useComposerIntelligence({
    value: input,
    setValue: setInput,
    context: "chat",
    onSend: async (text) => {
      await sendMessage(text);
      // sendMessage clears input itself; just resolve
      return true;
    },
  });
  const {
    inputRef: copilotInputRef,
    handleChange: handleInputChange,
    handleBlur: handleInputBlur,
    handleSend: smartCopilotSend,
    polishing: copilotPolishing,
    isBusy: copilotBusy,
    preview: copilotPreview,
    acceptPolish: acceptCopilotPolish,
    rejectPolish: rejectCopilotPolish,
    cancelPolish: cancelCopilotPolish,
  } = composer;
  const [chatLoading, setChatLoading] = useState(false);
  const [activeWizard, setActiveWizard] = useState<{ action: any; messageIndex: number } | null>(null);
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { jarvis_enabled: jarvisEnabledDb, setJarvisEnabled: setJarvisDb } = useUserPreferences();
  const [jarvisEnabled, setJarvisEnabled] = useState(jarvisEnabledDb);
  const pendingAutoSend = useRef(false);
  const autoSendText = useRef("");
  const lastAutoSentForSession = useRef<string | null>(null);
  const sendMessageRef = useRef<(overrideText?: string) => Promise<void>>(async () => {});

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const isReadOnly = activeSession?.ended_at != null;

  const { isRecording, loading: voiceLoading, toggle: toggleRecording } = useVoiceToText({
    context: "jarvis_chat",
    onTranscript: (text) => {
      if (text) {
        setInput(text);
        if (pendingAutoSend.current) {
          pendingAutoSend.current = false;
          autoSendText.current = text;
        }
      }
    },
    onError: (err) => toast({ title: "Voice Error", description: err, variant: "destructive" }),
  });

  // Auto-send when input is set from JARVIS wake word
  useEffect(() => {
    if (autoSendText.current && input === autoSendText.current && !chatLoading) {
      const key = `${activeSessionId}::${autoSendText.current}`;
      autoSendText.current = "";
      if (lastAutoSentForSession.current === key) return;
      lastAutoSentForSession.current = key;
      sendMessageRef.current();
    }
  }, [input, activeSessionId, chatLoading]);

  const handleWake = useCallback(() => {
    pendingAutoSend.current = true;
    toggleRecording();
  }, [toggleRecording]);

  const { listening: jarvisListening, supported: jarvisSupported } = useWakeWord({
    onWake: handleWake,
    enabled: jarvisEnabled,
  });

  useEffect(() => {
    setJarvisEnabled(jarvisEnabledDb);
  }, [jarvisEnabledDb]);

  const toggleJarvis = () => {
    const next = !jarvisEnabled;
    setJarvisEnabled(next);
    setJarvisDb(next);
    toast({ title: next ? "JARVIS Activated" : "JARVIS Deactivated", description: next ? "Listening for wake word..." : "Wake word disabled" });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle pending call session
  useEffect(() => {
    if (sessionsLoading || pendingVersion === lastProcessedVersion.current || pendingSessionCreation.current) return;

    const callInfo = consumePendingCallSession();
    if (callInfo) {
      lastProcessedVersion.current = pendingVersion;
      pendingSessionCreation.current = true;
      pendingQueryConsumed.current = false;
      autoSendText.current = "";
      lastAutoSentForSession.current = null;
      setInput("");
      clearMessages();

      void (async () => {
        try {
          await createCallSession(callInfo.phone, callInfo.contactName, callInfo.callSid);
        } finally {
          pendingSessionCreation.current = false;
        }
      })();
      return;
    }

    const smsInfo = consumePendingSmsSession();
    if (smsInfo) {
      lastProcessedVersion.current = pendingVersion;
      pendingSessionCreation.current = true;
      pendingQueryConsumed.current = false;
      autoSendText.current = "";
      lastAutoSentForSession.current = null;
      setInput("");
      clearMessages();

      void (async () => {
        try {
          const label = smsInfo.contactName ? `SMS — ${smsInfo.contactName}` : `SMS — ${smsInfo.phone}`;
          await createSession(label);
        } finally {
          pendingSessionCreation.current = false;
        }
      })();
      return;
    }

    const vmInfo = consumePendingVoicemailSession();
    if (vmInfo) {
      lastProcessedVersion.current = pendingVersion;
      pendingSessionCreation.current = true;
      pendingQueryConsumed.current = false;
      autoSendText.current = "";
      lastAutoSentForSession.current = null;
      setInput("");
      clearMessages();

      void (async () => {
        try {
          const label = vmInfo.contactName ? `VM — ${vmInfo.contactName}` : `VM — ${vmInfo.phone}`;
          await createSession(label);
        } finally {
          pendingSessionCreation.current = false;
        }
      })();
      return;
    }

    pendingQueryConsumed.current = false;
    lastProcessedVersion.current = pendingVersion;
  }, [
    sessionsLoading,
    pendingVersion,
    consumePendingCallSession,
    consumePendingSmsSession,
    consumePendingVoicemailSession,
    createCallSession,
    createSession,
    clearMessages,
  ]);

  // Auto-send pending query
  useEffect(() => {
    if (messagesLoading || pendingQueryConsumed.current || chatLoading || !activeSessionId || pendingSessionCreation.current) return;
    const query = consumePendingQuery();
    if (query) {
      pendingQueryConsumed.current = true;
      setTimeout(() => {
        setInput(query);
        autoSendText.current = query;
      }, 300);
    }
  }, [messagesLoading, chatLoading, consumePendingQuery, activeSessionId]);

  useEffect(() => {
    return () => {
      pendingQueryConsumed.current = false;
      pendingSessionCreation.current = false;
    };
  }, []);

  // Auto-create session if none
  useEffect(() => {
    if (!sessionsLoading && !activeSessionId && sessions.length === 0) {
      createSession("General");
    }
  }, [sessionsLoading, activeSessionId, sessions.length, createSession]);

  // Route-change session reset
  const prevRouteKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!routeKey || sessionsLoading || pendingSessionCreation.current || chatLoading) return;

    const isFirstMount = prevRouteKey.current === undefined;
    const hasChanged = routeKey !== prevRouteKey.current;
    prevRouteKey.current = routeKey;

    if (!hasChanged && !isFirstMount) return;
    if (isFirstMount && sessions.length === 0) return;

    const SHORT_LABELS: Record<string, string> = {
      "/": "Dispatch HQ", "/customers": "Customer HQ", "/parts": "Parts",
      "/agreements": "Agreements", "/payments": "Payments",
      "/settings": "Settings", "/admin": "Admin",
      "/sms": "Messages", "/phone": "Phone", "/calls": "Phone", "/team": "Team HQ", "/chat": "Team HQ",
      "/agent-training": "Agent Training", "/brochure": "Brochures",
      "/locations": "Catalog", "/copilot": "JARVIS",
    };

    let label = SHORT_LABELS[routeKey];
    if (!label) {
      if (routeKey.startsWith("/jobs/")) label = "Job Detail";
      else if (routeKey.startsWith("/estimates/")) label = "Estimate Detail";
      else if (routeKey.startsWith("/customers/")) label = "Customer Detail";
      else label = routeKey;
    }

    pendingSessionCreation.current = true;
    clearMessages();
    void (async () => {
      try {
        await createSession(label);
      } finally {
        pendingSessionCreation.current = false;
      }
    })();
  }, [routeKey, sessionsLoading, clearMessages, createSession, sessions.length, chatLoading]);

  

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const preview = URL.createObjectURL(file);
        setPastedImage({ file, preview });
        return;
      }
    }
  }, []);

  const fileToDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  }, []);

  const uploadPastedImage = async (file: File): Promise<string | null> => {
    const path = `copilot/${Date.now()}-${file.name || "screenshot.png"}`;
    const { error: upErr } = await supabase.storage.from("agent-documents").upload(path, file, {
      contentType: file.type || "image/png",
      upsert: false,
    });

    if (upErr) {
      console.error("Image upload error:", upErr);
      try {
        return await fileToDataUrl(file);
      } catch (dataUrlErr) {
        console.error("Image fallback encoding error:", dataUrlErr);
        toast({ title: "Image upload failed", description: upErr.message, variant: "destructive" });
        return null;
      }
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("agent-documents")
      .createSignedUrl(path, 60 * 60);

    if (signErr || !signedData?.signedUrl) {
      console.warn("Image signed URL error, falling back to inline data URL:", signErr);
      try {
        return await fileToDataUrl(file);
      } catch (dataUrlErr) {
        console.error("Image fallback encoding error:", dataUrlErr);
        toast({ title: "Image share failed", description: signErr?.message || "Unable to prepare image for JARVIS", variant: "destructive" });
        return null;
      }
    }

    return signedData.signedUrl;
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    const imageToSend = pastedImage;
    if ((!text && !imageToSend) || chatLoading || isReadOnly) return;
    setInput("");
    setPastedImage(null);

    await ensureActiveSession();

    // Build user message content — multimodal if image attached
    let userContent: ChatApiContent = text || "What do you see in this image?";
    let imageUrl: string | null = null;

    if (imageToSend) {
      imageUrl = await uploadPastedImage(imageToSend.file);
      if (imageUrl) {
        userContent = [
          ...(text ? [{ type: "text", text }] : [{ type: "text", text: "What do you see in this image?" }]),
          { type: "image_url", image_url: { url: imageUrl } },
        ];
      }
      URL.revokeObjectURL(imageToSend.preview);
    }

    const displayText = text || "(screenshot attached)";
    const userMsg: ChatMessage = { role: "user", content: displayText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    await persistMessage(userMsg);
    setChatLoading(true);
    setError(null);

    try {
      const contextPrefix = pageContext ? `[User is currently on: ${pageContext}] ` : "";
      // Build messages for API — use multimodal content for the last user message if it has an image
      const apiMessages = newMessages.map((m, i) => {
        if (i === newMessages.length - 1 && imageUrl && m.role === "user") {
          return { role: m.role, content: userContent };
        }
        return { role: m.role, content: m.content };
      });

      // Pull (and clear) any pending JARVIS context payload — sent ONCE with the
      // first message of a triggered session, so the agent can answer without
      // redoing search_customer / lookup_history.
      const jarvisContext = consumePendingContext();

      const { data: result, error: fnError } = await supabase.functions.invoke("ai-task-agent", {
        body: {
          mode: "chat",
          messages: apiMessages,
          model: getSelectedModel(),
          page_context: contextPrefix || undefined,
          jarvis_context: jarvisContext || undefined,
        },
      });

      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);

      const reply = result?.reply || "No response generated.";
      const assistantMsg: ChatMessage = { role: "assistant", content: reply };
      if (result?.suggested_actions?.length) {
        (assistantMsg as any).suggestedActions = result.suggested_actions;
      }
      setMessages([...newMessages, assistantMsg]);
      await persistMessage(assistantMsg);
    } catch (e: any) {
      setError(e.message || "Failed to send message");
    } finally {
      setChatLoading(false);
    }
  };
  sendMessageRef.current = sendMessage;

  const quickQuestions = (() => {
    if (!routeKey) return ["What should I focus on first today?", "Which jobs are at risk?", "How's the team doing this week?"];
    if (routeKey.startsWith("/jobs/")) return [
      "Summarize this job",
      "What's the next step?",
      "Draft a follow-up text to the customer",
    ];
    if (routeKey.startsWith("/customers/")) return [
      "Summarize this customer's history",
      "Any open jobs for this customer?",
      "Draft a text to this customer",
    ];
    if (routeKey.startsWith("/estimates/")) return [
      "Summarize this estimate",
      "Compare the tiers on this estimate",
      "What equipment is quoted?",
    ];
    if (routeKey === "/sms") return [
      "💬 Unread SMS summary",
      "📋 Summarize today's jobs",
      "Draft a text message",
    ];
    if (routeKey === "/phone" || routeKey === "/calls") return [
      "📞 Missed calls summary",
      "📋 Summarize today's jobs",
      "Summarize recent conversations",
    ];
    if (routeKey === "/team" || routeKey === "/chat") return [
      "🗨️ Unread team chats summary",
      "🔔 What needs follow-up?",
    ];
    if (routeKey === "/customers") return [
      "Who are my most active customers?",
      "Any customers waiting on follow-up?",
      "Look up a customer by phone number",
    ];
    if (routeKey === "/estimates") return [
      "Any estimates pending approval?",
      "Which estimates expire soon?",
      "Show recent approved estimates",
    ];
    if (routeKey === "/" || routeKey === "/dashboard") return [
      "📋 Summarize today's jobs",
      "📞 Missed calls summary",
      "💬 Unread SMS summary",
      "🗨️ Unread team chats summary",
      "🔔 What needs follow-up?",
    ];
    return ["What should I focus on first today?", "Which jobs are at risk?", "How's the team doing this week?"];
  })();

  const handleNewChat = async () => {
    if (activeSessionId && !isReadOnly) {
      await endSession(activeSessionId);
    }
    await createSession("General");
    clearMessages();
    toast({ title: "New Chat", description: "Started a new conversation" });
  };

  const handleSwitchSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Session header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b bg-muted/30">
        {activeContext ? (
          <div className="flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-md border border-primary/40 bg-primary/10 max-w-[260px]">
            {activeContext.contextType === "call" ? (
              <PhoneIcon className="h-3 w-3 text-blue-500 shrink-0" />
            ) : activeContext.contextType === "sms" ? (
              <MessageSquare className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <Briefcase className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            <span className="text-xs font-medium truncate flex-1">{activeContext.contactName}</span>
            <button
              onClick={() => setActiveContext(null)}
              className="h-5 w-5 rounded hover:bg-primary/20 flex items-center justify-center text-muted-foreground hover:text-foreground"
              title="Clear context"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 max-w-[200px] truncate">
              {!activeContext && (activeSession?.call_sid || activeSession?.phone_number) ? (
                <PhoneIcon className="h-3 w-3 text-primary shrink-0" />
              ) : null}
              <span className="truncate">
                {activeContext ? "Switch context" : (activeSession?.label || "Pick context")}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[320px] p-0">
            <ContextPicker
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSwitchSession}
              onSelectContext={(item) => {
                const ctxType = item.kind as "call" | "sms" | "job";
                setActiveContext({
                  contextType: ctxType,
                  contextSubtype: item.subtype,
                  customerId: item.customer_id,
                  jobId: item.job_id,
                  phone: item.phone,
                  summary: `${item.contact_name}: ${item.preview}`,
                  contactName: item.contact_name,
                });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        {activeCallPreview && (
          softphone.status === "offline" || softphone.status === "ready" ? (
            <Button
              size="sm"
              onClick={() => {
                const e164 = toE164(activeCallPreview.phone);
                if (!e164) return;
                // Always use the in-app popup dialer.
                softphone.setDialNumber(e164);
                startCallSession(e164, activeCallPreview.contactName);
              }}
              className="h-7 text-xs gap-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              title={`Call ${activeCallPreview.contactName || activeCallPreview.phone}`}
            >
              <PhoneCall className="h-3 w-3" /> Start Call
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled className="h-7 text-xs gap-1">
              <PhoneOff className="h-3 w-3" /> On Call
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" onClick={handleNewChat} title="New chat" className="h-7 text-xs gap-1">
          <Plus className="h-3 w-3" /> New Chat
        </Button>
      </div>

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="bg-muted/50 text-muted-foreground text-xs text-center py-1.5 border-b">
          Viewing archived session — start a new chat to continue
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pb-4 px-1">
        {messagesLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading chat history...
          </div>
        )}
        {!messagesLoading && messages.length === 0 && !isReadOnly && (
          <div className="space-y-3 pt-6 px-2">
            {!activeContext ? (
              <div className="text-center">
                <Bot className="h-8 w-8 text-primary mx-auto mb-2 opacity-60" />
                <p className="text-xs text-muted-foreground">
                  Pick a Job, SMS, or Call from the menu above to give JARVIS context
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">
                    Context: <span className="text-primary">{activeContext.contactName}</span>
                  </p>
                  <button
                    onClick={() => setActiveContext(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    clear
                  </button>
                </div>
                <SmartSuggestions
                  contextType={activeContext.contextType}
                  contextSubtype={activeContext.contextSubtype}
                  customerId={activeContext.customerId}
                  jobId={activeContext.jobId}
                  phone={activeContext.phone}
                  summary={activeContext.summary}
                  onPick={(s) => {
                    const prefix = activeContext.contactName ? `[Re: ${activeContext.contactName}] ` : "";
                    sendMessage(prefix + s.prompt);
                  }}
                />
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          const override = msg.role === "assistant" ? parseOverrideRequest(msg.content) : null;
          const isLastAssistant = msg.role === "assistant" && i === messages.length - 1 && !chatLoading && !isReadOnly;

          // Parse numbered/lettered options from Copilot suggestions
          const quickOptions: { label: string; text: string }[] = [];
          if (isLastAssistant) {
            const content = msg.content;

            const draftPatterns = [
              /```[\s\S]*?```/g,
              /(?:^|\n)(?:Subject|From|To|Cc|Bcc):\s*.+/gi,
              /(?:^|\n)(?:Dear|Hi|Hello|Hey)\s+[A-Z].+?,?\n[\s\S]*?(?:(?:Best|Thanks|Regards|Sincerely|Cheers|Warm regards).*$)/gim,
              /(?:^|\n)>\s*.+(?:\n>\s*.*)*/gm,
              /(?:^|\n)\d+\.\s*\*{0,2}Proposed\b[\s\S]*?(?=\n\d+\.\s|\nHow\s|\n\n[A-Z]|$)/gim,
            ];

            let conversationalText = content;
            for (const pattern of draftPatterns) {
              conversationalText = conversationalText.replace(pattern, "");
            }

            const lines = conversationalText.split("\n");
            const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
            for (const line of lines) {
              const m = line.match(/^\s*(?:(\d+)[.)]\s*|([a-eA-E])[.)]\s*|[-•]\s+)(?:\*{1,2})?(.+?)(?:\*{1,2})?$/);
              if (m) {
                const body = m[3].replace(/\*{1,2}/g, "").replace(/\?$/, "").trim();
                if (body.length > 3 && body.length < 120) {
                  const idx = quickOptions.length;
                  const letter = LETTERS[idx] || String(idx + 1);
                  quickOptions.push({ label: letter, text: body });
                }
              }
            }
            quickOptions.splice(6);
            if (quickOptions.length < 2) quickOptions.length = 0;
          }

          // Yes/No detection
          const showYesNo = isLastAssistant && quickOptions.length === 0 &&
            /\?\s*$/.test(msg.content.trim()) &&
            /\b(would you|do you|should i|shall i|want me to|ready to|like me to|can i|confirm|proceed|go ahead|want to|ok to|send this|approve|is that)\b/i.test(msg.content);

          return (
            <div key={i}>
              <div
                className={`text-sm rounded-lg p-3 ${
                  msg.role === "user"
                    ? "bg-primary/10 text-primary ml-12"
                    : "bg-muted/50 text-foreground mr-8"
                }`}
              >
                <p className="font-medium text-[10px] uppercase tracking-wide mb-1 opacity-60">
                  {msg.role === "user" ? "You" : "JARVIS"}
                </p>
                {override ? (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {override.cleanContent || "I found a conflict with your rules:"}
                  </p>
                ) : (
                  <EquipmentCardRenderer content={msg.content} onPickerComplete={(summary) => sendMessage(summary)} />
                )}
              </div>
              {showYesNo && (
                <div className="flex items-center gap-2 mr-8 mt-1.5 ml-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-4 border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => sendMessage("Yes, go ahead")}
                    disabled={chatLoading}
                  >
                    Yes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-4 border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                    onClick={() => sendMessage("No, hold off")}
                    disabled={chatLoading}
                  >
                    No
                  </Button>
                </div>
              )}
              {quickOptions.length > 0 && (
                <div className="flex flex-col gap-1.5 mr-8 mt-1.5 ml-1">
                  {quickOptions.map((opt) => (
                    <Button
                      key={opt.label}
                      size="sm"
                      variant="outline"
                      className="h-auto py-1.5 px-2.5 text-xs border-primary/25 text-primary hover:bg-primary/10 text-left w-full justify-start whitespace-normal"
                      onClick={() => sendMessage(`${opt.label}. ${opt.text}`)}
                      disabled={chatLoading}
                    >
                      <span className="font-bold mr-1 shrink-0">{opt.label}.</span>
                      <span className="break-words">{opt.text}</span>
                    </Button>
                  ))}
                </div>
              )}
              {override && !isReadOnly && (
                <div className="mr-8 mt-2">
                  <OverrideRequestCard
                    rule={override.rule}
                    request={override.request}
                    onOverride={() => {
                      sendMessage(`[OVERRIDE_CONFIRMED] proceed with the original request`);
                    }}
                    onCancel={async () => {
                      const cancelMsg: ChatMessage = { role: "user", content: "Cancel — keep the existing rule." };
                      setMessages(prev => [...prev, cancelMsg]);
                      await persistMessage(cancelMsg);
                    }}
                    loading={chatLoading}
                  />
                </div>
              )}
              {/* Smart Action Buttons */}
              {msg.role === "assistant" && (msg as any).suggestedActions?.length > 0 && !activeWizard && (
                <ActionButtons
                  actions={(msg as any).suggestedActions}
                  onAction={(action, propertyChoice) => {
                    // select_property: dispatcher picked an existing property — tell JARVIS
                    // to book at THAT address, not the primary billing.
                    if (action.type === "select_property" && propertyChoice) {
                      sendMessage(
                        `Use this property for the booking: ${propertyChoice.label} — ${propertyChoice.formatted}` +
                        (propertyChoice.id ? ` (customer_addresses.id: ${propertyChoice.id})` : "") +
                        `. Do NOT default to the primary billing address.`
                      );
                      return;
                    }
                    // Confirm/confirm_no: send the payload text as a user message
                    if ((action.type === "confirm" || action.type === "confirm_no") && action.payload) {
                      // Log negative feedback for RAG quality improvement
                      if (action.type === "confirm_no" && activeSessionId) {
                        supabase.from("rag_feedback").insert({
                          session_id: activeSessionId,
                          feedback_type: "negative",
                          query_text: action.payload,
                          details: `Dispatcher clicked NO on: ${action.label || action.payload}`,
                        }).then(() => {});
                      }
                      sendMessage(action.payload);
                      return;
                    }
                    // Direct-execution actions (no wizard needed)
                    if (action.type === "call_back" && action.phone) {
                      // Always use the in-app popup dialer.
                      softphone.setDialNumber(action.phone);
                      startCallSession(action.phone, action.customer_name);
                      return;
                    }
                    if ((action.type === "send_text" || action.type === "reply_sms") && action.phone) {
                      openSmsComposer(action.phone, { contactName: action.customer_name });
                      return;
                    }
                    if (action.type === "view_job" && action.job_id) {
                      navigate(`/jobs/${action.job_id}`);
                      return;
                    }
                    if (action.type === "view_voicemail") {
                      navigate("/phone?tab=voicemail");
                      return;
                    }
                    if (action.type === "send_invoice_reminder" && action.job_id) {
                      navigate(`/jobs/${action.job_id}?tab=invoice`);
                      return;
                    }
                    // Booking & create actions: tell JARVIS to execute from context
                    if (action.type === "book_job" || action.type === "book_estimate" || action.type === "book_maintenance") {
                      const jobLabel = action.type === "book_estimate" ? "estimate" : action.type === "book_maintenance" ? "maintenance visit" : "service call";
                      const details = [
                        action.customer_name && `Customer: ${action.customer_name}`,
                        action.phone && `Phone: ${action.phone}`,
                        action.address && `Address: ${action.address}`,
                        action.email && `Email: ${action.email}`,
                        action.description && `Description: ${action.description}`,
                      ].filter(Boolean).join(", ");
                      sendMessage(`Yes, book the ${jobLabel}. ${details}`);
                      return;
                    }
                    if (action.type === "create_customer") {
                      const details = [
                        action.customer_name && `Name: ${action.customer_name}`,
                        action.phone && `Phone: ${action.phone}`,
                        action.address && `Address: ${action.address}`,
                        action.email && `Email: ${action.email}`,
                      ].filter(Boolean).join(", ");
                      sendMessage(`Yes, create the customer. ${details}`);
                      return;
                    }
                    // Linked-property edge case: caller (existing customer) is calling
                    // about a DIFFERENT property than their home (church, rental,
                    // parents' house, business). Tell JARVIS to verify the address,
                    // create a NEW customer record for the property, link it back to
                    // the parent customer via notes, and re-target the booking.
                    if (action.type === "linked_property_proposal") {
                      const parts = [
                        action.proposed_label && `Property: ${action.proposed_label}`,
                        action.address && `Address: ${action.address}`,
                        action.relationship && `Relationship: ${action.relationship}`,
                        action.parent_customer_id && `Parent contact id: ${action.parent_customer_id}`,
                        action.customer_name && `Parent contact name: ${action.customer_name}`,
                        action.phone && `Shared phone: ${action.phone}`,
                      ].filter(Boolean).join(", ");
                      sendMessage(
                        `Yes, this is a different property. Please: (1) verify_address on "${action.address || ""}", ` +
                        `(2) search_customer at that address to make sure we don't already have it, ` +
                        `(3) if not found, create_customer for the property using the verified address with notes "Property contact: ${action.customer_name || "the caller"} (parent customer_id: ${action.parent_customer_id || "?"})" and tag the relationship, ` +
                        `(4) re-target any pending booking to the new property's customer_id, NOT the caller's home address. ${parts}`
                      );
                      return;
                    }
                    // Fallback: open wizard for anything else
                    setActiveWizard({ action, messageIndex: i });
                  }}
                  disabled={chatLoading}
                />
              )}
              {/* Inline Booking Wizard */}
              {activeWizard && activeWizard.messageIndex === i && (
                <InlineBookingWizard
                  action={activeWizard.action}
                  onComplete={(summary) => {
                    setActiveWizard(null);
                    sendMessage(summary);
                  }}
                  onCancel={() => setActiveWizard(null)}
                />
              )}
            </div>
          );
        })}
        {chatLoading && (
          <div className="flex items-center gap-2 text-muted-foreground mr-8">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Thinking...</span>
          </div>
        )}
        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mr-8">{error}</div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      {!isReadOnly && (
        <div className="border-t bg-background pt-2 pb-8 px-1 flex flex-col gap-1.5">
          {/* Row 1: action buttons */}
          <div className="flex items-center gap-1.5 px-0.5">
            {jarvisSupported && (
              <button
                onClick={toggleJarvis}
                className={cn(
                  "shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border transition-all",
                  jarvisEnabled
                    ? "bg-primary/10 border-primary text-primary animate-pulse"
                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50"
                )}
                title={jarvisEnabled ? "JARVIS is listening — click to disable" : "Enable JARVIS wake word"}
              >
                J.A.R.V.I.S
              </button>
            )}
            <EmojiPicker onSelect={(emoji) => setInput((prev) => prev + emoji)} />
            <Button
              size="icon"
              variant={isRecording ? "destructive" : "ghost"}
              onClick={toggleRecording}
              disabled={voiceLoading}
              className={cn("shrink-0 relative h-7 w-7", isRecording && "animate-pulse")}
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              {voiceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {isRecording && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
              )}
            </Button>
          </div>
          {/* Pasted image preview */}
          {pastedImage && (
            <div className="relative inline-block">
              <img src={pastedImage.preview} alt="Pasted screenshot" className="max-h-24 rounded-md border border-border" />
              <button
                onClick={() => { URL.revokeObjectURL(pastedImage.preview); setPastedImage(null); }}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {/* Grammar polish suggestion */}
          {copilotPreview && (
            <GrammarPreview
              original={copilotPreview.original}
              polished={copilotPreview.polished}
              onAccept={acceptCopilotPolish}
              onReject={rejectCopilotPolish}
              onCancel={cancelCopilotPolish}
            />
          )}
          {/* Row 2: text input + send */}
          <div className="flex items-center gap-1.5">
            <Input
              ref={copilotInputRef}
              value={input}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter" && !e.shiftKey) smartCopilotSend(); }}
              onPaste={handlePaste}
              placeholder={compact ? "Ask Copilot..." : "Ask about jobs, tasks, or operations..."}
              className="flex-1"
              disabled={chatLoading || copilotPolishing}
            />
            <Button
              size="icon"
              onClick={() => smartCopilotSend()}
              disabled={chatLoading || copilotBusy || (!input.trim() && !pastedImage)}
              className="shrink-0"
              title={copilotPolishing ? "Checking grammar..." : "Send"}
            >
              {copilotPolishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
