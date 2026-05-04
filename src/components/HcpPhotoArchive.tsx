import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Square, CheckCircle2, RotateCcw, AlertTriangle, Play, Trash2 } from "lucide-react";

type Phase = "idle" | "loading" | "running" | "done" | "error";

interface SavedProgress {
  last_completed_page: number;
  total_pages: number;
  total_jobs: number;
  total_archived: number;
  total_skipped: number;
  total_errors: number;
  status: "running" | "stopped" | "done";
  updated_at: string;
}

const PAGE_SIZE = 10;
const PAGE_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function HcpPhotoArchive() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState({ archived: 0, skipped: 0, errors: 0, totalJobs: 0 });
  const [error, setError] = useState<string | null>(null);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);
  const stopRef = useRef(false);
  const resumePageRef = useRef<number>(1);

  // Load saved progress on mount
  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("archive-hcp-photos", {
        body: { resume: true },
      });
      if (fnErr) throw fnErr;
      const p = data?.progress as SavedProgress | null;
      if (p && p.status !== "done") {
        setSavedProgress(p);
        setTotalPages(p.total_pages);
        setCurrentPage(p.last_completed_page);
        setStats({
          archived: p.total_archived,
          skipped: p.total_skipped,
          errors: p.total_errors,
          totalJobs: p.total_jobs,
        });
      } else if (p && p.status === "done") {
        setSavedProgress(p);
        setTotalPages(p.total_pages);
        setCurrentPage(p.total_pages);
        setStats({
          archived: p.total_archived,
          skipped: p.total_skipped,
          errors: p.total_errors,
          totalJobs: p.total_jobs,
        });
        setPhase("done");
        return;
      }
      setPhase("idle");
    } catch {
      setPhase("idle");
    }
  };

  const resetProgress = async () => {
    await supabase.functions.invoke("archive-hcp-photos", { body: { reset: true } });
    setSavedProgress(null);
    setStats({ archived: 0, skipped: 0, errors: 0, totalJobs: 0 });
    setCurrentPage(0);
    setTotalPages(0);
    setPhase("idle");
  };

  const fetchPage = async (page: number, cumulative: { archived: number; skipped: number; errors: number }) => {
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
      attempts++;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("archive-hcp-photos", {
          body: { page, page_size: PAGE_SIZE, cumulative },
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
  };

  const runArchive = async (startPage = 1) => {
    stopRef.current = false;
    setError(null);
    setRetryInfo(null);
    setPhase("running");

    let page = startPage;
    let totalArchived = startPage > 1 ? stats.archived : 0;
    let totalSkipped = startPage > 1 ? stats.skipped : 0;
    let totalErrors = startPage > 1 ? stats.errors : 0;

    while (!stopRef.current) {
      setCurrentPage(page);
      try {
        const data = await fetchPage(page, {
          archived: totalArchived,
          skipped: totalSkipped,
          errors: totalErrors,
        });
        setTotalPages(data.total_pages || 0);
        totalArchived += data.archived || 0;
        totalSkipped += data.skipped || 0;
        totalErrors += (data.errors?.length || 0);
        setStats({
          archived: totalArchived,
          skipped: totalSkipped,
          errors: totalErrors,
          totalJobs: data.total_jobs || 0,
        });

        if (data.done) break;
        page++;
        resumePageRef.current = page;
        await sleep(PAGE_DELAY_MS);
      } catch (e: any) {
        resumePageRef.current = page;
        setError(e.message);
        setPhase("error");
        return;
      }
    }

    if (stopRef.current) {
      // Save stop progress via edge function
      await supabase.functions.invoke("archive-hcp-photos", {
        body: {
          stop: true,
          progress: {
            last_completed_page: page > 1 ? page - 1 : 1,
            total_pages: totalPages,
            total_jobs: stats.totalJobs,
            total_archived: totalArchived,
            total_skipped: totalSkipped,
            total_errors: totalErrors,
          },
        },
      });
      await loadProgress();
    } else {
      setSavedProgress(null);
      setPhase("done");
    }
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const handleResume = () => {
    if (savedProgress) {
      runArchive(savedProgress.last_completed_page + 1);
    }
  };

  const handleStartFresh = async () => {
    await resetProgress();
    runArchive(1);
  };

  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const hasResumableProgress = savedProgress && (savedProgress.status === "running" || savedProgress.status === "stopped");

  if (phase === "loading") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Archive HCP Job Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Checking for previous progress…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Archive HCP Job Photos
        </CardTitle>
        <CardDescription className="text-xs">
          Download all job attachments from HCP and store them permanently. Run this before canceling your HCP subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {phase === "idle" && !hasResumableProgress && (
          <Button onClick={handleStartFresh} className="w-full">
            <Camera className="h-4 w-4 mr-2" />
            Start Photo Archive
          </Button>
        )}

        {phase === "idle" && hasResumableProgress && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              Previous run stopped at page <strong>{savedProgress!.last_completed_page}</strong> of <strong>{savedProgress!.total_pages}</strong>.
              {savedProgress!.total_archived > 0 && <> Archived <strong>{savedProgress!.total_archived}</strong> photos so far.</>}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleResume} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Resume from page {savedProgress!.last_completed_page + 1}
              </Button>
              <Button variant="outline" size="sm" onClick={resetProgress} title="Clear progress and start over">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {phase === "running" && (
          <>
            <div className="text-sm font-medium">
              Archiving photos… Page {currentPage} of {totalPages || "?"}
            </div>
            {retryInfo && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                ⏳ {retryInfo}
              </div>
            )}
            <Progress value={progress} className="h-2" />
            <Button variant="destructive" size="sm" onClick={handleStop} className="w-full">
              <Square className="h-3.5 w-3.5 mr-2" />
              Stop (progress is saved)
            </Button>
          </>
        )}

        {phase === "done" && (
          <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Archive complete!
            <Button variant="ghost" size="sm" onClick={resetProgress} className="ml-auto">
              Reset
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-2">
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => runArchive(resumePageRef.current)} className="flex-1">
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Resume from page {resumePageRef.current}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setPhase("idle"); loadProgress(); }} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(stats.archived > 0 || stats.skipped > 0) && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
            <p>Total jobs: <strong>{stats.totalJobs}</strong></p>
            <p>Photos archived: <strong>{stats.archived}</strong></p>
            <p>Jobs skipped (already archived or no photos): <strong>{stats.skipped}</strong></p>
            {stats.errors > 0 && <p className="text-destructive">Errors: <strong>{stats.errors}</strong></p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
