import { MessageSquare } from "lucide-react";
import SmsTemplateEditor from "@/components/SmsTemplateEditor";

export function OutputTemplates() {
  return (
    <div className="space-y-4">
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
