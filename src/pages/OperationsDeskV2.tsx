import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Bot,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  File as FileIcon,
  FileText,
  Hash,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { UniversalMediaPlayer } from "@/components/media";
import { NewJobDialog } from "@/components/NewJobDialog";
import { SmsThreadView } from "@/components/SmsThreadView";
import { SmsTemplatePicker } from "@/components/SmsTemplatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GrammarPreview } from "@/components/ui/GrammarPreview";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/voice/DictateButton";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { useCallLog, type CallConversation } from "@/hooks/useCallLog";
import { useCallerLookup } from "@/hooks/useCallerLookup";
import { useComposerIntelligence } from "@/hooks/useComposerIntelligence";
import {
  useCustomerEstimates,
  useCustomerJobs,
} from "@/hooks/useCustomerHistory";
import { useCustomerOverview } from "@/hooks/useCustomerOverview";
import { useEmployees } from "@/hooks/useEmployees";
import { useJobs } from "@/hooks/useJobs";
import { useSmsLog, type SmsConversation } from "@/hooks/useSmsLog";
import { useSmsLogScoped } from "@/hooks/useSmsLogScoped";
import { useUnifiedCommunications, type UnifiedCommunication } from "@/hooks/useUnifiedCommunications";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDateFriendly, formatPhone, normalizeLast10, toE164 } from "@/lib/formatters";
import { verifyAddressWithGoogle, type GoogleAddressVerification } from "@/lib/google-maps";
import { insertAtSelection } from "@/lib/insertAtCursor";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { openSmsComposer } from "@/lib/smsComposerBridge";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { cn } from "@/lib/utils";

type DeskConversation = {
  id: string;
  kind: "call" | "sms";
  direction: "inbound" | "outbound";
  phone: string;
  companyPhone?: string | null;
  businessUnitId?: string | null;
  name: string | null;
  email?: string | null;
  address?: string | null;
  customerId?: string | null;
  customerType: string;
  status: string;
  summary: string;
  detail: string;
  createdAt: string;
  timeLabel: string;
  unread: boolean;
  latestJobId?: string | null;
  raw: CallConversation | SmsConversation;
  canonical?: UnifiedCommunication | null;
  handledByName?: string | null;
  handledAt?: string | null;
  handledMetadata?: Record<string, any> | null;
};

type IntakeThreadStatusRow = {
  channel: "sms" | "call";
  phone_last10: string;
  company_phone_number?: string | null;
  company_phone_last10?: string | null;
  thread_key?: string | null;
  status: "open" | "handled";
  handled_by_user_id: string | null;
  handled_by_name: string | null;
  handled_at: string | null;
  updated_at: string | null;
  metadata?: Record<string, any> | null;
};

type UIMode = "ai" | "human";
type InboxView = "now" | "answering" | "active" | "all";

const INTAKE_ACTIONS_CLEARED_BEFORE = new Date("2026-04-30T08:30:00-05:00").getTime();

type IconType = typeof Phone;

type BookingIntentSuggestion = {
  type: "book_job" | "book_estimate" | "book_maintenance" | "create_customer";
  label: string;
  buttonLabel: string;
  defaultOwner: string;
  urgency: "normal" | "soon" | "emergency";
  preferredTiming: string;
  address: string;
  confidence: "low" | "medium" | "high";
  action: {
    type: "book_job" | "book_estimate" | "book_maintenance" | "create_customer";
    job_type?: string;
    customer_name?: string;
    customer_id?: string;
    phone?: string;
    address?: string;
    description?: string;
    email?: string;
  };
};

type LiveIntakeField = {
  label: string;
  value: string;
  status: "captured" | "listening" | "missing";
};

type AddressVerification = {
  address: string;
  standardized?: string;
  confidence: "high" | "medium" | "low" | "unknown";
  source: "customer_record" | "call_ai" | "google_live" | "dispatcher" | "none";
  message: string;
};

type TeamNotificationRow = {
  id: string;
  title: string;
  body: string | null;
  related_entity_id: string | null;
  created_at: string;
};

type TeamMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type TeamConversationRow = {
  id: string;
  name: string | null;
  type: "direct" | "room";
};

type EmployeeLite = {
  profile_id: string | null;
  name: string;
};

