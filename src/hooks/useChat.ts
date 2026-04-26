import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

export interface ChatChannel {
  id: string;
  name: string;
  description?: string | null;
  job_id: string | null;
  estimate_id: string | null;
  is_special: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  is_deleted?: boolean;
  attachments?: { name: string; url: string; type: string }[];
  is_pinned?: boolean;
  pinned_by?: string | null;
  reply_to_id?: string | null;
}

export interface ChatReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ChatReadCursor {
  id: string;
  channel_id: string;
  user_id: string;
  last_read_at: string;
}


// --- Channels ---

export function useChannels() {
  return useQuery({
    queryKey: ["chat-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_channels")
        .select("id, name, description, job_id, estimate_id, is_special, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ChatChannel[];
    },
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("chat_channels")
        .insert({ name, description: description || null })
        .select()
        .single();
      if (error) throw error;
      return data as ChatChannel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
    },
  });
}

// --- Messages ---

export function useChannelMessages(channelId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-messages", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, channel_id, user_id, sender_name, content, created_at, edited_at, is_deleted, attachments, is_pinned, pinned_by, reply_to_id")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as ChatMessage[];
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`chat-messages-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            queryClient.setQueryData(
              ["chat-messages", channelId],
              (old: ChatMessage[] | undefined) => {
                if (!old) return [payload.new as ChatMessage];
                if (old.some((m) => m.id === (payload.new as ChatMessage).id)) return old;
                return [...old, payload.new as ChatMessage];
              }
            );
          } else if (payload.eventType === "UPDATE") {
            queryClient.setQueryData(
              ["chat-messages", channelId],
              (old: ChatMessage[] | undefined) => {
                if (!old) return old;
                return old.map((m) =>
                  m.id === (payload.new as ChatMessage).id ? { ...m, ...payload.new } : m
                );
              }
            );
          } else if (payload.eventType === "DELETE") {
            queryClient.setQueryData(
              ["chat-messages", channelId],
              (old: ChatMessage[] | undefined) => {
                if (!old) return old;
                return old.filter((m) => m.id !== (payload.old as any).id);
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, queryClient]);

  return query;
}

export function useSendMessage() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      channelId,
      content,
      senderName,
      attachments,
      replyToId,
    }: {
      channelId: string;
      content: string;
      senderName: string;
      attachments?: { name: string; url: string; type: string }[];
      replyToId?: string;
    }) => {
      // Grammar-check the message content before sending
      let correctedContent = content;
      try {
        const grammarResp = await supabase.functions.invoke("grammar-check", {
          body: { text: content, context: "chat" },
        });
        if (grammarResp.data?.corrected) {
          correctedContent = grammarResp.data.corrected;
        }
      } catch {
        // Silently fall back to original content
      }

      const row: any = {
        channel_id: channelId,
        user_id: user!.id,
        sender_name: senderName,
        content: correctedContent,
      };
      if (attachments && attachments.length > 0) {
        row.attachments = attachments;
      }
      if (replyToId) {
        row.reply_to_id = replyToId;
      }
      const { error } = await supabase.from("chat_messages").insert(row);
      if (error) throw error;
    },
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const { error } = await supabase
        .from("chat_messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, soft }: { messageId: string; soft?: boolean }) => {
      if (soft) {
        const { error } = await supabase
          .from("chat_messages")
          .update({ is_deleted: true, content: "" })
          .eq("id", messageId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("chat_messages")
          .delete()
          .eq("id", messageId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
  });
}

export function usePinMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, pin, pinnedBy }: { messageId: string; pin: boolean; pinnedBy?: string }) => {
      const { error } = await supabase
        .from("chat_messages")
        .update({ is_pinned: pin, pinned_by: pin ? pinnedBy : null })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
  });
}

// --- Reactions ---

export function useReactions(channelId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-reactions", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      // Get all message IDs in this channel first
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("channel_id", channelId);
      if (!msgs || msgs.length === 0) return [];
      const msgIds = msgs.map((m) => m.id);
      const { data, error } = await supabase
        .from("chat_reactions")
        .select("*")
        .in("message_id", msgIds);
      if (error) throw error;
      return data as ChatReaction[];
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`chat-reactions-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_reactions" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat-reactions", channelId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, queryClient]);

  return query;
}

