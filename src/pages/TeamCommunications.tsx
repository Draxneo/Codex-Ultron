import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Briefcase,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  CreditCard,
  Edit3,
  ExternalLink,
  Hash,
  Inbox,
  Link as LinkIcon,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  PhoneCall,
  PhoneOff,
  Plus,
  Pin,
  PinOff,
  Send,
  Smile,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GrammarPreview } from "@/components/ui/GrammarPreview";
import { Input } from "@/components/ui/input";
import { MediaItem } from "@/components/media";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useComposerIntelligence } from "@/hooks/useComposerIntelligence";
import { useQuickLinks } from "@/hooks/useQuickLinks";
import { supabase } from "@/integrations/supabase/client";
import { audioCallProvider, type ProviderCall } from "@/lib/audioCallProvider";
import { errorMessage } from "@/lib/errorMessage";
import { formatBytes } from "@/lib/fileTypes";
import { cn } from "@/lib/utils";

type ConversationType = "direct" | "room";

type TeamConversation = {
  id: string;
  type: ConversationType;
  name: string | null;
  direct_pair_key: string | null;
  created_by: string | null;
  created_at: string;
};

type TeamMember = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
};

type TeamUser = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  profile_id: string | null;
  is_active: boolean | null;
};

type TeamMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachments: TeamAttachment[] | null;
  is_pinned: boolean;
  pinned_by: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

type TeamAttachment = {
  name: string;
  url: string;
  type: string;
  size: number;
  path: string;
};

