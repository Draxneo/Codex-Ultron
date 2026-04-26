import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, RefreshCw, Trash2, ChevronDown, Users, AlertCircle, Save, Download } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { format } from "date-fns";

interface FilterRules {
  geo?: string[];
  job_type?: string | null;
  has_agreement?: boolean;
  min_days_since_job?: number | null;
  estimate_not_converted?: boolean;
  date_range?: { from?: string; to?: string } | null;
}

interface MetaAudience {
  id: string;
  name: string;
  meta_audience_id: string | null;
  filter_rules: FilterRules;
  last_synced_at: string | null;
  last_sync_count: number;
  status: string;
  created_at: string;
}

interface SyncLog {
  id: string;
  audience_id: string;
  customers_synced: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

const SA_ZIPS = [
  "78201","78202","78203","78204","78205","78206","78207","78208","78209","78210",
  "78211","78212","78213","78214","78215","78216","78217","78218","78219","78220",
  "78221","78222","78223","78224","78225","78226","78227","78228","78229","78230",
  "78231","78232","78233","78234","78235","78236","78237","78238","78239","78240",
  "78241","78242","78243","78244","78245","78246","78247","78248","78249","78250",
  "78251","78252","78253","78254","78255","78256","78257","78258","78259","78260",
  "78261","78263","78264","78266",
];

export function MetaAudiencesCard() {
  const { settings, updateSettings } = useCompanySettings();
  const { confirmDelete } = useConfirm();
  const [audiences, setAudiences] = useState<MetaAudience[]>([]);
  const [syncs, setSyncs] = useState<Record<string, SyncLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAudience, setEditingAudience] = useState<MetaAudience | null>(null);
  const [adAccountId, setAdAccountId] = useState("");
  const [adAccountDirty, setAdAccountDirty] = useState(false);
  const [metaToken, setMetaToken] = useState("");
  const [metaTokenDirty, setMetaTokenDirty] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formGeoEnabled, setFormGeoEnabled] = useState(false);
  const [formGeoZips, setFormGeoZips] = useState("");
  const [formJobType, setFormJobType] = useState<string>("all");
  const [formHasAgreement, setFormHasAgreement] = useState(false);
  const [formDormantDays, setFormDormantDays] = useState("");
  const [formEstimateNotConverted, setFormEstimateNotConverted] = useState(false);
  const [formDateFrom, setFormDateFrom] = useState("");
  const [formDateTo, setFormDateTo] = useState("");

  useEffect(() => {
    setAdAccountId((settings as any).meta_ad_account_id || "");
    const token = (settings as any).meta_access_token || "";
    setMetaToken(token ? "••••••••••••••••" : "");
    setTokenSaved(!!token);
  }, [settings]);

  useEffect(() => {
    loadAudiences();
  }, []);

  async function loadAudiences() {
    setLoading(true);
    const { data } = await supabase
      .from("meta_audiences" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setAudiences((data as any[]) || []);

    // Load recent syncs for each audience
    if (data && data.length > 0) {
      const ids = (data as any[]).map((a) => a.id);
      const { data: syncData } = await supabase
        .from("meta_audience_syncs" as any)
        .select("*")
        .in("audience_id", ids)
        .order("created_at", { ascending: false })
        .limit(50);
      const grouped: Record<string, SyncLog[]> = {};
      for (const s of (syncData as any[]) || []) {
        if (!grouped[s.audience_id]) grouped[s.audience_id] = [];
        grouped[s.audience_id].push(s);
      }
      setSyncs(grouped);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditingAudience(null);
    setFormName("");
    setFormGeoEnabled(false);
    setFormGeoZips(SA_ZIPS.join(", "));
    setFormJobType("all");
    setFormHasAgreement(false);
    setFormDormantDays("");
    setFormEstimateNotConverted(false);
    setFormDateFrom("");
    setFormDateTo("");
    setDialogOpen(true);
  }

  function openEdit(a: MetaAudience) {
    setEditingAudience(a);
    const f = a.filter_rules || {};
    setFormName(a.name);
    setFormGeoEnabled(!!f.geo && f.geo.length > 0);
    setFormGeoZips(f.geo?.join(", ") || SA_ZIPS.join(", "));
    setFormJobType(f.job_type || "all");
    setFormHasAgreement(!!f.has_agreement);
    setFormDormantDays(f.min_days_since_job?.toString() || "");
    setFormEstimateNotConverted(!!f.estimate_not_converted);
    setFormDateFrom(f.date_range?.from || "");
    setFormDateTo(f.date_range?.to || "");
    setDialogOpen(true);
  }

  async function saveAudience() {
    const filter_rules: FilterRules = {};
    if (formGeoEnabled && formGeoZips.trim()) {
      filter_rules.geo = formGeoZips.split(",").map((z) => z.trim()).filter(Boolean);
    }
    if (formJobType !== "all") filter_rules.job_type = formJobType;
    if (formHasAgreement) filter_rules.has_agreement = true;
    if (formDormantDays) filter_rules.min_days_since_job = parseInt(formDormantDays);
    if (formEstimateNotConverted) filter_rules.estimate_not_converted = true;
    if (formDateFrom || formDateTo) {
      filter_rules.date_range = {};
      if (formDateFrom) filter_rules.date_range.from = formDateFrom;
      if (formDateTo) filter_rules.date_range.to = formDateTo;
    }

    if (editingAudience) {
      await supabase
        .from("meta_audiences" as any)
        .update({ name: formName, filter_rules } as any)
        .eq("id", editingAudience.id);
    } else {
      await supabase
        .from("meta_audiences" as any)
        .insert({ name: formName, filter_rules } as any);
    }

    setDialogOpen(false);
    toast({ title: editingAudience ? "Audience updated" : "Audience created" });
    loadAudiences();
  }

  async function deleteAudience(id: string) {
    const ok = await confirmDelete("audience", {
      onConfirm: async () => {
        await supabase.from("meta_audiences" as any).delete().eq("id", id);
      },
    });
    if (!ok) return;
    toast({ title: "Audience deleted" });
    loadAudiences();
  }

  async function syncAudience(id: string) {
    setSyncing(id);
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-audience", {
        body: { audience_id: id },
      });
      if (error) throw error;
      toast({ title: "Sync complete", description: `${data.customers_synced} customers pushed to Meta` });
      loadAudiences();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  }

  async function downloadGoogleCsv(audience: MetaAudience) {
    setDownloading(audience.id);
    try {
      const { data, error } = await supabase.functions.invoke("export-audience-csv", {
        body: { audience_id: audience.id },
      });
      if (error) throw error;

      // data comes back as text since the function returns text/csv
      const csvText = typeof data === "string" ? data : await (data as Blob).text?.() || JSON.stringify(data);
      const blob = new Blob([csvText], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${audience.name.replace(/[^a-zA-Z0-9]/g, "_")}_google_audience.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV downloaded", description: "Upload this file to Google Ads → Audience Manager → Customer List" });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }
  const [downloadingAll, setDownloadingAll] = useState(false);

  async function downloadAllCustomersCsv() {
    setDownloadingAll(true);
    try {
      let allCustomers: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("customers")
          .select("first_name, last_name, email, phone, mobile_phone, city, state, zip")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allCustomers = allCustomers.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Filter to those with email or phone
      const filtered = allCustomers.filter((c: any) => c.email || c.phone || c.mobile_phone);

      const header = "Email,Phone,First Name,Last Name,Country,Zip";
      const rows = filtered.map((c: any) => {
        const phone = (c.mobile_phone || c.phone || "").replace(/\D/g, "");
        const formattedPhone = phone ? (phone.startsWith("1") ? `+${phone}` : `+1${phone}`) : "";
        return [
          c.email || "",
          formattedPhone,
          c.first_name || "",
          c.last_name || "",
          "US",
          c.zip || "",
        ].map(v => `"${(v || "").replace(/"/g, '""')}"`).join(",");
      });

      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all_customers_google_audience_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV downloaded", description: `${filtered.length} customers exported. Upload to Google Ads → Audience Manager → Customer List` });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingAll(false);
    }
  }

  function saveAdAccountId() {
    updateSettings.mutate({ meta_ad_account_id: adAccountId } as any);
    setAdAccountDirty(false);
  }

  function saveMetaToken() {
    updateSettings.mutate({ meta_access_token: metaToken } as any);
    setMetaTokenDirty(false);
    setTokenSaved(true);
    toast({ title: "Access token saved" });
  }

  function filterSummary(f: FilterRules): string {
    const parts: string[] = [];
    if (f.geo?.length) parts.push(`${f.geo.length} zips`);
    if (f.job_type) parts.push(f.job_type);
    if (f.has_agreement) parts.push("agreement");
    if (f.min_days_since_job) parts.push(`${f.min_days_since_job}d dormant`);
    if (f.estimate_not_converted) parts.push("unconverted");
    if (f.date_range) parts.push("date range");
    return parts.join(" · ") || "All customers";
  }

  return (
    <div className="space-y-6">
      {/* Quick Export — Full Customer Base */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Google Ads — Export Full Customer List</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Downloads all customers with email/phone as a CSV ready for Google Ads Customer Match / Lookalike Audience
              </p>
            </div>
            <Button onClick={downloadAllCustomersCsv} disabled={downloadingAll}>
              <Download className={`h-4 w-4 mr-2 ${downloadingAll ? "animate-pulse" : ""}`} />
              {downloadingAll ? "Exporting…" : "Download Google CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {/* Ad Account Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Meta Ad Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Ad Account ID</Label>
              <Input
                placeholder="e.g. 123456789"
                value={adAccountId}
                onChange={(e) => { setAdAccountId(e.target.value); setAdAccountDirty(true); }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Find this in Meta Business Suite → Ad Accounts. Prefix "act_" is added automatically.
              </p>
            </div>
            {adAccountDirty && (
              <Button size="sm" onClick={saveAdAccountId}>
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            )}
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label>Access Token</Label>
              <Input
                type="password"
                placeholder="Paste your Meta System User Access Token"
                value={metaToken}
                onChange={(e) => { setMetaToken(e.target.value); setMetaTokenDirty(true); setTokenSaved(false); }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Meta Business Suite → System Users → Generate Token with <code>ads_management</code> permission.
              </p>
            </div>
            {metaTokenDirty && (
              <Button size="sm" onClick={saveMetaToken}>
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            )}
            {tokenSaved && !metaTokenDirty && (
              <Badge variant="default" className="mb-1 text-[10px]">Saved</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audiences */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Custom Audiences</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3 w-3 mr-1" /> New Audience
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : audiences.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No audiences yet. Create one to start syncing customers to Meta.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audiences.map((a) => (
                <Collapsible key={a.id}>
                  <div className="border rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{a.name}</span>
                          <Badge variant={a.status === "active" ? "default" : "secondary"} className="text-[10px]">
                            {a.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {filterSummary(a.filter_rules as FilterRules)}
                          {a.last_synced_at && (
                            <> · {a.last_sync_count} customers · synced {format(new Date(a.last_synced_at), "MMM d, h:mm a")}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncAudience(a.id)}
                          disabled={syncing === a.id || !adAccountId}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${syncing === a.id ? "animate-spin" : ""}`} />
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadGoogleCsv(a)}
                          disabled={downloading === a.id}
                          title="Download CSV for Google Ads Lookalike Audience"
                        >
                          <Download className={`h-3 w-3 mr-1 ${downloading === a.id ? "animate-pulse" : ""}`} />
                          Google CSV
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAudience(a.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button size="sm" variant="ghost"><ChevronDown className="h-3 w-3" /></Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs font-medium mb-2">Sync History</p>
                        {(!syncs[a.id] || syncs[a.id].length === 0) ? (
                          <p className="text-xs text-muted-foreground">No syncs yet</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Customers</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {syncs[a.id].slice(0, 5).map((s) => (
                                <TableRow key={s.id}>
                                  <TableCell className="text-xs">{format(new Date(s.created_at), "MMM d, h:mm a")}</TableCell>
                                  <TableCell className="text-xs">{s.customers_synced}</TableCell>
                                  <TableCell>
                                    <Badge variant={s.status === "success" ? "default" : s.status === "running" ? "secondary" : "destructive"} className="text-[10px]">
                                      {s.status}
                                    </Badge>
                                    {s.error_message && (
                                      <span className="text-xs text-destructive ml-2">{s.error_message}</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAudience ? "Edit Audience" : "New Audience"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Audience Name</Label>
              <Input placeholder="e.g. SA Install Customers 2025" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>

            {/* Geo Filter */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Filter by San Antonio Zip Codes</Label>
                <p className="text-xs text-muted-foreground">Only push customers in your service area</p>
              </div>
              <Switch checked={formGeoEnabled} onCheckedChange={setFormGeoEnabled} />
            </div>
            {formGeoEnabled && (
              <div>
                <Label>Zip Codes (comma-separated)</Label>
                <Input value={formGeoZips} onChange={(e) => setFormGeoZips(e.target.value)} className="text-xs" />
              </div>
            )}

            {/* Job Type */}
            <div>
              <Label>Job Type</Label>
              <Select value={formJobType} onValueChange={setFormJobType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="install">Install</SelectItem>
                  <SelectItem value="service">Service / Repair</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Agreement */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Active Maintenance Agreement</Label>
                <p className="text-xs text-muted-foreground">Only customers with a current plan</p>
              </div>
              <Switch checked={formHasAgreement} onCheckedChange={setFormHasAgreement} />
            </div>

            {/* Dormant */}
            <div>
              <Label>Dormant (days since last job)</Label>
              <Input type="number" placeholder="e.g. 365" value={formDormantDays} onChange={(e) => setFormDormantDays(e.target.value)} />
            </div>

            {/* Unconverted estimates */}
            <div className="flex items-center justify-between">
              <div>
                <Label>Estimate Not Converted</Label>
                <p className="text-xs text-muted-foreground">Got an estimate but never became a job</p>
              </div>
              <Switch checked={formEstimateNotConverted} onCheckedChange={setFormEstimateNotConverted} />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Date From</Label>
                <Input type="date" value={formDateFrom} onChange={(e) => setFormDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>Date To</Label>
                <Input type="date" value={formDateTo} onChange={(e) => setFormDateTo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAudience} disabled={!formName.trim()}>
              {editingAudience ? "Save Changes" : "Create Audience"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
