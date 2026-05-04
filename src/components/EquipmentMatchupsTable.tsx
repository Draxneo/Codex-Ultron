import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, ArrowUp, ArrowDown, Pencil, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { FeaturesEditor } from "@/components/FeaturesEditor";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { EquipmentMatchup } from "@/hooks/useEquipmentMatchups";

const SYSTEM_LABELS: Record<string, string> = {
  gas_heat: "Gas Heat",
  heat_pump: "Heat Pump",
  electric: "Straight Cool",
  dual_fuel: "Dual Fuel",
};

type SortKey = keyof EquipmentMatchup;
type SortDir = "asc" | "desc";

interface Column {
  key: SortKey;
  label: string;
  type?: "text" | "number" | "money" | "system";
  editable?: boolean;
  width?: string;
  sticky?: boolean;
}

const COLUMNS: Column[] = [
  { key: "brand", label: "Brand", width: "w-28", sticky: true },
  { key: "tonnage", label: "Ton", type: "number", editable: true, width: "w-16" },
  { key: "tier", label: "Tier", width: "w-24" },
  { key: "system_type", label: "System", type: "system", width: "w-28" },
  { key: "application", label: "Orientation", width: "w-28" },
  { key: "condenser_model", label: "Condenser", editable: true, width: "w-32" },
  { key: "furnace_model", label: "Furnace", editable: true, width: "w-32" },
  { key: "coil_model", label: "Coil", editable: true, width: "w-32" },
  { key: "heat_kit", label: "Heat Kit", editable: true, width: "w-24" },
  { key: "seer2", label: "SEER2", type: "number", editable: true, width: "w-20" },
  { key: "eer2", label: "EER2", type: "number", editable: true, width: "w-20" },
  { key: "hspf2", label: "HSPF2", type: "number", editable: true, width: "w-20" },
  { key: "afue", label: "AFUE", type: "number", editable: true, width: "w-20" },
  { key: "cooling_cap", label: "BTU", type: "number", editable: true, width: "w-24" },
  { key: "ahri_number", label: "AHRI #", editable: true, width: "w-28" },
  { key: "component_price", label: "Component $", type: "money", editable: true, width: "w-28" },
  { key: "total_price", label: "Total $", type: "money", width: "w-28" },
  { key: "factory_rebate_price", label: "Rebate $", type: "money", width: "w-28" },
  { key: "monthly_payment", label: "Mo 36", type: "money", width: "w-24" },
  { key: "monthly_payment_120", label: "Mo 120", type: "money", width: "w-24" },
  { key: "cps_rebate_tier", label: "CPS Tier", width: "w-20" },
  { key: "early_rebate", label: "Early $", type: "money", width: "w-24" },
  { key: "burnout_rebate", label: "Burnout $", type: "money", width: "w-24" },
];

interface Props {
  rows: EquipmentMatchup[];
  editable?: boolean;
}

