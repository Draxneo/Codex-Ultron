import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarX, Package, MessageSquare, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBacklogJobs } from "@/hooks/useJobs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLifecycleInfo } from "@/lib/jobLifecycle";
import { NewJobDialog } from "@/components/NewJobDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const cardBgColors: Record<string, string> = {
  install: "bg-card border border-primary/25 shadow-[inset_3px_0_0_hsl(var(--primary))]",
  service: "bg-card border border-[hsl(var(--today))]/25 shadow-[inset_3px_0_0_hsl(var(--today))]",
  maintenance: "bg-card border border-[hsl(var(--complete))]/25 shadow-[inset_3px_0_0_hsl(var(--complete))]",
  phone_call: "bg-card border border-sky-300/25 shadow-[inset_3px_0_0_hsl(199_89%_48%)]",
  estimate: "bg-card border border-purple-300/30 shadow-[inset_3px_0_0_rgb(147,51,234)]",
};

const cardSolidColors: Record<string, string> = {
  install: "bg-primary text-primary-foreground",
  service: "bg-[hsl(var(--today))] text-white",
  maintenance: "bg-[hsl(var(--complete))] text-white",
  phone_call: "bg-sky-500 text-white",
  estimate: "bg-purple-600 text-white",
};

function JobCard({ job, navigate }: { job: any; navigate: (path: string) => void }) {
  return (
    <button
      key={job.id}
      onClick={() => navigate(`/jobs/${job.id}`)}
      className={cn(
        "w-full text-left rounded-lg p-3 transition-colors hover:shadow-md",
        cardBgColors[job.job_type || "service"] || "bg-card border"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
            cardSolidColors[job.job_type || "service"]
          )}
        >
          {job.job_type === "install" ? "INST" : job.job_type === "maintenance" ? "MAINT" : job.job_type === "phone_call" ? "📞 CALL" : job.job_type === "estimate" ? "EST" : "SERV"}
        </span>
        {(job as any).job_number || job.hcp_job_number ? (
          <span className="text-xs text-muted-foreground font-semibold">
            #{(job as any).job_number || job.hcp_job_number}
          </span>
        ) : null}
        {job.assigned_to && (
          <span className="text-xs text-muted-foreground ml-auto">{job.assigned_to}</span>
        )}
      </div>
      <div className="text-sm font-semibold text-foreground">{job.customer_name || "Unknown"}</div>
      {job.address && (
        <div className="text-xs text-muted-foreground mt-0.5">{job.address}</div>
      )}
      {(job as any).follow_up_reason && (
        <div className="text-xs text-muted-foreground mt-0.5 italic">
          {(job as any).follow_up_reason}
        </div>
      )}
      {(() => {
        const lifecycle = getLifecycleInfo(job);
        return !lifecycle.isComplete ? (
          <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-lg font-bold text-[11px] bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] shadow-sm">
            {lifecycle.label}
          </span>
        ) : null;
      })()}
    </button>
  );
}

interface BucketSectionProps {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  jobs: any[];
  navigate: (path: string) => void;
  defaultOpen?: boolean;
}

function BucketSection({ title, icon: Icon, iconColor, jobs, navigate, defaultOpen = true }: BucketSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full mb-2 group">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <Icon className={cn("h-4 w-4", iconColor)} />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          <Badge variant="secondary" className="text-xs">{jobs.length}</Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground italic mb-4">None</p>
        ) : (
          <div className="grid gap-2 mb-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} navigate={navigate} />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

const UnscheduledJobs = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: buckets, isLoading } = useBacklogJobs();
  const [newJobOpen, setNewJobOpen] = useState(false);

  const totalCount = (buckets?.readyToSchedule.length || 0) + (buckets?.waitingOnParts.length || 0) + (buckets?.followUp.length || 0);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {!isMobile && <AppHeader />}
      <main className="flex-1 flex flex-col min-h-0 overflow-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Job Backlog</h1>
          <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
          <Button size="sm" className="ml-auto text-xs" onClick={() => setNewJobOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New Job
          </Button>
        </div>

        {isLoading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && buckets && (
          <div className="p-4 max-w-3xl mx-auto w-full space-y-6">
            <BucketSection
              title="Ready to Schedule"
              icon={CalendarX}
              iconColor="text-warm"
              jobs={buckets.readyToSchedule}
              navigate={navigate}
            />
            <BucketSection
              title="Waiting on Parts"
              icon={Package}
              iconColor="text-orange-600"
              jobs={buckets.waitingOnParts}
              navigate={navigate}
              defaultOpen={buckets.waitingOnParts.length > 0}
            />
            <BucketSection
              title="Follow-Up"
              icon={MessageSquare}
              iconColor="text-sky-500"
              jobs={buckets.followUp}
              navigate={navigate}
              defaultOpen={buckets.followUp.length > 0}
            />
          </div>
        )}
      </main>
      <NewJobDialog open={newJobOpen} onOpenChange={setNewJobOpen} />
    </div>
  );
};

export default UnscheduledJobs;
