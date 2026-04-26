import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Download, Square, CheckCircle2, RotateCcw, FlaskConical, Paperclip, ShoppingCart, CalendarClock } from "lucide-react";

type Phase = "idle" | "jobs" | "estimates" | "line_items" | "done" | "error" | "test-done";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const PAGE_DELAY_MS = 500;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface TestResults {
  jobs: number;
  customers: number;
  attachments: number;
  sampleAttachment: any;
  totalPages: number;
}

export function HcpHistoryImport() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalImported, setTotalImported] = useState({ jobs: 0, estimates: 0, customers: 0, lineItems: 0 });
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const stopRef = useRef(false);
  const resumeRef = useRef<{ phase: "jobs" | "estimates" | "line_items"; page: number } | null>(null);

  const fetchPage = useCallback(async (resource: string, page: number, test = false, extraBody: Record<string, any> = {}) => {
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("import-hcp-history", {
          body: { resource, page, ...(test ? { test: true } : {}), ...extraBody },
        });
        if (fnErr) throw new Error(fnErr.message);
        if (data.error) throw new Error(data.error);

        if (data.retry) {
          const waitSec = data.retry_after || 10;
          setRetryInfo(`Rate limited — waiting ${waitSec}s before retrying…`);
          await sleep(waitSec * 1000);
          setRetryInfo(null);
          continue;
        }

        return data;
      } catch (e: any) {
        if (attempts < MAX_RETRIES) {
          setRetryInfo(`Error on page ${page}, retrying (${attempts}/${MAX_RETRIES})…`);
          await sleep(RETRY_DELAY_MS);
          setRetryInfo(null);
        } else {
          throw e;
        }
      }
    }
  }, []);

  const runTest = async () => {
    stopRef.current = false;
    setError(null);
    setRetryInfo(null);
    setPhase("jobs");
    setCurrentPage(1);

    try {
      const data = await fetchPage("jobs", 1, true);
      setTotalPages(data.total_pages || 0);
      setTotalImported({ jobs: data.imported || 0, estimates: 0, customers: data.customers_found || 0, lineItems: 0 });
      setTestResults({
        jobs: data.imported || 0,
        customers: data.customers_found || 0,
        attachments: data.attachments_found || 0,
        sampleAttachment: data.sample_attachment || null,
        totalPages: data.total_pages || 0,
      });
      setPhase("test-done");
    } catch (e: any) {
      setError(e.message);
      setPhase("error");
    }
  };

  const runImport = async (startPhase?: "jobs" | "estimates" | "line_items", startPage?: number) => {
    stopRef.current = false;
    setError(null);
    setRetryInfo(null);

    const skipJobs = startPhase === "estimates" || startPhase === "line_items";
    const skipEstimates = startPhase === "line_items";
    let jobsTotal = totalImported.jobs;
    let estimatesTotal = totalImported.estimates;
    let customersTotal = totalImported.customers;
    let lineItemsTotal = totalImported.lineItems;

    // Phase 1: Jobs
    if (!skipJobs) {
      setPhase("jobs");
      let page = startPhase === "jobs" && startPage ? startPage : 1;

      while (!stopRef.current) {
        setCurrentPage(page);
        try {
          const data = await fetchPage("jobs", page);
          setTotalPages(data.total_pages || 0);
          jobsTotal += data.imported || 0;
          customersTotal += data.customers_found || 0;
          setTotalImported({ jobs: jobsTotal, estimates: estimatesTotal, customers: customersTotal, lineItems: lineItemsTotal });
          if (data.done) break;
          page++;
          await sleep(PAGE_DELAY_MS);
        } catch (e: any) {
          resumeRef.current = { phase: "jobs", page };
          setError(e.message);
          setPhase("error");
          return;
        }
      }
      if (stopRef.current) { setPhase("idle"); return; }
    }

    // Phase 2: Estimates
    if (!skipEstimates) {
      setPhase("estimates");
      let page = startPhase === "estimates" && startPage ? startPage : 1;

      while (!stopRef.current) {
        setCurrentPage(page);
        try {
          const data = await fetchPage("estimates", page);
          setTotalPages(data.total_pages || 0);
          estimatesTotal += data.imported || 0;
          customersTotal += data.customers_found || 0;
          setTotalImported({ jobs: jobsTotal, estimates: estimatesTotal, customers: customersTotal, lineItems: lineItemsTotal });
          if (data.done) break;
          page++;
          await sleep(PAGE_DELAY_MS);
        } catch (e: any) {
          resumeRef.current = { phase: "estimates", page };
          setError(e.message);
          setPhase("error");
          return;
        }
      }
      if (stopRef.current) { setPhase("idle"); return; }
    }

    // Phase 3: Line Items
    setPhase("line_items");
    let offset = startPhase === "line_items" && startPage ? startPage : 0;

    while (!stopRef.current) {
      setCurrentPage(offset);
      try {
        const data = await fetchPage("line_items", 1, false, { offset, batch_size: 15 });
        setTotalPages(data.total_jobs || 0);
        lineItemsTotal += data.imported || 0;
        setTotalImported({ jobs: jobsTotal, estimates: estimatesTotal, customers: customersTotal, lineItems: lineItemsTotal });
        offset = data.offset || (offset + (data.jobs_processed || 0));
        setCurrentPage(offset);
        if (data.done) break;
        await sleep(PAGE_DELAY_MS);
      } catch (e: any) {
        resumeRef.current = { phase: "line_items", page: offset };
        setError(e.message);
        setPhase("error");
        return;
      }
    }

    if (!stopRef.current) {
      resumeRef.current = null;
      const { count } = await supabase.from("customers").select("id", { count: "exact", head: true });
      setTotalImported(prev => ({ ...prev, customers: count || prev.customers }));
      setPhase("done");
    } else {
      setPhase("idle");
    }
  };

  const stop = () => { stopRef.current = true; };

  const resume = () => {
    if (resumeRef.current) {
      runImport(resumeRef.current.phase, resumeRef.current.page);
    }
  };

  const startFresh = () => {
    resumeRef.current = null;
    setTestResults(null);
    setTotalImported({ jobs: 0, estimates: 0, customers: 0, lineItems: 0 });
    runImport();
  };

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const isRunning = phase === "jobs" || phase === "estimates" || phase === "line_items";

  const phaseLabel = phase === "jobs" ? "jobs" : phase === "estimates" ? "estimates" : "line items";
  const progressLabel = phase === "line_items"
    ? `Importing line items… Job ${currentPage} of ${totalPages || "?"}`
    : `Importing ${phaseLabel}… Page ${currentPage} of ${totalPages || "?"}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="h-4 w-4" />
          Import Full HCP History
        </CardTitle>
        <CardDescription className="text-xs">
          Pull all historical jobs, estimates, customers, and line items from Housecall Pro. Auto-retries on errors and can resume if interrupted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {phase === "idle" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={runTest} className="flex-1">
              <FlaskConical className="h-4 w-4 mr-2" />
              Test (1 page)
            </Button>
            <Button onClick={startFresh} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Full Import
            </Button>
          </div>
        )}

        {isRunning && (
          <>
            <div className="text-sm font-medium">{progressLabel}</div>
            {retryInfo && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                ⏳ {retryInfo}
              </div>
            )}
            <Progress value={progress} className="h-2" />
            <div className="flex gap-1.5 text-[10px] text-muted-foreground">
              <span className={phase === "jobs" ? "font-bold text-foreground" : ""}>Jobs</span>
              <span>→</span>
              <span className={phase === "estimates" ? "font-bold text-foreground" : ""}>Estimates</span>
              <span>→</span>
              <span className={phase === "line_items" ? "font-bold text-foreground" : ""}>Line Items</span>
            </div>
            <Button variant="destructive" size="sm" onClick={stop} className="w-full">
              <Square className="h-3.5 w-3.5 mr-2" />
              Stop Import
            </Button>
          </>
        )}

        {phase === "test-done" && testResults && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Test complete — page 1 of {testResults.totalPages}
            </div>
            <div className="text-xs bg-muted/50 rounded-lg p-3 space-y-1">
              <p>Jobs imported: <strong>{testResults.jobs}</strong></p>
              <p>Customers found: <strong>{testResults.customers}</strong></p>
              <p className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                Attachments found: <strong>{testResults.attachments}</strong>
                {testResults.attachments === 0 && (
                  <span className="text-muted-foreground"> (expand may not work on list endpoint)</span>
                )}
              </p>
              {testResults.sampleAttachment && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted-foreground">Sample attachment structure</summary>
                  <pre className="text-[10px] mt-1 overflow-x-auto bg-muted rounded p-2">
                    {JSON.stringify(testResults.sampleAttachment, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={startFresh} className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Run Full Import
              </Button>
              <Button variant="outline" onClick={() => { setPhase("idle"); setTestResults(null); }} className="flex-1">
                Back
              </Button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Import complete!
            <Button variant="ghost" size="sm" onClick={startFresh} className="ml-auto">
              Run Again
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-2">
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">
              Error: {error}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={resume} className="flex-1">
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Resume from {resumeRef.current?.phase === "line_items" ? `job ${resumeRef.current?.page || "?"}` : `page ${resumeRef.current?.page || "?"}`}
              </Button>
              <Button variant="outline" size="sm" onClick={startFresh} className="flex-1">
                Start Over
              </Button>
            </div>
          </div>
        )}

        {(totalImported.jobs > 0 || totalImported.estimates > 0 || totalImported.lineItems > 0) && phase !== "test-done" && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <p>Jobs imported: <strong>{totalImported.jobs}</strong></p>
            <p>Estimates imported: <strong>{totalImported.estimates}</strong></p>
            <p>Customers found: <strong>{totalImported.customers}</strong></p>
            <p>Line items imported: <strong>{totalImported.lineItems}</strong></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Line Items Import Card (standalone for re-runs) ---

function LineItemsImportCard() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [offset, setOffset] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalImported, setTotalImported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const stopRef = useRef(false);

  const run = async (startOffset = 0, testMode = false) => {
    stopRef.current = false;
    setStatus("running");
    setError(null);
    setRetryInfo(null);
    let currentOffset = startOffset;
    let imported = totalImported;

    while (!stopRef.current) {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("import-hcp-history", {
          body: { resource: "line_items", offset: currentOffset, batch_size: testMode ? 5 : 15 },
        });
        if (fnErr) throw new Error(fnErr.message);
        if (data.error) throw new Error(data.error);

        if (data.retry) {
          const waitSec = data.retry_after || 10;
          setRetryInfo(`Rate limited — waiting ${waitSec}s…`);
          currentOffset = data.offset || currentOffset;
          await sleep(waitSec * 1000);
          setRetryInfo(null);
          continue;
        }

        setTotalJobs(data.total_jobs || 0);
        imported += data.imported || 0;
        setTotalImported(imported);
        currentOffset = data.offset || currentOffset;
        setOffset(currentOffset);

        if (testMode || data.done) {
          setStatus("done");
          return;
        }
        await sleep(500);
      } catch (e: any) {
        setOffset(currentOffset);
        setError(e.message);
        setStatus("error");
        return;
      }
    }
    setStatus("idle");
  };

  const progress = totalJobs > 0 ? Math.round((offset / totalJobs) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Import Job Line Items
        </CardTitle>
        <CardDescription className="text-xs">
          Pull what was sold on each job (equipment, labor, parts) from HCP. Processes ~15 jobs per batch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "idle" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run(0, true)} className="flex-1">
              <FlaskConical className="h-4 w-4 mr-2" />
              Test (5 jobs)
            </Button>
            <Button onClick={() => run(offset)} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              {offset > 0 ? `Resume from job ${offset}` : "Start Import"}
            </Button>
          </div>
        )}

        {status === "running" && (
          <>
            <div className="text-sm font-medium">
              Processing jobs… {offset} of {totalJobs || "?"}
            </div>
            {retryInfo && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                ⏳ {retryInfo}
              </div>
            )}
            <Progress value={progress} className="h-2" />
            <Button variant="destructive" size="sm" onClick={() => { stopRef.current = true; }} className="w-full">
              <Square className="h-3.5 w-3.5 mr-2" /> Stop
            </Button>
          </>
        )}

        {status === "done" && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Done! {totalImported} line items imported.
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">Error: {error}</div>
            <Button size="sm" onClick={() => run(offset)} className="w-full">
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Resume from job {offset}
            </Button>
          </div>
        )}

        {totalImported > 0 && status !== "done" && (
          <div className="text-xs text-muted-foreground">
            Line items imported so far: <strong>{totalImported}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Backfill Payment Dates Card ---

function BackfillPaidDatesCard() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [noMatch, setNoMatch] = useState(0);
  const [clamped, setClamped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const stopRef = useRef(false);

  const run = async (startPage = 1, testMode = false) => {
    stopRef.current = false;
    setStatus("running");
    setError(null);
    setRetryInfo(null);
    let currentPage = startPage;
    let totalUpdated = startPage === 1 ? 0 : updated;
    let totalSkipped = startPage === 1 ? 0 : skipped;
    let totalNoMatch = startPage === 1 ? 0 : noMatch;
    let totalClamped = startPage === 1 ? 0 : clamped;

    while (!stopRef.current) {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("backfill-paid-dates", {
          body: { page: currentPage, page_size: testMode ? 10 : 50, ...(testMode ? { test: true } : {}) },
        });
        if (fnErr) throw new Error(fnErr.message);
        if (data.error) throw new Error(data.error);

        if (data.retry) {
          const waitSec = data.retry_after || 10;
          setRetryInfo(`Rate limited — waiting ${waitSec}s…`);
          await sleep(waitSec * 1000);
          setRetryInfo(null);
          continue;
        }

        setTotalPages(data.total_pages || 0);
        setTotalItems(data.total_items || 0);
        totalUpdated += data.updated || 0;
        totalSkipped += data.skipped || 0;
        totalNoMatch += data.no_match || 0;
        totalClamped += data.clamped || 0;
        setUpdated(totalUpdated);
        setSkipped(totalSkipped);
        setNoMatch(totalNoMatch);
        setClamped(totalClamped);
        currentPage++;
        setPage(currentPage);

        if (testMode || data.done) {
          setStatus("done");
          return;
        }
        await sleep(300);
      } catch (e: any) {
        setPage(currentPage);
        setError(e.message);
        setStatus("error");
        return;
      }
    }
    setStatus("idle");
  };

  const progress = totalPages > 0 ? Math.round(((page - 1) / totalPages) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Backfill Payment Dates
        </CardTitle>
        <CardDescription className="text-xs">
          Pages through HCP invoices to fetch real payment dates. Fixes "Collected This Month" accuracy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "idle" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run(1, true)} className="flex-1">
              <FlaskConical className="h-4 w-4 mr-2" />
              Test (1 page)
            </Button>
            <Button onClick={() => run(page > 1 ? page : 1)} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              {page > 1 ? `Resume page ${page}` : "Start Backfill"}
            </Button>
          </div>
        )}

        {status === "running" && (
          <>
            <div className="text-sm font-medium">
              Page {page - 1} of {totalPages || "?"} ({totalItems} HCP invoices)
            </div>
            {retryInfo && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                ⏳ {retryInfo}
              </div>
            )}
            <Progress value={progress} className="h-2" />
            <Button variant="destructive" size="sm" onClick={() => { stopRef.current = true; }} className="w-full">
              <Square className="h-3.5 w-3.5 mr-2" /> Stop
            </Button>
          </>
        )}

        {status === "done" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Done! {updated} updated{clamped > 0 ? ` (${clamped} clamped to sched date)` : ""}, {skipped} skipped, {noMatch} no match.
            </div>
            <Button variant="outline" size="sm" onClick={() => { setUpdated(0); setSkipped(0); setNoMatch(0); setClamped(0); setPage(1); setStatus("idle"); }}>
              Reset
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-2">
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3">Error: {error}</div>
            <Button size="sm" onClick={() => run(page)} className="w-full">
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Resume page {page}
            </Button>
          </div>
        )}

        {(updated > 0 || skipped > 0) && status === "running" && (
          <div className="text-xs text-muted-foreground">
            Updated: <strong>{updated}</strong>{clamped > 0 && <> · Clamped: <strong>{clamped}</strong></>} · Skipped: <strong>{skipped}</strong> · No match: <strong>{noMatch}</strong>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { LineItemsImportCard, BackfillPaidDatesCard };