type BusinessUnitLite = {
  id: string;
  slug?: string | null;
  display_name?: string | null;
  legal_name?: string | null;
  billing_name?: string | null;
  primary_phone_number?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatFeedTimestamp(value?: string | null) {
  if (!value) return { date: "Unknown", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "Unknown", time: "" };
  return {
    date: date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
    time: date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

function formatDate(value?: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function handledReceiptLabel(item?: DeskConversation | null) {
  if (!item || !isHandledConversation(item)) return null;
  const meta = item.handledMetadata || {};
  if (meta.handled_label) return String(meta.handled_label);
  if (meta.handled_outcome === "scheduled" || meta.scheduled_date) {
    const date = meta.scheduled_date ? formatDateFriendly(String(meta.scheduled_date)) || String(meta.scheduled_date) : "";
    const start = String(meta.scheduled_time || "").split(":")[0];
    const end = String(meta.scheduled_end || "").split(":")[0];
    const toHour = (value: string) => {
      const hour = Number(value);
      return Number.isFinite(hour) ? String(hour % 12 || 12) : value;
    };
    const block = start ? `${toHour(start)}${end ? ` to ${toHour(end)}` : ""}` : "";
    return `Scheduled ${[date, block].filter(Boolean).join(", ")}`.trim();
  }
  if (item.handledByName && item.handledAt) return `Handled by ${item.handledByName}`;
  return "Handled";
}

function handledReceiptDetail(item?: DeskConversation | null) {
  if (!item || !isHandledConversation(item)) return null;
  const meta = item.handledMetadata || {};
  return (
    meta.handled_detail ||
    meta.handled_work_reason ||
    (item.handledByName && item.handledAt ? `Handled by ${item.handledByName} at ${formatDateTime(item.handledAt)}.` : null)
  );
}

function timeAgo(value?: string | null) {
  if (!value) return "now";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 0) return "now";
  const minutes = Math.max(1, Math.floor(delta / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function customerName(customer: any) {
  if (!customer) return null;
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || null;
}

function customerAddress(customer: any) {
  if (!customer) return "";
  if (typeof customer.address === "string" && customer.address.trim()) return customer.address.trim();
  const parts = [
    customer.address_line1,
    customer.address_line2,
    customer.city,
    customer.state,
    customer.zip,
  ].filter(Boolean);
  return parts.join(", ");
}

function getConversationExtraction(selected: DeskConversation | null): Record<string, any> {
  if (!selected) return {};
  if (selected.kind === "call") {
    const call = (selected.raw as CallConversation).lastCall as any;
    return call?.extracted_data || call?.call_extraction || {};
  }
  const sms = selected.raw as SmsConversation;
  return (sms.lastMessage as any)?.extracted_data || (sms.lastMessage as any)?.sms_extraction || {};
}

function getConversationContextText(selected: DeskConversation | null) {
  if (!selected) return "";
  if (selected.kind === "call") {
    const calls = (selected.raw as CallConversation).calls || [];
    return calls
      .slice(0, 3)
      .map((call) => {
        const label = `${call.direction} call ${formatDateTime(call.created_at)}`;
        const body = call.transcription || call.ai_summary || call.status || "";
        return `${label}: ${body}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }

  const messages = (selected.raw as SmsConversation).messages || [];
  return messages
    .slice(-12)
    .map((message) => {
      const label = `${message.direction === "inbound" ? "Customer" : "Office"} ${message.time_ct || formatDateTime(message.created_at)}`;
      return `${label}: ${message.body || "Attachment"}`;
    })
    .join("\n");
}

function extractionAddress(extracted: Record<string, any>) {
  const verified = extracted.verified_address || extracted.address_standardized || "";
  if (typeof verified === "string" && verified.trim()) return verified.trim();
  const parts = [extracted.address, extracted.city, extracted.state, extracted.zip].filter(Boolean);
  return parts.join(", ");
}

function extractAddressFromText(text: string) {
  const match = text.match(
    /\b\d{2,6}\s+[A-Za-z0-9 .'-]+?\s(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Boulevard|Blvd|Way|Trail|Trl|Place|Pl|Loop|Path|Parkway|Pkwy|Orchard)\b(?:[^.\n|]*?(?:,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5})?)?/i
  );
  return match?.[0]?.replace(/\s+/g, " ").trim() || "";
}

function addressVerificationFromContext(
  selected: DeskConversation | null,
  customer: any,
  liveVerification?: GoogleAddressVerification | null,
  acceptedVerification?: AddressVerification | null
): AddressVerification {
  if (acceptedVerification) return acceptedVerification;

  const extracted = getConversationExtraction(selected);
  const heardAddress = extractionAddress(extracted);
  const textAddress = selected ? extractAddressFromText(`${selected.summary || ""} ${selected.detail || ""}`) : "";
  const recordAddress = customerAddress(customer);

  if (extracted.address_verified === true || extracted.address_verification_confidence >= 0.8) {
    return {
      address: heardAddress,
      standardized: extracted.verified_address || extracted.address_standardized || heardAddress,
      confidence: "high",
      source: "call_ai",
      message: "Google verified the address from the call.",
    };
  }

  if (extracted.address_verified === false || extracted.address_confidence === "low") {
    return {
      address: heardAddress || recordAddress,
      standardized: extracted.verified_address || heardAddress || recordAddress,
      confidence: "low",
      source: heardAddress ? "call_ai" : "customer_record",
      message: "Address needs dispatcher confirmation before booking.",
    };
  }

  if (liveVerification) {
    return {
      address: liveVerification.input,
      standardized: liveVerification.standardized,
      confidence: liveVerification.confidenceLabel,
      source: "google_live",
      message: liveVerification.confidenceLabel === "high"
        ? "Google has high confidence in this address."
        : "Google found the address, but confidence is not high enough to skip review.",
    };
  }

  if (heardAddress || textAddress) {
    return {
      address: heardAddress || textAddress,
      confidence: "unknown",
      source: heardAddress ? "call_ai" : "google_live",
      message: "Waiting for Google address verification.",
    };
  }

  if (recordAddress) {
    return {
      address: recordAddress,
      confidence: "high",
      source: "customer_record",
      message: "Using the existing customer address on file.",
    };
  }

  return {
    address: "",
    confidence: "unknown",
    source: "none",
    message: "No address captured yet.",
  };
}

function detectPreferredTiming(text: string) {
  if (/\btoday\b|right away|as soon as possible|\basap\b/i.test(text)) return "Today preferred";
  if (/\btomorrow\b/i.test(text)) return "Tomorrow is acceptable";
  if (/\bmorning\b/i.test(text)) return "Morning preferred";
  if (/\bafternoon\b/i.test(text)) return "Afternoon preferred";
  if (/\bafter\s+\d/i.test(text)) return "Specific time mentioned";
  return "Ask for preferred day/time";
}

function detectUrgency(text: string): BookingIntentSuggestion["urgency"] {
  if (/emergency|no heat|no cool|not cooling|not heating|water leak|burning|smell|sparking/i.test(text)) return "emergency";
  if (/today|as soon as possible|\basap\b|right away|urgent/i.test(text)) return "soon";
  return "normal";
}

function inferBookingIntent(selected: DeskConversation, customer: any): BookingIntentSuggestion | null {
  const text = `${selected.summary || ""} ${selected.detail || ""}\n${getConversationContextText(selected)}`.trim();
  const lowered = text.toLowerCase();
  const name = customerName(customer) || selected.name || "";
  const extracted = getConversationExtraction(selected);
  const address = extractionAddress(extracted) || customerAddress(customer) || extractAddressFromText(text);
  const customerId = customer?.id ? String(customer.id) : undefined;
  const commonAction = {
    customer_name: name,
    customer_id: customerId,
    phone: selected.phone,
    address,
    description: text,
    email: customer?.email || customer?.primary_email || "",
  };

  if (/quote|estimate|bid|proposal|replace|replacement|new system|new unit|install/i.test(lowered)) {
    return {
      type: "book_estimate",
      label: "Estimate intent detected",
      buttonLabel: "Review & Book Estimate",
      defaultOwner: "Clint Carnes",
      urgency: detectUrgency(text),
      preferredTiming: detectPreferredTiming(text),
      address,
      confidence: /quote|estimate|replace|replacement|new system/i.test(lowered) ? "high" : "medium",
      action: {
        ...commonAction,
        type: "book_estimate",
        job_type: "estimate",
      },
    };
  }

  if (/maintenance|tune[- ]?up|service agreement|comfort club|spring|fall/i.test(lowered)) {
    return {
      type: "book_maintenance",
      label: "Maintenance intent detected",
      buttonLabel: "Review & Book Maintenance",
      defaultOwner: "Jonathan Carnes",
      urgency: detectUrgency(text),
      preferredTiming: detectPreferredTiming(text),
      address,
      confidence: "medium",
      action: {
        ...commonAction,
        type: "book_maintenance",
        job_type: "maintenance",
      },
    };
  }

  if (/book|schedule|appointment|ac|a\/c|hvac|heater|furnace|broken|repair|not cooling|not heating|service call|come out/i.test(lowered)) {
    return {
      type: "book_job",
      label: "Service booking intent detected",
      buttonLabel: "Review & Book Service",
      defaultOwner: "Jonathan Carnes",
      urgency: detectUrgency(text),
      preferredTiming: detectPreferredTiming(text),
      address,
      confidence: /book|schedule|appointment|repair|not cooling|not heating/i.test(lowered) ? "high" : "medium",
      action: {
        ...commonAction,
        type: "book_job",
        job_type: "service",
      },
    };
  }

  return null;
}

function buildLiveIntakeFields(
  selected: DeskConversation,
  customer: any,
  bookingSuggestion: BookingIntentSuggestion | null,
  addressVerification?: AddressVerification
): LiveIntakeField[] {
  const text = `${selected.summary || ""} ${selected.detail || ""}`.trim();
  const timing = bookingSuggestion?.preferredTiming || detectPreferredTiming(text);
  const issue = bookingSuggestion?.action.description || text;
  const verifiedAddress = addressVerification?.standardized || addressVerification?.address || customerAddress(customer);
  const fields: LiveIntakeField[] = [
    {
      label: "Customer",
      value: customerName(customer) || selected.name || "",
      status: customerName(customer) || selected.name ? "captured" : "missing",
    },
    {
      label: "Phone",
      value: formatPhone(selected.phone) || selected.phone || "",
      status: selected.phone ? "captured" : "missing",
    },
    {
      label: "Address",
      value: verifiedAddress,
      status: verifiedAddress
        ? addressVerification?.confidence === "low" || addressVerification?.confidence === "unknown"
          ? "listening"
          : "captured"
        : "listening",
    },
    {
      label: "Address confidence",
      value: addressVerification?.confidence && addressVerification.confidence !== "unknown"
        ? `${addressVerification.confidence.toUpperCase()} - ${addressVerification.message}`
        : "",
      status: addressVerification?.confidence === "high" ? "captured" : "listening",
    },
    {
      label: "Intent",
      value: bookingSuggestion?.label.replace(" detected", "") || "",
      status: bookingSuggestion ? "captured" : "listening",
    },
    {
      label: "Issue",
      value: issue,
      status: issue ? "captured" : "listening",
    },
    {
      label: "Preferred timing",
      value: timing === "Ask for preferred day/time" ? "" : timing,
      status: timing === "Ask for preferred day/time" ? "listening" : "captured",
    },
    {
      label: "Urgency",
      value: bookingSuggestion
        ? bookingSuggestion.urgency === "emergency"
          ? "Emergency"
          : bookingSuggestion.urgency === "soon"
            ? "Soon"
            : "Normal"
        : "",
      status: bookingSuggestion ? "captured" : "listening",
    },
    {
      label: "Default owner",
      value: bookingSuggestion?.defaultOwner || "",
      status: bookingSuggestion ? "captured" : "listening",
    },
  ];

  return fields;
}

function callSummary(conversation: CallConversation) {
  const call = conversation.lastCall;
  const extracted = call.extracted_data || {};
  const intent = extracted.intent || extracted.customer_intent || extracted.action || extracted.booking_intent;
  if (typeof intent === "string" && intent.trim()) return intent.replaceAll("_", " ");
  if (call.ai_summary) return call.ai_summary;
  if (call.transcription) return call.transcription;
  if (call.status === "voicemail") return "Voicemail needs review";
  if (call.direction === "inbound") return "Incoming call";
  return "Outbound call";
}

function smsSummary(conversation: SmsConversation) {
  if (conversation.status === "needs_reply") return "Needs reply";
  if (conversation.latestJobId || conversation.jobContext) return "Text tied to active work";
  if (conversation.lastMessage.direction === "inbound") return "Incoming text";
  return "Outbound text";
}

function callToDeskItem(conversation: CallConversation): DeskConversation {
  const call = conversation.lastCall;
  return {
    id: `call-${call.id}`,
    kind: "call",
    direction: call.direction,
    phone: conversation.phoneNumber,
    companyPhone: conversation.calledNumber || null,
    businessUnitId: conversation.businessUnitId || null,
    name: conversation.contactName,
    customerType: conversation.contactType,
    status: call.status || "logged",
    summary: callSummary(conversation),
    detail: call.ai_summary || call.transcription || "Open this call to review what happened and decide the next step.",
    createdAt: call.created_at,
    timeLabel: call.time_ct || formatDateTime(call.created_at),
    unread: call.direction === "inbound" && !call.is_read,
    latestJobId: (call as any).related_job_id || null,
    raw: conversation,
  };
}

function smsToDeskItem(conversation: SmsConversation): DeskConversation {
  const message = conversation.lastMessage;
  return {
    id: `sms-${message.id}`,
    kind: "sms",
    direction: message.direction,
    phone: conversation.phoneNumber,
    companyPhone: conversation.toNumber || null,
    businessUnitId: conversation.businessUnitId || null,
    name: conversation.contactName,
    email: conversation.contactEmail || null,
    address: conversation.contactAddress || null,
    customerId: conversation.customerId || null,
    customerType: conversation.contactType,
    status: conversation.status,
    summary: smsSummary(conversation),
    detail: message.body || "Open this text to read it and reply.",
    createdAt: message.created_at,
    timeLabel: message.time_ct || formatDateTime(message.created_at),
    unread: conversation.unreadCount > 0,
    latestJobId: conversation.latestJobId,
    raw: conversation,
  };
}

function unifiedSourceKey(sourceTable?: string | null, sourceId?: string | null) {
  if (!sourceTable || !sourceId) return null;
  return `${sourceTable}:${sourceId}`;
}

function unifiedKeyForDeskItem(item: DeskConversation) {
  if (item.kind === "call") {
    const call = (item.raw as CallConversation).lastCall;
    return unifiedSourceKey("call_log", call.id);
  }

  const message = (item.raw as SmsConversation).lastMessage;
  return unifiedSourceKey("sms_log", message.id);
}

function intakeThreadKeyForParts(channel: "sms" | "call", phone: string, companyPhone?: string | null) {
  const phoneLast10 = normalizeLast10(phone);
  if (!phoneLast10) return `${channel}:legacy:unknown`;
  return `${channel}:${normalizeLast10(companyPhone || "") || "legacy"}:${phoneLast10}`;
}

function intakeThreadKeyForDeskItem(item: DeskConversation) {
  if (item.kind === "sms") {
    const conversation = item.raw as SmsConversation;
    return intakeThreadKeyForParts("sms", item.phone, conversation.toNumber);
  }
  const conversation = item.raw as CallConversation;
  return intakeThreadKeyForParts("call", item.phone, conversation.calledNumber);
}

function applyUnifiedCommunication(
  item: DeskConversation,
  canonicalBySource: Map<string, UnifiedCommunication>,
): DeskConversation {
  const canonical = canonicalBySource.get(unifiedKeyForDeskItem(item) || "");
  if (!canonical) return item;

  return {
    ...item,
    canonical,
    name: item.name || canonical.contact_name,
    customerType: item.customerType || canonical.contact_type || item.customerType,
    latestJobId: item.latestJobId || canonical.job_id,
    summary: item.summary || canonical.summary_text || item.summary,
    detail: item.detail || canonical.body || canonical.transcription || canonical.ai_summary || item.detail,
  };
}

function canonicalCommunicationContext(canonical?: UnifiedCommunication | null) {
  if (!canonical) return null;
  return {
    communication_id: canonical.communication_id,
    source_table: canonical.source_table,
    source_id: canonical.source_id,
    source_type: canonical.source_type,
    intake_channel: canonical.intake_channel,
    intake_status: canonical.intake_status,
    customer_id: canonical.customer_id,
    job_id: canonical.job_id,
    estimate_id: canonical.estimate_id,
    handled_by_name: canonical.handled_by_name,
    handled_at: canonical.handled_at,
  };
}

function conversationVisual(item: Pick<DeskConversation, "kind" | "direction">) {
  if (item.kind === "call" && item.direction === "inbound") {
    return {
      label: "Incoming call",
      shortLabel: "Call",
      icon: PhoneIncoming,
      directionIcon: ArrowDownLeft,
      ringClass: "bg-sky-700 text-white",
      badgeClass: "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-100",
      cardClass: "border-l-sky-700 bg-card hover:bg-muted/30",
      selectedClass: "border-primary bg-card ring-2 ring-primary/25 shadow-md",
    };
  }
  if (item.kind === "call" && item.direction === "outbound") {
    return {
      label: "Outgoing call",
      shortLabel: "Call",
      icon: PhoneOutgoing,
      directionIcon: ArrowUpRight,
      ringClass: "bg-indigo-700 text-white",
      badgeClass: "border-indigo-300 bg-indigo-50 text-indigo-950 dark:border-indigo-800/70 dark:bg-indigo-950/30 dark:text-indigo-100",
      cardClass: "border-l-indigo-700 bg-card hover:bg-muted/30",
      selectedClass: "border-primary bg-card ring-2 ring-primary/25 shadow-md",
    };
  }
  if (item.kind === "sms" && item.direction === "inbound") {
    return {
      label: "Incoming text",
      shortLabel: "Text",
      icon: MessageSquare,
      directionIcon: ArrowDownLeft,
      ringClass: "bg-teal-700 text-white",
      badgeClass: "border-teal-300 bg-teal-50 text-teal-950 dark:border-teal-800/70 dark:bg-teal-950/30 dark:text-teal-100",
      cardClass: "border-l-teal-700 bg-card hover:bg-muted/30",
      selectedClass: "border-primary bg-card ring-2 ring-primary/25 shadow-md",
    };
  }
  return {
    label: "Outgoing text",
    shortLabel: "Text",
    icon: Send,
    directionIcon: ArrowUpRight,
    ringClass: "bg-slate-700 text-white",
    badgeClass: "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100",
    cardClass: "border-l-slate-500 bg-card hover:bg-muted/30",
    selectedClass: "border-primary bg-card ring-2 ring-primary/25 shadow-md",
  };
}

function businessUnitMaps(units: BusinessUnitLite[]) {
  const byId = new Map<string, BusinessUnitLite>();
  const byPhone = new Map<string, BusinessUnitLite>();

  for (const unit of units) {
    if (unit.id) byId.set(unit.id, unit);
    const phoneKey = normalizeLast10(unit.primary_phone_number || "");
    if (phoneKey) byPhone.set(phoneKey, unit);
  }

  return { byId, byPhone };
}

function fallbackBusinessUnitForPhone(phone?: string | null): BusinessUnitLite | null {
  const last10 = normalizeLast10(phone || "");
  if (last10 === "2106005671") {
    return { id: "fix-fallback", slug: "fix", display_name: "FIX Construction", primary_phone_number: phone };
  }
  if (last10 === "2106005091") {
    return { id: "carnes-fallback", slug: "carnes", display_name: "Carnes & Sons", primary_phone_number: phone };
  }
  return null;
}

function businessUnitForConversation(
  item: DeskConversation,
  unitsById: Map<string, BusinessUnitLite>,
  unitsByPhone: Map<string, BusinessUnitLite>
) {
  const byId = item.businessUnitId ? unitsById.get(item.businessUnitId) : null;
  if (byId) return byId;

  const phoneKey = normalizeLast10(item.companyPhone || "");
  if (phoneKey && unitsByPhone.has(phoneKey)) return unitsByPhone.get(phoneKey)!;

  return fallbackBusinessUnitForPhone(item.companyPhone);
}

function companyLineBadge(unit: BusinessUnitLite | null, companyPhone?: string | null) {
  const rawName = unit?.display_name || unit?.billing_name || unit?.legal_name || "";
  const rawSlug = unit?.slug || "";
  const identity = `${rawSlug} ${rawName}`.toLowerCase();

  if (identity.includes("fix") || normalizeLast10(companyPhone || "") === "2106005671") {
    return {
      label: "FIX",
      title: rawName || "FIX Construction",
      className: "border-cyan-300 bg-cyan-500 text-slate-950 shadow-cyan-500/20 dark:border-cyan-300 dark:bg-cyan-400 dark:text-slate-950",
    };
  }

  if (identity.includes("carnes") || normalizeLast10(companyPhone || "") === "2106005091") {
    return {
      label: "CARNES",
      title: rawName || "Carnes & Sons",
      className: "border-orange-300 bg-orange-500 text-white shadow-orange-500/20 dark:border-orange-300 dark:bg-orange-500 dark:text-white",
    };
  }

  return {
    label: "LINE",
    title: rawName || "Company line not matched yet",
    className: "border-slate-300 bg-slate-700 text-white shadow-slate-700/20 dark:border-slate-600 dark:bg-slate-200 dark:text-slate-950",
  };
}

function isChannelOnlyText(value?: string | null) {
  const text = String(value || "").trim().toLowerCase();
  return [
    "incoming call",
    "inbound call",
    "outbound call",
    "outgoing call",
    "incoming text",
    "inbound text",
    "outbound text",
    "outgoing text",
  ].includes(text);
}

function cleanConversationDetail(value?: string | null) {
  const text = String(value || "").trim();
  if (/^open this (call|text)/i.test(text)) return "Review what happened and decide the next step.";
  return text;
}

function isUnknownConversation(item: DeskConversation) {
  const type = String(item.customerType || "").toLowerCase();
  return !item.name || type.includes("unknown") || type.includes("lead") || type.includes("new");
}

function isEmployeeConversation(item: DeskConversation) {
  const type = String(item.customerType || "").toLowerCase();
  return type === "employee" || type === "internal" || type.includes("employee") || type.includes("tech") || type.includes("internal");
}

function isAnsweringServiceConversation(item: DeskConversation) {
  if (item.kind !== "sms") return false;
  const text = `${item.name || ""} ${item.customerType || ""} ${item.summary || ""} ${item.detail || ""}`.toLowerCase();
  return text.includes("answering service") || text.includes("answering_service");
}

function isHandledConversation(item: DeskConversation) {
  return String(item.status || "").toLowerCase() === "done";
}

function isRecentWithinDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function isOpenWorkStatus(status?: string | null) {
  const text = String(status || "").toLowerCase();
  if (!text) return false;
  return !/\b(done|complete|completed|closed|cancel|canceled|cancelled|lost|won|paid|invoiced|archived)\b/.test(text);
}

function hasCurrentWorkDate(value?: string | null) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - 24 * 60 * 60 * 1000;
}

function hasActiveWorkSignal(item: DeskConversation) {
  if (isHandledConversation(item)) return false;
  if (isEmployeeConversation(item)) return false;
  if (new Date(item.createdAt).getTime() <= INTAKE_ACTIONS_CLEARED_BEFORE) return false;
  if (item.kind === "sms") {
    const conversation = item.raw as SmsConversation;
    if (
      conversation.jobContext &&
      isOpenWorkStatus(conversation.jobContext.status) &&
      hasCurrentWorkDate(conversation.jobContext.scheduledDate)
    ) {
      return true;
    }
    if (
      conversation.estimateContext &&
      isOpenWorkStatus(conversation.estimateContext.status) &&
      hasCurrentWorkDate(conversation.estimateContext.scheduledDate)
    ) {
      return true;
    }
  }
  return false;
}

function getAttentionBadges(item: DeskConversation) {
  const text = `${item.summary || ""} ${item.detail || ""} ${item.status || ""}`.toLowerCase();
  if (isHandledConversation(item)) return [];
  if (isEmployeeConversation(item)) return [];
  const eligibleForAction = new Date(item.createdAt).getTime() > INTAKE_ACTIONS_CLEARED_BEFORE;
  const badges: {
    label: string;
    prefix?: string;
    className: string;
    icon: IconType;
    group: "needs_action" | "active" | "recent";
  }[] = [];

  const inbound = item.direction === "inbound";
  const unhandledSms = item.kind === "sms" && inbound && (item.status === "needs_reply" || item.unread);
  const unhandledCall = item.kind === "call" && inbound && item.unread;
  const urgent = eligibleForAction && (unhandledSms || unhandledCall) && /\burgent\b|\bemergency\b|no cool|not cooling|a\/c not working|ac not working|no heat|water leak|burning|smoke/.test(text);
  const needsReply = eligibleForAction && unhandledSms;
  const missedCall = eligibleForAction && unhandledCall && /missed|voicemail|no.?answer|busy|failed/.test(text);
  const unknown = isUnknownConversation(item);
  const freshUnknownInbound = eligibleForAction && unknown && inbound && item.unread && isRecentWithinDays(item.createdAt, 2);

  if (urgent) {
    badges.push({
      label: "Urgent",
      prefix: "Urgent",
      className: "border-red-300 bg-red-50 text-red-950 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-100",
      icon: AlertTriangle,
      group: "needs_action",
    });
  }
  if (needsReply) {
    badges.push({
      label: "Needs reply",
      prefix: "Needs reply",
      className: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100",
      icon: MessageSquare,
      group: "needs_action",
    });
  }
  if (missedCall) {
    badges.push({
      label: "Missed",
      prefix: "Missed call",
      className: "border-red-300 bg-red-50 text-red-950 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-100",
      icon: PhoneIncoming,
      group: "needs_action",
    });
  }
  if (freshUnknownInbound) {
    badges.push({
      label: "New lead",
      prefix: badges.length ? undefined : "New lead",
      className: "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-100",
      icon: UserPlus,
      group: "needs_action",
    });
  }
  if (eligibleForAction && item.unread && badges.length === 0) {
    badges.push({
      label: "New",
      prefix: "New",
      className: "border-primary/30 bg-primary/5 text-primary",
      icon: BellRing,
      group: "needs_action",
    });
  }

  return badges;
}

function conversationMatchesInboxView(item: DeskConversation, view: InboxView, selectedId?: string) {
  if (view === "all") return true;
  if (view === "answering") return isAnsweringServiceConversation(item) && !isHandledConversation(item);
  if (view === "active") return hasActiveWorkSignal(item);
  return getConversationGroup(item, selectedId) === "needs_action";
}

function getConversationGroup(item: DeskConversation, selectedId?: string) {
  const badges = getAttentionBadges(item);
  if (badges.some((badge) => badge.group === "needs_action")) return "needs_action";
  if (item.id === selectedId) return "active";
  return "recent";
}

function groupConversationItems(items: DeskConversation[], selectedId?: string) {
  const groups = [
    { key: "needs_action", label: "Needs Action", items: [] as DeskConversation[] },
    { key: "active", label: "Active", items: [] as DeskConversation[] },
    { key: "recent", label: "Recent", items: [] as DeskConversation[] },
  ];
  const byKey = new Map(groups.map((group) => [group.key, group.items]));
  for (const item of items) {
    byKey.get(getConversationGroup(item, selectedId))?.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

function StepHeader({
  step,
  title,
  detail,
  icon: Icon,
  tone = "primary",
  action,
}: {
  step: string;
  title: string;
  detail: string;
  icon: IconType;
  tone?: "primary" | "signal" | "context" | "action";
  action?: React.ReactNode;
}) {
  const toneClass =
    tone === "signal"
      ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-100"
      : tone === "context"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100"
        : tone === "action"
          ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100"
          : "border-primary/20 bg-primary/5 text-foreground";

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {step}
              </span>
              <h2 className="text-sm font-semibold">{title}</h2>
            </div>
            <p className="mt-1 text-xs leading-5 opacity-80">{detail}</p>
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function TeamInboxSignal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["intake-team-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_notifications")
        .select("id, title, body, related_entity_id, created_at")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as TeamNotificationRow[];
    },
    refetchInterval: 15000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["intake-team-messages"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data || []) as TeamMessageRow[];
    },
    refetchInterval: 15000,
  });

  const latestMessage = messages[0] || null;
  const conversationIds = useMemo(
    () => Array.from(new Set(messages.map((message) => message.conversation_id).filter(Boolean))),
    [messages]
  );
  const senderIds = useMemo(
    () => Array.from(new Set(messages.map((message) => message.sender_id).filter(Boolean))),
    [messages]
  );

  const { data: conversations = [] } = useQuery({
    queryKey: ["intake-team-conversations", conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_conversations")
        .select("id, name, type")
        .in("id", conversationIds);
      if (error) throw error;
      return (data || []) as TeamConversationRow[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["intake-team-senders", senderIds.join(",")],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("profile_id, name")
        .in("profile_id", senderIds);
      if (error) throw error;
      return (data || []) as EmployeeLite[];
    },
  });

  const markRead = async () => {
    if (!user) return;
    const { error } = await (supabase as any)
      .from("team_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast({ title: "Team alerts stayed unread", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["intake-team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["side-rail-team-notifications", user.id] });
    queryClient.invalidateQueries({ queryKey: ["now-team-notifications", user.id] });
    toast({ title: "Team alerts cleared" });
  };

  if (notifications.length === 0 && !latestMessage) return null;

  const senderByProfile = new Map(employees.map((employee) => [employee.profile_id, employee.name]));
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const sender = latestMessage
    ? senderByProfile.get(latestMessage.sender_id) || (latestMessage.sender_id === user?.id ? "You" : "Team member")
    : "";
  const conversation = latestMessage ? conversationById.get(latestMessage.conversation_id) : null;
  const href = latestMessage ? `/team?conversation=${latestMessage.conversation_id}` : "/team";

  return (
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <p className="truncate text-sm font-semibold">
              {notifications.length > 0
                ? `${notifications.length} team alert${notifications.length === 1 ? "" : "s"} need attention`
                : "Latest team text"}
            </p>
          </div>
          {latestMessage ? (
            <div className="mt-2 text-xs">
              <div className="flex items-center gap-1 text-amber-900/80 dark:text-amber-100/80">
                <span className="font-semibold">{sender}</span>
                <span>·</span>
                <Hash className="h-3 w-3" />
                <span className="truncate">{conversation?.name || (conversation?.type === "direct" ? "Direct message" : "Team")}</span>
                <span>·</span>
                <span>{timeAgo(latestMessage.created_at)}</span>
              </div>
              <p className="mt-1 line-clamp-2">{latestMessage.body || "Attachment"}</p>
            </div>
          ) : notifications[0]?.body ? (
            <p className="mt-2 line-clamp-2 text-xs">{notifications[0].body}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Link to={href} className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700">
            Open
          </Link>
          {notifications.length > 0 && (
            <button type="button" onClick={markRead} className="rounded-md px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-950/40">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationList({
  items,
  selectedId,
  businessUnits,
  isAdmin,
  loading,
  readModelError,
  search,
  tutorialMode,
  onSearch,
  onSelect,
  onClearForTesting,
  clearingIds,
}: {
  items: DeskConversation[];
  selectedId?: string;
  businessUnits: BusinessUnitLite[];
  isAdmin: boolean;
  loading: boolean;
  readModelError?: unknown;
  search: string;
  tutorialMode: boolean;
  onSearch: (value: string) => void;
  onSelect: (item: DeskConversation) => void;
  onClearForTesting: (item: DeskConversation) => void;
  clearingIds: Set<string>;
}) {
  const PAGE_SIZE = 20;
  const { byId: businessUnitsById, byPhone: businessUnitsByPhone } = useMemo(
    () => businessUnitMaps(businessUnits),
    [businessUnits]
  );
  const hasSearch = search.trim().length > 0;
  const [inboxView, setInboxView] = useState<InboxView>("now");
  const viewOptions: { key: InboxView; label: string; description: string }[] = [
    { key: "now", label: "Now", description: "Only contacts that need attention." },
    { key: "answering", label: "Answering", description: "Overflow calls captured by the answering service." },
    { key: "active", label: "Active", description: "Open work and recent customers." },
    { key: "all", label: "Recent", description: "All recent calls and texts." },
  ];
  const currentViewLabel = hasSearch
    ? "Search"
    : viewOptions.find((option) => option.key === inboxView)?.label || "Now";
  const viewCounts = useMemo(() => ({
    now: items.filter((item) => conversationMatchesInboxView(item, "now", selectedId)).length,
    answering: items.filter((item) => conversationMatchesInboxView(item, "answering", selectedId)).length,
    active: items.filter((item) => conversationMatchesInboxView(item, "active", selectedId)).length,
    all: items.length,
  }), [items, selectedId]);
  const queueItems = useMemo(() => {
    const viewItems = hasSearch
      ? items
      : items.filter((item) => conversationMatchesInboxView(item, inboxView, selectedId));
    const needsAction = viewItems.filter((item) => getConversationGroup(item, selectedId) === "needs_action");
    const actionIds = new Set(needsAction.map((item) => item.id));
    const active = selectedId
      ? viewItems.filter((item) => item.id === selectedId && !actionIds.has(item.id))
      : [];
    const activeIds = new Set(active.map((item) => item.id));
    const recent = viewItems.filter((item) => !actionIds.has(item.id) && !activeIds.has(item.id));
    const selected = selectedId
      ? viewItems.find((item) => item.id === selectedId && !actionIds.has(item.id) && !activeIds.has(item.id) && !recent.some((candidate) => candidate.id === item.id))
      : null;
    return selected ? [selected, ...needsAction, ...active, ...recent] : [...needsAction, ...active, ...recent];
  }, [hasSearch, inboxView, items, selectedId]);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const visibleItems = queueItems.slice(0, visibleLimit);
  const visibleGroups = useMemo(() => groupConversationItems(visibleItems, selectedId), [selectedId, visibleItems]);
  const totalGroups = useMemo(() => groupConversationItems(queueItems, selectedId), [queueItems, selectedId]);
  const totalGroupCounts = useMemo(
    () => new Map(totalGroups.map((group) => [group.key, group.items.length])),
    [totalGroups]
  );
  const remainingCount = Math.max(0, queueItems.length - visibleItems.length);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [PAGE_SIZE, inboxView, search]);

  const handleQueueScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceFromBottom > 180) return;
    setVisibleLimit((current) => Math.min(current + PAGE_SIZE, queueItems.length));
  }, [PAGE_SIZE, queueItems.length]);

  return (
    <aside className="flex min-h-0 flex-col border-r bg-background">
      <div className="border-b bg-card p-4">
        {tutorialMode ? (
          <StepHeader
            step="Step 1"
            title="Start Here: New Calls & Texts"
            detail={hasSearch ? "Search the wider communication history." : "Pick the newest call or text, then move right."}
            icon={BellRing}
            tone="signal"
            action={
              <Badge variant="secondary" className="shrink-0">
                {currentViewLabel}
              </Badge>
            }
          />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Calls & Texts Coming In</h2>
                <Badge variant="secondary">{currentViewLabel}</Badge>
              </div>
            </div>
          </div>
        )}
        <div className={cn("flex justify-end", tutorialMode ? "mt-3" : "mt-2")}>
          <Link
            to="/phone"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Open inbox
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border bg-muted/40 p-1">
          {viewOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              title={option.description}
              onClick={() => setInboxView(option.key)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-semibold transition",
                inboxView === option.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
            >
              <span className="block truncate">{option.label}</span>
              <span className="block text-[10px] font-medium opacity-70">{viewCounts[option.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search phone, name, message"
            className="h-9 pl-9"
          />
        </div>
        <TeamInboxSignal />
        {readModelError ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100">
            Calls and texts are showing, but customer/job matching is behind. Refresh or check Control Room if this stays on.
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-6" onScroll={handleQueueScroll}>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 rounded-lg" />)}
          </div>
        ) : queueItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {hasSearch
              ? "No conversations match this search."
              : inboxView === "now"
                ? "Zero inbox. No contacts need attention right now."
                : inboxView === "answering"
                  ? "No answering service messages found."
                : inboxView === "active"
                  ? "No active work contacts in this view."
                  : "No recent conversations found."}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.key} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {inboxView === "answering"
                      ? "Answering Service"
                      : inboxView === "active" && group.key === "recent"
                        ? "Active Work"
                        : group.label}
                  </p>
                  <Badge variant="outline" className="h-5 text-[10px]">{totalGroupCounts.get(group.key) || group.items.length}</Badge>
                </div>
              {group.items.map((item) => {
                const visual = conversationVisual(item);
                const Icon = visual.icon;
                const DirectionIcon = visual.directionIcon;
                const feedTime = formatFeedTimestamp(item.createdAt);
                const badges = getAttentionBadges(item);
                const primaryBadge = badges[0] || null;
                const name = item.name || formatPhone(item.phone) || item.phone;
                const contactLine = [item.address, item.email].filter(Boolean).join(" / ");
                const summaryText = isChannelOnlyText(item.summary) ? "Review what happened" : item.summary;
                const detailText = cleanConversationDetail(item.detail);
                const isSelected = selectedId === item.id;
                const showTestingDelete = isAdmin && group.key === "needs_action";
                const isClearing = clearingIds.has(item.id);
                const unit = businessUnitForConversation(item, businessUnitsById, businessUnitsByPhone);
                const companyBadge = companyLineBadge(unit, item.companyPhone);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(item)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelect(item);
                    }}
                    title={visual.label}
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative w-full rounded-lg border border-l-4 px-3 py-2 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
                      isSelected ? cn(visual.selectedClass, "intake-selected-card animate-selected-card") : visual.cardClass,
                      primaryBadge?.label === "Urgent" && !isSelected && "border-red-300 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20",
                      primaryBadge?.label === "Needs reply" && !isSelected && "border-amber-300 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/20",
                      item.unread && !isSelected && "ring-1 ring-primary/15"
                    )}
                  >
                    {showTestingDelete && (
                      <button
                        type="button"
                        title="Clear this testing card from Intake"
                        aria-label="Clear this testing card from Intake"
                        disabled={isClearing}
                        onClick={(event) => {
                          event.stopPropagation();
                          onClearForTesting(item);
                        }}
                        className={cn(
                          "absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground opacity-0 shadow-sm transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100",
                          isClearing && "pointer-events-none opacity-60"
                        )}
                      >
                      {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <div className={cn("mb-2 inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] shadow-sm", companyBadge.className)}>
                      <span className="truncate">{companyBadge.label}</span>
                      <span className="h-3 w-px bg-current/40" />
                      <span className="truncate text-[9px] font-bold tracking-wide opacity-85">
                        {formatPhone(item.companyPhone || unit?.primary_phone_number || "") || companyBadge.title}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn("flex min-w-0 items-center gap-2", showTestingDelete && "pr-8")}>
                        <div
                          className={cn(
                            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-transform duration-200 group-hover:scale-105",
                            visual.ringClass,
                            item.unread && !isSelected && "animate-attention-pulse",
                            isSelected && "ring-2 ring-background/80"
                          )}
                          aria-label={visual.label}
                        >
                          <Icon className="h-4 w-4" />
                          <DirectionIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-background bg-background p-0.5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            {isSelected && (
                              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                                Active
                              </span>
                            )}
                          </div>
                          {contactLine && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">{contactLine}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {badges.slice(0, 2).map((badge) => {
                              const BadgeIcon = badge.icon;
                              return (
                                <span key={badge.label} className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", badge.className)}>
                                  <BadgeIcon className="h-3 w-3" />
                                  {badge.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-right text-[10px] leading-4 text-muted-foreground">
                        <span className="block font-medium text-foreground/70">{feedTime.date}</span>
                        <span className="block">{feedTime.time || item.timeLabel}</span>
                      </span>
                    </div>
                    <p className={cn("mt-2 truncate text-xs font-medium", isSelected ? "text-foreground" : "text-foreground/90")}>{summaryText}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{detailText}</p>
                  </div>
                );
              })}
              </div>
            ))}
            {remainingCount > 0 && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Scroll for {remainingCount} more conversation{remainingCount === 1 ? "" : "s"}.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function MiniConversationRail({
  items,
  selectedId,
  onSelect,
}: {
  items: DeskConversation[];
  selectedId?: string;
  onSelect: (item: DeskConversation) => void;
}) {
  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((item) => {
        const visual = conversationVisual(item);
        const Icon = visual.icon;
        const DirectionIcon = visual.directionIcon;
        const badges = getAttentionBadges(item);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            title={visual.label}
            className={cn(
              "w-full rounded-md border border-l-4 p-2 text-left transition hover:border-primary/40",
              selectedId === item.id ? visual.selectedClass : visual.cardClass
            )}
          >
            <div className="flex items-center gap-2">
              <div className={cn("relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md", visual.ringClass)} aria-label={visual.label}>
                <Icon className="h-3 w-3" />
                <DirectionIcon className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border border-background bg-background p-0.5 text-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{item.name || formatPhone(item.phone) || item.phone}</p>
                {badges[0] && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {badges[0].label}
                  </p>
                )}
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.summary}</p>
          </button>
        );
      })}
    </div>
  );
}

function ConversationEvidence({ selected }: { selected: DeskConversation }) {
  const navigate = useNavigate();

  if (selected.kind !== "call") return null;

  const conversation = selected.raw as CallConversation;
  const latestCall = conversation.lastCall;
  const transcript = latestCall.transcription?.trim();
  const summary = latestCall.ai_summary?.trim();
  const previousCalls = conversation.calls.filter((call) => call.id !== latestCall.id).slice(0, 2);

  return (
    <Section title="Call Notes" detail="Recording notes and summary from this call.">
      <div className="space-y-3">
        {summary && (
          <div className="rounded-md border bg-primary/5 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jarvis summary</p>
            <p className="mt-1 line-clamp-4 text-sm leading-6">{summary}</p>
          </div>
        )}
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recording</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestCall.duration_seconds ? `${latestCall.duration_seconds}s call` : "Call audio"}
              </p>
            </div>
            <Badge variant={latestCall.recording_url ? "secondary" : "outline"}>
              {latestCall.recording_url ? "Available" : "No audio yet"}
            </Badge>
          </div>
          {latestCall.recording_url ? (
            <UniversalMediaPlayer
              src={getRecordingProxyUrl(latestCall.recording_url)}
              kind="audio"
              title="Call recording"
              subtitle={latestCall.time_ct || formatDateTime(latestCall.created_at)}
              className="mt-3"
            />
          ) : (
            <p className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No recording is attached to this call yet. If Twilio is still attaching audio, it will appear here when the call log refreshes.
            </p>
          )}
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Transcript</p>
            <Badge variant={transcript ? "secondary" : "outline"}>{transcript ? "Deepgram" : latestCall.status || "pending"}</Badge>
          </div>
          {transcript ? (
            <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
              {transcript}
            </p>
          ) : (
            <p className="mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No transcript is attached to this call yet. If Deepgram is still processing, this will fill in when the call log updates.
            </p>
          )}
        </div>
        {previousCalls.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent calls with this number</p>
            {previousCalls.map((call) => (
              <div key={call.id} className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{call.direction === "inbound" ? "Inbound" : "Outbound"} call</span>
                  <span className="text-[10px] text-muted-foreground">{call.time_ct || formatDateTime(call.created_at)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{call.ai_summary || call.transcription || call.status || "No note"}</p>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/phone")}>
          <ExternalLink className="h-4 w-4" />
          Open call inbox
        </Button>
      </div>
    </Section>
  );
}

type SendSmsHandler = (to: string, body: string, jobId?: string, contactName?: string, mediaUrls?: string[]) => Promise<boolean>;

function InlineSmsReplyComposer({
  selected,
  sending,
  onSend,
}: {
  selected: DeskConversation;
  sending: boolean;
  onSend: SendSmsHandler;
}) {
  const conversation = selected.raw as SmsConversation;
  const [body, setBody] = useState("");
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false);
  const visibleMessages = useMemo(
    () => conversation.messages.slice(-20),
    [conversation.messages]
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      if (threadRef.current) {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      }
    });
  }, [selected.id, visibleMessages.length]);

  useEffect(() => {
    setBody("");
    setPendingFiles((prev) => {
      prev.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
      });
      return [];
    });
  }, [selected.id]);

  const uploadFiles = useCallback(async (files: { file: File }[]) => {
    const urls: string[] = [];
    for (const { file } of files) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `outbound/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("mms-media").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("mms-media").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }, []);

  const executeSend = useCallback(
    async (text: string): Promise<boolean> => {
      const to = selected.phone || conversation.phoneNumber;
      if (!to || sending || uploading || sendInFlightRef.current) return false;
      if (!text.trim() && pendingFiles.length === 0) return false;

      sendInFlightRef.current = true;
      let mediaUrls: string[] | undefined;
      try {
        if (pendingFiles.length > 0) {
          setUploading(true);
          mediaUrls = await uploadFiles(pendingFiles);
          setUploading(false);
        }

        const success = await onSend(
          to,
          text.trim() || "Attachment",
          conversation.latestJobId || selected.latestJobId || undefined,
          conversation.contactName || selected.name || undefined,
          mediaUrls
        );

        if (success) {
          setBody("");
          setPendingFiles((prev) => {
            prev.forEach((item) => {
              if (item.preview) URL.revokeObjectURL(item.preview);
            });
            return [];
          });
        }
        return !!success;
      } catch (error: any) {
        setUploading(false);
        toast({
          title: "SMS attachment failed",
          description: error?.message || "The message was not sent. Try again or open the full SMS thread.",
          variant: "destructive",
        });
        return false;
      } finally {
        sendInFlightRef.current = false;
      }
    },
    [conversation.contactName, conversation.latestJobId, conversation.phoneNumber, onSend, pendingFiles, selected.latestJobId, selected.name, selected.phone, sending, uploadFiles, uploading]
  );

  const composer = useComposerIntelligence({
    value: body,
    setValue: setBody,
    context: "sms",
    onSend: executeSend,
  });

  const {
    inputRef,
    handleChange,
    handleBlur,
    handleSend: smartSend,
    polishing,
    isBusy,
    preview,
    acceptPolish,
    rejectPolish,
    cancelPolish,
  } = composer;

  const handleSend = async () => {
    if (sending || uploading || polishing) return;
    if (!body.trim() && pendingFiles.length > 0) {
      await executeSend("");
      return;
    }
    await smartSend();
  };

  const addFiles = (files: File[]) => {
    const next = files.map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setPendingFiles((prev) => [...prev, ...next]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/") || item.type.startsWith("video/") || item.type === "application/pdf")
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];

    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const sendDisabled = sending || uploading || isBusy || (!body.trim() && pendingFiles.length === 0);

  return (
    <section id="intake-inline-sms-reply">
      <Section title="Text Conversation" detail="Newest messages stay at the bottom, just like texting.">
      <div className="overflow-hidden rounded-lg border bg-background">
        <div ref={threadRef} className="max-h-[420px] space-y-2 overflow-y-auto p-3">
          {visibleMessages.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No messages loaded for this thread yet.</p>
          ) : (
            visibleMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[88%] rounded-2xl px-3 py-2 shadow-sm",
                  message.direction === "outbound"
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "mr-auto rounded-bl-md border bg-muted/70 text-foreground"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                    {message.direction === "outbound" ? "You" : "Customer"}
                  </span>
                  <span className="text-[10px] opacity-70">{message.time_ct || formatDateTime(message.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-5">{message.body || "Attachment"}</p>
                {normalizeMediaAttachments(message.media_urls).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {normalizeMediaAttachments(message.media_urls).map((media, index) => (
                      <MmsMediaRenderer
                        key={`${media.url}-${index}`}
                        url={media.url}
                        contentType={media.fileType || undefined}
                        fileName={media.fileName}
                        compact
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        {preview && (
          <div className="border-t p-3">
          <GrammarPreview
            original={preview.original}
            polished={preview.polished}
            onAccept={acceptPolish}
            onReject={rejectPolish}
            onCancel={cancelPolish}
          />
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t p-3">
            {pendingFiles.map((item, index) => (
              <div key={`${item.file.name}-${index}`} className="relative flex items-center gap-2 rounded-md border bg-background p-2 pr-8 text-xs">
                {item.preview ? (
                  <img src={item.preview} alt={item.file.name} className="h-10 w-10 rounded object-cover" />
                ) : item.file.type === "application/pdf" ? (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <FileIcon className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="max-w-[140px] truncate">{item.file.name}</span>
                <button
                  type="button"
                  onClick={() => removePendingFile(index)}
                  className="absolute right-1 top-1 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t bg-card p-2">
          <Textarea
            ref={inputRef}
            value={body}
            onChange={handleChange}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Reply by SMS..."
            className="min-h-[86px] resize-none border-0 px-1 shadow-none focus-visible:ring-0"
            disabled={sending || uploading || polishing}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*,application/pdf"
                onChange={handleFileSelect}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Attach photo, video, or PDF">
                <Paperclip className="h-4 w-4" />
              </Button>
              <EmojiPicker
                onSelect={(emoji) => {
                  const el = inputRef.current;
                  const { value, caret } = insertAtSelection(body, el?.selectionStart ?? null, el?.selectionEnd ?? null, emoji);
                  setBody(value);
                  requestAnimationFrame(() => {
                    el?.focus();
                    el?.setSelectionRange(caret, caret);
                  });
                }}
              />
              <SmsTemplatePicker
                onSelect={(template) => {
                  const next = body.trim() ? `${body.trim()}\n${template}` : template;
                  setBody(next);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              />
              <DictateButton
                size="sm"
                showLabel
                hideOnMobile={false}
                autoStopOnSilence={false}
                context="sms"
                title="Dictate reply"
                onTranscript={(text) => {
                  const el = inputRef.current;
                  const { value, caret } = insertAtSelection(body, el?.selectionStart ?? null, el?.selectionEnd ?? null, text);
                  setBody(value);
                  requestAnimationFrame(() => {
                    el?.focus();
                    el?.setSelectionRange(caret, caret);
                  });
                }}
              />
            </div>
            <Button className="gap-2" onClick={handleSend} disabled={sendDisabled}>
              {sending || uploading || polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send reply
            </Button>
          </div>
        </div>
      </div>
      </Section>
    </section>
  );
}

function CustomerWorkspace({
  selected,
  tutorialMode,
  smsSending,
  onSendSms,
  onMarkSmsRead,
  onMarkCallRead,
  onSetSmsThreadStatus,
  onHandled,
}: {
  selected: DeskConversation | null;
  tutorialMode: boolean;
  smsSending: boolean;
  onSendSms: SendSmsHandler;
  onMarkSmsRead: (phone: string) => void | Promise<void>;
  onMarkCallRead: (phone: string) => void | Promise<void>;
  onSetSmsThreadStatus: ReturnType<typeof useSmsLog>["setThreadStatus"];
  onHandled: (conversationId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, employeeId } = useAuth();
  const { data: employees = [] } = useEmployees();
  const { startRecordSession } = useCopilotPanel();
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
  const [jarvisDialogOpen, setJarvisDialogOpen] = useState(false);
  const [handledStamp, setHandledStamp] = useState<{ id: string; label: string; at: string } | null>(null);
  const [handling, setHandling] = useState(false);
  const lookup = useCallerLookup(selected?.phone);
  const customer = lookup.data;
  const customerId = customer?.id;
  const { data: overview, isLoading: overviewLoading } = useCustomerOverview(customerId);
  const { data: jobs = [] } = useCustomerJobs(customerId);
  const { data: estimates = [] } = useCustomerEstimates(customerId);

  const activeJobs = useMemo(() => {
    const done = new Set(["done", "invoiced", "canceled", "cancelled", "completed"]);
    return (jobs || []).filter((job: any) => !done.has(String(job.status || "").toLowerCase()));
  }, [jobs]);

  const recentRecords = useMemo(() => {
    return [...(jobs || []).slice(0, 3), ...(estimates || []).slice(0, 2)].slice(0, 4);
  }, [jobs, estimates]);
  const keepUnreadUntilHandled = useCallback((_phone: string) => undefined, []);

  if (!selected) {
    return (
      <main className="flex min-h-0 flex-1 flex-col bg-background p-4">
        {tutorialMode ? (
          <StepHeader
            step="Step 2"
            title="See Who's Calling"
            detail="Pick a call or text and we'll show who it is, what they need, and what to do next."
            icon={UserRound}
            tone="context"
          />
        ) : (
          <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Customer Lookup</h2>
            </div>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No conversation selected</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a call or text to identify the customer, see active work, and decide what dispatch should do next.
          </p>
        </div>
        </div>
      </main>
    );
  }

  const displayName = customerName(customer) || selected.name || formatPhone(selected.phone) || selected.phone;
  const employeeName = employees.find((employee: any) => employee.id === employeeId)?.name || user?.email || "Current user";
  const address = customer
    ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")
    : null;
  const contactReason = isChannelOnlyText(selected.summary)
    ? cleanConversationDetail(selected.detail) || "Review the selected conversation and decide the next step."
    : selected.summary || cleanConversationDetail(selected.detail) || "Waiting for Jarvis summary";
  const dialable = toE164(selected.phone) || selected.phone;
  const visual = conversationVisual(selected);
  const ConversationIcon = visual.icon;
  const attentionBadges = getAttentionBadges(selected);
  const primaryAttention = attentionBadges[0] || null;
  const riskLabel = primaryAttention?.label || (!customer ? "Unknown customer" : activeJobs.length > 0 ? "Active work" : "Normal");
  const riskClass = primaryAttention?.className || (!customer ? "border-violet-300 bg-violet-50 text-violet-950 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-100" : "border-border bg-muted/30 text-foreground");
  const bookingSuggestion = inferBookingIntent(selected, customer);
  const addressVerification = addressVerificationFromContext(selected, customer);
  const liveIntakeFields = buildLiveIntakeFields(selected, customer, bookingSuggestion, addressVerification);
  const missingFields = liveIntakeFields.filter((field) => field.status !== "captured");
  const capturedFields = liveIntakeFields.filter((field) => field.status === "captured");
  const openCall = () => {
    openPhoneConsole(dialable, { contactName: displayName, customerId: customer?.id, autoDial: false });
  };
  const openText = () => {
    setSmsDialogOpen(true);
  };
  const handledLabel = handledReceiptLabel(selected);
  const handledDetail = handledReceiptDetail(selected);
  const markHandled = async () => {
    if (!selected || handling) return;
    if (!user?.id) {
      toast({ title: "Sign in required", description: "We need your user account so the handled stamp is accountable." });
      return;
    }

    setHandling(true);
    const handledAt = new Date().toISOString();
    const phoneLast10 = normalizeLast10(selected.phone);
    const latestCall = selected.kind === "call" ? (selected.raw as CallConversation).lastCall : null;
    const smsConversation = selected.kind === "sms" ? selected.raw as SmsConversation : null;
    const communicationId = selected.kind === "call" ? latestCall?.id : smsConversation?.lastMessage.id;
    const canonical = selected.canonical || null;
    const details = {
      conversation_id: selected.id,
      communication_id: communicationId || null,
      canonical_communication_id: canonical?.communication_id || null,
      canonical_source_table: canonical?.source_table || null,
      canonical_source_id: canonical?.source_id || null,
      communication_type: selected.kind,
      direction: selected.direction,
      phone_last10: phoneLast10 || null,
      customer_id: customer?.id || null,
      customer_name: customerName(customer) || selected.name || null,
      job_id: selected.latestJobId || null,
      summary: selected.summary || null,
      handled_by_user_id: user.id,
      handled_by_name: employeeName,
      handled_at: handledAt,
    };

    try {
      if (selected.kind === "sms") {
        const threadKey = smsConversation?.threadKey || selected.phone;
        await onMarkSmsRead(threadKey);
        await onSetSmsThreadStatus(threadKey, "done");
      } else {
        await onMarkCallRead((selected.raw as CallConversation).threadKey || selected.phone);
      }
      if (phoneLast10) {
        const { data: handledResult, error: sharedStatusError } = await (supabase as any)
          .rpc("mark_intake_communication_handled", {
            _channel: canonical?.intake_channel || selected.kind,
            _phone_number: selected.phone,
            _handled_by_name: employeeName,
            _source_table: canonical?.source_table || (selected.kind === "call" ? "call_log" : "sms_log"),
            _source_event_id: canonical?.source_id || communicationId || null,
            _metadata: details,
          });
        if (sharedStatusError) throw sharedStatusError;
        if (handledResult && handledResult.ok === false) {
          throw new Error(handledResult.reason || "The intake handled stamp was not saved.");
        }
      }

      const auditResults = await Promise.all([
        supabase.from("copilot_button_clicks" as any).insert({
          user_id: user.id,
          context_type: "intake",
          context_subtype: `${selected.kind}:${selected.direction}:${phoneLast10 || "unknown"}`,
          action_key: "mark_handled",
          action_label: "Marked intake conversation handled",
          customer_id: customer?.id ?? null,
          job_id: selected.latestJobId ?? null,
        }),
        supabase.from("activity_log" as any).insert({
          job_id: selected.latestJobId ?? null,
          action: "intake_conversation_handled",
          performed_by: employeeName,
          details: JSON.stringify(details),
        }),
        customer?.id
          ? supabase.from("customer_activity_feed" as any).insert({
              customer_id: customer.id,
              related_job_id: selected.latestJobId ?? null,
              event_type: "intake_conversation_handled",
              title: "Intake conversation handled",
              body: `${employeeName} marked this ${selected.kind === "call" ? "call" : "text thread"} handled.`,
              source: "intake_hq",
              actor_id: user.id,
              actor_name: employeeName,
              metadata: details,
            })
          : Promise.resolve({ error: null }),
      ]);
      const auditError = auditResults.find((result: any) => result?.error)?.error;
      if (auditError) throw auditError;

      setHandledStamp({ id: selected.id, label: employeeName, at: handledAt });
      onHandled(selected.id);
      queryClient.invalidateQueries({ queryKey: ["call_log"] });
      queryClient.invalidateQueries({ queryKey: ["sms_log"] });
      queryClient.invalidateQueries({ queryKey: ["unified-communications"] });
      queryClient.invalidateQueries({ queryKey: ["intake-thread-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["activity_log"] });
      if (customer?.id) queryClient.invalidateQueries({ queryKey: ["customer-activity-feed", customer.id] });
      toast({ title: "Marked handled", description: `Stamped as handled by ${employeeName}.` });
    } catch (error: any) {
      toast({
        title: "Could not mark handled",
        description: error?.message || "The conversation was not updated.",
        variant: "destructive",
      });
    } finally {
      setHandling(false);
    }
  };
  const handleModalSend: SendSmsHandler = async (to, text, jobId, contactName, mediaUrls) => {
    const success = await onSendSms(to, text, jobId, contactName || displayName, mediaUrls);
    if (success) setSmsDialogOpen(false);
    return success;
  };
  const askJarvisAboutSelection = () => {
    const contextText = getConversationContextText(selected);
    const customerNameForContext = customerName(customer) || selected.name || null;
    const latestCall = selected.kind === "call" ? (selected.raw as CallConversation).lastCall : null;
    const smsConversation = selected.kind === "sms" ? selected.raw as SmsConversation : null;

    startRecordSession({
      contextType: selected.kind,
      contextId: selected.kind === "call" ? latestCall?.id : smsConversation?.lastMessage.id,
      label: `${selected.kind === "call" ? "Call" : "SMS"} with ${customerNameForContext || formatPhone(selected.phone) || selected.phone}`,
      prompt: `Use the attached ${selected.kind === "call" ? "call transcript" : "SMS thread"} context. Identify who this is, what they need, why it matters, and prepare the next human-approved actions. If there is already an open Now card, update that card instead of creating duplicate work.`,
      context: {
        id: selected.id,
        title: selected.summary,
        phone: selected.phone,
        customer_id: customer?.id || null,
        customer_name: customerNameForContext,
        address: customerAddress(customer) || addressVerification.standardized || addressVerification.address || null,
        communication_type: selected.kind,
        direction: selected.direction,
        summary: selected.summary,
        detail: selected.detail,
        transcript_or_thread: contextText,
        canonical_communication: canonicalCommunicationContext(selected.canonical),
        suggested_actions: [
          "Summarize this selected conversation",
          "Detect booking, estimate, maintenance, reschedule, customer-note, warranty, or billing intent",
          "Create or update the related Now card",
          "Draft an SMS reply if needed",
        ],
      },
    });
    navigate("/copilot");
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background p-4 animate-context-panel">
      {tutorialMode && (
      <div className="mb-4">
        <StepHeader
          step="Step 2"
          title="Understand the Customer"
          detail="Match the phone number, review the thread, and see the customer record before taking action."
          icon={UserRound}
          tone="context"
        />
      </div>
      )}
      <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm transition-colors duration-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", visual.ringClass)}>
                <ConversationIcon className="h-4 w-4" />
              </div>
              <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
              {customer ? (
                <Badge variant="default">Existing customer</Badge>
              ) : lookup.isLoading ? (
                <Badge variant="secondary">Matching...</Badge>
              ) : (
                <Badge variant="destructive">Unknown / new lead</Badge>
              )}
              {activeJobs.length > 0 && <Badge variant="secondary">{activeJobs.length} active job{activeJobs.length === 1 ? "" : "s"}</Badge>}
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                Selected {selected.kind === "call" ? "call" : "text"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{formatPhone(selected.phone) || selected.phone}</span>
              {address && <span>{address}</span>}
              {customer?.email && <span>{customer.email}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={openCall}>
              <Phone className="h-4 w-4" />
              Call
            </Button>
            <Button variant={selected.kind === "sms" ? "default" : "outline"} size="sm" className="gap-2" onClick={openText}>
              <MessageSquare className="h-4 w-4" />
              Text
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setJarvisDialogOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Jarvis notes
            </Button>
            <Button
              size="sm"
              className="max-w-[260px] gap-2"
              onClick={markHandled}
              disabled={handling || Boolean(handledLabel)}
              title={handledDetail || handledLabel || "Mark this conversation handled"}
            >
              {handling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span className="truncate">{handledLabel || "Handled"}</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/now")}>
              <Zap className="h-4 w-4" />
              Now
            </Button>
            {customer ? (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/customers/${customer.id}`)}>
                <ExternalLink className="h-4 w-4" />
                Customer
              </Button>
            ) : (
              <div className="rounded-md border bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Jarvis will help match this person or start a new lead.
              </div>
            )}
          </div>
        </div>
        {handledStamp?.id === selected.id && (
          <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/25 dark:text-emerald-100">
            Handled by {handledStamp.label} at {formatDateTime(handledStamp.at)}.
          </div>
        )}
        {handledLabel && handledDetail && (
          <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/25 dark:text-emerald-100">
            {handledDetail}
          </div>
        )}
      </div>

      <div className="mb-4">
        {selected.kind === "sms" ? (
          <InlineSmsReplyComposer selected={selected} sending={smsSending} onSend={onSendSms} />
        ) : (
          <ConversationEvidence selected={selected} />
        )}
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-5">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
          <p className="mt-1 truncate text-sm font-semibold">{customer ? "Known" : "Unknown lead"}</p>
        </div>
        <div className="rounded-lg border bg-card p-3 md:col-span-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service Address</p>
          <p className="mt-1 truncate text-sm font-semibold">{address || "Needs confirmation"}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active Work</p>
          <p className="mt-1 truncate text-sm font-semibold">{activeJobs.length ? `${activeJobs.length} active` : "None"}</p>
        </div>
        <div className={cn("rounded-lg border p-3", riskClass)}>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Risk</p>
          <p className="mt-1 truncate text-sm font-semibold">{riskLabel}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Section title="What happened" detail="The latest call or text and why it needs attention.">
          <div className="rounded-md border bg-card p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Latest call or text
            </div>
            <p className="mt-2 line-clamp-5 text-sm leading-6 text-muted-foreground">
              {contactReason}
            </p>
            {selected.detail && selected.detail !== selected.summary && (
              <p className="mt-3 line-clamp-3 rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                {selected.detail}
              </p>
            )}
          </div>
        </Section>

        <Section title="Customer work history" detail="Recent jobs and estimates so you do not have to open the full record.">
          {overviewLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : !customer ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No customer history yet. Approve a customer action before attaching work.
            </p>
          ) : (
            <div className="space-y-3">
              {activeJobs.length > 0 ? (
                <div className="space-y-2">
                  {activeJobs.slice(0, 3).map((job: any) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="w-full rounded-md border bg-background p-3 text-left transition hover:border-primary/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{job.job_number || job.hcp_job_number || job.job_type || "Active job"}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{job.address || address || "No address"}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[10px]">{job.status || "open"}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  No active jobs found. This likely needs a new booking, estimate, or follow-up.
                </p>
              )}
              {recentRecords.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent jobs and quotes</p>
                  {recentRecords.map((row: any) => (
                    <div key={row.id} className="rounded-md border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{row.job_number || row.estimate_number || row.job_type || "Record"}</p>
                        <span className="text-[10px] text-muted-foreground">{formatDate(row.scheduled_date || row.created_at)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.description || row.address || row.status || row.work_status || "No detail"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>

      <Dialog open={smsDialogOpen} onOpenChange={setSmsDialogOpen}>
        <DialogContent className="flex h-[82vh] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle>Text {displayName}</DialogTitle>
            <DialogDescription>
              {formatPhone(dialable) || dialable}. Send the reply here and stay in Intake HQ.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <SmsThreadView
              conversation={selected.kind === "sms" ? (selected.raw as SmsConversation) : null}
              sending={smsSending}
              onSend={handleModalSend}
              onMarkRead={keepUnreadUntilHandled}
              onStatusChange={onSetSmsThreadStatus}
              onBack={() => setSmsDialogOpen(false)}
              newMessageMode={selected.kind !== "sms"}
              prefillPhone={selected.kind !== "sms" ? dialable : undefined}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={jarvisDialogOpen} onOpenChange={setJarvisDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Jarvis notes</DialogTitle>
            <DialogDescription>
              Quick read on this conversation. Action cards live in Now HQ.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Who</p>
                <p className="mt-1 text-sm font-semibold">{displayName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatPhone(selected.phone) || selected.phone}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What this may need</p>
                <p className="mt-1 text-sm font-semibold">{bookingSuggestion?.label || primaryAttention?.prefix || "Review conversation"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{bookingSuggestion?.preferredTiming || "No timing preference captured yet"}</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Where</p>
                <p className="mt-1 text-sm font-semibold">{addressVerification.standardized || addressVerification.address || address || "No address confirmed"}</p>
                <Badge variant={addressVerification.confidence === "high" ? "secondary" : "outline"} className="mt-2 text-[10px]">
                  {addressVerification.confidence === "unknown" ? "needs check" : `${addressVerification.confidence} confidence`}
                </Badge>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current work</p>
                <p className="mt-1 text-sm font-semibold">{activeJobs.length ? `${activeJobs.length} active job${activeJobs.length === 1 ? "" : "s"}` : "No active job found"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{customer ? "Matched customer record" : "Unknown or new lead"}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conversation read</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{contactReason}</p>
            </div>

            {missingFields.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Missing or uncertain</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingFields.slice(0, 6).map((field) => (
                    <Badge key={field.label} variant="outline">{field.label}</Badge>
                  ))}
                </div>
              </div>
            )}

            {capturedFields.length > 0 && (
              <div className="rounded-lg border bg-card p-3">
                <p className="text-sm font-semibold">Captured</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {capturedFields.slice(0, 6).map((field) => (
                    <div key={field.label} className="rounded-md border bg-background px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{field.label}</p>
                      <p className="mt-1 truncate text-xs font-medium">{field.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setJarvisDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" className="gap-2" onClick={askJarvisAboutSelection}>
              <Sparkles className="h-4 w-4" />
              Ask Jarvis
            </Button>
            <Button className="gap-2" onClick={() => navigate("/now")}>
              <Zap className="h-4 w-4" />
              Open Now HQ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ActionPanel({
  selected,
  tutorialMode,
}: {
  selected: DeskConversation | null;
  tutorialMode: boolean;
}) {
  const navigate = useNavigate();
  const { startRecordSession } = useCopilotPanel();
  const [liveAddressVerification, setLiveAddressVerification] = useState<GoogleAddressVerification | null>(null);
  const [acceptedAddressVerification, setAcceptedAddressVerification] = useState<AddressVerification | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [addressVerifying, setAddressVerifying] = useState(false);
  const lookup = useCallerLookup(selected?.phone);
  const customer = lookup.data;
  const isCall = selected?.kind === "call";
  const isSms = selected?.kind === "sms";
  const isKnown = !!customer;
  const bookingSuggestion = useMemo(
    () => (selected ? inferBookingIntent(selected, customer) : null),
    [selected, customer]
  );
  const addressVerification = useMemo(
    () => addressVerificationFromContext(selected, customer, liveAddressVerification, acceptedAddressVerification),
    [selected, customer, liveAddressVerification, acceptedAddressVerification]
  );
  const liveIntakeFields = useMemo(
    () => (selected ? buildLiveIntakeFields(selected, customer, bookingSuggestion, addressVerification) : []),
    [selected, customer, bookingSuggestion, addressVerification]
  );
  const capturedFieldCount = liveIntakeFields.filter((field) => field.status === "captured").length;
  const addressNeedsReview = addressVerification.confidence === "low" || addressVerification.confidence === "unknown";
  const minimumReady = !!bookingSuggestion
    && liveIntakeFields.some((field) => field.label === "Phone" && field.status === "captured")
    && !!addressVerification.address
    && !addressNeedsReview;
  const approvalState = !bookingSuggestion
    ? {
        label: "Waiting to hear what they need",
        detail: "Jarvis is still checking whether this is a booking, change, or follow-up.",
        className: "border-border bg-card text-foreground",
        icon: Sparkles,
      }
    : minimumReady
      ? {
          label: "Ready for human review",
          detail: "The required intake fields look ready. Nothing happens until you approve it.",
          className: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-100",
          icon: CheckCircle2,
        }
      : addressNeedsReview
        ? {
            label: "Blocked: address",
            detail: "Confirm the service address before this becomes schedulable work.",
            className: "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100",
            icon: AlertTriangle,
          }
        : {
            label: "Needs a little more info",
            detail: "Capture the missing intake details before approval.",
            className: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100",
            icon: AlertTriangle,
          };
  const ApprovalIcon = approvalState.icon;
  const fieldPriority = new Set(["Address", "Preferred timing", "Issue", "Intent", "Customer", "Phone"]);
  const visibleIntakeFields = [
    ...liveIntakeFields.filter((field) => field.status !== "captured" && fieldPriority.has(field.label)),
    ...liveIntakeFields.filter((field) => field.status === "captured" && fieldPriority.has(field.label)),
  ]
    .filter((field, index, all) => all.findIndex((candidate) => candidate.label === field.label) === index)
    .slice(0, 5);
  const hiddenIntakeFieldCount = Math.max(0, liveIntakeFields.length - visibleIntakeFields.length);
  const addressCheck = useMemo(() => {
    const extracted = getConversationExtraction(selected);
    return {
      candidate: extractionAddress(extracted) || extractAddressFromText(`${selected?.summary || ""} ${selected?.detail || ""}`),
      hasStoredResult: extracted.address_verified === true || extracted.address_verified === false,
    };
  }, [selected]);

  useEffect(() => {
    setLiveAddressVerification(null);
    setAcceptedAddressVerification(null);
    setAddressDialogOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    setAddressDraft(addressVerification.standardized || addressVerification.address || "");
  }, [addressVerification.address, addressVerification.standardized]);

  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      if (!addressCheck.candidate || addressCheck.hasStoredResult) {
        setAddressVerifying(false);
        return;
      }

      setAddressVerifying(true);
      const result = await verifyAddressWithGoogle(addressCheck.candidate);
      if (!cancelled) {
        setLiveAddressVerification(result);
        setAddressVerifying(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [addressCheck]);

  if (!selected) {
    return (
      <aside className="flex min-h-0 flex-col border-l bg-background p-4">
        {tutorialMode ? (
          <StepHeader
            step="Step 3"
            title="Approve the Action"
            detail="Jarvis prepares the next move after you select a call or text."
            icon={Bot}
            tone="action"
          />
        ) : (
          <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Jarvis Actions</h2>
            </div>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <Bot className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">Jarvis is waiting</h2>
            <p className="mt-1 text-xs text-muted-foreground">Select a call or text to see suggested next steps.</p>
          </div>
        </div>
      </aside>
    );
  }

  const reviewAddress = () => {
    setAddressDraft(addressVerification.standardized || addressVerification.address || "");
    setAddressDialogOpen(true);
  };
  const verifyAddressDraft = async () => {
    if (!addressDraft.trim()) {
      toast({ title: "No address yet", description: "Enter the address Jarvis heard before checking Google." });
      return;
    }
    setAddressVerifying(true);
    const result = await verifyAddressWithGoogle(addressDraft.trim());
    setLiveAddressVerification(result);
    setAddressVerifying(false);
    if (!result) {
      toast({ title: "Address not found", description: "Google did not return a match. Please repeat the address with the customer." });
    }
  };
  const textCustomerForAddress = () => {
    const candidate = addressDraft.trim() || addressVerification.standardized || addressVerification.address;
    const message = candidate
      ? `Hi, this is our office. I may have heard the service address incorrectly. Is this the correct address: ${candidate}?`
      : "Hi, this is our office. I may have heard the service address incorrectly. Can you please text me the correct service address?";
    setAddressDialogOpen(false);
    openSmsComposer(toE164(selected.phone) || selected.phone, {
      contactName: displayName,
      customerId: customer?.id,
      draft: message,
    });
  };
  const acceptAddress = () => {
    const accepted = liveAddressVerification?.standardized || addressDraft.trim() || addressVerification.standardized || addressVerification.address;
    if (!accepted) {
      toast({ title: "No address to accept", description: "Enter or verify an address first." });
      return;
    }
    setAcceptedAddressVerification({
      address: accepted,
      standardized: accepted,
      confidence: "high",
      source: "dispatcher",
      message: "Dispatcher accepted this address for booking.",
    });
    setAddressDialogOpen(false);
    toast({ title: "Address accepted", description: accepted });
  };
  const askJarvisAboutSelection = () => {
    const contextText = getConversationContextText(selected);
    const customerNameForContext = customerName(customer) || selected.name || null;
    const latestCall = selected.kind === "call" ? (selected.raw as CallConversation).lastCall : null;
    const smsConversation = selected.kind === "sms" ? selected.raw as SmsConversation : null;

    startRecordSession({
      contextType: selected.kind,
      contextId: selected.kind === "call" ? latestCall?.id : smsConversation?.lastMessage.id,
      label: `${selected.kind === "call" ? "Call" : "SMS"} with ${customerNameForContext || formatPhone(selected.phone) || selected.phone}`,
      prompt: `Use the attached ${selected.kind === "call" ? "call transcript" : "SMS thread"} context. Identify who this is, what they need, why it matters, and prepare the next human-approved actions. If the customer is trying to book service, estimate, maintenance, reschedule, add notes, or confirm an address, give me the clean action buttons/data needed.`,
      context: {
        id: selected.id,
        title: selected.summary,
        phone: selected.phone,
        customer_id: customer?.id || null,
        customer_name: customerNameForContext,
        address: customerAddress(customer) || addressVerification.standardized || addressVerification.address || null,
        communication_type: selected.kind,
        direction: selected.direction,
        summary: selected.summary,
        detail: selected.detail,
        transcript_or_thread: contextText,
        canonical_communication: canonicalCommunicationContext(selected.canonical),
        recent_calls: selected.kind === "call"
          ? (selected.raw as CallConversation).calls.slice(0, 5).map((call) => ({
              id: call.id,
              direction: call.direction,
              created_at: call.created_at,
              status: call.status,
              summary: call.ai_summary,
              transcription: call.transcription,
            }))
          : [],
        recent_sms: selected.kind === "sms"
          ? (selected.raw as SmsConversation).messages.slice(-12).map((message) => ({
              id: message.id,
              direction: message.direction,
              created_at: message.created_at,
              body: message.body,
              related_job_id: message.related_job_id,
            }))
          : [],
        suggested_actions: [
          "Summarize this selected conversation",
          "Detect booking, estimate, maintenance, reschedule, or customer-note intent",
          "Prepare human-approved next actions",
          "Draft an SMS reply if needed",
        ],
      },
    });
    navigate("/copilot");
  };

  return (
    <aside className="min-h-0 overflow-y-auto border-l bg-background">
      <div className="sticky top-0 z-10 border-b bg-card/95 p-4 backdrop-blur">
        {tutorialMode ? (
          <StepHeader
            step="Step 3"
            title="Next Step"
            detail="Handle the call here. Approve the follow-up in Now HQ when it is ready."
            icon={Bot}
            tone="action"
            action={
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 bg-background/80" onClick={askJarvisAboutSelection}>
                <Sparkles className="h-4 w-4" />
                Ask Jarvis
              </Button>
            }
          />
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Jarvis Notes</h2>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={askJarvisAboutSelection}>
              <Sparkles className="h-4 w-4" />
              Ask Jarvis
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <Section title="Live Call Details" detail="Use this while you talk. Put the follow-up in Now HQ.">
          {bookingSuggestion ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{bookingSuggestion.label}</Badge>
                  <Badge variant={bookingSuggestion.urgency === "emergency" ? "destructive" : "secondary"}>
                    {bookingSuggestion.urgency === "emergency"
                      ? "Emergency"
                      : bookingSuggestion.urgency === "soon"
                        ? "Soon"
                        : "Normal"}
                  </Badge>
                  <Badge variant="outline">{bookingSuggestion.confidence} confidence</Badge>
                </div>
                <div className={cn("mt-3 rounded-lg border p-3 shadow-sm", approvalState.className)}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/70">
                      <ApprovalIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {minimumReady ? "Ready for Now HQ review" : approvalState.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 opacity-80">
                        Jarvis should keep one follow-up card for this customer. If they call back and change direction, that same card should change with them.
                      </p>
                      <Button
                        className="mt-3 w-full gap-2"
                        onClick={() => navigate("/now")}
                      >
                        <Zap className="h-4 w-4" />
                        Open Now HQ
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {visibleIntakeFields.map((field) => (
                    <div
                      key={field.label}
                      className={cn(
                        "rounded-md border px-3 py-2",
                        field.status === "missing"
                          ? "border-amber-300 bg-amber-50/80 dark:border-amber-800/70 dark:bg-amber-950/25"
                          : field.status === "listening"
                            ? "bg-muted/30"
                            : "bg-card"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {field.label}
                        </span>
                        {field.status === "captured" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Captured" />
                        ) : field.status === "missing" ? (
                          <Badge variant="destructive" className="text-[10px]">Needed</Badge>
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Listening" />
                        )}
                      </div>
                      <p className={cn("mt-1 line-clamp-2 text-sm", field.value ? "text-foreground" : "text-muted-foreground")}>
                        {field.value || (field.status === "missing" ? "Ask customer" : "Waiting for transcript")}
                      </p>
                    </div>
                  ))}
                  {hiddenIntakeFieldCount > 0 && (
                    <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
                      {hiddenIntakeFieldCount} lower-priority field{hiddenIntakeFieldCount === 1 ? "" : "s"} hidden until they matter.
                    </p>
                  )}
                </div>

                <div className="mt-3 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Readiness</p>
                      <p className="text-xs text-muted-foreground">Jarvis prepares here; the operator approves from Now.</p>
                    </div>
                    <Badge variant={minimumReady ? "secondary" : "outline"}>
                      {capturedFieldCount}/{liveIntakeFields.length} captured
                    </Badge>
                  </div>
                </div>

                <div
                  className={cn(
                    "mt-3 rounded-md border p-3",
                    addressVerification.confidence === "high"
                      ? "border-border bg-muted/20"
                      : addressVerification.confidence === "medium"
                        ? "border-amber-500/40 bg-amber-500/10 dark:border-amber-800/70 dark:bg-amber-950/25"
                        : "border-destructive/30 bg-destructive/5 dark:border-red-900/70 dark:bg-red-950/20"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {addressVerification.confidence === "high" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">Address verification</p>
                        <Badge
                          variant={addressVerification.confidence === "high" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {addressVerifying
                            ? "Checking Google"
                            : addressVerification.confidence === "unknown"
                              ? "Needs check"
                              : `${addressVerification.confidence} confidence`}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{addressVerification.message}</p>
                      {addressVerification.standardized && (
                        <p className="mt-2 line-clamp-2 text-xs font-medium text-foreground">
                          {addressVerification.standardized}
                        </p>
                      )}
                      {addressNeedsReview && (
                        <p className="mt-2 text-xs font-medium text-amber-700">
                          Flag dispatcher to repeat the address before booking.
                        </p>
                      )}
                      <Button
                        type="button"
                        variant={addressNeedsReview ? "default" : "outline"}
                        size="sm"
                        className="mt-3 w-full gap-2"
                        onClick={reviewAddress}
                      >
                        <MapPin className="h-4 w-4" />
                        {addressNeedsReview ? "Review Address" : "Verify / Change Address"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-md border bg-primary/5 p-3 text-xs text-muted-foreground">
                  <Briefcase className="mt-0.5 h-3.5 w-3.5 text-primary" />
                  <span>
                    This screen is for the call or text. Now HQ is where we approve{" "}
                    {bookingSuggestion.type === "book_estimate" ? "the estimate booking" : "the service job"} and hand it to{" "}
                    <strong className="text-foreground">{bookingSuggestion.defaultOwner}</strong> when it is ready.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {isSms && selected.direction === "inbound"
                    ? "Reply and decide whether this belongs on the board"
                    : isCall
                      ? "Review the call and decide whether to book or update"
                      : "Check this customer"}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.summary}</p>
              </div>
              {!isKnown && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground dark:border-red-900/70 dark:bg-red-950/20">
                  Unknown number. Jarvis should prepare a customer link or create-customer action first.
                </div>
              )}
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Jarvis is checking for booking requests, estimate requests, reschedules, gate codes, pet notes, quote follow-ups, warranty questions, or billing questions.
                If there is already a Now card open, Jarvis should update that card instead of making another one.
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/now")}>
                <Zap className="h-4 w-4" />
                Open Now HQ
              </Button>
            </div>
          )}
        </Section>

      </div>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify service address</DialogTitle>
            <DialogDescription>
              Confirm the address Jarvis heard before this becomes a schedulable job.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jarvis heard</p>
              <Input
                value={addressDraft}
                onChange={(event) => setAddressDraft(event.target.value)}
                placeholder="Type or edit the service address"
                className="mt-2"
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full gap-2"
                onClick={verifyAddressDraft}
                disabled={addressVerifying}
              >
                <MapPin className="h-4 w-4" />
                {addressVerifying ? "Checking Google..." : "Check Google"}
              </Button>
            </div>

            <div
              className={cn(
                "rounded-lg border p-4",
                addressVerification.confidence === "high"
                  ? "border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-800/70 dark:bg-emerald-950/25"
                  : addressVerification.confidence === "medium"
                    ? "border-amber-500/40 bg-amber-500/10 dark:border-amber-800/70 dark:bg-amber-950/25"
                    : "border-destructive/30 bg-destructive/5 dark:border-red-900/70 dark:bg-red-950/20"
              )}
            >
              <div className="flex items-start gap-3">
                {addressVerification.confidence === "high" ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {addressVerification.standardized || addressVerification.address || "No address candidate yet"}
                    </p>
                    <Badge variant={addressVerification.confidence === "high" ? "secondary" : "outline"}>
                      {addressVerification.confidence === "unknown" ? "needs check" : `${addressVerification.confidence} confidence`}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{addressVerification.message}</p>
                </div>
              </div>
            </div>

            {addressNeedsReview && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-100">
                Ask the customer to repeat the street number and street name. Once it looks right, accept it here and continue.
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={textCustomerForAddress}
            >
              <MessageSquare className="h-4 w-4" />
              Text customer to confirm address
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setAddressDialogOpen(false)}>
              Not yet
            </Button>
            <Button type="button" size="lg" className="gap-2" onClick={acceptAddress}>
              <CheckCircle2 className="h-4 w-4" />
              Yes, accept this address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function ManualActionPanel({
  selected,
  tutorialMode,
  onCreateJob,
}: {
  selected: DeskConversation | null;
  tutorialMode: boolean;
  onCreateJob: () => void;
}) {
  const navigate = useNavigate();
  const lookup = useCallerLookup(selected?.phone);
  const customer = lookup.data;
  const dialable = selected ? toE164(selected.phone) || selected.phone : "";
  const displayName =
    customerName(customer) ||
    selected?.name ||
    (selected ? formatPhone(selected.phone) || selected.phone : "");

  const callCustomer = () => {
    if (!selected || !dialable) {
      toast({ title: "No phone number", description: "Select a call or text first." });
      return;
    }
    openPhoneConsole(dialable, {
      contactName: displayName || undefined,
      customerId: customer?.id,
      autoDial: false,
    });
  };

  const textCustomer = () => {
    if (!selected?.phone) {
      toast({ title: "No phone number", description: "Select a call or text first." });
      return;
    }
    openSmsComposer(toE164(selected.phone) || selected.phone, {
      contactName: displayName || undefined,
      customerId: customer?.id,
    });
  };

  return (
    <aside className="min-h-0 overflow-y-auto border-l bg-background">
      <div className="sticky top-0 z-10 border-b bg-card/95 p-4 backdrop-blur">
        {tutorialMode ? (
          <StepHeader
            step="Step 3"
            title="Manual Actions"
            detail="Same customer information as AI Mode, but you press every button yourself."
            icon={UserRound}
            tone="action"
          />
        ) : (
          <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Manual Actions</h2>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <Section title="Selected Conversation" detail="Human Mode keeps the call or text visible and lets you choose each action.">
          {!selected ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Select a call or text from the live inbox to use manual controls.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-card p-3">
                <div className="flex items-start gap-3">
                  {(() => {
                    const visual = conversationVisual(selected);
                    const Icon = visual.icon;
                    const DirectionIcon = visual.directionIcon;
                    return (
                      <div className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md", visual.ringClass)}>
                        <Icon className="h-4 w-4" />
                        <DirectionIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-background bg-background p-0.5 text-foreground" />
                      </div>
                    );
                  })()}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{displayName || "Selected conversation"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPhone(selected.phone) || selected.phone}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {isChannelOnlyText(selected.summary) ? cleanConversationDetail(selected.detail) : selected.summary}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button className="gap-2" onClick={callCustomer}>
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
                <Button variant="outline" className="gap-2" onClick={textCustomer}>
                  <MessageSquare className="h-4 w-4" />
                  Text
                </Button>
                <Button variant="outline" className="col-span-2 gap-2" onClick={onCreateJob}>
                  <Plus className="h-4 w-4" />
                  Create job
                </Button>
                {customer && (
                  <Button
                    variant="outline"
                    className="col-span-2 gap-2"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <UserRound className="h-4 w-4" />
                    Open customer
                  </Button>
                )}
                {selected.latestJobId && (
                  <Button
                    variant="outline"
                    className="col-span-2 gap-2"
                    onClick={() => navigate(`/jobs/${selected.latestJobId}`)}
                  >
                    <Briefcase className="h-4 w-4" />
                    Open related job
                  </Button>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section title="Manual Rule" detail="AI Mode prepares suggestions. Human Mode gives you the buttons directly.">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Use this side when Jarvis is uncertain, offline, or you want to take over the intake by hand.
          </div>
        </Section>
      </div>
    </aside>
  );
}

function HumanModeDesk({
  conversations,
  selectedConversation,
  selectedJobId,
  onSelectConversation,
  onSelectJob,
  onCreateJob,
}: {
  conversations: DeskConversation[];
  selectedConversation: DeskConversation | null;
  selectedJobId: string | null;
  onSelectConversation: (item: DeskConversation) => void;
  onSelectJob: (jobId: string) => void;
  onCreateJob: () => void;
}) {
  const navigate = useNavigate();
  const selectedConversationLookup = useCallerLookup(selectedConversation?.phone);
  const selectedConversationCustomer = selectedConversationLookup.data;
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();
  const { data: employees = [] } = useEmployees();
  const selectedJob = selectedJobId ? (jobs as any[]).find((job: any) => job.id === selectedJobId) : null;
  const selectedConversationDialable = selectedConversation
    ? toE164(selectedConversation.phone) || selectedConversation.phone
    : "";
  const selectedConversationName =
    customerName(selectedConversationCustomer) ||
    selectedConversation?.name ||
    (selectedConversation ? formatPhone(selectedConversation.phone) || selectedConversation.phone : "");

  const todayKey = new Date().toISOString().slice(0, 10);
  const activeJobs = useMemo(() => {
    const done = new Set(["done", "invoiced", "canceled", "cancelled", "completed"]);
    return (jobs as any[]).filter((job: any) => !done.has(String(job.status || "").toLowerCase()));
  }, [jobs]);

  const todayJobs = useMemo(() => {
    return activeJobs
      .filter((job: any) => String(job.scheduled_date || "").slice(0, 10) === todayKey)
      .sort((a: any, b: any) => String(a.arrival_start || "").localeCompare(String(b.arrival_start || "")));
  }, [activeJobs, todayKey]);

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const employee of (employees as any[]).filter((employee: any) => employee.is_active !== false)) {
      groups.set(employee.name, []);
    }
    groups.set("Unassigned", []);
    for (const job of todayJobs) {
      const techName = (employees as any[]).find((employee: any) => employee.id === job.assigned_to)?.name || (job.assigned_to ? String(job.assigned_to) : "Unassigned");
      if (!groups.has(techName)) groups.set(techName, []);
      groups.get(techName)?.push(job);
    }
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => b.length - a.length)
      .filter(([, items], index) => items.length > 0 || index < 5);
  }, [employees, todayJobs]);

  const technicianCounts = useMemo(() => {
    return grouped.map(([name, items]) => ({ name, count: items.length }));
  }, [grouped]);

  const callCustomer = (job: any) => {
    const phone = toE164(job.customer_phone) || job.customer_phone;
    if (!phone) {
      toast({ title: "No phone number", description: "This job does not have a customer phone number." });
      return;
    }
    openPhoneConsole(phone, { contactName: job.customer_name || undefined, jobId: job.id, customerId: job.customer_id || undefined });
  };

  const textCustomer = (job: any) => {
    if (!job.customer_phone) {
      toast({ title: "No phone number", description: "This job does not have a customer phone number." });
      return;
    }
    openSmsComposer(toE164(job.customer_phone) || job.customer_phone, {
      contactName: job.customer_name || undefined,
      jobId: job.id,
      customerId: job.customer_id || undefined,
    });
  };

  const callSelectedConversation = () => {
    if (!selectedConversationDialable) {
      toast({ title: "No phone number", description: "Select a call or text first." });
      return;
    }
    openPhoneConsole(selectedConversationDialable, {
      contactName: selectedConversationName || undefined,
      customerId: selectedConversationCustomer?.id,
      autoDial: false,
    });
  };

  const textSelectedConversation = () => {
    if (!selectedConversation?.phone) {
      toast({ title: "No phone number", description: "Select a call or text first." });
      return;
    }
    openSmsComposer(toE164(selectedConversation.phone) || selectedConversation.phone, {
      contactName: selectedConversationName || undefined,
      customerId: selectedConversationCustomer?.id,
    });
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_340px] overflow-hidden">
      <aside className="min-h-0 overflow-y-auto border-r bg-card p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Manual Control</h2>
          <p className="mt-1 text-xs text-muted-foreground">Inbox stays visible, but dispatch is primary.</p>
        </div>
        <Section title="Live Inbox Minimized">
          <MiniConversationRail items={conversations} selectedId={selectedConversation?.id} onSelect={onSelectConversation} />
        </Section>
        <div className="mt-4">
          <Section title="Technicians Today">
            <div className="space-y-2">
              {technicianCounts.map((tech) => (
                <div key={tech.name} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="truncate text-sm font-medium">{tech.name}</span>
                  <Badge variant={tech.name === "Unassigned" ? "destructive" : "secondary"}>{tech.count}</Badge>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </aside>

      <main className="min-h-0 overflow-auto bg-background p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Today’s Dispatch Board</h2>
            <p className="text-sm text-muted-foreground">Manual board for verification, assignment, and override.</p>
          </div>
        </div>

        {jobsLoading ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-96 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid min-w-[900px] gap-3 lg:grid-cols-3 2xl:grid-cols-4">
            {grouped.map(([techName, items]) => (
              <section key={techName} className="flex min-h-[560px] flex-col rounded-lg border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b px-3 py-3">
                  <h3 className="truncate text-sm font-semibold">{techName}</h3>
                  <Badge variant={techName === "Unassigned" ? "destructive" : "secondary"}>{items.length}</Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <div className="flex h-28 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                      No jobs assigned
                    </div>
                  ) : (
                    items.map((job: any) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => onSelectJob(job.id)}
                        className={cn(
                          "w-full rounded-lg border border-l-4 border-l-primary bg-background p-3 text-left transition hover:border-primary/40",
                          selectedJobId === job.id && "ring-2 ring-primary/30"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{job.customer_name || "No customer"}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{job.address || "No address"}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{job.status || "open"}</Badge>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{job.job_number || job.hcp_job_number || job.job_type || "Job"}</span>
                          <div className="flex gap-1">
                            <span className="rounded-md border p-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /></span>
                            <span className="rounded-md border p-1.5 text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /></span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <aside className="min-h-0 overflow-y-auto border-l bg-card p-4">
        <Section title="Manual Conversation">
          {!selectedConversation ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Select a call or text from the left rail to use manual fallbacks.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-background p-3">
                <div className="flex items-start gap-2">
                  <div className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md", conversationVisual(selectedConversation).ringClass)}>
                    {(() => {
                      const visual = conversationVisual(selectedConversation);
                      const Icon = visual.icon;
                      const DirectionIcon = visual.directionIcon;
                      return (
                        <>
                          <Icon className="h-4 w-4" />
                          <DirectionIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-background bg-background p-0.5 text-foreground" />
                        </>
                      );
                    })()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedConversationName || "Selected conversation"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPhone(selectedConversation.phone) || selectedConversation.phone}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="gap-2" onClick={callSelectedConversation}>
                  <Phone className="h-4 w-4" />
                  Call
                </Button>
                <Button variant="outline" className="gap-2" onClick={textSelectedConversation}>
                  <MessageSquare className="h-4 w-4" />
                  Text
                </Button>
                {selectedConversationCustomer && (
                  <Button
                    variant="outline"
                    className="col-span-2 gap-2"
                    onClick={() => navigate(`/customers/${selectedConversationCustomer.id}`)}
                  >
                    <UserRound className="h-4 w-4" />
                    Open customer
                  </Button>
                )}
                {selectedConversation.latestJobId && (
                  <Button
                    variant="outline"
                    className="col-span-2 gap-2"
                    onClick={() => navigate(`/jobs/${selectedConversation.latestJobId}`)}
                  >
                    <Briefcase className="h-4 w-4" />
                    Open related job
                  </Button>
                )}
              </div>
            </div>
          )}
        </Section>

        <div className="mt-4">
        <h2 className="text-sm font-semibold">Selected Job</h2>
        <p className="mt-1 text-xs text-muted-foreground">Manual detail and override panel.</p>

        {!selectedJob ? (
          <div className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Select a job on the board.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <Section title={selectedJob.customer_name || "No customer"}>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>{selectedJob.address || "No address"}</span>
                </div>
                <div className="flex gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(selectedJob.scheduled_date)}</span>
                </div>
                <div className="flex gap-2">
                  <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>{selectedJob.job_type || "Job"} · {selectedJob.status || "open"}</span>
                </div>
              </div>
            </Section>
            <Section title="Manual Actions">
              <div className="grid gap-2">
                <Button className="justify-start gap-2" onClick={() => callCustomer(selectedJob)}>
                  <Phone className="h-4 w-4" />
                  Call customer
                </Button>
                <Button variant="outline" className="justify-start gap-2" onClick={() => textCustomer(selectedJob)}>
                  <MessageSquare className="h-4 w-4" />
                  Text customer
                </Button>
                <Button variant="outline" className="justify-start gap-2" onClick={() => navigate(`/jobs/${selectedJob.id}`)}>
                  <ExternalLink className="h-4 w-4" />
                  Open job
                </Button>
              </div>
            </Section>
            <Section title="Notes">
              <p className="text-sm text-muted-foreground">{selectedJob.description || "No job note shown on this record."}</p>
            </Section>
          </div>
        )}
        </div>
      </aside>
    </div>
  );
}

export default function OperationsDeskV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, role } = useAuth();
  const { conversations: callConversations, loading: callsLoading, markAsRead: markCallsAsRead } = useCallLog();
  const {
    conversations: smsConversations,
    loading: smsLoading,
    sending: smsSending,
    sendSms,
    markAsRead: markSmsAsRead,
    setThreadStatus: setSmsThreadStatus,
  } = useSmsLogScoped();
  const { communications: unifiedCommunications, loading: unifiedLoading, error: unifiedError } = useUnifiedCommunications({
    limit: 250,
    view: "all",
  });
  const { data: businessUnits = [] } = useQuery({
    queryKey: ["business-units", "intake-company-badges"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_units")
        .select("id, slug, display_name, legal_name, billing_name, primary_phone_number")
        .order("is_default", { ascending: false })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data || []) as BusinessUnitLite[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: intakeThreadStatuses = [] } = useQuery({
    queryKey: ["intake-thread-statuses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("intake_thread_status")
        .select("channel, phone_last10, company_phone_number, company_phone_last10, thread_key, status, handled_by_user_id, handled_by_name, handled_at, updated_at, metadata");
      if (error) {
        const legacy = await (supabase as any)
          .from("intake_thread_status")
          .select("channel, phone_last10, status, handled_by_user_id, handled_by_name, handled_at, updated_at, metadata");
        if (legacy.error) throw legacy.error;
        return (legacy.data || []) as IntakeThreadStatusRow[];
      }
      return (data || []) as IntakeThreadStatusRow[];
    },
    staleTime: 15_000,
  });
  useRealtimeInvalidation(
    [{ table: "intake_thread_status", queryKeys: [["intake-thread-statuses"]] }],
    "intake-thread-status-sync"
  );
  const sharedStatusByThread = useMemo(() => {
    const map = new Map<string, IntakeThreadStatusRow>();
    for (const row of intakeThreadStatuses) {
      map.set(row.thread_key || `${row.channel}:legacy:${row.phone_last10}`, row);
    }
    return map;
  }, [intakeThreadStatuses]);
  const canonicalBySource = useMemo(() => {
    const map = new Map<string, UnifiedCommunication>();
    for (const communication of unifiedCommunications) {
      const key = unifiedSourceKey(communication.source_table, communication.source_id);
      if (key) map.set(key, communication);
    }
    return map;
  }, [unifiedCommunications]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DeskConversation | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(() => localStorage.getItem("intake_tutorial_mode") === "true");
  const [clearingIds, setClearingIds] = useState<Set<string>>(() => new Set());

  const conversations = useMemo(() => {
    const items = [
      ...callConversations.map(callToDeskItem),
      ...smsConversations.map(smsToDeskItem),
    ]
      .map((item) => applyUnifiedCommunication(item, canonicalBySource))
      .map((item) => {
        const sharedStatus = sharedStatusByThread.get(intakeThreadKeyForDeskItem(item));
        if (!sharedStatus || sharedStatus.status !== "handled") return item;
        const handledAt = sharedStatus.handled_at || sharedStatus.updated_at;
        const handledAfterSignal = handledAt && new Date(handledAt).getTime() >= new Date(item.createdAt).getTime();
        if (!handledAfterSignal) return item;
        return {
          ...item,
          status: "done",
          unread: false,
          handledByName: sharedStatus.handled_by_name || null,
          handledAt: sharedStatus.handled_at || sharedStatus.updated_at || null,
          handledMetadata: sharedStatus.metadata || null,
        };
      })
      .filter((item) => !isEmployeeConversation(item))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.name,
        item.phone,
        normalizeLast10(item.phone),
        item.summary,
        item.detail,
        getConversationContextText(item),
        item.status,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [callConversations, smsConversations, canonicalBySource, search, sharedStatusByThread]);

  const selectConversation = (item: DeskConversation) => {
    setSelected(item);
  };

  const handleConversationHandled = (conversationId: string) => {
    setSelected((current) => (current?.id === conversationId ? null : current));
  };

  const clearConversationForTesting = async (item: DeskConversation) => {
    if (role !== "admin") {
      toast({ title: "Admins only", description: "Only an admin can clear intake cards while testing.", variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Sign in required", description: "We need your user account so the cleanup stamp is accountable." });
      return;
    }
    if (clearingIds.has(item.id)) return;

    setClearingIds((current) => new Set(current).add(item.id));
    const phoneLast10 = normalizeLast10(item.phone);
    const canonical = item.canonical || null;
    const latestCall = item.kind === "call" ? (item.raw as CallConversation).lastCall : null;
    const smsConversation = item.kind === "sms" ? item.raw as SmsConversation : null;
    const communicationId = item.kind === "call" ? latestCall?.id : smsConversation?.lastMessage.id;
    const clearedBy = user.email || "Admin";

    try {
      if (item.kind === "sms") {
        const threadKey = smsConversation?.threadKey || item.phone;
        await markSmsAsRead(threadKey);
        await setSmsThreadStatus(threadKey, "done");
      } else {
        await markCallsAsRead((item.raw as CallConversation).threadKey || item.phone);
      }

      const { data, error } = await (supabase as any)
        .rpc("mark_intake_communication_handled", {
          _channel: canonical?.intake_channel || item.kind,
          _phone_number: item.phone,
          _handled_by_name: clearedBy,
          _source_table: canonical?.source_table || (item.kind === "call" ? "call_log" : "sms_log"),
          _source_event_id: canonical?.source_id || communicationId || null,
          _metadata: {
            reason: "admin_testing_clear",
            conversation_id: item.id,
            communication_id: communicationId || null,
            phone_last10: phoneLast10 || null,
            summary: item.summary || null,
            cleared_by_user_id: user.id,
            cleared_by_name: clearedBy,
            cleared_at: new Date().toISOString(),
          },
        });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.reason || "The intake card was not cleared.");

      setSelected((current) => (current?.id === item.id ? null : current));
      queryClient.invalidateQueries({ queryKey: ["call_log"] });
      queryClient.invalidateQueries({ queryKey: ["sms_log"] });
      queryClient.invalidateQueries({ queryKey: ["unified-communications"] });
      queryClient.invalidateQueries({ queryKey: ["intake-thread-statuses"] });
      toast({ title: "Intake card cleared", description: "The call/text history stayed saved, but this card is out of the testing queue." });
    } catch (error: any) {
      toast({
        title: "Could not clear card",
        description: error?.message || "The intake card stayed in the queue.",
        variant: "destructive",
      });
    } finally {
      setClearingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!selected) return;
    const refreshedSelection =
      conversations.find((item) => item.id === selected.id) ||
      conversations.find((item) => intakeThreadKeyForDeskItem(item) === intakeThreadKeyForDeskItem(selected)) ||
      conversations.find((item) => item.kind === selected.kind && normalizeLast10(item.phone) === normalizeLast10(selected.phone));

    if (refreshedSelection) {
      if (refreshedSelection !== selected) setSelected(refreshedSelection);
      return;
    }

    setSelected(null);
  }, [conversations, selected]);

  useEffect(() => {
    const phone = searchParams.get("phone");
    if (!phone || conversations.length === 0) return;
    const digits = normalizeLast10(phone);
    const match = conversations.find((item) => normalizeLast10(item.phone) === digits);
    if (match && selected?.id !== match.id) {
      selectConversation(match);
    }
  }, [conversations, searchParams, selected?.id]);

  useEffect(() => {
    localStorage.setItem("intake_tutorial_mode", String(tutorialMode));
  }, [tutorialMode]);

  const loading = callsLoading || smsLoading || unifiedLoading;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader />
      <div className="border-b bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Intake HQ</h1>
              <Badge variant="secondary">Communication Desk</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Handle calls and texts here. Now HQ keeps track of what needs doing next.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
              <Switch
                checked={tutorialMode}
                onCheckedChange={setTutorialMode}
                aria-label="Toggle intake tutorial mode"
              />
              <span className="text-sm font-medium">Tutorial</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/now")}>
              <Zap className="h-4 w-4" />
              Now HQ
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/dispatch")}>
              <CalendarDays className="h-4 w-4" />
              Dispatch HQ
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
        <ConversationList
          items={conversations}
          selectedId={selected?.id}
          businessUnits={businessUnits}
          isAdmin={role === "admin"}
          loading={loading}
          readModelError={unifiedError}
          search={search}
          tutorialMode={tutorialMode}
          onSearch={setSearch}
          onSelect={selectConversation}
          onClearForTesting={clearConversationForTesting}
          clearingIds={clearingIds}
        />
        <CustomerWorkspace
          key={selected ? intakeThreadKeyForDeskItem(selected) : "empty"}
          selected={selected}
          tutorialMode={tutorialMode}
          smsSending={smsSending}
          onSendSms={sendSms}
          onMarkSmsRead={markSmsAsRead}
          onMarkCallRead={markCallsAsRead}
          onSetSmsThreadStatus={setSmsThreadStatus}
          onHandled={handleConversationHandled}
        />
      </div>

      <NewJobDialog open={newJobOpen} onOpenChange={setNewJobOpen} />
    </div>
  );
}
