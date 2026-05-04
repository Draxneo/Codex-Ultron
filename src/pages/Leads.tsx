import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Phone, Mail, Facebook, Globe, User, CheckCircle2, XCircle, MessageCircle, ArrowLeft, MapPin, RefreshCw, Undo2, Database } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";

const SOURCE_ICONS: Record<string, React.ElementType> = {
  facebook: Facebook,
  google: Globe,
  google_lsa: MapPin,
  angi: Globe,
  thumbtack: Globe,
  manual: User,
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "New", variant: "destructive" },
  contacted: { label: "Contacted", variant: "default" },
  converted: { label: "Converted", variant: "secondary" },
  lost: { label: "Lost", variant: "outline" },
};

export default function Leads() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState(searchParams.get("source") || "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  // Sync URL param
  useEffect(() => {
    const src = searchParams.get("source");
    if (src) setSourceFilter(src);
  }, [searchParams]);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", sourceFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (sourceFilter !== "all") q = q.eq("source", sourceFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);

      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const customerIds = Array.from(new Set(rows.map((lead: any) => lead.customer_id).filter(Boolean)));
      if (customerIds.length === 0) return rows;

      const { data: customers, error: customerError } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .in("id", customerIds);
      if (customerError) return rows;

      const customerMap = new Map((customers || []).map((customer: any) => [customer.id, customer]));
      return rows.map((lead: any) => ({
        ...lead,
        customers: lead.customer_id ? customerMap.get(lead.customer_id) || null : null,
      }));
    },
  });

  // Fetch revenue per customer for matched leads
  const matchedCustomerIds = (leads || [])
    .filter((l: any) => l.customer_id)
    .map((l: any) => l.customer_id as string);

  const { data: revenueMap } = useQuery({
    queryKey: ["lead-revenue", matchedCustomerIds.sort().join(",")],
    enabled: matchedCustomerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_invoices")
        .select("job_id, total, jobs!customer_invoices_job_id_fkey(customer_id)")
        .in("status", ["paid", "sent"]);
      if (error) throw error;

      const map: Record<string, number> = {};
      for (const inv of data || []) {
        const custId = (inv as any).jobs?.customer_id;
        if (custId && matchedCustomerIds.includes(custId)) {
          map[custId] = (map[custId] || 0) + Number(inv.total);
        }
      }
      return map;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, source, lsa_lead_id }: { id: string; status: string; source?: string; lsa_lead_id?: string }) => {
      const updates: Record<string, any> = { status, updated_at: new Date().toISOString() };
      if (status === "converted") {
        updates.converted_at = new Date().toISOString();
        // Stop drip on conversion
        updates.drip_sequence_id = null;
        updates.drip_step_index = null;
        updates.drip_next_at = null;
      }
      if (status === "contacted") updates.contacted_at = new Date().toISOString();
      if (status === "lost") {
        updates.drip_sequence_id = null;
        updates.drip_step_index = null;
        updates.drip_next_at = null;
      }
      if (status === "new") {
        updates.converted_at = null;
        updates.contacted_at = null;
      }

      const { error } = await supabase.from("leads").update(updates).eq("id", id);
      if (error) throw error;

      // Push status back to Google LSA if applicable
      if (source === "google_lsa" && lsa_lead_id) {
        try {
          await supabase.functions.invoke("update-lsa-lead-status", {
            body: { lead_id: id, status },
          });
        } catch (e) {
          console.error("LSA status sync failed:", e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead updated");
    },
  });

  const filtered = (leads || []).filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (l.first_name || "").toLowerCase().includes(s) ||
      (l.last_name || "").toLowerCase().includes(s) ||
      (l.phone || "").includes(s) ||
      (l.email || "").toLowerCase().includes(s)
    );
  });

  const [syncing, setSyncing] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState("");

  const handleBackfillInvoices = async () => {
    setBackfilling(true);
    let offset = 0;
    let totalImported = 0;
    let batchCount = 0;
    try {
      while (true) {
        batchCount++;
        setBackfillProgress(`Batch ${batchCount}... (${totalImported} items so far)`);
        const { data, error } = await supabase.functions.invoke("import-hcp-history", {
          body: { resource: "line_items", offset, batch_size: 20 },
        });
        if (error) throw error;
        if (data?.retry) {
          setBackfillProgress(`Rate limited, waiting ${data.retry_after || 10}s...`);
          await new Promise(r => setTimeout(r, (data.retry_after || 10) * 1000));
          continue;
        }
        totalImported += data?.imported || 0;
        offset = data?.offset || offset + 20;
        if (data?.done) break;
        await new Promise(r => setTimeout(r, 500));
      }
      toast.success(`Invoice backfill complete: ${totalImported} line items imported across ${batchCount} batches`);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (e: any) {
      toast.error("Backfill failed at batch " + batchCount + ": " + (e.message || "Unknown error"));
    } finally {
      setBackfilling(false);
      setBackfillProgress("");
    }
  };

  const handleHistoricalSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lsa-leads", {
        body: { mode: "historical", start_date: "2024-01-01" },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Historical sync complete: ${data?.inserted ?? 0} imported, ${data?.skipped ?? 0} already existed`);
    } catch (e: any) {
      toast.error("Historical sync failed: " + (e.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-lsa-booked-report");
      if (error) throw error;
      toast.success(`Report sent to ${data?.sent_to || "company email"} — ${data?.total || 0} matched leads (${data?.new_leads || 0} new)`);
    } catch (e: any) {
      toast.error("Report failed: " + (e.message || "Unknown error"));
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {!isMobile && <AppHeader />}
      <div className="container mx-auto p-4 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">Leads</h1>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" onClick={handleBackfillInvoices} disabled={backfilling}>
            <Database className={`h-4 w-4 mr-1 ${backfilling ? "animate-pulse" : ""}`} />
            {backfilling ? (backfillProgress || "Backfilling...") : "Backfill HCP Invoices"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleSendReport} disabled={sendingReport}>
            <Mail className={`h-4 w-4 mr-1`} />
            {sendingReport ? "Sending..." : "Email Matched Report"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleHistoricalSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Historical LSA"}
          </Button>
          <Badge variant="outline" className="text-sm">
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="google_lsa">Google LSA</SelectItem>
            <SelectItem value="angi">Angi</SelectItem>
            <SelectItem value="thumbtack">Thumbtack</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer Match</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No leads found</TableCell>
                </TableRow>
              ) : (
                filtered.map((lead: any) => {
                  const SourceIcon = SOURCE_ICONS[lead.source] || Globe;
                  const statusCfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                  const rev = lead.customer_id && revenueMap ? revenueMap[lead.customer_id] : null;

                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">
                        {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-sm">
                          {lead.phone && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" /> {formatPhone(lead.phone) || lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {lead.email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm capitalize">
                          <SourceIcon className="h-4 w-4 text-muted-foreground" />
                          {lead.source === "google_lsa" ? "Google LSA" : lead.source}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lead.customers ? (
                          <Link to={`/customers?search=${encodeURIComponent([lead.customers.first_name, lead.customers.last_name].filter(Boolean).join(" "))}`}>
                            <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-accent">
                              <User className="h-3 w-3 mr-1" />
                              {[lead.customers.first_name, lead.customers.last_name].filter(Boolean).join(" ")}
                            </Badge>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">New prospect</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(lead.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        {rev ? (
                          <span className="font-semibold text-emerald-600">${rev.toLocaleString()}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lead.status === "new" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus.mutate({ id: lead.id, status: "contacted", source: lead.source, lsa_lead_id: lead.lsa_lead_id })}
                              title="Mark contacted"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {lead.status !== "converted" && lead.status !== "lost" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateStatus.mutate({ id: lead.id, status: "converted", source: lead.source, lsa_lead_id: lead.lsa_lead_id })}
                                title="Mark converted"
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateStatus.mutate({ id: lead.id, status: "lost", source: lead.source, lsa_lead_id: lead.lsa_lead_id })}
                                title="Mark lost"
                              >
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                          {(lead.status === "converted" || lead.status === "lost") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus.mutate({ id: lead.id, status: "new", source: lead.source, lsa_lead_id: lead.lsa_lead_id })}
                              title="Undo — revert to New"
                            >
                              <Undo2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
