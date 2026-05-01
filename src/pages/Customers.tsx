import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Search, Plus, Mail, LayoutList, LayoutGrid, ArrowDownAZ, Clock, Users, ChevronLeft, ChevronRight, MessageSquare, PhoneCall, Briefcase, CalendarClock, MapPin } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCustomersPaginated, type CustomerDirectorySort, type EnrichedCustomer } from "@/hooks/useCustomersPaginated";
import { useActiveJobCustomerIds } from "@/hooks/useCustomerHistory";
import { CustomerCard } from "@/components/CustomerCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { NewCustomerDialog } from "@/components/NewCustomerDialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleWorkbench } from "@/components/workbench/ModuleWorkbench";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";
import { formatRelativeDate } from "@/lib/formatters";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
const PAGE_SIZE = 50;

function lastContactLabel(customer: EnrichedCustomer) {
  const at = customer.enrichment.last_contact_at;
  if (!at) return "No recent contact";
  const direction = customer.enrichment.last_contact_direction;
  const directionLabel = direction ? direction.charAt(0).toUpperCase() + direction.slice(1) : null;
  return [directionLabel, formatRelativeDate(at)].filter(Boolean).join(" - ");
}

function lastContactTone(customer: EnrichedCustomer) {
  if (customer.enrichment.last_contact_type === "sms") return "text-sky-600 bg-sky-500/10 dark:text-sky-300";
  if (customer.enrichment.last_contact_type === "call") return "text-emerald-600 bg-emerald-500/10 dark:text-emerald-300";
  return "text-muted-foreground bg-muted";
}

