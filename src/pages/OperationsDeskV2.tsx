import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
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
  Plus,
  Search,
  Send,
  Sparkles,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { MmsMediaRenderer } from "@/components/chat/MmsMediaRenderer";
import { InlineBookingWizard } from "@/components/copilot/InlineBookingWizard";
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone, normalizeLast10, toE164 } from "@/lib/formatters";
import { verifyAddressWithGoogle, type GoogleAddressVerification } from "@/lib/google-maps";
import { insertAtSelection } from "@/lib/insertAtCursor";
import { normalizeMediaAttachments } from "@/lib/mediaAttachments";
import { openPhoneConsole } from "@/lib/phoneConsoleBridge";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { cn } from "@/lib/utils";

type DeskConversation = {
  id: string;
  kind: "call" | "sms";
  direction: "inbound" | "outbound";
  phone: string;
  name: string | null;
  customerType: string;
  status: string;
  summary: string;
  detail: string;
  createdAt: string;
  timeLabel: string;
  unread: boolean;
  latestJobId?: string | null;
  raw: CallConversation | SmsConversation;
};

type UIMode = "ai" | "human";

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

function formatDateTime(value?: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDate(value?: string | null) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
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

function buildSmsUrl(phone?: string | null, draft?: string) {
  if (!phone) return "/sms";
  const params = new URLSearchParams();
  params.set("phone", toE164(phone) || phone);
  if (draft) params.set("draft", draft);
  return `/sms?${params.toString()}`;
}

function callToDeskItem(conversation: CallConversation): DeskConversation {
  const call = conversation.lastCall;
  return {
    id: `call-${call.id}`,
    kind: "call",
    direction: call.direction,
    phone: conversation.phoneNumber,
    name: conversation.contactName,
    customerType: conversation.contactType,
    status: call.status || "logged",
    summary: callSummary(conversation),
    detail: call.ai_summary || call.transcription || "Open this call to review context and decide the next dispatch action.",
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
    name: conversation.contactName,
    customerType: conversation.contactType,
    status: conversation.status,
    summary: smsSummary(conversation),
    detail: message.body || "Open this text to review context and reply.",
    createdAt: message.created_at,
    timeLabel: message.time_ct || formatDateTime(message.created_at),
    unread: conversation.unreadCount > 0,
    latestJobId: conversation.latestJobId,
    raw: conversation,
  };
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
      .is("read_at", null);
    if (error) {
      toast({ title: "Team alerts stayed unread", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["intake-team-notifications", user.id] });
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
    <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 shrink-0 text-amber-700" />
            <p className="truncate text-sm font-semibold">
              {notifications.length > 0
                ? `${notifications.length} team alert${notifications.length === 1 ? "" : "s"} need attention`
                : "Latest team text"}
            </p>
          </div>
          {latestMessage ? (
            <div className="mt-2 text-xs">
              <div className="flex items-center gap-1 text-amber-900/80">
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
            <button type="button" onClick={markRead} className="rounded-md px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
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
  loading,
  search,
  onSearch,
  onSelect,
}: {
  items: DeskConversation[];
  selectedId?: string;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (item: DeskConversation) => void;
}) {
  const hasSearch = search.trim().length > 0;
  const priorityItems = useMemo(() => {
    if (hasSearch) return items;
    const urgent = items.filter((item) => item.unread || item.direction === "inbound").slice(0, 6);
    const urgentIds = new Set(urgent.map((item) => item.id));
    const recent = items.filter((item) => !urgentIds.has(item.id)).slice(0, 4);
    const selected = selectedId ? items.find((item) => item.id === selectedId && !urgentIds.has(item.id) && !recent.some((candidate) => candidate.id === item.id)) : null;
    return selected ? [selected, ...urgent, ...recent] : [...urgent, ...recent];
  }, [hasSearch, items, selectedId]);
  const quickLimit = hasSearch ? 20 : 10;
  const visibleItems = priorityItems.slice(0, quickLimit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <aside className="flex min-h-0 flex-col border-r bg-card">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold">Live Inbox</h2>
            <Badge variant="secondary">{hasSearch ? "Search" : "Now Queue"}</Badge>
          </div>
          <Link
            to="/phone"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Open inbox
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasSearch ? "Search the wider communication history." : "Only the active handful stays here."}
        </p>
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
      </div>

      <div className="shrink-0 overflow-y-auto p-3" style={{ maxHeight: "min(58vh, 620px)" }}>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No conversations match this search.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-muted/30",
                    selectedId === item.id ? "border-primary bg-primary/5" : "bg-background",
                    item.unread && "border-l-4 border-l-primary"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge variant={item.kind === "call" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                        {item.kind === "call" ? "Call" : "Text"}
                      </Badge>
                      <Badge variant={item.direction === "inbound" ? "default" : "outline"} className="shrink-0 text-[10px]">
                        {item.direction === "inbound" ? "In" : "Out"}
                      </Badge>
                      <p className="truncate text-sm font-semibold">
                        {item.name || formatPhone(item.phone) || item.phone}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{item.timeLabel}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-foreground">{item.summary}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.detail}</p>
                </button>
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Showing {visibleItems.length} active item{visibleItems.length === 1 ? "" : "s"}. {hiddenCount} older conversation{hiddenCount === 1 ? "" : "s"} stay in the full inbox.
                </p>
                <Link to="/phone" className="mt-2 inline-flex rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                  Open full inbox
                </Link>
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
      {items.slice(0, 8).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            "w-full rounded-md border bg-background p-2 text-left transition hover:border-primary/40",
            selectedId === item.id && "border-primary bg-primary/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Badge variant={item.kind === "call" ? "secondary" : "outline"} className="text-[10px]">
              {item.kind === "call" ? "Call" : "Text"}
            </Badge>
            <p className="truncate text-xs font-semibold">{item.name || formatPhone(item.phone) || item.phone}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{item.summary}</p>
        </button>
      ))}
    </div>
  );
}

function ConversationEvidence({ selected }: { selected: DeskConversation }) {
  const navigate = useNavigate();

  if (selected.kind === "call") {
    const conversation = selected.raw as CallConversation;
    const latestCall = conversation.lastCall;
    const transcript = latestCall.transcription?.trim();
    const summary = latestCall.ai_summary?.trim();
    const previousCalls = conversation.calls.filter((call) => call.id !== latestCall.id).slice(0, 2);

    return (
      <Section title="Conversation Evidence" detail="Deepgram transcript and call context from the selected call.">
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
            Open phone history
          </Button>
        </div>
      </Section>
    );
  }

  const conversation = selected.raw as SmsConversation;
  const messages = conversation.messages.slice(-8);

  return (
    <Section title="Conversation Evidence" detail="Recent SMS thread from the selected phone number.">
      <div className="space-y-3">
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
          {messages.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No messages loaded for this thread yet.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[92%] rounded-lg border px-3 py-2",
                  message.direction === "outbound" ? "ml-auto bg-primary/5" : "mr-auto bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.direction === "outbound" ? "Office" : "Customer"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{message.time_ct || formatDateTime(message.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-5">{message.body || "Attachment"}</p>
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
        <Button variant="outline" className="w-full gap-2" onClick={() => navigate(buildSmsUrl(selected.phone))}>
          <ExternalLink className="h-4 w-4" />
          Open full SMS thread
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
  const sendInFlightRef = useRef(false);
  const latestInbound = useMemo(
    () => [...conversation.messages].reverse().find((message) => message.direction === "inbound"),
    [conversation.messages]
  );

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
      <Section title="Reply to Latest Message" detail="Answer from Intake HQ without losing the customer context.">
      <div className="space-y-3">
        {latestInbound && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest customer text</p>
              <span className="text-[10px] text-muted-foreground">{latestInbound.time_ct || formatDateTime(latestInbound.created_at)}</span>
            </div>
            <p className="mt-1 line-clamp-3 text-sm leading-6">{latestInbound.body || "Attachment"}</p>
            {normalizeMediaAttachments(latestInbound.media_urls).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {normalizeMediaAttachments(latestInbound.media_urls).map((media, index) => (
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
        )}

        {preview && (
          <GrammarPreview
            original={preview.original}
            polished={preview.polished}
            onAccept={acceptPolish}
            onReject={rejectPolish}
            onCancel={cancelPolish}
          />
        )}

        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
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

        <div className="rounded-md border bg-background p-2">
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
                provider="openai"
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
  smsSending,
  onSendSms,
  onMarkSmsRead,
  onSetSmsThreadStatus,
}: {
  selected: DeskConversation | null;
  smsSending: boolean;
  onSendSms: SendSmsHandler;
  onMarkSmsRead: (phone: string) => void | Promise<void>;
  onSetSmsThreadStatus: ReturnType<typeof useSmsLog>["setThreadStatus"];
}) {
  const navigate = useNavigate();
  const { startCallSession, startSmsSession } = useCopilotPanel();
  const [smsDialogOpen, setSmsDialogOpen] = useState(false);
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

  if (!selected) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No conversation selected</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a call or text to identify the customer, see active work, and decide what dispatch should do next.
          </p>
        </div>
      </main>
    );
  }

  const displayName = customerName(customer) || selected.name || formatPhone(selected.phone) || selected.phone;
  const address = customer
    ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")
    : null;
  const contactReason = selected.summary || selected.detail || "Waiting for Jarvis summary";
  const knownSignals = [
    customer?.email,
    address,
    activeJobs.length ? `${activeJobs.length} active job${activeJobs.length === 1 ? "" : "s"}` : null,
    overview?.agreement ? `${overview.agreement.plan_name} agreement` : null,
  ].filter(Boolean);
  const dialable = toE164(selected.phone) || selected.phone;
  const openCall = () => {
    startCallSession(dialable, displayName);
    openPhoneConsole(dialable, { contactName: displayName, customerId: customer?.id, autoDial: false });
  };
  const openText = () => {
    startSmsSession(dialable, displayName);
    if (selected.kind === "sms") void onMarkSmsRead(dialable);
    setSmsDialogOpen(true);
  };
  const handleModalSend: SendSmsHandler = async (to, text, jobId, contactName, mediaUrls) => {
    const success = await onSendSms(to, text, jobId, contactName || displayName, mediaUrls);
    if (success) setSmsDialogOpen(false);
    return success;
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background p-4">
      <div className="mb-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{displayName}</h1>
              {customer ? (
                <Badge variant="default">Existing customer</Badge>
              ) : lookup.isLoading ? (
                <Badge variant="secondary">Matching...</Badge>
              ) : (
                <Badge variant="destructive">Unknown / new lead</Badge>
              )}
              {activeJobs.length > 0 && <Badge variant="secondary">{activeJobs.length} active job{activeJobs.length === 1 ? "" : "s"}</Badge>}
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
            {customer ? (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/customers/${customer.id}`)}>
                <ExternalLink className="h-4 w-4" />
                Customer
              </Button>
            ) : (
              <div className="rounded-md border bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Jarvis will prepare customer match or lead creation.
              </div>
            )}
          </div>
        </div>
      </div>

      {selected.kind === "sms" && (
        <div className="mb-4">
          <InlineSmsReplyComposer selected={selected} sending={smsSending} onSend={onSendSms} />
        </div>
      )}

      <div className="mb-4">
        <ConversationEvidence selected={selected} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Section title="Who" detail="Customer identity and match confidence.">
          <div className="space-y-3">
            <div className="rounded-md border bg-background p-3">
              <p className="text-sm font-semibold">{displayName}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatPhone(selected.phone) || selected.phone}</p>
            </div>
            {knownSignals.length ? (
              <div className="space-y-2">
                {knownSignals.map((signal) => (
                  <div key={String(signal)} className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {signal}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Unknown number. Jarvis should prepare a link or create-customer action.
              </p>
            )}
          </div>
        </Section>

        <Section title="What" detail="The request Jarvis heard.">
          <div className="space-y-3">
            <div className="rounded-md border bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                {selected.kind === "sms" ? "Text intake" : "Call intake"}
              </div>
              <p className="mt-2 line-clamp-5 text-sm leading-6 text-muted-foreground">{contactReason}</p>
            </div>
            {selected.detail && selected.detail !== selected.summary && (
              <p className="line-clamp-4 rounded-md border bg-background p-3 text-xs leading-5 text-muted-foreground">
                {selected.detail}
              </p>
            )}
          </div>
        </Section>

        <Section title="Why" detail="Reason for action and nearby context.">
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
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent memory</p>
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
              onMarkRead={onMarkSmsRead}
              onStatusChange={onSetSmsThreadStatus}
              onBack={() => setSmsDialogOpen(false)}
              newMessageMode={selected.kind !== "sms"}
              prefillPhone={selected.kind !== "sms" ? dialable : undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ActionPanel({
  selected,
}: {
  selected: DeskConversation | null;
}) {
  const navigate = useNavigate();
  const { startRecordSession } = useCopilotPanel();
  const [draft, setDraft] = useState("");
  const [bookingWizardOpen, setBookingWizardOpen] = useState(false);
  const [queuedBookingSummary, setQueuedBookingSummary] = useState<string | null>(null);
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
  const fieldPriority = new Set(["Address", "Preferred timing", "Issue", "Intent", "Customer", "Phone"]);
  const visibleIntakeFields = [
    ...liveIntakeFields.filter((field) => field.status !== "captured" && fieldPriority.has(field.label)),
    ...liveIntakeFields.filter((field) => field.status === "captured" && fieldPriority.has(field.label)),
  ]
    .filter((field, index, all) => all.findIndex((candidate) => candidate.label === field.label) === index)
    .slice(0, 5);
  const hiddenIntakeFieldCount = Math.max(0, liveIntakeFields.length - visibleIntakeFields.length);

  useEffect(() => {
    if (!selected) {
      setDraft("");
      return;
    }
    if (selected.kind === "sms" && selected.direction === "inbound") {
      setDraft("Thanks for reaching out. Let me take a look and get you helped.");
    } else if (selected.kind === "call") {
      setDraft("Thanks for calling Carnes and Sons. This is the Carnes family following up on our conversation. Text us back here if there is anything else you want us to know.");
    } else {
      setDraft("");
    }
  }, [selected?.id]);

  useEffect(() => {
    setBookingWizardOpen(false);
    setQueuedBookingSummary(null);
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
      const extracted = getConversationExtraction(selected);
      const candidate = extractionAddress(extracted) || extractAddressFromText(`${selected?.summary || ""} ${selected?.detail || ""}`);
      const hasStoredResult = extracted.address_verified === true || extracted.address_verified === false;
      if (!candidate || hasStoredResult) {
        setAddressVerifying(false);
        return;
      }

      setAddressVerifying(true);
      const result = await verifyAddressWithGoogle(candidate);
      if (!cancelled) {
        setLiveAddressVerification(result);
        setAddressVerifying(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  if (!selected) {
    return (
      <aside className="flex min-h-0 flex-col border-l bg-card p-4">
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

  const dialable = toE164(selected.phone) || selected.phone;
  const openSms = () => navigate(buildSmsUrl(selected.phone, draft));
  const bookingActionForReview = bookingSuggestion
    ? { ...bookingSuggestion.action, address: addressVerification.standardized || addressVerification.address || bookingSuggestion.action.address }
    : null;
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
      ? `Hi, this is Carnes and Sons. I may have heard the service address incorrectly. Is this the correct address: ${candidate}?`
      : "Hi, this is Carnes and Sons. I may have heard the service address incorrectly. Can you please text me the correct service address?";
    setAddressDialogOpen(false);
    navigate(buildSmsUrl(selected.phone, message));
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
    <aside className="min-h-0 overflow-y-auto border-l bg-card">
      <div className="sticky top-0 z-10 border-b bg-card/95 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Jarvis + Actions</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {bookingSuggestion ? "Review the prepared action." : "Waiting for enough context."}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={askJarvisAboutSelection}>
            <Sparkles className="h-4 w-4" />
            Ask Jarvis
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <Section title="Jarvis Prepared Action" detail="Who, what, and why stay visible before approval.">
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
                <div className="mt-3 space-y-2">
                  {visibleIntakeFields.map((field) => (
                    <div key={field.label} className="rounded-md border bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {field.label}
                        </span>
                        <Badge
                          variant={field.status === "captured" ? "secondary" : field.status === "missing" ? "destructive" : "outline"}
                          className="text-[10px]"
                        >
                          {field.status === "captured" ? "Captured" : field.status === "missing" ? "Needed" : "Listening"}
                        </Badge>
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
                      <p className="text-xs text-muted-foreground">Jarvis prepares; the operator approves.</p>
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
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : addressVerification.confidence === "medium"
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-destructive/30 bg-destructive/5"
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
                    If approved, this starts as {bookingSuggestion.type === "book_estimate" ? "an estimate" : "a service job"} with{" "}
                    <strong className="text-foreground">{bookingSuggestion.defaultOwner}</strong> as the default owner.
                  </span>
                </div>
              </div>

              {queuedBookingSummary && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                  <p className="font-semibold text-foreground">Queued for review</p>
                  <p className="mt-1">{queuedBookingSummary}</p>
                </div>
              )}

              {bookingWizardOpen ? (
                <InlineBookingWizard
                  action={bookingActionForReview || bookingSuggestion.action}
                  onCancel={() => setBookingWizardOpen(false)}
                  onComplete={(summary) => {
                    setQueuedBookingSummary(summary);
                    setBookingWizardOpen(false);
                    toast({
                      title: "Booking ready for approval",
                      description: "Nothing was booked automatically from this screen.",
                    });
                  }}
                />
              ) : (
                <div className="space-y-2">
                  <Button className="w-full gap-2" onClick={() => setBookingWizardOpen(true)} disabled={!minimumReady}>
                    <CalendarDays className="h-4 w-4" />
                    {bookingSuggestion.buttonLabel}
                  </Button>
                  {!minimumReady && (
                    <p className="text-center text-xs text-muted-foreground">
                      Capture and verify the service address before opening the schedule step.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-primary/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {isSms && selected.direction === "inbound"
                    ? "Reply and decide whether this belongs on the board"
                    : isCall
                      ? "Review call context and decide whether to book/update"
                      : "Check customer context"}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{selected.summary}</p>
              </div>
              {!isKnown && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
                  Unknown number. Jarvis should prepare a customer link or create-customer action first.
                </div>
              )}
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Listening for booking or estimate intent. As the transcript mentions a repair, maintenance visit, quote,
                address, or preferred time, this becomes a one-click review action.
              </div>
            </div>
          )}
        </Section>

        <Section title="Approval Macros" detail="Fast actions without manual job creation clutter.">
          {(isSms || draft) && (
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Draft a customer reply..."
              className="min-h-20 resize-none"
            />
          )}
          <div className={cn("grid gap-2", (isSms || draft) && "mt-3")}>
            <Button className="gap-2" onClick={openSms}>
              <Send className="h-4 w-4" />
              Review text reply
            </Button>
            <Button variant="outline" className="gap-2" onClick={reviewAddress}>
              <MapPin className="h-4 w-4" />
              Confirm address
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => openPhoneConsole(dialable, { contactName: selected.name || undefined, customerId: customer?.id })}>
              <Phone className="h-4 w-4" />
              Call customer
            </Button>
            {customer && (
              <Button variant="outline" className="gap-2" onClick={() => navigate(`/customers/${customer.id}`)}>
                <UserRound className="h-4 w-4" />
                Open customer
              </Button>
            )}
            {selected.latestJobId && (
              <Button variant="outline" className="gap-2" onClick={() => navigate(`/jobs/${selected.latestJobId}`)}>
                <Briefcase className="h-4 w-4" />
                Open related job
              </Button>
            )}
          </div>
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
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : addressVerification.confidence === "medium"
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-destructive/30 bg-destructive/5"
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
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
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
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();
  const { data: employees = [] } = useEmployees();
  const selectedJob = selectedJobId ? (jobs as any[]).find((job: any) => job.id === selectedJobId) : null;

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
    navigate(buildSmsUrl(job.customer_phone));
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
      </aside>
    </div>
  );
}

export default function OperationsDeskV2() {
  const navigate = useNavigate();
  const { conversations: callConversations, loading: callsLoading, markAsRead: markCallsAsRead } = useCallLog();
  const {
    conversations: smsConversations,
    loading: smsLoading,
    sending: smsSending,
    sendSms,
    markAsRead: markSmsAsRead,
    setThreadStatus: setSmsThreadStatus,
  } = useSmsLog();
  const [uiMode, setUiMode] = useState<UIMode>("ai");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DeskConversation | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);

  const conversations = useMemo(() => {
    const items = [
      ...callConversations.map(callToDeskItem),
      ...smsConversations.map(smsToDeskItem),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
  }, [callConversations, smsConversations, search]);

  const selectConversation = (item: DeskConversation) => {
    setSelected(item);
    if (item.kind === "call") {
      void markCallsAsRead(item.phone);
    } else {
      void markSmsAsRead(item.phone);
    }
  };

  useEffect(() => {
    if (selected || conversations.length === 0) return;
    setSelected(conversations[0]);
  }, [conversations, selected]);

  const loading = callsLoading || smsLoading;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader />
      <div className="border-b bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Intake HQ</h1>
              <Badge variant="secondary">{uiMode === "ai" ? "AI Control" : "Human Control"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Calls, texts, customer match, AI intake, and human-approved booking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border bg-background p-1">
              <Button
                variant={uiMode === "ai" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-2"
                onClick={() => setUiMode("ai")}
              >
                <Bot className="h-4 w-4" />
                AI Mode
              </Button>
              <Button
                variant={uiMode === "human" ? "default" : "ghost"}
                size="sm"
                className="h-8 gap-2"
                onClick={() => setUiMode("human")}
              >
                <UserRound className="h-4 w-4" />
                Human Mode
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/dispatch")}>
              <CalendarDays className="h-4 w-4" />
              Dispatch HQ
            </Button>
            {uiMode === "human" && (
              <Button size="sm" onClick={() => setNewJobOpen(true)}>
                <Plus className="h-4 w-4" />
                New job
              </Button>
            )}
          </div>
        </div>
      </div>

      {uiMode === "ai" ? (
        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)_360px] overflow-hidden">
          <ConversationList
            items={conversations}
            selectedId={selected?.id}
            loading={loading}
            search={search}
            onSearch={setSearch}
            onSelect={selectConversation}
          />
          <CustomerWorkspace
            selected={selected}
            smsSending={smsSending}
            onSendSms={sendSms}
            onMarkSmsRead={markSmsAsRead}
            onSetSmsThreadStatus={setSmsThreadStatus}
          />
          <ActionPanel selected={selected} />
        </div>
      ) : (
        <HumanModeDesk
          conversations={conversations}
          selectedConversation={selected}
          selectedJobId={selectedJobId}
          onSelectConversation={selectConversation}
          onSelectJob={setSelectedJobId}
          onCreateJob={() => setNewJobOpen(true)}
        />
      )}

      <NewJobDialog open={newJobOpen} onOpenChange={setNewJobOpen} />
    </div>
  );
}