type TeamAudioCall = {
  id: string;
  conversation_id: string;
  provider: "stub_link";
  provider_call_id: string;
  call_url: string;
  created_by: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

type TeamNotification = {
  id: string;
  type: "direct_message" | "room_message" | "audio_call_started";
  title: string;
  body: string | null;
  related_entity_type: string;
  related_entity_id: string;
  read_at: string | null;
  created_at: string;
};

type TeamNowAction = {
  id: string;
  status: string | null;
  title: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type LooseSupabaseClient = {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

type TeamPinRpcClient = typeof supabase & {
  rpc(
    fn: "set_team_message_pin",
    args: { _message_id: string; _pin: boolean },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

const db = supabase as unknown as LooseSupabaseClient;
const teamRpc = supabase as unknown as TeamPinRpcClient;
const urlPattern = /(https?:\/\/[^\s]+)/g;
const isUrl = (value: string) => /^https?:\/\/[^\s]+$/.test(value);
const commonEmojis = ["\u{1F44D}", "\u{1F64F}", "\u2705", "\u{1F525}", "\u{1F389}", "\u{1F440}", "\u{1F4A1}", "\u{1F4CC}"];

function showTeamActionError(title: string, error: unknown) {
  const description = error instanceof Error ? error.message : undefined;
  toast.error(title, description ? { description } : undefined);
}

const quickAccessItems = [
  { label: "Dispatch HQ", href: "/dispatch", icon: CalendarDays },
  { label: "Intake HQ", href: "/intake", icon: Inbox },
  { label: "Customer HQ", href: "/customers", icon: Users },
  { label: "Quote HQ", href: "/quick-quote", icon: ClipboardList },
  { label: "Price Book", href: "/catalog", icon: Briefcase },
  { label: "Payments", href: "/payments", icon: CreditCard },
];

const usefulWebLinks = [
  { label: "Housecall Pro", href: "https://pro.housecallpro.com" },
  { label: "AHRI Directory", href: "https://www.ahridirectory.org" },
  { label: "ENERGY STAR Rebates", href: "https://www.energystar.gov/rebate-finder" },
  { label: "Google Maps", href: "https://maps.google.com" },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function messageTime(value: string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

function extractUrls(text: string) {
  return Array.from(new Set(text.match(urlPattern) ?? []));
}

function safeStorageName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()}` : "";
  const base = parts.join(".") || "attachment";
  return `${base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "attachment"}${extension.toLowerCase()}`;
}

function LinkifiedText({ text }: { text: string }) {
  const pieces = text.split(urlPattern);
  return (
    <>
      {pieces.map((piece, index) =>
        isUrl(piece) ? (
          <a
            key={`${piece}-${index}`}
            href={piece}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {piece}
          </a>
        ) : (
          <span key={`${piece}-${index}`}>{piece}</span>
        )
      )}
    </>
  );
}

function SidebarEmpty({ children }: { children: string }) {
  return <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

export default function TeamCommunications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [mutedCallIds, setMutedCallIds] = useState<Set<string>>(new Set());
  const [pendingAttachments, setPendingAttachments] = useState<TeamAttachment[]>([]);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resourceLabel, setResourceLabel] = useState("");
  const [resourceHref, setResourceHref] = useState("");
  const [resourceNote, setResourceNote] = useState("");
  const [resourceCategory, setResourceCategory] = useState("Team Resources");
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    links: sharedLinks,
    categories: sharedCategories,
    isLoading: sharedLinksLoading,
    isError: sharedLinksError,
    error: sharedLinksQueryError,
    addLink: addQuickLink,
  } = useQuickLinks();

  const {
    data: teamUsers = [],
    isLoading: teamUsersLoading,
    isError: teamUsersError,
    error: teamUsersQueryError,
  } = useQuery({
    queryKey: ["team-users"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("employees")
        .select("id, name, role, email, profile_id, is_active")
        .eq("is_active", true)
        .not("profile_id", "is", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamUser[];
    },
  });

  const userByAuthId = useMemo(() => {
    const map = new Map<string, TeamUser>();
    for (const employee of teamUsers) {
      if (employee.profile_id) map.set(employee.profile_id, employee);
    }
    return map;
  }, [teamUsers]);

  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    error: conversationsQueryError,
  } = useQuery({
    queryKey: ["team-conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_conversations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeamConversation[];
    },
  });

  const conversationIds = useMemo(() => conversations.map((conversation) => conversation.id), [conversations]);

  const { data: members = [], isLoading: membersLoading, isError: membersError, error: membersQueryError } = useQuery({
    queryKey: ["team-conversation-members", conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_conversation_members")
        .select("*")
        .in("conversation_id", conversationIds);
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
  });

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0] ?? null,
    [conversations, selectedConversationId]
  );

  useEffect(() => {
    if (requestedConversationId && conversations.some((conversation) => conversation.id === requestedConversationId)) {
      setSelectedConversationId(requestedConversationId);
      return;
    }
    if (!selectedConversationId && conversations[0]) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, requestedConversationId, selectedConversationId]);

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
    error: messagesQueryError,
  } = useQuery({
    queryKey: ["team-messages", selectedConversation?.id],
    enabled: !!selectedConversation,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_messages")
        .select("*")
        .eq("conversation_id", selectedConversation!.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as TeamMessage[];
      return Promise.all(
        rows.map(async (message) => {
          const attachments = await Promise.all(
            (message.attachments ?? []).map(async (attachment) => {
              const { data: signed, error: signedError } = await supabase.storage
                .from("chat-attachments")
                .createSignedUrl(attachment.path, 60 * 60);

              return signedError ? attachment : { ...attachment, url: signed.signedUrl };
            })
          );

          return { ...message, attachments };
        })
      );
    },
  });

  const { data: calls = [], isError: callsError, error: callsQueryError } = useQuery({
    queryKey: ["team-audio-calls", conversationIds.join(",")],
    enabled: conversationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_audio_calls")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as TeamAudioCall[];
    },
  });

  const activeCall = useMemo(
    () => calls.find((call) => call.conversation_id === selectedConversation?.id && !call.ended_at) ?? null,
    [calls, selectedConversation?.id]
  );

  const { data: teamNowActions = [], isError: teamNowActionsError, error: teamNowActionsQueryError } = useQuery({
    queryKey: ["team-now-action-items"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("action_items" as any)
        .select("id, status, title, description, metadata, created_at")
        .eq("source", "team_communications")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as TeamNowAction[];
    },
  });

  const { data: unreadNotifications = [], isError: notificationsError, error: notificationsQueryError } = useQuery({
    queryKey: ["team-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("team_notifications")
        .select("*")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as TeamNotification[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`team-communications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-messages"] });
        queryClient.invalidateQueries({ queryKey: ["team-notifications", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_audio_calls" }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-audio-calls"] });
        queryClient.invalidateQueries({ queryKey: ["team-notifications", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-notifications", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "action_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-now-action-items"] });
        queryClient.invalidateQueries({ queryKey: ["now-hq-action-items"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedConversation?.id]);

  const roomConversations = conversations.filter((conversation) => conversation.type === "room");
  const directConversations = conversations.filter((conversation) => conversation.type === "direct");
  const currentMemberIds = new Set(members.map((member) => member.user_id));
  const availableDirectUsers = teamUsers.filter(
    (employee) => employee.profile_id && employee.profile_id !== user?.id
  );

  const conversationTitle = (conversation: TeamConversation) => {
    if (conversation.type === "room") return conversation.name || "Room";
    const member = members.find(
      (item) => item.conversation_id === conversation.id && item.user_id !== user?.id
    );
    return userByAuthId.get(member?.user_id ?? "")?.name ?? "Direct message";
  };

  const selectedMembers = members
    .filter((member) => member.conversation_id === selectedConversation?.id)
    .map((member) => userByAuthId.get(member.user_id))
    .filter(Boolean) as TeamUser[];

  const sendMessage = useMutation({
    mutationFn: async ({ body, attachments = [] }: { body: string; attachments?: TeamAttachment[] }) => {
      if (!user || !selectedConversation) throw new Error("No conversation selected");
      const trimmedBody = body.trim();
      if (!trimmedBody && attachments.length === 0) return;
      if (trimmedBody.length > 4000) throw new Error("Message is too long");

      const { error } = await db.from("team_messages").insert({
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        body: trimmedBody,
        attachments,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setPendingAttachments([]);
      queryClient.invalidateQueries({ queryKey: ["team-messages", selectedConversation?.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send message"),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editingMessageId) return;
      const body = editingText.trim();
      if (!body) return;
      const { error } = await db
        .from("team_messages")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", editingMessageId)
        .eq("sender_id", user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingMessageId(null);
      setEditingText("");
      queryClient.invalidateQueries({ queryKey: ["team-messages", selectedConversation?.id] });
    },
    onError: (error) => showTeamActionError("Could not edit message", error),
  });

  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await db
        .from("team_messages")
        .update({ body: "", deleted_at: new Date().toISOString() })
        .eq("id", messageId)
        .eq("sender_id", user?.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-messages", selectedConversation?.id] }),
    onError: (error) => showTeamActionError("Could not delete message", error),
  });

  const getOrCreateDirect = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) throw new Error("Not signed in");
      const directPairKey = [user.id, targetUserId].sort().join(":");
      const { data: existing, error: existingError } = await db
        .from("team_conversations")
        .select("*")
        .eq("direct_pair_key", directPairKey)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return existing as TeamConversation;

      const conversationId = crypto.randomUUID();
      const { error: conversationError } = await db.from("team_conversations").insert({
        id: conversationId,
        type: "direct",
        direct_pair_key: directPairKey,
        created_by: user.id,
      });
      if (conversationError) throw conversationError;

      const { error: membersError } = await db.from("team_conversation_members").insert([
        { conversation_id: conversationId, user_id: user.id, role: "owner" },
        { conversation_id: conversationId, user_id: targetUserId, role: "member" },
      ]);
      if (membersError) throw membersError;

      return {
        id: conversationId,
        type: "direct",
        name: null,
        direct_pair_key: directPairKey,
        created_by: user.id,
        created_at: new Date().toISOString(),
      } as TeamConversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ["team-conversations", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["team-conversation-members"] });
      setSelectedConversationId(conversation.id);
    },
    onError: (error) => showTeamActionError("Could not open direct message", error),
  });

  const createRoom = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const name = newRoomName.trim();
      if (!name) return null;
      const conversationId = crypto.randomUUID();
      const { error: conversationError } = await db.from("team_conversations").insert({
        id: conversationId,
        type: "room",
        name,
        created_by: user.id,
      });
      if (conversationError) throw conversationError;

      const memberRows = [
        { conversation_id: conversationId, user_id: user.id, role: "owner" },
        ...availableDirectUsers
          .map((employee) => employee.profile_id)
          .filter(Boolean)
          .map((profileId) => ({ conversation_id: conversationId, user_id: profileId, role: "member" })),
      ];
      const { error: membersError } = await db.from("team_conversation_members").insert(memberRows);
      if (membersError) throw membersError;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      setNewRoomName("");
      queryClient.invalidateQueries({ queryKey: ["team-conversations", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["team-conversation-members"] });
      if (conversationId) setSelectedConversationId(conversationId);
    },
    onError: (error) => showTeamActionError("Could not create room", error),
  });

  const startCall = useMutation({
    mutationFn: async () => {
      if (!user || !selectedConversation) throw new Error("No conversation selected");
      const providerCall = await audioCallProvider.createCall({ conversationId: selectedConversation.id });
      const callId = crypto.randomUUID();
      const { error: callError } = await db.from("team_audio_calls").insert({
        id: callId,
        conversation_id: selectedConversation.id,
        provider: providerCall.provider,
        provider_call_id: providerCall.providerCallId,
        call_url: providerCall.callUrl,
        created_by: user.id,
        started_at: providerCall.startedAt,
      });
      if (callError) throw callError;

      const { error: messageError } = await db.from("team_messages").insert({
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        body: `Audio call started: ${providerCall.callUrl}`,
      });
      if (messageError) throw messageError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-audio-calls"] });
      queryClient.invalidateQueries({ queryKey: ["team-messages", selectedConversation?.id] });
    },
    onError: (error) => showTeamActionError("Could not start call", error),
  });

  const joinCall = useMutation({
    mutationFn: async (call: TeamAudioCall) => {
      if (!user) throw new Error("Not signed in");
      const providerCall: ProviderCall = {
        provider: call.provider,
        providerCallId: call.provider_call_id,
        callUrl: call.call_url,
        startedAt: call.started_at,
        endedAt: call.ended_at,
      };
      await audioCallProvider.joinCall(providerCall);
      const { error } = await db.from("team_audio_call_participants").insert({
        audio_call_id: call.id,
        user_id: user.id,
        joined_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-audio-calls"] }),
    onError: (error) => showTeamActionError("Could not join call", error),
  });

  const leaveCall = useMutation({
    mutationFn: async (call: TeamAudioCall) => {
      const { error } = await db
        .from("team_audio_call_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("audio_call_id", call.id)
        .eq("user_id", user?.id)
        .is("left_at", null);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Left call"),
    onError: (error) => showTeamActionError("Could not leave call", error),
  });

  const endCall = useMutation({
    mutationFn: async (call: TeamAudioCall) => {
      const providerCall: ProviderCall = {
        provider: call.provider,
        providerCallId: call.provider_call_id,
        callUrl: call.call_url,
        startedAt: call.started_at,
        endedAt: call.ended_at,
      };
      const { endedAt } = await audioCallProvider.endCall(providerCall);
      const { error } = await db.from("team_audio_calls").update({ ended_at: endedAt }).eq("id", call.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-audio-calls"] }),
    onError: (error) => showTeamActionError("Could not end call", error),
  });

  const markNotificationsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await db
        .from("team_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      [
        ["team-notifications", user?.id],
        ["side-rail-team-notifications", user?.id],
        ["now-team-notifications", user?.id],
        ["intake-team-notifications", user?.id],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
  });

  const sendMessageToNow = useMutation({
    mutationFn: async (message: TeamMessage) => {
      if (!user || !selectedConversation || message.deleted_at) throw new Error("Message unavailable");

      const { data: existing, error: existingError } = await db
        .from("action_items" as any)
        .select("id")
        .eq("status", "pending")
        .eq("source", "team_communications")
        .eq("metadata->>team_message_id", message.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if ((existing as any)?.id) return (existing as any).id;

      const sender = userByAuthId.get(message.sender_id);
      const body = message.body?.trim();
      const { data, error } = await db
        .from("action_items" as any)
        .insert({
          source: "team_communications",
          category: "team_blocker",
          priority: "normal",
          title: "Team message needs attention",
          description: body || `${message.attachments?.length ?? 0} team attachment needs review.`,
          suggested_action: "Open Team HQ, read the message, and decide what needs to happen next.",
          metadata: {
            team_message_id: message.id,
            conversation_id: message.conversation_id,
            conversation_title: conversationTitle(selectedConversation),
            sender_id: message.sender_id,
            sender_name: sender?.name ?? "Team member",
            message_created_at: message.created_at,
            source_url: `/team?conversation=${message.conversation_id}`,
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["now-hq-action-items"] });
      queryClient.invalidateQueries({ queryKey: ["hud_attention_counts"] });
      toast.success("Sent to Now");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not send to Now"),
  });

  const uploadAttachments = useMutation({
    mutationFn: async (files: FileList) => {
      if (!user || !selectedConversation) throw new Error("No conversation selected");
      const uploaded: TeamAttachment[] = [];

      for (const file of Array.from(files).slice(0, 8)) {
        if (file.size > 20 * 1024 * 1024) {
          throw new Error(`${file.name} is larger than 20 MB`);
        }

        const path = `team/${selectedConversation.id}/${crypto.randomUUID()}-${safeStorageName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (uploadError) throw uploadError;

        const { data, error: signedError } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(path, 60 * 60);
        if (signedError) throw signedError;

        uploaded.push({
          name: file.name,
          url: data.signedUrl,
          type: file.type || "application/octet-stream",
          size: file.size,
          path,
        });
      }

      return uploaded;
    },
    onSuccess: (attachments) => {
      setPendingAttachments((previous) => [...previous, ...attachments]);
      if (attachments.length > 0) toast.success(`${attachments.length} file${attachments.length === 1 ? "" : "s"} ready`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not upload file"),
  });

  const togglePin = useMutation({
    mutationFn: async (message: TeamMessage) => {
      const { error } = await teamRpc.rpc("set_team_message_pin", {
        _message_id: message.id,
        _pin: !message.is_pinned,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-messages", selectedConversation?.id] }),
    onError: (error) => showTeamActionError("Could not update pin", error),
  });

  const composer = useComposerIntelligence({
    value: draft,
    setValue: setDraft,
    context: "chat",
    onSend: async (text) => {
      await sendMessage.mutateAsync({ body: text, attachments: pendingAttachments });
    },
  });

  const sendCurrentDraft = () => {
    if (pendingAttachments.length > 0 && !draft.trim()) {
      sendMessage.mutate({ body: "", attachments: pendingAttachments });
      return;
    }
    composer.handleSend();
  };

  const createTeamResource = () => {
    const label = resourceLabel.trim();
    const href = resourceHref.trim();
    if (!label || !href) {
      toast.error("Add a name and link");
      return;
    }
    if (!/^https?:\/\//i.test(href)) {
      toast.error("Use a full http or https link");
      return;
    }

    addQuickLink.mutate(
      {
        label,
        href,
        sub: resourceNote.trim() || "Team resource",
        iconName: "LinkIcon",
        category: resourceCategory.trim() || "Team Resources",
      },
      {
        onSuccess: () => {
          setResourceLabel("");
          setResourceHref("");
          setResourceNote("");
          setResourceCategory("Team Resources");
          setResourceDialogOpen(false);
          toast.success("Team resource added");
        },
      }
    );
  };

  const pinnedMessages = messages.filter((message) => message.is_pinned && !message.deleted_at);
  const pinnedLinks = Array.from(
    new Set(pinnedMessages.flatMap((message) => extractUrls(message.body)))
  ).slice(0, 6);
  const recentLinks = Array.from(
    new Set(messages.flatMap((message) => (message.deleted_at ? [] : extractUrls(message.body))))
  ).slice(-6);
  const operationCandidates = messages
    .filter((message) => !message.deleted_at && (message.body?.trim() || (message.attachments?.length ?? 0) > 0))
    .slice(-4)
    .reverse();
  const teamNowByMessageId = useMemo(() => {
    const map = new Map<string, TeamNowAction>();
    for (const item of teamNowActions) {
      const messageId = item.metadata?.team_message_id;
      if (messageId && !map.has(messageId)) map.set(messageId, item);
    }
    return map;
  }, [teamNowActions]);
  const selectedConversationNowActions = teamNowActions.filter(
    (item) => item.metadata?.conversation_id === selectedConversation?.id
  );
  const pendingTeamNowActions = selectedConversationNowActions.filter(
    (item) => !["done", "handled", "dismissed", "completed", "closed"].includes(String(item.status || "").toLowerCase())
  );
  const sidebarLoading = teamUsersLoading || conversationsLoading || membersLoading;
  const pageHasError = teamUsersError || conversationsError;
  const teamDataIssues = [
    membersError ? `room members (${errorMessage(membersQueryError)})` : null,
    callsError ? `team calls (${errorMessage(callsQueryError)})` : null,
    teamNowActionsError ? `team Now cards (${errorMessage(teamNowActionsQueryError)})` : null,
    notificationsError ? `notifications (${errorMessage(notificationsQueryError)})` : null,
    sharedLinksError ? `team resources (${errorMessage(sharedLinksQueryError)})` : null,
  ].filter(Boolean);
  const visibleSharedLinks = sharedLinks.length > 0 ? sharedLinks : usefulWebLinks.map((item, index) => ({
    id: `fallback-${index}`,
    href: item.href,
    label: item.label,
    sub: "Starter resource",
    iconName: "LinkIcon",
    category: "Starter Links",
    sort_order: index,
  }));
  const sharedLinkGroups = visibleSharedLinks.reduce<Record<string, typeof visibleSharedLinks>>((groups, link) => {
    const key = link.category || "Team Resources";
    groups[key] = groups[key] || [];
    groups[key].push(link);
    return groups;
  }, {});
  const resourceCategories = Array.from(new Set(["Team Resources", "Permits", "Ordering", "Warranty", "Finance", ...sharedCategories]));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="h-[calc(100vh-3rem)] overflow-hidden bg-muted/25">
        <div className="grid h-full grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1 xl:grid-cols-[280px_minmax(0,1fr)_330px]">
          <aside className="min-h-0 border-b bg-card/95 lg:border-b-0 lg:border-r">
            <div className="flex h-14 items-center justify-between border-b px-3">
              <div>
                <h1 className="text-base font-semibold">Team HQ</h1>
              </div>
              <Badge
                variant={unreadNotifications.length ? "default" : "secondary"}
                className="gap-1"
                title={`${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? "" : "s"}`}
                aria-label={`${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? "" : "s"}`}
              >
                <Bell className="h-3 w-3" />
                {unreadNotifications.length}
              </Badge>
            </div>

            <ScrollArea className="h-44 lg:h-[calc(100vh-6.5rem)]">
              <div className="grid gap-3 p-3 sm:grid-cols-3 lg:block lg:space-y-5">
                <section>
                  <div className="mb-2 flex items-center gap-1.5 px-1">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rooms</p>
                  </div>
                  <div className="space-y-1">
                    {sidebarLoading &&
                      Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={`room-loading-${index}`} className="h-9 rounded-md" />
                      ))}
                    {roomConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => setSelectedConversationId(conversation.id)}
                        aria-label={`Open ${conversationTitle(conversation)}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          selectedConversation?.id === conversation.id
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        )}
                      >
                        <Hash className="h-4 w-4 shrink-0" />
                        <span className="truncate">{conversationTitle(conversation)}</span>
                      </button>
                    ))}
                    {!sidebarLoading && roomConversations.length === 0 && (
                      <SidebarEmpty>Create a room for dispatch notes, sales, or installs.</SidebarEmpty>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={newRoomName}
                      onChange={(event) => setNewRoomName(event.target.value)}
                      placeholder="New room"
                      className="h-8 text-xs"
                      maxLength={60}
                    />
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => createRoom.mutate()}
                      disabled={!newRoomName.trim() || createRoom.isPending}
                      title="Create room"
                      aria-label="Create room"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-1.5 px-1">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Direct</p>
                  </div>
                  <div className="space-y-1">
                    {sidebarLoading &&
                      Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={`direct-loading-${index}`} className="h-10 rounded-md" />
                      ))}
                    {availableDirectUsers.map((employee) => {
                      const conversation = directConversations.find((item) =>
                        members.some(
                          (member) => member.conversation_id === item.id && member.user_id === employee.profile_id
                        )
                      );
                      return (
                        <button
                          key={employee.profile_id}
                          onClick={() =>
                            conversation
                              ? setSelectedConversationId(conversation.id)
                              : getOrCreateDirect.mutate(employee.profile_id!)
                          }
                          aria-label={`Open direct message with ${employee.name}`}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                            selectedConversation?.id === conversation?.id
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted"
                          )}
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[11px]">{initials(employee.name)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                          {currentMemberIds.has(employee.profile_id!) && (
                            <span className="h-2 w-2 rounded-full bg-emerald-500" title="Available">
                              <span className="sr-only">Available</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {!sidebarLoading && availableDirectUsers.length === 0 && (
                      <SidebarEmpty>No teammates with chat access are active yet.</SidebarEmpty>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-1.5 px-1">
                    <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                  </div>
                  <div className="space-y-1.5">
                    {calls.slice(0, 5).map((call) => {
                      const conversation = conversations.find((item) => item.id === call.conversation_id);
                      return (
                        <button
                          key={call.id}
                          onClick={() => setSelectedConversationId(call.conversation_id)}
                          aria-label={`Open ${conversation ? conversationTitle(conversation) : "audio call"} from ${messageTime(call.started_at)}`}
                          className="w-full rounded-md px-2.5 py-2 text-left text-xs hover:bg-muted"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">
                              {conversation ? conversationTitle(conversation) : "Audio Call"}
                            </span>
                            {!call.ended_at && (
                              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Live">
                                <span className="sr-only">Live</span>
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground">{messageTime(call.started_at)}</p>
                        </button>
                      );
                    })}
                    {calls.length === 0 && (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">No recent calls</p>
                    )}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-background">
            <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {selectedConversation?.type === "room" ? <Hash className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                  <h2 className="truncate text-sm font-semibold">
                    {selectedConversation ? conversationTitle(selectedConversation) : "Team Room"}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedMembers.length} member{selectedMembers.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => startCall.mutate()}
                  disabled={!selectedConversation || startCall.isPending}
                  title="Start call"
                  aria-label="Start call"
                >
                  <PhoneCall className="h-4 w-4" />
                </Button>
              </div>
            </header>

            {activeCall && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100 sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <PhoneCall className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="font-medium">Live call</p>
                  <p className="truncate text-xs opacity-80">{activeCall.call_url}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => joinCall.mutate(activeCall)}>
                    Join
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() =>
                      setMutedCallIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(activeCall.id)) {
                          next.delete(activeCall.id);
                        } else {
                          next.add(activeCall.id);
                        }
                        return next;
                      })
                    }
                    title={mutedCallIds.has(activeCall.id) ? "Unmute" : "Mute"}
                    aria-label={mutedCallIds.has(activeCall.id) ? "Unmute call" : "Mute call"}
                  >
                    {mutedCallIds.has(activeCall.id) ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => leaveCall.mutate(activeCall)}>
                    Leave
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => endCall.mutate(activeCall)}
                    title="End call"
                    aria-label="End call"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-4 sm:px-5 sm:py-5">
                {pageHasError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Team chat could not load</AlertTitle>
                    <AlertDescription>
                      Refresh the page or try again after the connection recovers.
                      {teamUsersError && ` Roster: ${errorMessage(teamUsersQueryError)}.`}
                      {conversationsError && ` Rooms: ${errorMessage(conversationsQueryError)}.`}
                    </AlertDescription>
                  </Alert>
                )}
                {messagesError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Messages could not load</AlertTitle>
                    <AlertDescription>
                      The room list is available, but this conversation did not return messages. {errorMessage(messagesQueryError)}
                    </AlertDescription>
                  </Alert>
                )}
                {teamDataIssues.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Part of Team HQ is behind</AlertTitle>
                    <AlertDescription>
                      Team HQ is open, but these feeds need a refresh: {teamDataIssues.join(", ")}.
                    </AlertDescription>
                  </Alert>
                )}
                {messagesLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={`message-loading-${index}`} className={cn("flex gap-3", index % 2 === 1 && "flex-row-reverse")}>
                      <Skeleton className="mt-1 h-8 w-8 rounded-full" />
                      <div className={cn("w-2/3 space-y-2", index % 2 === 1 && "items-end")}>
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-16 rounded-lg" />
                      </div>
                    </div>
                  ))}
                {!messagesLoading && messages.map((message) => {
                  const sender = userByAuthId.get(message.sender_id);
                  const own = message.sender_id === user?.id;
                  const deleted = !!message.deleted_at;
                  return (
                    <div id={`team-message-${message.id}`} key={message.id} className={cn("group flex gap-2 scroll-mt-6 sm:gap-3", own && "flex-row-reverse")}>
                      <Avatar className="mt-1 hidden h-8 w-8 sm:flex">
                        <AvatarFallback className="text-xs">
                          {initials(sender?.name ?? (own ? "You" : "Team"))}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn("min-w-0 max-w-[86%] sm:max-w-[76%]", own && "text-right")}>
                        <div className={cn("mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground", own && "justify-end")}>
                          <span className="font-medium text-foreground">{own ? "You" : sender?.name ?? "Team member"}</span>
                          <span>{messageTime(message.created_at)}</span>
                          {message.edited_at && !deleted && (
                            <Edit3 className="h-3 w-3" aria-label="Edited" />
                          )}
                          {message.is_pinned && !deleted && <Pin className="h-3 w-3" aria-label="Pinned" />}
                        </div>
                        <div
                          className={cn(
                            "rounded-lg border px-3 py-2 text-left text-sm leading-relaxed shadow-sm",
                            own ? "bg-primary text-primary-foreground" : "bg-card",
                            deleted && "italic text-muted-foreground"
                          )}
                        >
                          {editingMessageId === message.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                                className="min-h-20 bg-background text-foreground"
                                maxLength={4000}
                              />
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-7 w-7"
                                  onClick={() => saveEdit.mutate()}
                                  title="Save edit"
                                  aria-label="Save edit"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Cancel edit"
                                  aria-label="Cancel edit"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditingText("");
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ) : deleted ? (
                            "Message deleted"
                          ) : (
                            <div className="space-y-2 whitespace-pre-wrap break-words">
                              {message.body && <LinkifiedText text={message.body} />}
                              {(message.attachments ?? []).length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {(message.attachments ?? []).map((attachment) => (
                                    <div
                                      key={attachment.path || attachment.url}
                                      className={cn(
                                        "max-w-full rounded-md border bg-background/90 p-2 text-foreground sm:max-w-64",
                                        own && "bg-primary-foreground"
                                      )}
                                    >
                                      <MediaItem
                                        url={attachment.url}
                                        fileName={attachment.name}
                                        fileType={attachment.type}
                                        size={attachment.size}
                                        variant="compact"
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {!deleted && editingMessageId !== message.id && (
                          <div className={cn("mt-1 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100", own && "justify-end")}>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => togglePin.mutate(message)}
                              title={message.is_pinned ? "Unpin message" : "Pin message"}
                              aria-label={message.is_pinned ? "Unpin message" : "Pin message"}
                            >
                              {message.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </Button>
                            {own && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditingText(message.body);
                                  }}
                                  title="Edit message"
                                  aria-label="Edit message"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => deleteMessage.mutate(message.id)}
                                  title="Delete message"
                                  aria-label="Delete message"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!messagesLoading && !messagesError && messages.length === 0 && (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-12 text-center">
                    <div className="mb-3 rounded-full bg-background p-3 shadow-sm">
                      <MessageSquare className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start with a dispatch update, job handoff, or quick team question.</p>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            <footer className="border-t bg-card/90 p-2.5 sm:p-3">
              <div className="mx-auto max-w-4xl space-y-2">
                {composer.preview && (
                  <GrammarPreview
                    original={composer.preview.original}
                    polished={composer.preview.polished}
                    onAccept={composer.acceptPolish}
                    onReject={composer.rejectPolish}
                    onCancel={composer.cancelPolish}
                    loading={sendMessage.isPending}
                  />
                )}
                {pendingAttachments.length > 0 && (
                  <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                    {pendingAttachments.map((attachment) => (
                      <div key={attachment.path} className="flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="max-w-36 truncate font-medium sm:max-w-44">{attachment.name}</span>
                        <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 hover:bg-muted"
                          title="Remove file"
                          aria-label={`Remove ${attachment.name}`}
                          onClick={() =>
                            setPendingAttachments((previous) =>
                              previous.filter((item) => item.path !== attachment.path)
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      if (event.target.files?.length) uploadAttachments.mutate(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!selectedConversation || uploadAttachments.isPending}
                    title="Attach files"
                    aria-label="Attach files"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1 overflow-x-auto pb-0.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
                        title="Grammar assist"
                        aria-label="Grammar assist"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm hover:bg-muted"
                          onClick={() => setDraft((value) => `${value}${emoji}`)}
                          title={`Insert ${emoji}`}
                          aria-label={`Insert ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <Smile className="h-3.5 w-3.5 text-muted-foreground" aria-label="Emoji" />
                    </div>
                    <Textarea
                      ref={composer.inputRef}
                      value={draft}
                      onChange={composer.handleChange}
                      onBlur={composer.handleBlur}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendCurrentDraft();
                        }
                      }}
                      placeholder="Message"
                      className="max-h-32 min-h-10 resize-none sm:min-h-11"
                      maxLength={4000}
                    />
                  </div>
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
                    disabled={
                      (!draft.trim() && pendingAttachments.length === 0) ||
                      sendMessage.isPending ||
                      composer.isBusy ||
                      !selectedConversation
                    }
                    onClick={sendCurrentDraft}
                    title="Send"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </footer>
          </section>

          <aside className="hidden min-h-0 border-l bg-card/95 xl:block">
            <div className="flex h-14 items-center justify-between border-b px-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden="true" />
                <p className="text-sm font-semibold">Members</p>
              </div>
              {unreadNotifications.length > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => markNotificationsRead.mutate()}
                  title="Mark notifications read"
                  aria-label="Mark notifications read"
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
            <ScrollArea className="h-[calc(100vh-6.5rem)]">
              <div className="space-y-4 p-3">
                <section className="space-y-2">
                  {membersLoading &&
                    Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton key={`member-loading-${index}`} className="h-10 rounded-md" />
                    ))}
                  {selectedMembers.map((member) => (
                    <div key={member.profile_id} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.name}</p>
                        {member.role && <p className="text-xs text-muted-foreground">{member.role}</p>}
                      </div>
                    </div>
                  ))}
                  {!membersLoading && selectedMembers.length === 0 && (
                    <SidebarEmpty>Select a room or direct message to see members.</SidebarEmpty>
                  )}
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team Items to Handle</p>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-md border bg-background p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{selectedConversation ? conversationTitle(selectedConversation) : "No room selected"}</span>
                        <Badge variant={pendingTeamNowActions.length ? "default" : activeCall ? "default" : "secondary"}>
                          {pendingTeamNowActions.length ? `${pendingTeamNowActions.length} in Now` : activeCall ? "call live" : "quiet"}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">
                        {operationCandidates[0]?.body || (operationCandidates[0]?.attachments?.length ? "Latest update has attachments." : "Pick a chat to see what is going on.")}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-muted-foreground">
                        <span>{unreadNotifications.length} unread team alert{unreadNotifications.length === 1 ? "" : "s"}</span>
                        {activeCall?.started_at && <span>{messageTime(activeCall.started_at)}</span>}
                      </div>
                    </div>

                    {operationCandidates.slice(0, 3).map((message) => (
                      <div key={`now-candidate-${message.id}`} className="rounded-md border bg-background px-3 py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{userByAuthId.get(message.sender_id)?.name ?? "Team member"}</p>
                            <p className="mt-1 line-clamp-2 text-muted-foreground">
                              {message.body || `${message.attachments?.length ?? 0} attachment${message.attachments?.length === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          {teamNowByMessageId.get(message.id) ? (
                            <Button asChild size="sm" variant="secondary" className="h-7 shrink-0 px-2 text-[11px]">
                              <Link to={`/now?action_items=1&action_id=${teamNowByMessageId.get(message.id)!.id}`}>
                                Sent
                              </Link>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 px-2 text-[11px]"
                              onClick={() => sendMessageToNow.mutate(message)}
                              disabled={sendMessageToNow.isPending}
                            >
                              Now
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {operationCandidates.length === 0 && (
                      <SidebarEmpty>Team blockers can be sent to Now once a message exists.</SidebarEmpty>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now Cards From This Chat</p>
                  </div>
                  <div className="space-y-2">
                    {selectedConversationNowActions.slice(0, 4).map((item) => (
                      <Link
                        key={item.id}
                        to={`/now?action_items=1&action_id=${item.id}`}
                        className="block rounded-md border bg-background px-3 py-2 text-xs hover:bg-muted"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{item.title || "Team follow-up"}</p>
                          <Badge variant={item.status === "pending" ? "default" : "secondary"} className="text-[10px]">
                            {item.status || "open"}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-muted-foreground">
                          {item.description || "Open Now HQ to finish this item."}
                        </p>
                      </Link>
                    ))}
                    {selectedConversationNowActions.length === 0 && (
                      <SidebarEmpty>Nothing from this chat has been sent to Now yet.</SidebarEmpty>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Pin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned</p>
                  </div>
                  <div className="space-y-2">
                    {pinnedMessages.slice(0, 4).map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        className="w-full rounded-md border bg-background px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={() => document.getElementById(`team-message-${message.id}`)?.scrollIntoView({ block: "center" })}
                        aria-label={`Show pinned message from ${userByAuthId.get(message.sender_id)?.name ?? "team member"}`}
                      >
                        <div className="mb-1 flex items-center gap-1 font-medium">
                          <span className="truncate">{userByAuthId.get(message.sender_id)?.name ?? "Team member"}</span>
                        </div>
                        <p className="line-clamp-2 text-muted-foreground">
                          {message.body || `${message.attachments?.length ?? 0} attachment${message.attachments?.length === 1 ? "" : "s"}`}
                        </p>
                      </button>
                    ))}
                    {pinnedMessages.length === 0 && <SidebarEmpty>Pin key dispatch details so they stay easy to find.</SidebarEmpty>}
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team Links</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setResourceDialogOpen(true)}
                      title="Add team link"
                      aria-label="Add team link"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {sharedLinksLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={`resource-loading-${index}`} className="h-10 rounded-md" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(sharedLinkGroups).slice(0, 5).map(([category, links]) => (
                        <div key={category}>
                          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{category}</p>
                          <div className="space-y-1">
                            {links.slice(0, 5).map((link) => (
                              <a
                                key={link.id}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-2 text-xs hover:bg-muted"
                                aria-label={`Open ${link.label}`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold">{link.label}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">{link.sub || link.href}</span>
                                </span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                      {sharedLinks.length === 0 && (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          Starter links are shown here. Add permitting, vendor ordering, utility, warranty, and financing links for the whole team.
                        </p>
                      )}
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Access</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {quickAccessItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-2 text-xs font-medium hover:bg-muted"
                          aria-label={`Open ${item.label}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Links</p>
                  </div>
                  <div className="space-y-1.5">
                    {pinnedLinks
                      .filter((href, index, list) => list.indexOf(href) === index)
                      .slice(0, 8)
                      .map((href) => {
                        return (
                          <a
                            key={href}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"
                            aria-label={`Open ${href}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{href}</span>
                          </a>
                        );
                      })}
                    {pinnedLinks.length === 0 && recentLinks.length === 0 && (
                      <SidebarEmpty>Links shared in chat will collect here.</SidebarEmpty>
                    )}
                    {recentLinks.length > 0 && (
                      <div className="pt-1">
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">Recent</p>
                        {recentLinks.slice(0, 3).map((href) => (
                          <button
                            key={href}
                            type="button"
                            className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted"
                            onClick={() => setDraft((value) => `${value}${value ? " " : ""}${href}`)}
                            aria-label={`Add ${href} to message`}
                          >
                            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{href}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unread</p>
                  </div>
                  <div className="space-y-2">
                    {unreadNotifications.map((notification) => (
                      <div key={notification.id} className="rounded-md border bg-background px-3 py-2 text-xs">
                        <p className="font-medium">{notification.title}</p>
                        {notification.body && <p className="mt-1 line-clamp-2 text-muted-foreground">{notification.body}</p>}
                      </div>
                    ))}
                    {unreadNotifications.length === 0 && <SidebarEmpty>Nothing new</SidebarEmpty>}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </aside>
        </div>
      </main>
      <Dialog open={resourceDialogOpen} onOpenChange={setResourceDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add team link</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
              <Input
                value={resourceLabel}
                onChange={(event) => setResourceLabel(event.target.value)}
                placeholder="City permit portal, vendor order desk..."
                maxLength={80}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link</p>
              <Input
                value={resourceHref}
                onChange={(event) => setResourceHref(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
              <Input
                value={resourceCategory}
                onChange={(event) => setResourceCategory(event.target.value)}
                list="team-resource-categories"
                placeholder="Permits, Ordering, Warranty..."
                maxLength={60}
              />
              <datalist id="team-resource-categories">
                {resourceCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note</p>
              <Input
                value={resourceNote}
                onChange={(event) => setResourceNote(event.target.value)}
                placeholder="What the team uses this for"
                maxLength={120}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setResourceDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={createTeamResource} disabled={addQuickLink.isPending}>
                {addQuickLink.isPending ? "Adding..." : "Add resource"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
