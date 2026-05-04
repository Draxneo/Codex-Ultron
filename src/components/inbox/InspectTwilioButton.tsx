import { useState } from "react";
import { Search, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { UniversalMediaPlayer } from "@/components/media";

interface Props {
  callSid: string;
  callLogId: string;
  hasRecording: boolean;
  className?: string;
}

interface InspectResult {
  parent: {
    sid: string;
    status: string;
    duration: number;
    answered_by: string | null;
    from: string;
    to: string;
    start_time: string | null;
    end_time: string | null;
  };
  children: Array<{
    sid: string;
    to: string;
    from: string;
    status: string;
    duration: number;
    start_time: string | null;
    end_time: string | null;
  }>;
  recordings: Array<{
    sid: string;
    duration: number;
    channels: number;
    source: string;
    status: string;
    date_created: string;
    from_leg: string;
    media_url: string;
    play_url: string;
  }>;
}

/**
 * Admin-only diagnostic button — pulls live Twilio data for a CallSid.
 * Designed for overflow calls where the local recording_url is missing
 * because Twilio's RecordingStatusCallback never reached us.
 */
export function InspectTwilioButton({ callSid, callLogId, hasRecording, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);
  const [savingSid, setSavingSid] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const inspect = async () => {
    setOpen(true);
    if (result) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("twilio-call-inspect", {
        body: { callSid },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as InspectResult);
    } catch (e: any) {
      toast.error(`Twilio lookup failed: ${e.message || e}`);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const saveRecording = async (mediaUrl: string, sid: string) => {
    setSavingSid(sid);
    try {
      const { error } = await supabase
        .from("call_log")
        .update({ recording_url: mediaUrl } as any)
        .eq("id", callLogId);
      if (error) throw error;
      toast.success("Recording saved to call log");
      queryClient.invalidateQueries({ queryKey: ["call-log"] });
    } catch (e: any) {
      toast.error(`Save failed: ${e.message || e}`);
    } finally {
      setSavingSid(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          inspect();
        }}
        className={className}
        title="Inspect Twilio — fetch live call details + recovered recordings"
      >
        <Search className="h-3.5 w-3.5 mr-1" />
        Inspect Twilio
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Twilio call inspector</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{callSid}</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Querying Twilio…
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Parent */}
              <section className="border rounded-md p-3 bg-muted/30">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Parent leg (incoming)
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Field label="Status" value={result.parent.status} />
                  <Field label="Duration" value={`${result.parent.duration}s`} />
                  <Field label="From" value={result.parent.from} />
                  <Field label="To" value={result.parent.to} />
                  <Field label="Answered by" value={result.parent.answered_by || "—"} />
                  <Field label="Start" value={fmt(result.parent.start_time)} />
                </div>
              </section>

              {/* Children */}
              <section className="border rounded-md p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Child legs (overflow dial) — {result.children.length}
                </h3>
                {result.children.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No child legs found.</p>
                ) : (
                  <div className="space-y-2">
                    {result.children.map((c) => (
                      <div key={c.sid} className="flex items-center justify-between text-xs gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={c.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                            {c.status}
                          </Badge>
                          <span className="font-mono truncate">{c.to}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {c.duration}s · {fmt(c.start_time)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Recordings */}
              <section className="border rounded-md p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Recordings — {result.recordings.length}
                </h3>
                {result.recordings.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Twilio has no recordings for this call. The answering service may have answered without
                    recording, or the call never connected long enough to capture audio.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {result.recordings.map((r) => (
                      <div key={r.sid} className="border rounded p-2 bg-muted/20 space-y-2">
                        <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              {r.duration}s · {r.channels}ch
                            </Badge>
                            <span className="text-muted-foreground">{r.from_leg}</span>
                          </div>
                          {!hasRecording && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => saveRecording(r.media_url, r.sid)}
                              disabled={savingSid === r.sid}
                              className="h-7 text-xs"
                            >
                              {savingSid === r.sid ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Save className="h-3 w-3 mr-1" />
                                  Save to call log
                                </>
                              )}
                            </Button>
                          )}
                          {hasRecording && (
                            <span className="text-[10px] text-success flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> already saved
                            </span>
                          )}
                        </div>
                        <UniversalMediaPlayer
                          src={r.play_url}
                          kind="audio"
                          title="Recovered Twilio recording"
                          subtitle={`${r.duration}s`}
                          variant="inline"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-medium">{value}</span>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}