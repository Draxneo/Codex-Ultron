import { useAgentLearnings, useDeleteLearning } from "@/hooks/useAgentLearnings";
import { Loader2, Trash2, Brain, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function LearningsLog() {
  const { data: learnings, isLoading } = useAgentLearnings();
  const deleteMut = useDeleteLearning();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading learnings...
      </div>
    );
  }

  if (!learnings || learnings.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Brain className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
        <p className="text-sm text-muted-foreground">No learnings yet</p>
        <p className="text-xs text-muted-foreground">
          When you correct JARVIS, it will save the lesson here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Learning Log</h2>
        <Badge variant="secondary" className="text-xs">{learnings.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Rules JARVIS has learned from your corrections. These feed into Instructions automatically.
      </p>
      <div className="space-y-2">
        {learnings.map((l) => (
          <div key={l.id} className="border rounded-lg p-3 space-y-1.5 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Trigger:</span> {l.trigger}
                </p>
                <p className="text-xs mt-1">
                  <span className="font-medium text-primary">Learned:</span> {l.correction}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {l.instruction_slug && (
                    <Badge variant="outline" className="text-[10px]">
                      → {l.instruction_slug}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(l.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMut.mutate(l.id)}
                disabled={deleteMut.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
