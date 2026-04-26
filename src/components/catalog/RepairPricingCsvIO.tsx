import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * CSV columns (in order):
 *   id, name, category, base_price, parts_cost, member_price,
 *   default_labor_hours, default_severity, manual_price_override, is_active
 *
 * On import: matches by `id` (preferred). If id is blank, falls back to
 * exact `name` match. Only the four numeric/boolean columns are written:
 *   base_price, parts_cost, member_price, manual_price_override
 *
 * Editing a row's price via spreadsheet implicitly sets manual_price_override = true
 * so the global multiplier won't overwrite it on the next recalc.
 */

interface Row {
  id: string;
  name: string;
  category: string;
  base_price: number | null;
  parts_cost: number | null;
  member_price: number | null;
  default_labor_hours: number | null;
  default_severity: string | null;
  manual_price_override: boolean | null;
  is_active: boolean;
}

interface ImportDiff {
  id: string;
  name: string;
  field: string;
  before: string;
  after: string;
}

const escapeCsv = (val: string | number | boolean | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim().length > 0));
};

export function RepairPricingCsvIO() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDiffs, setPendingDiffs] = useState<ImportDiff[] | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Array<{ id: string; patch: any }>>([]);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["repair_catalog_csv_io"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("id, name, category, base_price, parts_cost, member_price, default_labor_hours, default_severity, manual_price_override, is_active")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const downloadCsv = () => {
    const headers = [
      "id", "name", "category",
      "base_price", "parts_cost", "member_price",
      "default_labor_hours", "default_severity",
      "manual_price_override", "is_active",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        escapeCsv(r.id),
        escapeCsv(r.name),
        escapeCsv(r.category),
        escapeCsv(r.base_price),
        escapeCsv(r.parts_cost),
        escapeCsv(r.member_price),
        escapeCsv(r.default_labor_hours),
        escapeCsv(r.default_severity),
        escapeCsv(r.manual_price_override ?? false),
        escapeCsv(r.is_active),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repair-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: `${rows.length} repairs exported as CSV` });
  };

  const downloadTemplate = () => {
    const csv = [
      "id,name,category,base_price,parts_cost,member_price,default_labor_hours,default_severity,manual_price_override,is_active",
      ",Example Repair,Electrical,249.49,45,212.49,1.5,recommended,true,true",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repair-pricing-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast({ title: "Empty file", variant: "destructive" });
      return;
    }
    const header = parsed[0].map(h => h.trim().toLowerCase());
    const idIdx = header.indexOf("id");
    const nameIdx = header.indexOf("name");
    const baseIdx = header.indexOf("base_price");
    const partsIdx = header.indexOf("parts_cost");
    const memberIdx = header.indexOf("member_price");
    const lockedIdx = header.indexOf("manual_price_override");

    if (nameIdx === -1 || baseIdx === -1) {
      toast({
        title: "Missing required columns",
        description: "CSV must include at least 'name' and 'base_price'.",
        variant: "destructive",
      });
      return;
    }

    const byId = new Map(rows.map(r => [r.id, r]));
    const byName = new Map(rows.map(r => [r.name.trim().toLowerCase(), r]));
    const diffs: ImportDiff[] = [];
    const updates: Array<{ id: string; patch: any }> = [];
    let unmatched = 0;

    for (let i = 1; i < parsed.length; i++) {
      const cells = parsed[i];
      const id = idIdx >= 0 ? cells[idIdx]?.trim() : "";
      const name = cells[nameIdx]?.trim() || "";
      let row: Row | undefined;
      if (id) row = byId.get(id);
      if (!row && name) row = byName.get(name.toLowerCase());
      if (!row) { unmatched += 1; continue; }

      const patch: any = {};
      const newBase = parseFloat(cells[baseIdx]);
      if (!isNaN(newBase) && Math.abs(newBase - Number(row.base_price ?? 0)) > 0.001) {
        patch.base_price = newBase;
        diffs.push({ id: row.id, name: row.name, field: "base_price", before: `$${Number(row.base_price ?? 0).toFixed(2)}`, after: `$${newBase.toFixed(2)}` });
      }
      if (partsIdx >= 0) {
        const newParts = parseFloat(cells[partsIdx]);
        if (!isNaN(newParts) && Math.abs(newParts - Number(row.parts_cost ?? 0)) > 0.001) {
          patch.parts_cost = newParts;
          diffs.push({ id: row.id, name: row.name, field: "parts_cost", before: `$${Number(row.parts_cost ?? 0).toFixed(2)}`, after: `$${newParts.toFixed(2)}` });
        }
      }
      if (memberIdx >= 0) {
        const newMember = parseFloat(cells[memberIdx]);
        if (!isNaN(newMember) && Math.abs(newMember - Number(row.member_price ?? 0)) > 0.001) {
          patch.member_price = newMember;
          diffs.push({ id: row.id, name: row.name, field: "member_price", before: `$${Number(row.member_price ?? 0).toFixed(2)}`, after: `$${newMember.toFixed(2)}` });
        }
      }

      // If the user changed base_price via spreadsheet, lock it from global recalc
      // unless they explicitly set manual_price_override in the CSV.
      if (lockedIdx >= 0) {
        const raw = (cells[lockedIdx] || "").trim().toLowerCase();
        const newLocked = raw === "true" || raw === "1" || raw === "yes";
        if (newLocked !== !!row.manual_price_override) {
          patch.manual_price_override = newLocked;
          diffs.push({ id: row.id, name: row.name, field: "locked", before: row.manual_price_override ? "yes" : "no", after: newLocked ? "yes" : "no" });
        }
      } else if (patch.base_price !== undefined && !row.manual_price_override) {
        patch.manual_price_override = true;
        diffs.push({ id: row.id, name: row.name, field: "locked", before: "no", after: "yes (auto)" });
      }

      if (Object.keys(patch).length > 0) updates.push({ id: row.id, patch });
    }

    if (updates.length === 0) {
      toast({
        title: "No changes detected",
        description: unmatched > 0 ? `${unmatched} row(s) didn't match any existing repair.` : "All values matched the catalog.",
      });
      return;
    }

    setPendingDiffs(diffs);
    setPendingUpdates(updates);
    setConfirmOpen(true);
    if (unmatched > 0) {
      toast({
        title: `${unmatched} unmatched row(s) skipped`,
        description: "These rows had no matching id or name and will not be imported.",
      });
    }
  };

  const applyImport = async () => {
    setImporting(true);
    try {
      let ok = 0;
      let failed = 0;
      for (const u of pendingUpdates) {
        const { error } = await supabase
          .from("repair_catalog")
          .update(u.patch as any)
          .eq("id", u.id);
        if (error) failed += 1; else ok += 1;
      }
      qc.invalidateQueries({ queryKey: ["repair_catalog_csv_io"] });
      qc.invalidateQueries({ queryKey: ["repair-catalog"] });
      qc.invalidateQueries({ queryKey: ["repair_catalog_for_pricing"] });
      toast({
        title: "Import complete",
        description: `${ok} repair${ok === 1 ? "" : "s"} updated${failed > 0 ? ` · ${failed} failed` : ""}`,
      });
    } finally {
      setImporting(false);
      setConfirmOpen(false);
      setPendingDiffs(null);
      setPendingUpdates([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Spreadsheet Import / Export
          <Badge variant="outline" className="text-[10px] font-normal">{rows.length} repairs</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={isLoading} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadTemplate} className="gap-1.5 text-xs">
            Blank template
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Edit prices in Excel, Google Sheets, or Numbers. Match rows by <code>id</code> (recommended) or
          exact <code>name</code>. Changing <code>base_price</code> auto-locks that repair so the global
          multiplier won't overwrite it later.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Apply {pendingUpdates.length} change{pendingUpdates.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Review the changes from your spreadsheet before saving.
                </p>
                <div className="max-h-72 overflow-y-auto rounded border border-border bg-muted/30 text-xs">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="text-left">
                        <th className="px-2 py-1.5 font-semibold">Repair</th>
                        <th className="px-2 py-1.5 font-semibold">Field</th>
                        <th className="px-2 py-1.5 font-semibold">Before</th>
                        <th className="px-2 py-1.5 font-semibold">After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pendingDiffs || []).slice(0, 100).map((d, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-2 py-1 truncate max-w-[200px]">{d.name}</td>
                          <td className="px-2 py-1 text-muted-foreground">{d.field}</td>
                          <td className="px-2 py-1 tabular-nums text-muted-foreground line-through">{d.before}</td>
                          <td className="px-2 py-1 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{d.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(pendingDiffs?.length ?? 0) > 100 && (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic border-t border-border/50">
                      + {(pendingDiffs?.length ?? 0) - 100} more change(s)…
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyImport} disabled={importing}>
              {importing ? "Saving…" : `Apply ${pendingUpdates.length} change${pendingUpdates.length === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
