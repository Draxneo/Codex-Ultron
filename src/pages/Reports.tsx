import { Link } from "react-router-dom";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CreditCard,
  FileText,
  Headphones,
  LineChart,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ModuleWorkbench } from "@/components/workbench/ModuleWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPORT_GROUPS = [
  {
    title: "Jobs",
    icon: Briefcase,
    reports: [
      { title: "Job revenue", description: "Revenue by date, status, and technician.", to: "/admin?section=reports" },
      { title: "Job count", description: "Daily, weekly, and monthly job volume.", to: "/" },
      { title: "Unscheduled work", description: "Backlog and follow-up opportunities.", to: "/jobs/backlog" },
    ],
  },
  {
    title: "Estimates",
    icon: FileText,
    reports: [
      { title: "Estimate pipeline", description: "Open, sent, approved, and declined proposals.", to: "/quick-quote" },
      { title: "Presented options", description: "Customer carts and in-home presentation activity.", to: "/catalog" },
    ],
  },
  {
    title: "Customers",
    icon: Users,
    reports: [
      { title: "Customer list", description: "Search, sort, and inspect the customer base.", to: "/customers" },
      { title: "Lead sources", description: "LSA, referrals, and intake source performance.", to: "/leads" },
    ],
  },
  {
    title: "Employee",
    icon: UserRound,
    reports: [
      { title: "Tech performance", description: "Dispatch, completion, sales, and route context.", to: "/admin?section=reports" },
      { title: "Paysheet", description: "Employee pay and job-linked compensation.", to: "/pay" },
    ],
  },
  {
    title: "Money",
    icon: CreditCard,
    reports: [
      { title: "Payments", description: "Collected, pending, financing, and payment links.", to: "/payments" },
      { title: "API costs", description: "Usage and spend guardrails for external services.", to: "/admin?section=reports" },
    ],
  },
  {
    title: "Voice",
    icon: Headphones,
    reports: [
      { title: "Call activity", description: "Calls, voicemail, and phone-system follow-up.", to: "/phone" },
      { title: "SMS conversations", description: "Inbound and outbound customer messaging.", to: "/sms" },
    ],
  },
];

export default function Reports() {
  const [activeGroup, setActiveGroup] = useState("Jobs");
  const [search, setSearch] = useState("");
  const active = REPORT_GROUPS.find((group) => group.title === activeGroup) || REPORT_GROUPS[0];
  const term = search.trim().toLowerCase();
  const visibleReports = active.reports.filter((report) =>
    !term || `${report.title} ${report.description} ${active.title}`.toLowerCase().includes(term)
  );
  const totalReports = REPORT_GROUPS.reduce((sum, group) => sum + group.reports.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reports"
      />
      <main className="h-[calc(100vh-3rem)] min-h-0">
        <ModuleWorkbench
          title="Reporting"
          eyebrow="Business intelligence"
          description="Find the operational reports the office checks every day."
          icon={<BarChart3 className="h-4.5 w-4.5" />}
          primaryAction={
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/admin?section=reports">
                <LineChart className="h-4 w-4" /> Cost Dashboard
              </Link>
            </Button>
          }
          meta={<Badge variant="outline" className="rounded-sm">{totalReports} reports</Badge>}
          sideRail={
            <nav className="space-y-1 p-2">
              {REPORT_GROUPS.map((group) => {
                const Icon = group.icon;
                const selected = group.title === activeGroup;
                return (
                  <button
                    key={group.title}
                    type="button"
                    onClick={() => setActiveGroup(group.title)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{group.title}</span>
                    </span>
                    <Badge variant="secondary" className="rounded-sm px-1.5 text-[10px]">{group.reports.length}</Badge>
                  </button>
                );
              })}
            </nav>
          }
          contentClassName="p-4 md:p-6"
        >
          <div className="mx-auto max-w-6xl space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="rounded-md">
                <CardContent className="flex items-center gap-3 p-3">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Today first</p>
                    <p className="text-xs text-muted-foreground">Use reports to steer the current dispatch day.</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-md">
                <CardContent className="flex items-center gap-3 p-3">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Jobs and estimates</p>
                    <p className="text-xs text-muted-foreground">Keep sales, service, and follow-up visible.</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-md">
                <CardContent className="flex items-center gap-3 p-3">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">Money movement</p>
                    <p className="text-xs text-muted-foreground">Payments, financing, and cost guardrails.</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{active.title}</h2>
                  <p className="text-xs text-muted-foreground">HCP-style report directory grouped by the question the office is asking.</p>
                </div>
                <Badge variant="outline" className="rounded-sm">{visibleReports.length} shown</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleReports.map((report) => (
                  <Link key={report.title} to={report.to} className="block">
                    <Card className="h-full rounded-md transition-colors hover:bg-muted/40">
                      <CardContent className="p-4">
                        <p className="text-sm font-semibold text-foreground">{report.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{report.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </ModuleWorkbench>
      </main>
    </div>
  );
}
