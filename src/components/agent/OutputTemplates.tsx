import { MessageSquare, ArrowRight, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import SmsTemplateEditor from "@/components/SmsTemplateEditor";

export function OutputTemplates() {
  return (
    <div className="space-y-4">
      {/* Sequence Builder banner */}
      <Link to="/sequence-builder">
        <div className="flex items-center justify-between rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors cursor-pointer">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Build automated flows using these templates</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            Open Sequence Builder <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Link>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="text-sm font-semibold">SMS Templates</span>
        </div>
        <div className="p-4">
          <SmsTemplateEditor />
        </div>
      </div>
    </div>
  );
}