export default function Customers() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"card" | "table">("table");
  const [sortMode, setSortMode] = useState<CustomerDirectorySort>("recent_contact");
  const [page, setPage] = useState(0);
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: activeJobCustomers, isError: activeJobsError, error: activeJobsQueryError } = useActiveJobCustomerIds();

  const { data: result, isLoading, isError: customersError, error: customersQueryError } = useCustomersPaginated({
    search: debouncedSearch,
    sortBy: sortMode,
    page,
    pageSize: PAGE_SIZE,
    letter: sortMode === "az" ? letterFilter : null,
  });

  const customers = result?.customers || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const customerDataIssues = [
    customersError ? `customer list (${errorMessage(customersQueryError)})` : null,
    activeJobsError ? `active job markers (${errorMessage(activeJobsQueryError)})` : null,
  ].filter(Boolean);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(0);
    clearTimeout((window as any).__custSearchTimer);
    (window as any).__custSearchTimer = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const handleCustomerCreated = (customer: { id: string }) => {
    setDialogOpen(false);
    navigate(`/customers/${customer.id}`);
  };

  const handleLetterClick = (letter: string) => {
    if (letterFilter === letter) {
      setLetterFilter(null);
    } else {
      setLetterFilter(letter);
      setSortMode("az");
    }
    setPage(0);
  };

  const handleSortChange = (v: string) => {
    if (v) {
      setSortMode(v as CustomerDirectorySort);
      setPage(0);
      if (v !== "az") setLetterFilter(null);
    }
  };

  const goToCustomer = (id: string) => navigate(`/customers/${id}`);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {!isMobile && (
        <AppHeader
          searchValue={search}
          onSearchChange={handleSearch}
          searchPlaceholder="Search customers"
        />
      )}
      <main className="flex-1 overflow-hidden flex">
        <ModuleWorkbench
          title="Customer HQ"
          eyebrow="Customer history"
          description="Find customers by recent call, recent text, recent job, name, address, email, or phone number."
          icon={<Users className="h-4.5 w-4.5" />}
          primaryAction={isMobile ? (
            <Button size="sm" className="text-xs bg-[hsl(var(--sky))] text-white hover:bg-[hsl(var(--sky))]/90" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Customer
            </Button>
          ) : undefined}
          search={isMobile ? (
            <div className="relative w-full min-w-[220px] max-w-sm sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, phone, address, email..."
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          ) : undefined}
          filters={
            <ToggleGroup type="single" value={sortMode} onValueChange={handleSortChange} className="hidden sm:flex">
              <ToggleGroupItem value="recent_contact" aria-label="Sort by recent contact" size="sm" title="Recent call or text">
                <PhoneCall className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="recent_job" aria-label="Sort by recent jobs" size="sm" title="Recent jobs">
                <Clock className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="az" aria-label="Sort A-Z" size="sm" title="A-Z">
                <ArrowDownAZ className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          }
          viewControls={
            <ToggleGroup type="single" value={view} onValueChange={v => v && setView(v as "card" | "table")} className="hidden sm:flex">
              <ToggleGroupItem value="table" aria-label="Table view" size="sm">
                <LayoutList className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="card" aria-label="Card view" size="sm">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          }
          meta={
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {totalCount.toLocaleString()} customer{totalCount !== 1 ? "s" : ""}
              {letterFilter && ` - ${letterFilter}`}
            </span>
          }
          contentClassName="p-4"
        >

          <div ref={scrollRef}>
            {customerDataIssues.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Customer HQ is open, but part of the customer picture did not load: {customerDataIssues.join(", ")}. Refresh before relying on this list.
                  </p>
                </div>
              </div>
            )}
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded mb-1" />
            ))}

            {!isLoading && customers.length === 0 && (
              <EmptyState
                icon={Users}
                title="No customers found"
                description={search ? "Try adjusting your search terms." : "Add your first customer to get started."}
                actionLabel={!search && isMobile ? "Add Customer" : undefined}
                onAction={!search && isMobile ? () => setDialogOpen(true) : undefined}
              />
            )}

            {!isLoading && customers.length > 0 && view === "table" && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell" aria-label="Phone" title="Phone">
                        <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="hidden md:table-cell" aria-label="Email" title="Email">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="hidden lg:table-cell" aria-label="City" title="City">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="hidden xl:table-cell" aria-label="Last contact" title="Last contact">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="text-right" aria-label="Jobs" title="Jobs">
                        <Briefcase className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                      <TableHead className="text-right hidden sm:table-cell" aria-label="Last job" title="Last job">
                        <CalendarClock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map(c => {
                      const e = c.enrichment;
                      const hasActiveJob = activeJobCustomers?.has(c.id);
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => goToCustomer(c.id)}
                        >
                          <TableCell className="font-medium py-2">
                            <CustomerCard customer={c} enrichment={e} variant="list" />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
                            {(c.phone || c.mobile_phone) ? (
                              <div className="flex items-center gap-1">
                                <ClickToCall phone={(c.phone || c.mobile_phone)!} contactName={[c.first_name, c.last_name].filter(Boolean).join(" ")} iconClassName="h-3 w-3" />
                                <SmsButton phone={(c.phone || c.mobile_phone)!} iconClassName="h-3 w-3" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground/40">-</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell py-2 text-sm text-muted-foreground">
                            {c.email || <span className="text-muted-foreground/40">-</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell py-2 text-sm text-muted-foreground">
                            {c.city || <span className="text-muted-foreground/40">-</span>}
                          </TableCell>
                          <TableCell className="hidden xl:table-cell py-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full", lastContactTone(c))}>
                                {c.enrichment.last_contact_type === "sms" ? (
                                  <MessageSquare className="h-3.5 w-3.5" />
                                ) : c.enrichment.last_contact_type === "call" ? (
                                  <PhoneCall className="h-3.5 w-3.5" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5" />
                                )}
                              </span>
                              <span>{lastContactLabel(c)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right py-2 text-sm">
                            <span
                              className={cn(
                                "inline-flex items-center justify-end gap-1.5",
                                hasActiveJob && "font-semibold text-emerald-700 dark:text-emerald-400"
                              )}
                              title={hasActiveJob ? "Active job" : "Job history"}
                            >
                              <Briefcase className={cn("h-3.5 w-3.5", hasActiveJob ? "animate-pulse text-emerald-600" : "text-muted-foreground/60")} />
                              <span>{e.job_count}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell py-2 text-xs text-muted-foreground">
                            {e.last_job_date ? format(new Date(e.last_job_date), "MMM d, yyyy") : <span className="text-muted-foreground/40">-</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {!isLoading && customers.length > 0 && view === "card" && (
              <div className="space-y-1">
                {customers.map(c => {
                  const e = c.enrichment;
                  const hasActiveJob = activeJobCustomers?.has(c.id);
                  return (
                    <Card
                      key={c.id}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => goToCustomer(c.id)}
                    >
                      <CustomerCard customer={c} enrichment={e} variant="list" showBadgeDetail>
                        <div
                          className={cn(
                            "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs text-muted-foreground",
                            hasActiveJob && "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400"
                          )}
                          title={hasActiveJob ? "Active job" : "Job history"}
                        >
                          <Briefcase className={cn("h-3.5 w-3.5", hasActiveJob ? "animate-pulse text-emerald-600" : "text-muted-foreground/60")} />
                          {e.job_count}
                        </div>
                      </CustomerCard>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground ml-[42px]">
                        {c.enrichment.last_contact_at && (
                          <span className="flex items-center gap-1">
                            <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full", lastContactTone(c))}>
                              {c.enrichment.last_contact_type === "sms" ? (
                                <MessageSquare className="h-3 w-3" />
                              ) : (
                                <PhoneCall className="h-3 w-3" />
                              )}
                            </span>
                            {lastContactLabel(c)}
                          </span>
                        )}
                        {!c.enrichment.last_contact_at && (
                          <span className="flex items-center gap-1 text-muted-foreground/70">
                            <span className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full", lastContactTone(c))}>
                              <Clock className="h-3 w-3" />
                            </span>
                            No recent contact
                          </span>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1">
                            <ClickToCall phone={c.phone} contactName={[c.first_name, c.last_name].filter(Boolean).join(" ")} className="text-xs text-muted-foreground" iconClassName="h-3 w-3" />
                            <SmsButton phone={c.phone} iconClassName="h-3 w-3" />
                          </div>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {!isLoading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 py-3">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(p => p - 1); scrollRef.current?.scrollTo(0, 0); }}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); scrollRef.current?.scrollTo(0, 0); }}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </ModuleWorkbench>

        {!isLoading && sortMode === "az" && (
          <div className="w-6 flex flex-col items-center justify-center py-2 bg-card border-l select-none shrink-0">
            {LETTERS.map(letter => (
              <button
                key={letter}
                onClick={() => handleLetterClick(letter)}
                className={cn(
                  "text-[10px] leading-tight py-[1px] w-full text-center transition-colors",
                  "text-foreground hover:text-primary hover:font-bold cursor-pointer",
                  letterFilter === letter && "text-primary font-bold bg-primary/10"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        )}
      </main>

      <NewCustomerDialog open={dialogOpen} onOpenChange={setDialogOpen} onCustomerCreated={handleCustomerCreated} />
    </div>
  );
}
