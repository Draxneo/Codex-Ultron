import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Loader2, Info, MessageSquare, ShieldCheck } from "lucide-react";
import { useAgentInstructions, useUpdateInstruction } from "@/hooks/useAgentInstructions";
import { toast } from "@/hooks/use-toast";

export function SmsRulesPanel() {
  const { data: instructions, isLoading } = useAgentInstructions();
  const updateInstruction = useUpdateInstruction();

  const smsRule = instructions?.find((i) => i.slug === "sms_response_rules");

  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (smsRule) setEditContent(smsRule.content);
  }, [smsRule]);

  const handleSave = () => {
    if (!smsRule) return;
    updateInstruction.mutate(
      { id: smsRule.id, content: editContent },
      {
        onSuccess: () => {
          setEditing(false);
          toast({ title: "SMS analysis rules saved" });
        },
      }
    );
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>;
  }

  if (!smsRule) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No SMS analysis rules found. Add an instruction with slug{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">sms_response_rules</code> in the
          Instructions tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Observer-only banner */}
      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed font-medium">
          Observer Mode — JARVIS reads customer SMS threads and surfaces suggestions to the dispatcher. He never replies directly — all outbound messages are sent by dispatch.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          These rules control how JARVIS analyzes inbound SMS threads — what intents to extract, what action cards to surface, and how to categorize customer requests for the dispatcher.
        </p>
      </div>

      <Card className={!smsRule.is_active ? "opacity-50" : ""}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {smsRule.label}
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant={smsRule.is_active ? "default" : "secondary"} className="text-xs">
              {smsRule.is_active ? "Active" : "Disabled"}
            </Badge>
            <Switch
              checked={smsRule.is_active}
              onCheckedChange={(checked) =>
                updateInstruction.mutate({ id: smsRule.id, is_active: checked })
              }
              className="scale-75"
            />
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="text-xs min-h-[320px] font-mono resize-y"
                placeholder="Enter SMS analysis rules..."
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7"
                  onClick={() => {
                    setEditing(false);
                    setEditContent(smsRule.content);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-7"
                  onClick={handleSave}
                  disabled={updateInstruction.isPending}
                >
                  {updateInstruction.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="text-xs text-muted-foreground whitespace-pre-wrap cursor-pointer hover:text-foreground transition-colors min-h-[40px] rounded border border-dashed border-border/50 p-3"
              onClick={() => setEditing(true)}
            >
              {smsRule.content || (
                <span className="italic">Click to add SMS analysis rules...</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
