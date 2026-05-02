import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  HardHat,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type JobOption = {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  address: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  assigned_to: string | null;
  job_type: string | null;
  status: string | null;
  description: string | null;
};

type SubcontractorLink = {
  id: string;
  job_id: string;
  token: string;
  subcontractor_name: string | null;
  subcontractor_phone: string | null;
  scope: string | null;
  equipment_summary: string | null;
  required_photo_slots: string[] | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  jobs?: {
    job_number: string | null;
    customer_name: string | null;
    address: string | null;
    scheduled_date: string | null;
  } | null;
};

const PHOTO_SLOTS = [
  { id: "arrival", label: "Arrival" },
  { id: "before", label: "Before" },
  { id: "equipment", label: "Equipment" },
  { id: "after", label: "After" },
  { id: "final", label: "Final" },
];

function formatDate(date?: string | null) {
  if (!date) return "No date";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start && !end) return "No time window";
  return [start, end].filter(Boolean).join(" - ");
}

function publicUrlForToken(token: string) {
  return `${window.location.origin}/subcontractor/${token}`;
}

export function SubcontractorLinkManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [subName, setSubName] = useState("");
  const [subPhone, setSubPhone] = useState("");
  const [scope, setScope] = useState("");
  const [equipment, setEquipment] = useState("");
  const [expiresDays, setExpiresDays] = useState(7);
  const [slots, setSlots] = useState<string[]>(["before", "after"]);
  const [previewToken, setPreviewToken] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["admin-subcontractor-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, job_number, customer_name, address, scheduled_date, arrival_start, arrival_end, assigned_to, job_type, status, description")
        .order("scheduled_date", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as JobOption[];
    },
  });

  const linksQuery = useQuery({
    queryKey: ["admin-subcontractor-links"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("subcontractor_job_links")
        .select(`
          id,
          job_id,
          token,
          subcontractor_name,
          subcontractor_phone,
          scope,
          equipment_summary,
          required_photo_slots,
          expires_at,
          completed_at,
          created_at,
          jobs(job_number, customer_name, address, scheduled_date)
        `)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as SubcontractorLink[];
    },
    retry: 1,
  });

  const jobs = jobsQuery.data || [];
  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return jobs.slice(0, 25);
    return jobs
      .filter((job) =>
        [
          job.job_number,
          job.customer_name,
          job.address,
          job.assigned_to,
          job.job_type,
          job.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      )
      .slice(0, 25);
  }, [jobs, search]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;

  const createLink = useMutation({
    mutationFn: async () => {
      if (!selectedJobId) throw new Error("Pick a job first.");
      const { data, error } = await (supabase as any).rpc("create_subcontractor_job_link", {
        p_job_id: selectedJobId,
        p_subcontractor_name: subName.trim() || null,
        p_subcontractor_phone: subPhone.trim() || null,
        p_scope: scope.trim() || null,
        p_equipment_summary: equipment.trim() || null,
        p_required_photo_slots: slots.length ? slots : ["before", "after"],
        p_expires_days: expiresDays,
      });
      if (error) throw error;
      return data as { token: string; path: string; expires_at: string };
    },
    onSuccess: async (data) => {
      setPreviewToken(data.token);
      await queryClient.invalidateQueries({ queryKey: ["admin-subcontractor-links"] });
      toast.success("Subcontractor link created");
    },
    onError: (error: any) => {
      toast.error("Could not create link", {
        description: error?.message || "Check the migration and try again.",
      });
    },
  });

  const handlePickJob = (job: JobOption) => {
    setSelectedJobId(job.id);
    if (!scope.trim()) {
      setScope(job.description || job.job_type || "");
    }
    setPreviewToken(null);
  };

  const previewUrl = previewToken ? publicUrlForToken(previewToken) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardHat className="h-5 w-5 text-orange-500" />
              Subcontractor Links
            </CardTitle>
            <CardDescription>
              Create a no-login job page for a subcontractor. They only see where to go, what to do, and where to upload photos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <Label>Find the job</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Search job, customer, address, or tech"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Expires after</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={expiresDays}
                  onChange={(event) => setExpiresDays(Math.max(1, Math.min(30, Number(event.target.value) || 7)))}
                />
              </div>
            </div>

            <div className="grid max-h-[360px] gap-2 overflow-auto rounded-xl border bg-muted/20 p-2">
              {jobsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading jobs
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No jobs match that search.</div>
              ) : (
                filteredJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => handlePickJob(job)}
                    className={cn(
                      "rounded-lg border bg-background p-3 text-left transition hover:border-orange-400",
                      selectedJobId === job.id && "border-orange-500 ring-2 ring-orange-500/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{job.customer_name || "Unnamed customer"}</p>
                          {job.job_number ? <Badge variant="secondary">#{job.job_number}</Badge> : null}
                          {job.status ? <Badge variant="outline">{job.status}</Badge> : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{job.address || "No address on job"}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p>{formatDate(job.scheduled_date)}</p>
                        <p>{formatWindow(job.arrival_start, job.arrival_end)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-orange-500" />
              Build The Work Link
            </CardTitle>
            <CardDescription>
              Keep it simple: destination, scope, equipment, and photos needed back at the office.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedJob ? (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-orange-500" />
                  <div>
                    <p className="font-semibold">{selectedJob.customer_name || "Selected job"}</p>
                    <p className="text-sm text-muted-foreground">{selectedJob.address || "No address on job"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Subcontractor name</Label>
                <Input value={subName} onChange={(event) => setSubName(event.target.value)} placeholder="Company or person" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={subPhone} onChange={(event) => setSubPhone(event.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>What they are doing</Label>
              <Textarea
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                placeholder="Example: Install 3-ton Carrier gas system in attic. Send before and after photos."
                className="min-h-28"
              />
            </div>

            <div className="space-y-2">
              <Label>Equipment / materials</Label>
              <Textarea
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
                placeholder="Example: Carrier 3-ton Performance gas system, horizontal attic, matching coil."
                className="min-h-20"
              />
            </div>

            <div className="space-y-2">
              <Label>Photos required</Label>
              <div className="grid gap-2 sm:grid-cols-5">
                {PHOTO_SLOTS.map((slot) => (
                  <label key={slot.id} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                    <Checkbox
                      checked={slots.includes(slot.id)}
                      onCheckedChange={(checked) => {
                        setSlots((current) =>
                          checked ? [...new Set([...current, slot.id])] : current.filter((value) => value !== slot.id)
                        );
                      }}
                    />
                    {slot.label}
                  </label>
                ))}
              </div>
            </div>

            <Button
              className="h-12 w-full gap-2 bg-orange-500 text-base font-bold text-white hover:bg-orange-600"
              onClick={() => createLink.mutate()}
              disabled={!selectedJobId || createLink.isPending}
            >
              {createLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Create Subcontractor Link
            </Button>

            {previewUrl ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Ready to send</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input readOnly value={previewUrl} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(previewUrl);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button className="gap-2" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-orange-500" />
                What The Sub Sees
              </CardTitle>
              <CardDescription>Preview the public page before you send the link.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                void linksQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <iframe title="Subcontractor preview" src={previewUrl} className="h-[680px] w-full rounded-xl border bg-slate-950" />
            ) : (
              <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-muted-foreground">
                Create or pick a recent link to preview the subcontractor page here.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent subcontractor links</CardTitle>
            <CardDescription>Quickly reopen, copy, or check whether the subcontractor marked the work complete.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {linksQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading links
              </div>
            ) : linksQuery.isError ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
                The subcontractor database is not live yet. Push the migration, then refresh this page.
              </div>
            ) : (linksQuery.data || []).length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">No subcontractor links yet.</div>
            ) : (
              (linksQuery.data || []).map((link) => {
                const url = publicUrlForToken(link.token);
                return (
                  <div key={link.id} className="rounded-xl border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{link.jobs?.customer_name || link.subcontractor_name || "Subcontractor job"}</p>
                          {link.jobs?.job_number ? <Badge variant="secondary">#{link.jobs.job_number}</Badge> : null}
                          {link.completed_at ? (
                            <Badge className="bg-emerald-500 text-white">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Complete
                            </Badge>
                          ) : (
                            <Badge variant="outline">Open</Badge>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{link.jobs?.address || link.scope || "No address shown"}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="outline" size="icon" onClick={() => setPreviewToken(link.token)}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={async () => {
                            await navigator.clipboard.writeText(url);
                            toast.success("Link copied");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

