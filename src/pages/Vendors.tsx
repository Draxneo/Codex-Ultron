import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVendorList, useVendorContacts } from "@/hooks/useVendors";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Store, Search, Hash, Phone, Users, Plus, Loader2, ArrowLeft, MapPin, ExternalLink, LayoutList, LayoutGrid, ArrowDownAZ, Clock, MessageSquare, Mail } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import SupplyHouseLocations from "@/components/SupplyHouseLocations";
import { QuickLinksGrid } from "@/components/QuickLinksGrid";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { PendingContactSuggestions } from "@/components/vendor-v2/PendingContactSuggestions";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export default function Vendors() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: vendors = [], isLoading } = useVendorList();
  const { data: allContacts = [] } = useVendorContacts();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<"table" | "card">("table");
  const [sortMode, setSortMode] = useState<"recent" | "az">("az");
  const [letterFilter, setLetterFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Aggregate metrics: order counts, branch counts
  const { data: metrics } = useQuery({
    queryKey: ["vendor_list_metrics"],
    queryFn: async () => {
      const [orders, branches] = await Promise.all([
        supabase.from("parts_orders").select("supply_house_id, created_at"),
        supabase.from("supply_house_locations").select("supply_house_id").eq("is_active", true),
      ]);
      const orderMap = new Map<string, { count: number; last: string | null }>();
      (orders.data || []).forEach((o: any) => {
        if (!o.supply_house_id) return;
        const existing = orderMap.get(o.supply_house_id) || { count: 0, last: null };
        existing.count += 1;
        if (!existing.last || (o.created_at && o.created_at > existing.last)) existing.last = o.created_at;
        orderMap.set(o.supply_house_id, existing);
      });
      const branchMap = new Map<string, number>();
      (branches.data || []).forEach((b: any) => {
        if (!b.supply_house_id) return;
        branchMap.set(b.supply_house_id, (branchMap.get(b.supply_house_id) || 0) + 1);
      });
      const emailMap = new Map<string, number>();
      return { orderMap, branchMap, emailMap };
    },
  });

  const addVendor = useMutation({
    mutationFn: async (vendor: { name: string; account_number?: string; contact_phone?: string; contact_email?: string }) => {
      const { error } = await supabase.from("supply_houses").insert(vendor as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_houses_full"] });
      toast({ title: "Vendor added" });
      setAddOpen(false);
    },
  });

  const contactsByVendor = useMemo(() => {
    const m = new Map<string, any[]>();
    allContacts.forEach((c) => {
      const arr = m.get(c.supply_house_id) || [];
      arr.push(c);
      m.set(c.supply_house_id, arr);
    });
    return m;
  }, [allContacts]);

  const enriched = useMemo(() => {
    const active = vendors.filter((v) => v.is_active !== false);
    return active.map((v) => {
      const contacts = contactsByVendor.get(v.id) || [];
      const primary = contacts.find((c) => c.is_primary) || contacts[0];
      const orderInfo = metrics?.orderMap.get(v.id);
      return {
        ...v,
        contacts,
        primaryContact: primary,
        orderCount: orderInfo?.count || 0,
        lastOrderDate: orderInfo?.last || null,
        branchCount: metrics?.branchMap.get(v.id) || 0,
        emailCount: metrics?.emailMap.get(v.id) || 0,
      };
    });
  }, [vendors, contactsByVendor, metrics]);

  const filtered = useMemo(() => {
    let rows = enriched.filter((v) =>
      !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.account_number?.toLowerCase().includes(search.toLowerCase()) ||
      v.brand_affinity?.some((b) => b.toLowerCase().includes(search.toLowerCase()))
    );
    if (letterFilter) {
      if (letterFilter === "#") rows = rows.filter((v) => /^[^a-z]/i.test(v.name[0] || ""));
      else rows = rows.filter((v) => v.name[0]?.toUpperCase() === letterFilter);
    }
    if (sortMode === "az") rows.sort((a, b) => a.name.localeCompare(b.name));
    else rows.sort((a, b) => {
      const at = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0;
      const bt = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0;
      return bt - at;
    });
    return rows;
  }, [enriched, search, letterFilter, sortMode]);

  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col">
      {!isMobile && <AppHeader />}
      <div className="px-4 py-4 space-y-4 flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Store className="h-5 w-5 text-amber-500" /> Vendors
            </h2>
            <span className="text-xs text-muted-foreground">{filtered.length} of {enriched.length}</span>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
              <AddVendorForm onSave={(v) => addVendor.mutate(v)} isPending={addVendor.isPending} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="vendors" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full bg-muted/60">
            <TabsTrigger value="vendors" className="flex-1 gap-1.5 data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Store className="h-4 w-4" /> Vendors
            </TabsTrigger>
            <TabsTrigger value="locations" className="flex-1 gap-1.5 data-[state=active]:bg-[hsl(var(--complete))] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <MapPin className="h-4 w-4" /> Locations
            </TabsTrigger>
            <TabsTrigger value="portals" className="flex-1 gap-1.5 data-[state=active]:bg-[hsl(var(--sky))] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <ExternalLink className="h-4 w-4" /> Portals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vendors" className="mt-4 space-y-3 flex-1 overflow-hidden flex flex-col">
            <PendingContactSuggestions />
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, account #, or brand…"
                  className="pl-9 h-9"
                />
              </div>
              <ToggleGroup type="single" value={sortMode} onValueChange={(v) => v && setSortMode(v as any)}>
                <ToggleGroupItem value="recent" size="sm" title="Recent orders"><Clock className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="az" size="sm" title="A–Z"><ArrowDownAZ className="h-4 w-4" /></ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as any)}>
                <ToggleGroupItem value="table" size="sm"><LayoutList className="h-4 w-4" /></ToggleGroupItem>
                <ToggleGroupItem value="card" size="sm"><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* A-Z filter */}
            {sortMode === "az" && (
              <div className="flex flex-wrap gap-1">
                {LETTERS.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLetterFilter(letterFilter === l ? null : l)}
                    className={cn(
                      "h-6 w-6 rounded text-[11px] font-medium hover:bg-accent",
                      letterFilter === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {search || letterFilter ? "No vendors match your filters." : "No vendors yet."}
                </CardContent>
              </Card>
            ) : view === "table" ? (
              <div className="border rounded-md overflow-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Account #</TableHead>
                      <TableHead>Primary contact</TableHead>
                      <TableHead>Brands</TableHead>
                      <TableHead className="text-right">Branches</TableHead>
                      <TableHead className="text-right">Emails</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead>Last order</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((v) => (
                      <TableRow key={v.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/vendors/${v.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium">
                            <Store className="h-4 w-4 text-amber-500 shrink-0" />
                            {v.name}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{v.account_number || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {v.primaryContact ? (
                            <div>
                              <div className="font-medium">{v.primaryContact.name}</div>
                              {v.primaryContact.title && <div className="text-xs text-muted-foreground">{v.primaryContact.title}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {v.brand_affinity?.slice(0, 3).map((b) => (
                              <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
                            ))}
                            {(v.brand_affinity?.length || 0) > 3 && (
                              <Badge variant="outline" className="text-[10px]">+{v.brand_affinity!.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{v.branchCount || "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {v.emailCount ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {v.emailCount}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm">{v.orderCount || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {v.lastOrderDate ? new Date(v.lastOrderDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {(v.primaryContact?.phone || v.contact_phone) && (
                              <ClickToCall
                                phone={v.primaryContact?.phone || v.contact_phone!}
                                contactName={v.name}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent"
                                iconClassName="h-3.5 w-3.5"
                              />
                            )}
                            {(v.primaryContact?.phone || v.text_support_phone || v.contact_phone) && (
                              <SmsButton
                                phone={v.primaryContact?.phone || v.text_support_phone || v.contact_phone!}
                                iconClassName="h-3.5 w-3.5"
                              />
                            )}
                            {v.ordering_url && (
                              <a
                                href={v.ordering_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
                                title="Open ordering portal"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 overflow-auto flex-1">
                {filtered.map((v) => (
                  <Card
                    key={v.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/vendors/${v.id}`)}
                  >
                    <CardContent className="py-3 px-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Store className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="font-medium truncate">{v.name}</span>
                        </div>
                        {v.contacts.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                            <Users className="h-3 w-3" /> {v.contacts.length}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {v.account_number && (
                          <span className="flex items-center gap-1 font-mono"><Hash className="h-3 w-3" /> {v.account_number}</span>
                        )}
                        {v.contact_phone && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {v.contact_phone}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {v.brand_affinity?.slice(0, 3).map((b) => (
                            <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>
                          ))}
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {v.orderCount > 0 ? `${v.orderCount} orders` : "No orders"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <SupplyHouseLocations />
          </TabsContent>

          <TabsContent value="portals" className="mt-4">
            <QuickLinksGrid onlyCategories={["Supply Houses"]} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AddVendorForm({ onSave, isPending }: { onSave: (v: any) => void; isPending: boolean }) {
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
          name: name.trim(),
          account_number: account.trim() || null,
          contact_phone: phone.trim() || null,
          contact_email: email.trim() || null,
        });
      }}
      className="space-y-3"
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name *" required />
      <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Account #" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Vendor"}
      </Button>
    </form>
  );
}