export function useToggleReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user) throw new Error("Not authenticated");
      // Check if reaction exists
      const { data: existing } = await supabase
        .from("chat_reactions")
        .select("id")
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji)
        .maybeSingle();
      if (existing) {
        await supabase.from("chat_reactions").delete().eq("id", existing.id);
      } else {
        await supabase.from("chat_reactions").insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-reactions"] });
    },
  });
}

// --- Search ---

export function useSearchMessages(channelId: string | null, searchTerm: string) {
  return useQuery({
    queryKey: ["chat-search", channelId, searchTerm],
    queryFn: async () => {
      if (!channelId || !searchTerm.trim()) return [];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .ilike("content", `%${searchTerm}%`)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as ChatMessage[];
    },
    enabled: !!channelId && searchTerm.trim().length > 1,
  });
}

// --- Typing Presence ---

export function useTypingPresence(channelId: string | null) {
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!channelId || !user) return;

    const ch = supabase.channel(`typing-${channelId}`, {
      config: { presence: { key: user.id } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const names: string[] = [];
      for (const [uid, entries] of Object.entries(state)) {
        if (uid === user.id) continue;
        const entry = (entries as any[])[0];
        if (entry?.typing) names.push(entry.name || "Someone");
      }
      setTypingUsers(names);
    }).subscribe();

    channelRef.current = ch;

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [channelId, user]);

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!channelRef.current || !user) return;
      channelRef.current.track({
        typing: isTyping,
        name: user.user_metadata?.full_name || user.email || "Unknown",
      });
    },
    [user]
  );

  return { typingUsers, setTyping };
}

// --- Read Cursors ---

export function useReadCursors() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat-read-cursors", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("chat_read_cursors")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data as ChatReadCursor[];
    },
    enabled: !!user,
  });
}

export function useUpdateReadCursor() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("chat_read_cursors")
        .upsert(
          {
            channel_id: channelId,
            user_id: user.id,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-read-cursors"] });
    },
  });
}

export interface LatestMessagePreview {
  channel_id: string;
  created_at: string;
  sender_name: string;
  content: string;
}

export function useLatestMessages() {
  return useQuery({
    queryKey: ["chat-latest-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("channel_id, created_at, sender_name, content")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, string> = {};
      const previewMap: Record<string, LatestMessagePreview> = {};
      for (const msg of data) {
        if (!map[msg.channel_id] || msg.created_at > map[msg.channel_id]) {
          map[msg.channel_id] = msg.created_at;
          previewMap[msg.channel_id] = {
            channel_id: msg.channel_id,
            created_at: msg.created_at,
            sender_name: msg.sender_name,
            content: msg.content,
          };
        }
      }
      return { timestamps: map, previews: previewMap };
    },
    refetchInterval: 30000,
  });
}

export function useUnreadCounts() {
  const { data: cursors } = useReadCursors();
  const { data: latestData } = useLatestMessages();

  if (!cursors || !latestData) return {};

  const counts: Record<string, boolean> = {};
  for (const [channelId, latestAt] of Object.entries(latestData.timestamps)) {
    const cursor = cursors.find((c) => c.channel_id === channelId);
    counts[channelId] =
      !cursor ||
      new Date(cursor.last_read_at).getTime() < new Date(latestAt).getTime();
  }
  return counts;
}

export function useTotalUnread() {
  const { data: channels = [] } = useChannels();
  const unreadCounts = useUnreadCounts();
  return channels.filter(
    (ch) => !ch.job_id && !ch.estimate_id && !ch.is_special && unreadCounts[ch.id]
  ).length;
}

// --- Delete channel ---

export function useDeleteChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase
        .from("chat_channels")
        .delete()
        .eq("id", channelId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      queryClient.invalidateQueries({ queryKey: ["chat-latest-messages"] });
    },
  });
}

// --- Get/Create channels ---

export function useGetOrCreateJobChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, jobName }: { jobId: string; jobName: string }) => {
      const { data: existing } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("job_id", jobId)
        .maybeSingle();
      if (existing) return existing as ChatChannel;
      const { data, error } = await supabase
        .from("chat_channels")
        .insert({ name: jobName, job_id: jobId })
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      return data as ChatChannel;
    },
  });
}

export function useGetOrCreateEstimateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ estimateId, estimateName }: { estimateId: string; estimateName: string }) => {
      const { data: existing } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("estimate_id", estimateId)
        .maybeSingle();
      if (existing) return existing as ChatChannel;
      const { data, error } = await supabase
        .from("chat_channels")
        .insert({ name: estimateName, estimate_id: estimateId })
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      return data as ChatChannel;
    },
  });
}
