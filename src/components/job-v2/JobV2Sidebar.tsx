import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, Plus, ClipboardList, Tag, Lock, Paperclip, Megaphone, Home, ListChecks } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { JobPhotosGrid } from "@/components/job/JobPhotosGrid";
import { PrivateNotesPanel } from "@/components/customer-v2/main/PrivateNotesPanel";

function SidebarCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  action,
  count,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-left flex-1 min-w-0">
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide truncate">
              {title}
              {count !== undefined && <span className="ml-1 text-muted-foreground">({count})</span>}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 ml-auto transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
          {action && <div className="ml-2 shrink-0">{action}</div>}
        </div>
        <CollapsibleContent>
          <div>{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

interface Props {
  job: any;
  jobId: string;
  customerId?: string | null;
  customerLeadSource?: string | null;
}

export function JobV2Sidebar({ job, jobId, customerId, customerLeadSource }: Props) {
  const tags: string[] = job?.tags || [];

  return (
    <div className="space-y-3">
      <SidebarCard
        title="Checklists"
        icon={ListChecks}
        action={<Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>}
      >
        <ul className="text-sm divide-y">
          <li className="px-3 py-2 hover:bg-accent/40 cursor-pointer">New System Install Checklist</li>
          <li className="px-3 py-2 hover:bg-accent/40 cursor-pointer">QC Post-Install Checklist</li>
        </ul>
      </SidebarCard>

      <SidebarCard
        title="Fields"
        icon={ClipboardList}
        action={<Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>}
      >
        <p className="px-3 py-3 text-xs text-muted-foreground">No custom fields</p>
      </SidebarCard>

      <SidebarCard
        title="Job tags"
        icon={Tag}
        count={tags.length}
        action={<Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>}
      >
        {tags.length > 0 ? (
          <div className="px-3 py-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
            ))}
          </div>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">No tags</p>
        )}
      </SidebarCard>

      <SidebarCard title="Private notes" icon={Lock} defaultOpen={false}>
        {customerId ? (
          <div className="p-2">
            <PrivateNotesPanel customerId={customerId} />
          </div>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">No customer linked</p>
        )}
      </SidebarCard>

      <SidebarCard
        title="Attachments"
        icon={Paperclip}
        defaultOpen={false}
        action={<Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>}
      >
        <JobPhotosGrid jobId={jobId} />
      </SidebarCard>

      <SidebarCard
        title="Lead source"
        icon={Megaphone}
        action={<Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="h-3.5 w-3.5" /></Button>}
      >
        <p className="px-3 py-3 text-sm">{customerLeadSource || <span className="text-muted-foreground">Not set</span>}</p>
      </SidebarCard>

      <SidebarCard title="Property profile" icon={Home} defaultOpen={false}>
        <p className="px-3 py-3 text-xs text-muted-foreground">See property card at top of customer panel.</p>
      </SidebarCard>
    </div>
  );
}
