import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent/40 transition-colors">
          <span className="text-sm font-semibold">{title}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 text-sm text-muted-foreground border-t">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function JobV2CollapsibleSections({ job }: { job: any }) {
  return (
    <div className="space-y-3">
      <Section title="Commissions">
        <p className="py-2">No commission rules configured for this job.</p>
      </Section>
      <Section title="Job inputs">
        <div className="py-2 space-y-1">
          <div className="flex justify-between"><span>Job type</span><span className="text-foreground">{job?.job_type || "—"}</span></div>
          <div className="flex justify-between"><span>System type</span><span className="text-foreground">{job?.system_type || "—"}</span></div>
          <div className="flex justify-between"><span>Tonnage</span><span className="text-foreground">{job?.tonnage ? `${job.tonnage} ton` : "—"}</span></div>
          <div className="flex justify-between"><span>Brand</span><span className="text-foreground">{job?.brand || "—"}</span></div>
        </div>
      </Section>
    </div>
  );
}
