import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Mail, LayoutList, LayoutGrid, ArrowDownAZ, Clock, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCustomersPaginated } from "@/hooks/useCustomersPaginated";
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

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
const PAGE_SIZE = 50;

export default function Customers() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"card" | "table">("table");
  const [sortMode, setSortMode] = useState<"recent" | "az">("recent");
  const [page, setPage] = useState(0);
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: activeJobCustomers } = useActiveJobCustomerIds();

  const { data: result, isLoading } = useCustomersPaginated({
    search: debouncedSearch,
    sortBy: sortMode,
    page,
    pageSize: PAGE_SIZE,
    letter: sortMode === "az" ? letterFilter : null,
  });

  const customers = result?.customers || [];
  const totalCount = result?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

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
      setSortMode(v as "recent" | "az");
      setPage(0);
      if (v === "recent") setLetterFilter(null);
    }
  };

  const goToCustomer = (id: string) => navigate(`/customers/${id}`);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {!isMobile && <AppHeader />}
      <main className="flex-1 overflow-hidden flex">
        <ModuleWorkbench
          title="Customers"
          eyebrow="Customer workspace"
          description="Find customers, start work, and review recent activity."
          icon={<Users className="h-4.5 w-4.5" />}
          primaryAction={
            <Button size="sm" className="text-xs bg-[hsl(var(--sky))] text-white hover:bg-[hsl(var(--sky))]/90" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Customer
            </Button>
          }
          search={
            <div className="relative w-full min-w-[220px] max-w-sm sm:w-80">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={search}
                onChange={e => handleSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          }
          filters={
            <ToggleGroup type="single" value={sortMode} onValueChange={handleSortChange} className="hidden sm:flex">
              <ToggleGroupItem value="recent" aria-label="Sort by recent jobs" size="sm" title="Recent Jobs">
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
              {letterFilter && ` · ${letterFilter}`}
            </span>
          }
          contentClassName="p-4"
        >
          {search === "__legacy_toolbar__" && (
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <div className="flex items-center gap-2">
              <Button size="sm" className="text-xs bg-[hsl(var(--sky))] text-white hover:bg-[hsl(var(--sky))]/90" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Customer
              </Button>
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ToggleGroup type="single" value={sortMode} onValueChange={handleSortChange} className="hidden sm:flex">
                <ToggleGroupItem value="recent" aria-label="Sort by recent jobs" size="sm" title="Recent Jobs">
                  <Clock className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="az" aria-label="Sort A-Z" size="sm" title="A–Z">
                  <ArrowDownAZ className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" value={view} onValueChange={v => v && setView(v as "card" | "table")} className="hidden sm:flex">
                <ToggleGroupItem value="table" aria-label="Table view" size="sm">
                  <LayoutList className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="card" aria-label="Card view" size="sm">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {totalCount.toLocaleString()} customer{totalCount !== 1 ? "s" : ""}
                {letterFilter && ` · ${letterFilter}`}
              </span>
            </div>
          </div>
          )}

          <div ref={scrollRef}>
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded mb-1" />
            ))}

            {!isLoading && customers.length === 0 && (
              <EmptyState
                icon={Users}
                title="No customers found"
                description={search ? "Try adjusting your search terms." : "Add your first customer to get started."}
                actionLabel={!search ? "Add Customer" : undefined}
                onAction={!search ? () => setDialogOpen(true) : undefined}
              />
            )}

            {!isLoading && customers.length > 0 && view === "table" && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Phone</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead className="hidden lg:table-cell">City</TableHead>
                      <TableHead className="text-right">Jobs</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Last Job</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map(c => {
                      const e = c.enrichment;
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
                            ) : "—"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell py-2 text-sm text-muted-foreground">
                            {c.email || "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell py-2 text-sm text-muted-foreground">
                            {c.city || "—"}
                          </TableCell>
                          <TableCell className="text-right py-2 text-sm">
                            <span className="inline-flex items-center gap-1.5">
                              {activeJobCustomers?.has(c.id) && (
                                <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse" title="Active job" />
                              )}
                              {e.job_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell py-2 text-xs text-muted-foreground">
                            {e.last_job_date ? format(new Date(e.last_job_date), "MMM d, yyyy") : "—"}
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
                  return (
                    <Card
                      key={c.id}
                      className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => goToCustomer(c.id)}
                    >
                      <CustomerCard customer={c} enrichment={e} variant="list" showBadgeDetail>
                        <div className="text-xs text-muted-foreground ml-auto shrink-0">
                          {e.job_count} job{e.job_count !== 1 ? "s" : ""}
                        </div>
                      </CustomerCard>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground ml-[42px]">
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
