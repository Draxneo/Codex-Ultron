import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Wrench, ClipboardList, User, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "job" | "estimate" | "customer";
  label: string;
  sublabel?: string;
  status?: string;
  date?: string;
}

const RECENT_KEY = "smart_search_recent";

function getRecent(): SearchResult[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch { return []; }
}

export function addToRecent(item: SearchResult) {
  const prev = getRecent().filter(r => r.id !== item.id);
  localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...prev].slice(0, 5)));
}

export function SmartSearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) setRecent(getRecent());
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const [jobsRes, estRes, custRes] = await Promise.all([
        supabase.from("jobs")
          .select("id, job_number, customer_name, status, scheduled_date, address")
          .or(`job_number.ilike.%${q}%,customer_name.ilike.%${q}%,address.ilike.%${q}%`)
          .order("scheduled_date", { ascending: false })
          .limit(5),
        supabase.from("estimates")
          .select("id, estimate_number, customer_name, status, scheduled_date, address")
          .or(`estimate_number.ilike.%${q}%,customer_name.ilike.%${q}%,address.ilike.%${q}%`)
          .order("scheduled_date", { ascending: false })
          .limit(5),
        supabase.from("customers")
          .select("id, first_name, last_name, phone, address")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5),
      ]);

      const mapped: SearchResult[] = [
        ...(jobsRes.data || []).map(j => ({
          id: j.id, type: "job" as const,
          label: `#${j.job_number || "—"} ${j.customer_name || ""}`,
          sublabel: j.address || undefined,
          status: j.status || undefined,
          date: j.scheduled_date || undefined,
        })),
        ...(estRes.data || []).map(e => ({
          id: e.id, type: "estimate" as const,
          label: `EST #${e.estimate_number || "—"} ${e.customer_name || ""}`,
          sublabel: e.address || undefined,
          status: e.status || undefined,
          date: e.scheduled_date || undefined,
        })),
        ...(custRes.data || []).map(c => ({
          id: c.id, type: "customer" as const,
          label: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
          sublabel: c.address || c.phone || undefined,
        })),
      ];
      setResults(mapped);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const go = (item: SearchResult) => {
    addToRecent(item);
    setOpen(false);
    setQuery("");
    if (item.type === "job") navigate(`/jobs/${item.id}`);
    else if (item.type === "estimate") navigate(`/estimates/${item.id}`);
    else navigate(`/customers/${item.id}`);
  };

  const icon = (type: string) => {
    if (type === "job") return <Wrench className="h-4 w-4 text-primary shrink-0" />;
    if (type === "estimate") return <ClipboardList className="h-4 w-4 text-amber-500 shrink-0" />;
    return <User className="h-4 w-4 text-emerald-500 shrink-0" />;
  };

  const displayItems = query.length >= 2 ? results : [];
  const showRecent = query.length < 2 && recent.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search jobs, estimates, customers..."
            className="flex h-9 w-64 rounded-md border border-border/50 bg-muted/50 px-3 py-2 pl-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-80 p-0 max-h-96 overflow-y-auto"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={e => e.preventDefault()}
        onInteractOutside={e => {
          // Don't close if clicking inside the anchor/input
          const target = e.target as HTMLElement;
          if (target.closest('[data-radix-popper-content-wrapper]') || target.tagName === 'INPUT') {
            e.preventDefault();
          }
        }}
      >
        {showRecent && (
          <div className="p-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Recently Viewed
            </p>
            {recent.map(item => (
              <button key={item.id} onClick={() => go(item)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted/60 transition-colors">
                {icon(item.type)}
                <span className="text-sm truncate flex-1">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        {loading && <p className="text-xs text-muted-foreground p-3">Searching...</p>}
        {!loading && displayItems.length > 0 && (
          <div className="p-2 space-y-0.5">
            {displayItems.map(item => (
              <button key={`${item.type}-${item.id}`} onClick={() => go(item)}
                className="flex items-start gap-2 w-full px-2 py-2 rounded text-left hover:bg-muted/60 transition-colors">
                {icon(item.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{item.label}</span>
                    {item.status && <JobStatusBadge status={item.status} className="text-[8px]" />}
                  </div>
                  {item.sublabel && <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>}
                  {item.date && <p className="text-[10px] text-muted-foreground">{item.date}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        {!loading && query.length >= 2 && displayItems.length === 0 && (
          <p className="text-xs text-muted-foreground p-4 text-center">No results found</p>
        )}
        {!showRecent && query.length < 2 && !loading && (
          <p className="text-xs text-muted-foreground p-4 text-center">Type to search...</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
