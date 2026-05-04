import { useMemo, useState } from "react";
import { useAhriLookups } from "@/hooks/useAhriLookups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Trash2, Loader2, Link, FileDown, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// Estimate tonnage from cooling capacity (12,000 BTU/h = 1 ton, snapped to nearest 0.5)
function btuhToTons(btuh: number | null | undefined): number | null {
  if (!btuh) return null;
  return Math.round((btuh / 12000) * 2) / 2;
}

// Derive system type the same way Equipment uses: heat_pump (HP rated), gas_heat (has furnace), else electric (straight cool)
function deriveSystemType(r: any): "heat_pump" | "gas_heat" | "electric" {
  if (r.program_type === "99" || (r.hspf2 && r.hspf2 > 0)) return "heat_pump";
  if (r.furnace_model && String(r.furnace_model).trim()) return "gas_heat";
  return "electric";
}

export default function AhriLookups() {
  const { lookups, isLoading, lookup, isLookingUp, deleteLookup } = useAhriLookups();
  const [ahriInput, setAhriInput] = useState("");
  const [systemType, setSystemType] = useState("gas_heat");
  const [bulkMode, setBulkMode] = useState(false);

  // Filters
  const [filterQuery, setFilterQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("all_brands");
  const [filterSystemType, setFilterSystemType] = useState("all_types");
  const [filterTonnage, setFilterTonnage] = useState("all_tons");
  const [filterStatus, setFilterStatus] = useState("all_status");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Derive filter option lists from existing lookups
  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    lookups.forEach((r: any) => { if (r.outdoor_brand) set.add(r.outdoor_brand); });
    return Array.from(set).sort();
  }, [lookups]);

  const tonnageOptions = useMemo(() => {
    const set = new Set<number>();
    lookups.forEach((r: any) => {
      const t = btuhToTons(r.cooling_cap_btuh);
      if (t) set.add(t);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [lookups]);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return lookups.filter((r: any) => {
      if (q) {
        const hay = [
          r.ahri_number, r.outdoor_brand, r.outdoor_series, r.outdoor_model,
          r.indoor_model, r.furnace_model, r.refrigerant,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterBrand !== "all_brands" && r.outdoor_brand !== filterBrand) return false;
      if (filterSystemType !== "all_types") {
        const st = deriveSystemType(r);
        if (st !== filterSystemType) return false;
      }
      if (filterTonnage !== "all_tons") {
        const tons = btuhToTons(r.cooling_cap_btuh);
        if (tons !== Number(filterTonnage)) return false;
      }
      if (filterStatus !== "all_status") {
        if ((r.model_status || "").toLowerCase() !== filterStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [lookups, filterQuery, filterBrand, filterSystemType, filterTonnage, filterStatus]);

  const hasAnyFilter = !!filterQuery || filterBrand !== "all_brands" || filterSystemType !== "all_types" || filterTonnage !== "all_tons" || filterStatus !== "all_status";

  const resetFilters = () => {
    setFilterQuery("");
    setFilterBrand("all_brands");
    setFilterSystemType("all_types");
    setFilterTonnage("all_tons");
    setFilterStatus("all_status");
  };

  const handleLookup = async () => {
    if (!ahriInput.trim()) return;

    if (bulkMode) {
      const numbers = ahriInput
        .split(/[\n,]+/)
        .map((n) => n.trim())
        .filter(Boolean);
      for (const num of numbers) {
        try {
          await lookup({ ahri_number: num, system_type: systemType });
        } catch {
          // toast already shown by hook
        }
      }
    } else {
      await lookup({ ahri_number: ahriInput.trim(), system_type: systemType });
    }
    setAhriInput("");
  };

  const handleLinkToEquipment = async (row: any) => {
    // Push AHRI data into a new equipment_matchups row
    const { data, error } = await supabase.from("equipment_matchups").insert({
      brand: row.outdoor_brand || "Unknown",
      condenser_model: row.outdoor_model || "Unknown",
      coil_model: row.indoor_model || null,
      furnace_model: row.furnace_model || null,
      seer2: row.seer2,
      eer2: row.eer2,
      hspf2: row.hspf2,
      cooling_cap: row.cooling_cap_btuh,
      ahri_number: row.ahri_number,
      system_type: deriveSystemType(row),
    }).select().single();

    if (error) {
      toast({ title: "Link failed", description: error.message, variant: "destructive" });
      return;
    }

    // Update the lookup with linked_matchup_id
    await supabase
      .from("ahri_lookups" as any)
      .update({ linked_matchup_id: data.id } as any)
      .eq("id", row.id);

    queryClient.invalidateQueries({ queryKey: ["ahri_lookups"] });
    queryClient.invalidateQueries({ queryKey: ["equipment_matchups"] });
    toast({ title: "Linked to equipment matchups" });
  };

  return (
    <div className="space-y-4">
      {/* Lookup Form */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">AHRI Lookup</h3>
          <Button variant="ghost" size="sm" onClick={() => setBulkMode(!bulkMode)}>
            {bulkMode ? "Single" : "Bulk"} Mode
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label>AHRI Number{bulkMode ? "s" : ""}</Label>
            {bulkMode ? (
              <Textarea
                placeholder="Enter AHRI numbers, one per line or comma-separated"
                value={ahriInput}
                onChange={(e) => setAhriInput(e.target.value)}
                rows={3}
              />
            ) : (
              <Input
                placeholder="e.g. 214950456"
                value={ahriInput}
                onChange={(e) => setAhriInput(e.target.value)}
                onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === "Enter") handleLookup(); }}
              />
            )}
          </div>
          <div className="w-full sm:w-48 space-y-1">
            <Label>System Type</Label>
            <Select value={systemType} onValueChange={setSystemType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gas_heat">AC / Straight Cool</SelectItem>
                <SelectItem value="heat_pump">Heat Pump</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={handleLookup} disabled={isLookingUp || !ahriInput.trim()}>
              {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-1.5">Lookup</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters bar */}
      {lookups.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search AHRI #, model, brand…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_brands">All Brands</SelectItem>
              {brandOptions.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSystemType} onValueChange={setFilterSystemType}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_types">All Types</SelectItem>
              <SelectItem value="gas_heat">Gas Heat</SelectItem>
              <SelectItem value="heat_pump">Heat Pump</SelectItem>
              <SelectItem value="electric">Straight Cool</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTonnage} onValueChange={setFilterTonnage}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="All Tons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_tons">All Tons</SelectItem>
              {tonnageOptions.map(t => (
                <SelectItem key={t} value={String(t)}>{t} ton</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_status">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Discontinued">Discontinued</SelectItem>
            </SelectContent>
          </Select>
          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1 text-xs">
              <X className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} of {lookups.length}
          </div>
        </div>
      )}

      {/* Results Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : lookups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No AHRI lookups yet. Enter an AHRI number above.</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No lookups match the current filters.</div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AHRI #</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Series</TableHead>
                <TableHead>Outdoor Model</TableHead>
                <TableHead>Indoor Model</TableHead>
                <TableHead>Furnace</TableHead>
                <TableHead className="text-right">SEER2</TableHead>
                <TableHead className="text-right">EER2</TableHead>
                <TableHead className="text-right">HSPF2</TableHead>
                <TableHead className="text-right">CCap</TableHead>
                <TableHead>Refrigerant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fetched</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono font-medium">{row.ahri_number}</TableCell>
                  <TableCell>{row.outdoor_brand}</TableCell>
                  <TableCell>{row.outdoor_series}</TableCell>
                  <TableCell className="font-mono text-xs">{row.outdoor_model}</TableCell>
                  <TableCell className="font-mono text-xs">{row.indoor_model}</TableCell>
                  <TableCell className="font-mono text-xs">{row.furnace_model}</TableCell>
                  <TableCell className="text-right">{row.seer2}</TableCell>
                  <TableCell className="text-right">{row.eer2}</TableCell>
                  <TableCell className="text-right">{row.hspf2 ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.cooling_cap_btuh?.toLocaleString()}</TableCell>
                  <TableCell>{row.refrigerant}</TableCell>
                  <TableCell>
                    <Badge variant={row.model_status === "Active" ? "default" : "secondary"}>
                      {row.model_status || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.created_at ? format(new Date(row.created_at), "MM/dd/yy") : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {row.certificate_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Download Certificate"
                          onClick={() => {
                            const { data: urlData } = supabase.storage
                              .from("ahri-certificates")
                              .getPublicUrl(row.certificate_path!);
                            window.open(urlData.publicUrl, "_blank");
                          }}
                        >
                          <FileDown className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      {!row.linked_matchup_id ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Link to Equipment"
                          onClick={() => handleLinkToEquipment(row)}
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-xs">Linked</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteLookup(row.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
