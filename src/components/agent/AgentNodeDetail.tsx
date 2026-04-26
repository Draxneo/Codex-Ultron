import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import {
  ExternalLink, Wrench, Zap, Save, Brain, Server,
  MessageSquare, Mail, FileText, Calendar, DollarSign,
  Search, Clock, Bot, Pencil,
} from "lucide-react";
import type { AgentRow } from "@/hooks/useAgentNetwork";

interface Props {
  agent: AgentRow | null;
  open: boolean;
  onClose: () => void;
  onStatusToggle?: (id: string, status: string) => void;
  onUpdateAgent?: (id: string, fields: Partial<AgentRow>) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  orchestrator: Brain, repair_quote: Wrench, parts_scraper: Search,
  follow_up: Clock, scheduling: Calendar, communications: MessageSquare,
  email: Mail, sales_docs: FileText, invoicing: DollarSign,
};

export function AgentNodeDetail({ agent, open, onClose, onStatusToggle, onUpdateAgent }: Props) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  if (!agent) return null;

  const isActive = agent.status === "active";
  const Icon = ICON_MAP[agent.name] || Bot;
  const isAnnotation = agent.type === "annotation";

  const saveDescription = () => {
    onUpdateAgent?.(agent.id, { description: descDraft });
    setEditingDesc(false);
  };

  const saveNotes = () => {
    onUpdateAgent?.(agent.id, { notes: notesDraft });
    setEditingNotes(false);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[400px] sm:w-[460px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-base">{agent.label}</SheetTitle>
              <p className="text-[10px] text-muted-foreground font-mono">{agent.name}</p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 mt-5">
          {/* Status Toggle */}
          {!isAnnotation && (
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2.5">
              <div>
                <Label className="text-xs font-medium">Status</Label>
                <p className="text-[10px] text-muted-foreground capitalize">{agent.status}</p>
              </div>
              {agent.status !== "planned" && (
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) =>
                    onStatusToggle?.(agent.id, checked ? "active" : "disabled")
                  }
                />
              )}
              {agent.status === "planned" && (
                <Badge variant="outline" className="text-[10px]">Planned</Badge>
              )}
            </div>
          )}

          <Separator />

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              {!isAnnotation && (
                <Button
                  variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                  onClick={() => { setDescDraft(agent.description); setEditingDesc(!editingDesc); }}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <Textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="text-sm min-h-[80px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveDescription}>
                    <Save className="h-3 w-3" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDesc(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-relaxed">{agent.description}</p>
            )}
          </div>

          {/* Edge Function */}
          {agent.edge_function && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Server className="h-3 w-3" /> Edge Function
              </Label>
              <code className="block text-sm mt-1.5 bg-muted px-3 py-1.5 rounded-md font-mono text-primary">
                {agent.edge_function}
              </code>
            </div>
          )}

          {/* Tools */}
          {agent.tools && agent.tools.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                <Wrench className="h-3 w-3" /> Tools ({agent.tools.length})
              </Label>
              <div className="space-y-1">
                {agent.tools.map((t) => (
                  <div key={t} className="flex items-center gap-2 bg-muted/50 rounded px-2.5 py-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <code className="text-[11px] font-mono flex-1">{t}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Triggers */}
          {agent.triggers && agent.triggers.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                <Zap className="h-3 w-3" /> Triggers
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {agent.triggers.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes (for annotations or general notes) */}
          {(isAnnotation || agent.notes) && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Button
                    variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                    onClick={() => { setNotesDraft(agent.notes || ""); setEditingNotes(!editingNotes); }}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      className="text-sm min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={saveNotes}>
                        <Save className="h-3 w-3" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{agent.notes || "No notes."}</p>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Quick Links */}
          <div className="space-y-2">
            {agent.name === "orchestrator" && (
              <Link to="/agent-training">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                  <ExternalLink className="h-3 w-3" /> Edit in Agent Training
                </Button>
              </Link>
            )}
            <Link to="/agent-pipeline">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full mt-2">
                <ExternalLink className="h-3 w-3" /> View Pipeline
              </Button>
            </Link>
          </div>

          {/* Metadata */}
          <div className="text-[10px] text-muted-foreground space-y-0.5 pt-2">
            <p>ID: <span className="font-mono">{agent.id.slice(0, 8)}…</span></p>
            <p>Created: {new Date(agent.created_at).toLocaleDateString()}</p>
            <p>Updated: {new Date(agent.updated_at).toLocaleDateString()}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
