import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface HuddleState {
  isConnected: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  participants: string[];
  activeHuddleId: string | null;
}

export function useActiveHuddle(channelId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-huddle", channelId],
    queryFn: async () => {
      if (!channelId) return null;
      const { data, error } = await supabase
        .from("chat_huddles")
        .select("*")
        .eq("channel_id", channelId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!channelId,
    refetchInterval: (query) => (query.state.data ? 5000 : 30000),
  });

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel(`huddle-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_huddles", filter: `channel_id=eq.${channelId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat-huddle", channelId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, queryClient]);

  return query;
}

export function useHuddle(channelId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<HuddleState>({
    isConnected: false,
    isMuted: false,
    isScreenSharing: false,
    participants: [],
    activeHuddleId: null,
  });

  const roomRef = useRef<any>(null);
  const screenTrackRef = useRef<any>(null);
  const localTracksRef = useRef<any[]>([]);

  const getToken = useCallback(async (room: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const resp = await supabase.functions.invoke("twilio-token", {
      body: { room },
    });
    if (resp.error) throw resp.error;
    return resp.data;
  }, []);

  const joinHuddle = useCallback(async () => {
    if (!channelId || !user || state.isConnected) return;

    try {
      const roomName = `huddle-${channelId}`;
      const { token, identity } = await getToken(roomName);

      // Dynamic import twilio-video
      const Video = await import("twilio-video");
      const room = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: false,
      });

      roomRef.current = room;

      // Track participants
      const updateParticipants = () => {
        const names: string[] = [];
        room.participants.forEach((p: any) => names.push(p.identity));
        names.push(identity);
        setState((s) => ({ ...s, participants: names }));
      };

      room.on("participantConnected", updateParticipants);
      room.on("participantDisconnected", updateParticipants);
      updateParticipants();

      // Create or join huddle record
      const { data: existing } = await supabase
        .from("chat_huddles")
        .select("id, participant_ids")
        .eq("channel_id", channelId)
        .is("ended_at", null)
        .maybeSingle();

      let huddleId: string;
      if (existing) {
        huddleId = existing.id;
        const currentIds = (existing.participant_ids as string[]) || [];
        if (!currentIds.includes(user.id)) {
          await supabase
            .from("chat_huddles")
            .update({ participant_ids: [...currentIds, user.id] })
            .eq("id", existing.id);
        }
      } else {
        const { data: newHuddle } = await supabase
          .from("chat_huddles")
          .insert({ channel_id: channelId, started_by: user.id, participant_ids: [user.id] })
          .select("id")
          .single();
        huddleId = newHuddle!.id;
      }

      setState((s) => ({ ...s, isConnected: true, activeHuddleId: huddleId }));
      queryClient.invalidateQueries({ queryKey: ["chat-huddle", channelId] });
      toast.success("Joined huddle");
    } catch (err: any) {
      console.error("Huddle join error:", err);
      toast.error("Failed to join huddle: " + (err.message || "Unknown error"));
    }
  }, [channelId, user, state.isConnected, getToken, queryClient]);

  const leaveHuddle = useCallback(async () => {
    // Stop screen share if active
    if (screenTrackRef.current) {
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    // Disconnect from room
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    // Remove self from huddle participants
    if (state.activeHuddleId && user) {
      const { data: huddle } = await supabase
        .from("chat_huddles")
        .select("participant_ids")
        .eq("id", state.activeHuddleId)
        .single();

      if (huddle) {
        const remaining = ((huddle.participant_ids as string[]) || []).filter((id) => id !== user.id);
        if (remaining.length === 0) {
          await supabase
            .from("chat_huddles")
            .update({ ended_at: new Date().toISOString(), participant_ids: [] })
            .eq("id", state.activeHuddleId);
        } else {
          await supabase
            .from("chat_huddles")
            .update({ participant_ids: remaining })
            .eq("id", state.activeHuddleId);
        }
      }
    }

    setState({
      isConnected: false,
      isMuted: false,
      isScreenSharing: false,
      participants: [],
      activeHuddleId: null,
    });
    queryClient.invalidateQueries({ queryKey: ["chat-huddle", channelId] });
    toast.info("Left huddle");
  }, [state.activeHuddleId, user, channelId, queryClient]);

  const toggleMute = useCallback(() => {
    if (!roomRef.current) return;
    const localParticipant = roomRef.current.localParticipant;
    localParticipant.audioTracks.forEach((pub: any) => {
      if (state.isMuted) {
        pub.track.enable();
      } else {
        pub.track.disable();
      }
    });
    setState((s) => ({ ...s, isMuted: !s.isMuted }));
  }, [state.isMuted]);

  const startScreenShare = useCallback(async () => {
    if (!roomRef.current || state.isScreenSharing) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];

      const Video = await import("twilio-video");
      const localVideoTrack = new Video.LocalVideoTrack(track, { name: "screen-share" });
      roomRef.current.localParticipant.publishTrack(localVideoTrack);
      screenTrackRef.current = localVideoTrack;

      track.onended = () => {
        stopScreenShare();
      };

      setState((s) => ({ ...s, isScreenSharing: true }));
      toast.success("Screen sharing started");
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        toast.error("Screen share failed");
      }
    }
  }, [state.isScreenSharing]);

  const stopScreenShare = useCallback(() => {
    if (screenTrackRef.current && roomRef.current) {
      roomRef.current.localParticipant.unpublishTrack(screenTrackRef.current);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setState((s) => ({ ...s, isScreenSharing: false }));
      toast.info("Screen sharing stopped");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return {
    ...state,
    joinHuddle,
    leaveHuddle,
    toggleMute,
    startScreenShare,
    stopScreenShare,
  };
}
