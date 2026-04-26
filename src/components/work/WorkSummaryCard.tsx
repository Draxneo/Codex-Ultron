import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface WorkSummaryCardProps {
  title?: string;
  description?: string | null;
  emptyText?: string;
}

export function WorkSummaryCard({
  title = "Summary of work",
  description,
  emptyText = "No summary added yet.",
}: WorkSummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <Button variant="ghost" size="sm" className="h-7">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="whitespace-pre-line text-sm">
        {description || (
          <span className="italic text-muted-foreground">{emptyText}</span>
        )}
      </p>
    </Card>
  );
}
