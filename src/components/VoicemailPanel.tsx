import { useVoicemails, Voicemail } from "@/hooks/useVoicemails";
import { format } from "date-fns";
import { Phone, Trash2, Voicemail as VoicemailIcon, Circle, MessageSquare, ChevronDown, ChevronUp, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCopilotPanel } from "@/contexts/CopilotPanelContext";
import { getRecordingProxyUrl } from "@/lib/recordingProxy";
import { UniversalMediaPlayer } from "@/components/media";
import { openSmsComposer } from "@/lib/smsComposerBridge";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoicemailPanel() {
  const { voicemails, loading, markAsRead, deleteVoicemail } = useVoicemails();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { startVoicemailSession } = useCopilotPanel();

  const handleAskJarvis = (vm: Voicemail) => {
    if (!vm.is_read) markAsRead(vm.id);
    startVoicemailSession(vm.id, vm.phone_number, vm.contact_name || undefined);
  };

  const toggleExpand = (vm: Voicemail) => {
    setExpandedId((prev) => (prev === vm.id ? null : vm.id));
    if (!vm.is_read) markAsRead(vm.id);
  };

  if (loading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading voicemails…</div>;
  }

  if (voicemails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <VoicemailIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No voicemails yet</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Voicemails from missed calls will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-y-auto h-full">
      {voicemails.map((vm) => {
        const isExpanded = expandedId === vm.id;
        const hasTranscription = !!vm.transcription;

        return (
          <div key={vm.id} className={cn("transition-colors", !vm.is_read && "bg-primary/5")}>
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
              <div className="relative">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {!vm.is_read && (
                  <Circle className="h-2 w-2 fill-destructive text-destructive absolute -top-0.5 -right-0.5" />
                )}
              </div>

              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => hasTranscription && toggleExpand(vm)}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm truncate ${!vm.is_read ? "font-semibold" : "font-medium"}`}>
                    {vm.contact_name || vm.phone_number}
                  </span>
                  {vm.contact_type !== "unknown" && (
                    <Badge variant="secondary" className="text-[9px]">{vm.contact_type}</Badge>
                  )}
                  {hasTranscription && (
                    <FileText className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(vm.created_at), "MMM d, h:mm a")}</span>
                  <span>•</span>
                  <span>{formatDuration(vm.duration_seconds)}</span>
                </div>
              </button>

              <div className="flex items-center gap-1">
                {hasTranscription && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={isExpanded ? "Collapse" : "View transcription"}
                    onClick={() => toggleExpand(vm)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Ask JARVIS about this voicemail"
                  onClick={() => handleAskJarvis(vm)}
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Send SMS"
                  onClick={() => {
                    openSmsComposer(vm.phone_number, { contactName: vm.contact_name || undefined });
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                </Button>
                {vm.recording_url && (
                  <UniversalMediaPlayer
                    src={getRecordingProxyUrl(vm.recording_url)}
                    kind="audio"
                    variant="compact"
                    stopPropagation
                    className="h-8 w-8 text-primary"
                    onPlayed={() => {
                      if (!vm.is_read) markAsRead(vm.id);
                    }}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => deleteVoicemail(vm.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Expandable transcription */}
            {isExpanded && hasTranscription && (
              <div className="px-4 pb-3 pt-0 ml-7">
                {vm.recording_url && (
                  <UniversalMediaPlayer
                    src={getRecordingProxyUrl(vm.recording_url)}
                    kind="audio"
                    title="Voicemail recording"
                    subtitle={formatDuration(vm.duration_seconds)}
                    variant="inline"
                    className="mb-3"
                    onPlayed={() => {
                      if (!vm.is_read) markAsRead(vm.id);
                    }}
                  />
                )}
                <div className="rounded-md bg-muted/50 border border-border/50 p-3">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    📝 Transcription
                  </p>
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {vm.transcription}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