export function EquipmentMatchupsTable({ rows, editable }: Props) {
  const queryClient = useQueryClient();
  const { confirmDelete } = useConfirm();
  const [sortKey, setSortKey] = useState<SortKey>("brand");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(50);
  const [editFeaturesFor, setEditFeaturesFor] = useState<EquipmentMatchup | null>(null);

  const sorted = useMemo(() => {
    const items = [...rows];
    items.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      const s = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? s : -s;
    });
    return items;
  }, [rows, sortKey, sortDir]);

  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = pageSize === 0 ? sorted : sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const formatCell = (col: Column, val: any): string => {
    if (val == null || val === "") return "";
    if (col.type === "money") return `$${Number(val).toLocaleString()}`;
    if (col.type === "system") return SYSTEM_LABELS[val] || val;
    return String(val);
  };

  const startEdit = (row: EquipmentMatchup, col: Column) => {
    if (!editable || !col.editable) return;
    setEditing({ id: row.id, key: col.key });
    setEditValue(row[col.key] == null ? "" : String(row[col.key]));
  };

  const commitEdit = async (row: EquipmentMatchup, col: Column) => {
    if (!editing) return;
    const raw = editValue.trim();
    let parsed: any = raw === "" ? null : raw;
    if (col.type === "number" || col.type === "money") {
      parsed = raw === "" ? null : Number(raw);
      if (parsed != null && Number.isNaN(parsed)) {
        toast({ title: "Invalid number", variant: "destructive" });
        setEditing(null);
        return;
      }
    }
    setEditing(null);
    if (parsed === row[col.key]) return;

    const { error } = await supabase
      .from("equipment_matchups" as any)
      .update({ [col.key]: parsed } as any)
      .eq("id", row.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
    queryClient.invalidateQueries({ queryKey: ["equipment_search"] });
  };

  const handleDelete = async (row: EquipmentMatchup) => {
    await confirmDelete(`${row.brand} ${row.tonnage}T ${row.tier ?? ""}`.trim(), {
      description: `Permanently delete this matchup (${row.condenser_model || "—"}). This action cannot be undone.`,
      confirmText: "Delete Matchup",
      onConfirm: async () => {
        const { error } = await supabase.from("equipment_matchups" as any).delete().eq("id", row.id);
        if (error) {
          toast({ title: "Delete failed", description: error.message, variant: "destructive" });
          throw error;
        }
        toast({ title: "Deleted" });
        queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
        queryClient.invalidateQueries({ queryKey: ["equipment_search"] });
      },
    });
  };

  const exportCSV = () => {
    const headers = COLUMNS.map(c => c.label);
    const csvRows = [headers.join(",")];
    sorted.forEach(row => {
      const cells = COLUMNS.map(col => {
        const v = row[col.key];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      });
      csvRows.push(cells.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equipment-matchups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{pageRows.length}</span> of {sorted.length}
          {editable && <span className="ml-2 text-muted-foreground/60">· Double-click any cell to edit</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
            <option value={0}>Show all</option>
          </select>
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border/60 rounded-md overflow-auto max-h-[70dvh] relative">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-sm">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-9 px-2 text-left font-semibold text-muted-foreground border-b border-r border-border/60 whitespace-nowrap cursor-pointer hover:bg-muted",
                    col.width,
                    col.sticky && "sticky left-0 z-10 bg-muted/95",
                  )}
                  onClick={() => toggleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {sortKey === col.key ? (
                      sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </div>
                </th>
              ))}
              {editable && (
                <th className="h-9 px-2 text-right font-semibold text-muted-foreground border-b border-border/60 w-20 sticky right-0 bg-muted/95 z-10">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + (editable ? 1 : 0)} className="text-center py-12 text-muted-foreground">
                  No rows match these filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/40 transition-colors",
                    idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  {COLUMNS.map((col) => {
                    const val = row[col.key];
                    const isMissing = val == null || val === "";
                    const isEditing = editing?.id === row.id && editing?.key === col.key;
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "px-2 py-1.5 border-b border-r border-border/30 whitespace-nowrap",
                          col.width,
                          col.sticky && "sticky left-0 z-[1]",
                          col.sticky && (idx % 2 === 0 ? "bg-background" : "bg-muted/20"),
                          isMissing && "bg-amber-50/60 dark:bg-amber-950/20",
                          isMissing && col.sticky && "bg-amber-50/60 dark:bg-amber-950/20",
                          editable && col.editable && "cursor-text hover:ring-1 hover:ring-primary/40",
                          (col.type === "number" || col.type === "money") && "tabular-nums text-right",
                        )}
                        onDoubleClick={() => startEdit(row, col)}
                      >
                        {isEditing ? (
                          <Input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(row, col)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(row, col);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="h-6 text-xs px-1"
                          />
                        ) : (
                          <span className={cn(isMissing && "text-amber-700 dark:text-amber-400 italic")}>
                            {isMissing ? "—" : formatCell(col, val)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className={cn(
                      "px-2 py-1 border-b border-border/30 sticky right-0 z-[1]",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                    )}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setEditFeaturesFor(row)}
                          title="Edit features & details"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-destructive"
                          onClick={() => handleDelete(row)}
                          title="Delete row"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7">
            Prev
          </Button>
          <span className="text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7">
            Next
          </Button>
        </div>
      )}

      {editFeaturesFor && (
        <FeaturesEditor
          matchup={editFeaturesFor}
          open={!!editFeaturesFor}
          onOpenChange={(o) => !o && setEditFeaturesFor(null)}
        />
      )}
    </div>
  );
}