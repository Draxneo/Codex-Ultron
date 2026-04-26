import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";
import { ExternalLink, Brain, Wrench, Cpu, BookOpen, Zap } from "lucide-react";
import { DebouncedTextarea } from "@/components/ui/debounced-inputs";
import { useAgentInstructions, useUpdateInstruction } from "@/hooks/useAgentInstructions";
import { useAgentTools, useToggleAgentTool } from "@/hooks/useAgentTools";

interface Props {
  stage: { id: string; label: string; detail: string; count?: number; link?: string } | null;
  open: boolean;
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  instructions: BookOpen,
  tools: Wrench,
  model: Cpu,
  learnings: Brain,
};

export function PipelineNodeDetail({ stage, open, onClose }: Props) {
  if (!stage) return null;

  const Icon = ICON_MAP[stage.id] || Zap;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[380px] sm:w-[460px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <SheetTitle className="text-base">{stage.label}</SheetTitle>
          </div>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {stage.count !== undefined && <Badge variant="secondary">{stage.count} active</Badge>}
          <p className="text-sm text-muted-foreground">{stage.detail}</p>

          {stage.id === "instructions" && <InstructionsSection />}
          {stage.id === "tools" && <ToolsSection />}

          {stage.link && (
            <>
              <Separator />
              <Link to={stage.link}>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                  <ExternalLink className="h-3 w-3" /> Edit in Agent Training
                </Button>
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InstructionsSection() {
  const { data: instructions } = useAgentInstructions();
  const updateInstruction = useUpdateInstruction();

  if (!instructions?.length) return <p className="text-xs text-muted-foreground">No instructions configured.</p>;

  return (
    <div className="space-y-3">
      <Separator />
      <Label className="text-xs text-muted-foreground">Active Instructions</Label>
      {instructions.filter(i => i.is_active).slice(0, 5).map((inst) => (
        <div key={inst.id} className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{inst.label}</span>
            <Switch
              checked={inst.is_active ?? true}
              onCheckedChange={(checked) => updateInstruction.mutate({ id: inst.id, is_active: checked })}
            />
          </div>
          <DebouncedTextarea
            value={inst.content}
            onSave={(v) => updateInstruction.mutate({ id: inst.id, content: v })}
            className="text-xs min-h-[48px] bg-background"
          />
        </div>
      ))}
    </div>
  );
}

function ToolsSection() {
  const { data: tools } = useAgentTools();
  const toggleTool = useToggleAgentTool();

  if (!tools?.length) return <p className="text-xs text-muted-foreground">No tools configured.</p>;

  return (
    <div className="space-y-3">
      <Separator />
      <Label className="text-xs text-muted-foreground">Registered Tools</Label>
      {tools.slice(0, 8).map((tool) => (
        <div key={tool.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{tool.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
          </div>
          <Switch
            checked={tool.is_enabled ?? true}
            onCheckedChange={(checked) => toggleTool.mutate({ id: tool.id, is_enabled: checked })}
          />
        </div>
      ))}
    </div>
  );
}
