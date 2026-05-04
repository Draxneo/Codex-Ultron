/**
 * TechCustomers.tsx - Tech-focused customer context.
 *
 * Keeps the mobile CRM tab in the technician workspace instead of opening the
 * office Customer HQ. The page favors customers from today's and recent
 * assigned work, with a compact customer search for field context.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, parseISO, subDays } from "date-fns";
import { CalendarClock, ChevronRight, History, MapPin, Search, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { useEmployees } from "@/hooks/useEmployees";
import { useTechDashboardData, useTechDashboardRealtime } from "@/hooks/useTechDashboardData";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CLOSED_ESTIMATE_STATUS_FILTER, CLOSED_WORK_STATUS_FILTER } from "@/lib/appLifecycle";

type CustomerLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  hcp_customer_id: string | null;
};

type WorkContext = {
  key: string;
  source: "job" | "estimate";
  id: string;
  customer_id: string | null;
  hcp_customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  address: string | null;
  scheduled_date: string | null;
  arrival_start: string | null;
  label: string;
  status: string | null;
};

type CustomerContext = {
  customer: CustomerLite | null;
  fallbackId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  latestDate: string | null;
  contexts: WorkContext[];
};

const CUSTOMER_SELECT =
  "id, first_name, last_name, company, phone, mobile_phone, email, address, city, state, zip, hcp_customer_id";

function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

function customerName(customer?: CustomerLite | null) {
  if (!customer) return "";
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || "Unknown customer";
}

function customerAddress(customer?: CustomerLite | null) {
  if (!customer) return "";
  return [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ");
}

function normalizeSearch(raw: string) {
  return raw.trim().replace(/[%,]/g, "");
}

function workDateValue(ctx: WorkContext) {
  return ctx.arrival_start || (ctx.scheduled_date ? `${ctx.scheduled_date}T00:00:00` : "");
}

function mergeCustomerContexts(work: WorkContext[], customers: CustomerLite[]) {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const byHcpId = new Map(
    customers
      .filter((customer) => customer.hcp_customer_id)
      .map((customer) => [customer.hcp_customer_id as string, customer]),
  );
  const merged = new Map<string, CustomerContext>();

  for (const item of work) {
    const customer = item.customer_id ? byId.get(item.customer_id) : item.hcp_customer_id ? byHcpId.get(item.hcp_customer_id) : null;
    const key = customer?.id || item.customer_id || item.hcp_customer_id || item.customer_phone || item.customer_name || item.key;
    const existing = merged.get(key);
    const nextContext = existing || {
      customer: customer || null,
      fallbackId: item.customer_id || null,
      name: customerName(customer) || item.customer_name || "Unknown customer",
      phone: customer?.mobile_phone || customer?.phone || item.customer_phone || null,
      email: customer?.email || item.customer_email || null,
      address: customerAddress(customer) || item.address || null,
      latestDate: item.scheduled_date,
      contexts: [],
    };

    nextContext.customer = nextContext.customer || customer || null;
    nextContext.fallbackId = nextContext.fallbackId || item.customer_id || null;
    nextContext.contexts.push(item);
    if (item.scheduled_date && (!nextContext.latestDate || item.scheduled_date > nextContext.latestDate)) {
      nextContext.latestDate = item.scheduled_date;
    }
    merged.set(key, nextContext);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aToday = a.contexts.some((ctx) => ctx.scheduled_date === todayKey());
    const bToday = b.contexts.some((ctx) => ctx.scheduled_date === todayKey());
    if (aToday !== bToday) return aToday ? -1 : 1;
    return (b.latestDate || "").localeCompare(a.latestDate || "");
  });
}

async function fetchCustomersForWork(work: WorkContext[]) {
  const ids = Array.from(new Set(work.map((item) => item.customer_id).filter(Boolean))) as string[];
  const hcpIds = Array.from(new Set(work.map((item) => item.hcp_customer_id).filter(Boolean))) as string[];
  const customers: CustomerLite[] = [];

  if (ids.length > 0) {
    const { data, error } = await supabase.from("customers").select(CUSTOMER_SELECT).in("id", ids);
    if (error) throw error;
    customers.push(...((data || []) as CustomerLite[]));
  }

  if (hcpIds.length > 0) {
    const knownIds = new Set(customers.map((customer) => customer.id));
    const { data, error } = await supabase.from("customers").select(CUSTOMER_SELECT).in("hcp_customer_id", hcpIds);
    if (error) throw error;
    for (const customer of (data || []) as CustomerLite[]) {
      if (!knownIds.has(customer.id)) customers.push(customer);
    }
  }

  return customers;
}

export default function TechCustomers() {
  const { employeeId } = useEffectiveAuth();
  const { data: employees } = useEmployees();
  const [search, setSearch] = useState("");
  useTechDashboardRealtime();

  const employeeName = useMemo(() => {
    if (!employeeId || !employees) return null;
    return employees.find((employee) => employee.id === employeeId)?.name || null;
  }, [employeeId, employees]);

  const today = todayKey();
  const { data: todayData, isLoading: todayLoading } = useTechDashboardData(employeeName, today);

  const todaysWork = useMemo<WorkContext[]>(() => {
    if (!todayData) return [];
    return [
      ...todayData.jobs.map((job: any) => ({
        key: `job-${job.id}`,
        source: "job" as const,
        id: job.id,
        customer_id: job.customer_id || null,
        hcp_customer_id: job.hcp_customer_id || null,
        customer_name: job.customer_name || null,
        customer_phone: job.customer_phone || null,
        customer_email: job.customer_email || null,
        address: job.address || null,
        scheduled_date: job.scheduled_date || today,
        arrival_start: job.arrival_start || null,
        label: job.job_type || "Job",
        status: job.status || null,
      })),
      ...todayData.estimates.map((estimate: any) => ({
        key: `estimate-${estimate.id}`,
        source: "estimate" as const,
        id: estimate.id,
        customer_id: estimate.customer_id || null,
        hcp_customer_id: estimate.hcp_customer_id || null,
        customer_name: estimate.customer_name || null,
        customer_phone: estimate.customer_phone || null,
        customer_email: estimate.customer_email || null,
        address: estimate.address || null,
        scheduled_date: estimate.scheduled_date || today,
        arrival_start: estimate.arrival_start || null,
        label: "Estimate",
        status: estimate.work_status || estimate.status || null,
      })),
    ].sort((a, b) => workDateValue(a).localeCompare(workDateValue(b)));
  }, [todayData, today]);

  const recentQuery = useQuery({
    queryKey: ["tech-customer-context-recent", employeeName],
    enabled: !!employeeName,
    staleTime: 60_000,
    queryFn: async () => {
      const start = format(subDays(new Date(), 45), "yyyy-MM-dd");
      const [jobsRes, estimatesRes] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, customer_id, hcp_customer_id, customer_name, customer_phone, customer_email, address, scheduled_date, arrival_start, job_type, status")
          .eq("assigned_to", employeeName!)
          .gte("scheduled_date", start)
          .not("status", "in", CLOSED_WORK_STATUS_FILTER)
          .order("scheduled_date", { ascending: false, nullsFirst: false })
          .limit(50),
        supabase
          .from("estimates")
          .select("id, customer_id, hcp_customer_id, customer_name, customer_phone, customer_email, address, scheduled_date, arrival_start, status, work_status")
          .eq("assigned_to", employeeName!)
          .gte("scheduled_date", start)
          .not("status", "in", CLOSED_ESTIMATE_STATUS_FILTER)
          .order("scheduled_date", { ascending: false, nullsFirst: false })
          .limit(50),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (estimatesRes.error) throw estimatesRes.error;

      return [
        ...((jobsRes.data || []) as any[]).map((job) => ({
          key: `job-${job.id}`,
          source: "job" as const,
          id: job.id,
          customer_id: job.customer_id || null,
          hcp_customer_id: job.hcp_customer_id || null,
          customer_name: job.customer_name || null,
          customer_phone: job.customer_phone || null,
          customer_email: job.customer_email || null,
          address: job.address || null,
          scheduled_date: job.scheduled_date || null,
          arrival_start: job.arrival_start || null,
          label: job.job_type || "Job",
          status: job.status || null,
        })),
        ...((estimatesRes.data || []) as any[]).map((estimate) => ({
          key: `estimate-${estimate.id}`,
          source: "estimate" as const,
          id: estimate.id,
          customer_id: estimate.customer_id || null,
          hcp_customer_id: estimate.hcp_customer_id || null,
          customer_name: estimate.customer_name || null,
          customer_phone: estimate.customer_phone || null,
          customer_email: estimate.customer_email || null,
          address: estimate.address || null,
          scheduled_date: estimate.scheduled_date || null,
          arrival_start: estimate.arrival_start || null,
          label: "Estimate",
          status: estimate.work_status || estimate.status || null,
        })),
      ] satisfies WorkContext[];
    },
  });

  const allAssignedWork = useMemo(() => {
    const seen = new Set<string>();
    const combined: WorkContext[] = [];
    for (const item of [...todaysWork, ...(recentQuery.data || [])]) {
      if (seen.has(item.key)) continue;
      seen.add(item.key);
      combined.push(item);
    }
    return combined;
  }, [todaysWork, recentQuery.data]);

  const assignedCustomersQuery = useQuery({
    queryKey: ["tech-customer-context-customers", allAssignedWork.map((item) => item.key).join("|")],
    enabled: allAssignedWork.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchCustomersForWork(allAssignedWork),
  });

  const assignedCustomerContexts = useMemo(
    () => mergeCustomerContexts(allAssignedWork, assignedCustomersQuery.data || []),
    [allAssignedWork, assignedCustomersQuery.data],
  );

  const normalizedSearch = normalizeSearch(search);
  const searchQuery = useQuery({
    queryKey: ["tech-customer-context-search", normalizedSearch],
    enabled: normalizedSearch.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const term = `%${normalizedSearch}%`;
      const { data, error } = await supabase
        .from("customers")
        .select(CUSTOMER_SELECT)
        .or(
          [
            `first_name.ilike.${term}`,
            `last_name.ilike.${term}`,
            `company.ilike.${term}`,
            `phone.ilike.${term}`,
            `mobile_phone.ilike.${term}`,
            `email.ilike.${term}`,
            `address.ilike.${term}`,
          ].join(","),
        )
        .order("updated_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data || []) as CustomerLite[];
    },
  });

  const searchedCustomers = (searchQuery.data || []).map<CustomerContext>((customer) => ({
    customer,
    fallbackId: customer.id,
    name: customerName(customer),
    phone: customer.mobile_phone || customer.phone || null,
    email: customer.email || null,
    address: customerAddress(customer) || null,
    latestDate: null,
    contexts: [],
  }));

  const isLoading = todayLoading || recentQuery.isLoading || assignedCustomersQuery.isLoading;
  const todaysCustomerCount = assignedCustomerContexts.filter((context) =>
    context.contexts.some((item) => item.scheduled_date === today),
  ).length;

  return (
    <div className="flex min-h-full flex-col bg-background pb-24">
      <header className="sticky top-0 z-20 border-b bg-card px-4 py-3">
        <div className="mx-auto max-w-3xl space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field customer context</p>
            <h1 className="text-xl font-bold text-foreground">Customer Context</h1>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email, or address"
              className="h-11 pl-9"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-3 py-4">
        {normalizedSearch.length >= 2 ? (
          <section className="space-y-2">
            <SectionTitle icon={Search} title="Search Results" meta={`${searchedCustomers.length} found`} />
            {searchQuery.isLoading ? (
              <LoadingList />
            ) : searchedCustomers.length === 0 ? (
              <EmptyCard title="No customers matched that search." />
            ) : (
              searchedCustomers.map((context) => <CustomerRow key={context.customer?.id || context.name} context={context} />)
            )}
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <SectionTitle icon={CalendarClock} title="Today" meta={`${todaysCustomerCount} customer${todaysCustomerCount === 1 ? "" : "s"}`} />
              {isLoading ? (
                <LoadingList />
              ) : todaysCustomerCount === 0 ? (
                <EmptyCard title="No assigned customers for today." />
              ) : (
                assignedCustomerContexts
                  .filter((context) => context.contexts.some((item) => item.scheduled_date === today))
                  .map((context) => <CustomerRow key={context.customer?.id || context.name} context={context} emphasizeToday />)
              )}
            </section>

            <section className="space-y-2">
              <SectionTitle icon={History} title="Recent Assigned" meta={`${assignedCustomerContexts.length} total`} />
              {isLoading ? (
                <LoadingList />
              ) : assignedCustomerContexts.length === 0 ? (
                <EmptyCard title="Recent assigned customers will show here." />
              ) : (
                assignedCustomerContexts.slice(0, 20).map((context) => (
                  <CustomerRow key={context.customer?.id || context.name} context={context} />
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  meta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-2 px-1">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="ml-auto text-xs text-muted-foreground">{meta}</span>
    </div>
  );
}

function CustomerRow({ context, emphasizeToday = false }: { context: CustomerContext; emphasizeToday?: boolean }) {
  const id = context.customer?.id || context.fallbackId;
  const href = id ? `/tech/customers/${id}` : undefined;
  const latest = context.latestDate;
  const primaryWork = context.contexts[0];
  const row = (
    <Card className="overflow-hidden rounded-lg">
      <div className="flex min-h-[92px] items-center gap-3 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{context.name}</p>
            {emphasizeToday && <Badge className="h-5 shrink-0 px-1.5 text-[10px]">Today</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {context.phone || context.email || "No phone on file"}
          </p>
          {context.address && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-foreground/75">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{context.address}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {latest && (
              <Badge variant="outline" className="h-5 text-[10px]">
                {isToday(parseISO(`${latest}T00:00:00`)) ? "Today" : format(parseISO(`${latest}T00:00:00`), "MMM d")}
              </Badge>
            )}
            {primaryWork && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {primaryWork.label}
              </Badge>
            )}
            {context.contexts.length > 1 && (
              <Badge variant="outline" className="h-5 text-[10px]">
                {context.contexts.length} visits
              </Badge>
            )}
          </div>
        </div>
        {href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>
    </Card>
  );

  if (!href) return row;
  return (
    <Link to={href} className="block active:scale-[0.99]">
      {row}
    </Link>
  );
}

function LoadingList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <Skeleton key={item} className="h-[92px] rounded-lg" />
      ))}
    </div>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <Card className="rounded-lg p-8 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
    </Card>
  );
}
