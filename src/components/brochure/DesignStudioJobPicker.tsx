import { useState, useEffect, useRef } from "react";
import { Search, X, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface SelectedJob {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  scheduled_date: string | null;
  customer_id: string | null;
}

interface Props {
  selectedJob: SelectedJob | null;
  onSelect: (job: SelectedJob | null) => void;
}

export default function DesignStudioJobPicker({ selectedJob, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SelectedJob[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from("jobs")
        .select("id, job_number, customer_name, job_type, scheduled_date, customer_id")
        .or(`customer_name.ilike.%${query}%,job_number.ilike.%${query}%,hcp_job_number.ilike.%${query}%`)
        .order("scheduled_date", { ascending: false })
        .limit(10);
      setResults((data || []) as SelectedJob[]);
      setLoading(false);
      setOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedJob) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
        <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">
          {selectedJob.customer_name} — #{selectedJob.job_number}
        </span>
        <Badge variant="outline" className="text-[10px] shrink-0">{selectedJob.job_type}</Badge>
        <button onClick={() => onSelect(null)} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search job by customer name or job number…"
          className="pl-8 h-8 text-xs w-72"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 w-80 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {results.map((job) => (
            <button
              key={job.id}
              onClick={() => { onSelect(job); setOpen(false); setQuery(""); }}
              className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-2 text-xs border-b last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{job.customer_name}</p>
                <p className="text-muted-foreground">#{job.job_number} · {job.job_type} · {job.scheduled_date || "No date"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-1 left-0 w-80 bg-popover border border-border rounded-lg shadow-lg z-50 px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">No jobs found for "{query}"</p>
        </div>
      )}
    </div>
  );
}
