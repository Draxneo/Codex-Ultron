import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAutoCorrectTextarea } from "@/hooks/useAutoCorrect";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useVendorList,
  useVendorContacts,
  useVendorSms,
  useVendorCalls,
  useVendorOrders,
  useVendorLocations,
} from "@/hooks/useVendors";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DictateButton } from "@/components/voice/DictateButton";
import {
  Mail, Users, MessageSquare, PhoneCall, Package, User, Plus, Pencil, Trash2,
  Loader2, Send, Sparkles, MapPin, Clock, Phone, Hash,
} from "lucide-react";
import { AddressLink } from "@/components/AddressLink";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSendSms } from "@/hooks/useSendSms";
import { format } from "date-fns";

import { VendorHeaderV2 } from "@/components/vendor-v2/VendorHeaderV2";
import { SummaryCard } from "@/components/vendor-v2/cards/SummaryCard";
import { AccountInfoCard } from "@/components/vendor-v2/cards/AccountInfoCard";
import { BrandAffinityCard } from "@/components/vendor-v2/cards/BrandAffinityCard";
import { PrimaryContactCard } from "@/components/vendor-v2/cards/PrimaryContactCard";
import { PrivateNotesCard } from "@/components/vendor-v2/cards/PrivateNotesCard";
import { VendorActivityFeed } from "@/components/vendor-v2/main/ActivityFeed";

const tabTriggerClass =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm font-semibold uppercase tracking-wide";

export default function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("contacts");
  const { data: vendors = [], isLoading: loadingList } = useVendorList();
  const vendor = vendors.find((v) => v.id === id);
  const { data: contacts = [] } = useVendorContacts(id);
  const { data: smsMessages = [] } = useVendorSms(id!);
  const { data: calls = [] } = useVendorCalls(id!);
  const { data: orders = [] } = useVendorOrders(id!);
  const { data: locations = [] } = useVendorLocations(id);

  if (loadingList) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <div className="max-w-[1600px] mx-auto p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background">
        {!isMobile && <AppHeader />}
        <div className="max-w-[1600px] mx-auto p-6">
          <p className="text-muted-foreground">Vendor not found.</p>
        </div>
      </div>
    );
  }

  const lastOrderDate = orders[0]?.created_at || null;

  return (
    <div className="min-h-screen bg-muted/20">
      {!isMobile && <AppHeader />}
      <VendorHeaderV2
        vendorId={id!}
        name={vendor.name}
        accountNumber={vendor.account_number}
        primaryPhone={vendor.contact_phone}
        textSupportPhone={vendor.text_support_phone}
        orderingUrl={vendor.ordering_url}
        websiteUrl={vendor.website_url}
        brandAffinity={vendor.brand_affinity}
      />

      <div className="max-w-[1600px] mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          {/* Sidebar */}
          <aside className="space-y-4">
            <SummaryCard
              totalOrders={orders.length}
              lastOrderDate={lastOrderDate}
              contactCount={contacts.length}
              branchCount={locations.length}
            />
            <PrimaryContactCard contacts={contacts as any} />
            <AccountInfoCard
              accountNumber={vendor.account_number}
              phone={vendor.contact_phone}
              textSupportPhone={vendor.text_support_phone}
              email={vendor.contact_email}
              websiteUrl={vendor.website_url}
              orderingUrl={vendor.ordering_url}
            />
            <BrandAffinityCard brands={vendor.brand_affinity} />
            <PrivateNotesCard vendorId={id!} />
          </aside>

          {/* Main */}
          <main className="space-y-4 min-w-0">
            <Card className="shadow-none border overflow-hidden">
              <Tabs value={tab} onValueChange={setTab}>
                <div className="border-b bg-background overflow-x-auto">
                  <TabsList className="w-full justify-start px-2 bg-transparent rounded-none h-auto p-0 gap-0">
                    <TabsTrigger value="contacts" className={tabTriggerClass}>
                      <Users className="h-3.5 w-3.5 mr-1.5" /> Contacts
                      {contacts.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{contacts.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="sms" className={tabTriggerClass}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> SMS
                      {smsMessages.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{smsMessages.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="calls" className={tabTriggerClass}>
                      <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Calls
                      {calls.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{calls.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="orders" className={tabTriggerClass}>
                      <Package className="h-3.5 w-3.5 mr-1.5" /> Orders
                      {orders.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{orders.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="locations" className={tabTriggerClass}>
                      <MapPin className="h-3.5 w-3.5 mr-1.5" /> Locations
                      {locations.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{locations.length}</Badge>}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-4">
                  <TabsContent value="contacts" className="mt-0">
                    <ContactsTab vendorId={id!} contacts={contacts} />
                  </TabsContent>
                  <TabsContent value="sms" className="mt-0">
                    <SmsTab messages={smsMessages} />
                  </TabsContent>
                  <TabsContent value="calls" className="mt-0">
                    <CallsTab calls={calls} />
                  </TabsContent>
                  <TabsContent value="orders" className="mt-0">
                    <OrdersTab orders={orders} />
                  </TabsContent>
                  <TabsContent value="locations" className="mt-0">
                    <LocationsTab locations={locations} />
                  </TabsContent>
                </div>
              </Tabs>
            </Card>

            <VendorActivityFeed vendorId={id!} />
          </main>
        </div>
      </div>
    </div>
  );
}

/* ─── Contacts Tab ─── */
function ContactsTab({ vendorId, contacts }: { vendorId: string; contacts: any[] }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [smsContactId, setSmsContactId] = useState<string | null>(null);

  const upsert = useMutation({
    mutationFn: async (c: any) => {
      if (c.id) {
        const { error } = await supabase.from("vendor_contacts").update(c as any).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vendor_contacts").insert({ ...c, supply_house_id: vendorId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor_contacts"] });
      setAdding(false);
      setEditId(null);
      toast({ title: "Contact saved" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor_contacts"] });
      toast({ title: "Contact removed" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">Contacts are auto-harvested from inbound emails. Add manually below.</p>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdding(!adding)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {adding && (
        <ContactForm
          onSave={(c) => upsert.mutate(c)}
          isPending={upsert.isPending}
          onCancel={() => setAdding(false)}
        />
      )}

      {contacts.length === 0 && !adding && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No contacts yet.</CardContent></Card>
      )}

      {contacts.map((c) => (
        <Card key={c.id}>
          <CardContent className="py-3 px-4">
            {editId === c.id ? (
              <ContactForm initial={c} onSave={(u) => upsert.mutate({ ...u, id: c.id })} isPending={upsert.isPending} onCancel={() => setEditId(null)} />
            ) : (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{c.name}</span>
                        {c.is_primary && <Badge variant="outline" className="text-[9px] h-4">Primary</Badge>}
                        {c.title && <span className="text-xs text-muted-foreground">· {c.title}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-0.5">
                        {c.email && <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>}
                        {c.phone && (
                          <>
                            <ClickToCall phone={c.phone} contactName={c.name} className="text-primary hover:underline" showIcon={false} />
                            <SmsButton phone={c.phone} iconClassName="h-3 w-3" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {c.phone && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-[hsl(var(--complete))]"
                        title={`Text ${c.name}`}
                        onClick={() => setSmsContactId(smsContactId === c.id ? null : c.id)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {c.phone && (
                      <ClickToCall phone={c.phone} contactName={c.name} className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent" iconClassName="h-3.5 w-3.5" showIcon={true}>
                        <span className="sr-only">Call {c.name}</span>
                      </ClickToCall>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(c.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {smsContactId === c.id && c.phone && (
                  <QuickSmsCompose
                    phone={c.phone}
                    contactName={c.name}
                    vendorId={vendorId}
                    onSent={() => setSmsContactId(null)}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickSmsCompose({ phone, contactName, vendorId, onSent }: {
  phone: string; contactName: string; vendorId: string; onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const { handleChange: handleBodyChange, textareaRef: bodyRef } = useAutoCorrectTextarea(body, setBody, "safe");
  const queryClient = useQueryClient();
  const { sendSms } = useSendSms();

  const send = useMutation({
    mutationFn: async () => {
      // Single authoritative send — the edge fn now persists contactName /
      // contactType / relatedVendorId in the same sms_log row, so no second
      // insert is needed (this fixes the duplicate-message-in-thread bug).
      await sendSms({
        to: phone,
        body: body.trim(),
        contactName,
        contactType: "vendor",
        relatedVendorId: vendorId,
        source: "vendor_compose",
        silent: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor_sms", vendorId] });
      toast({ title: "SMS sent", description: `Message sent to ${contactName}` });
      setBody("");
      onSent();
    },
    onError: (err: any) => toast({ title: "Failed to send SMS", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="border-t pt-2 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Text {contactName} at {phone}</span>
        </div>
        <DictateButton size="xs" onTranscript={(text) => setBody((prev) => (prev ? `${prev} ${text}` : text))} />
      </div>
      <Textarea ref={bodyRef} value={body} onChange={handleBodyChange} placeholder="Type your message..." className="min-h-[60px] text-sm resize-none" autoFocus />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onSent}>Cancel</Button>
        <Button size="sm" className="gap-1.5" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Send
        </Button>
      </div>
    </div>
  );
}

function ContactForm({ initial, onSave, isPending, onCancel }: {
  initial?: any; onSave: (c: any) => void; isPending: boolean; onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [title, setTitle] = useState(initial?.title || "");

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onSave({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, title: title.trim() || null }); }} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" required className="h-8 text-sm" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="h-8 text-sm" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="h-8 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>{isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* Emails Tab and QuickEmailReply removed — email system was ripped out */

/* ─── SMS Tab ─── */
function SmsTab({ messages }: { messages: any[] }) {
  if (messages.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No SMS linked to this vendor yet.</CardContent></Card>;
  return (
    <div className="space-y-2">
      {messages.map((m: any) => (
        <Card key={m.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Badge variant={m.direction === "inbound" ? "secondary" : "outline"} className="text-[10px]">{m.direction}</Badge>
              <span>{m.phone_number}</span>
              <span>{m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : ""}</span>
            </div>
            <p className="text-sm">{m.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Calls Tab ─── */
function CallsTab({ calls }: { calls: any[] }) {
  if (calls.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No calls linked to this vendor yet.</CardContent></Card>;
  return (
    <div className="space-y-2">
      {calls.map((c: any) => (
        <Card key={c.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant={c.direction === "inbound" ? "secondary" : "outline"} className="text-[10px]">{c.direction}</Badge>
                <span className="text-sm font-medium">{c.contact_name || c.phone_number}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.created_at ? format(new Date(c.created_at), "MMM d, h:mm a") : ""}
                {c.duration_seconds != null && <span className="ml-2">{Math.floor(c.duration_seconds / 60)}m {c.duration_seconds % 60}s</span>}
              </div>
            </div>
            {c.ai_summary && <p className="text-xs text-muted-foreground mt-1">{c.ai_summary}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Orders Tab ─── */
function OrdersTab({ orders }: { orders: any[] }) {
  if (orders.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No orders from this vendor yet.</CardContent></Card>;
  return (
    <div className="space-y-2">
      {orders.map((o: any) => (
        <Card key={o.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm font-medium">{o.description || "Order"}</span>
                {o.po_number && <span className="text-xs text-muted-foreground ml-2">PO #{o.po_number}</span>}
                {o.status && <Badge variant="outline" className="ml-2 text-[10px]">{o.status}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground shrink-0 ml-2">
                {o.created_at ? format(new Date(o.created_at), "MMM d, yyyy") : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Locations Tab ─── */
function LocationsTab({ locations }: { locations: any[] }) {
  if (locations.length === 0) return <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No branch locations saved for this vendor.</CardContent></Card>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {locations.map((loc: any) => (
        <Card key={loc.id}>
          <CardContent className="py-3 px-4 space-y-1.5 text-sm">
            <div className="font-medium">{loc.branch_name}</div>
            {loc.latitude && loc.longitude && (
              <div className="rounded-md overflow-hidden border" style={{ height: 140 }}>
                <iframe
                  src={`https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&z=14&output=embed`}
                  title={`Map of ${loc.branch_name}`}
                  className="w-full h-full border-0"
                  loading="lazy"
                  allowFullScreen={false}
                />
              </div>
            )}
            {loc.address && (
              <AddressLink
                address={[loc.address, loc.city, [loc.state, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                className="text-sm text-muted-foreground"
                iconClassName="h-4 w-4 mt-0.5"
              />
            )}
            {loc.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <ClickToCall phone={loc.phone} className="text-primary hover:underline" showIcon={false} />
                <SmsButton phone={loc.phone} iconClassName="h-3.5 w-3.5" />
              </div>
            )}
            {loc.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${loc.email}`} className="text-primary hover:underline">{loc.email}</a>
              </div>
            )}
            {loc.hours && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{loc.hours}</span>
              </div>
            )}
            {loc.account_number && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Hash className="h-4 w-4 shrink-0" />
                <span>Acct: {loc.account_number}</span>
              </div>
            )}
            {loc.rep_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-4 w-4 shrink-0" />
                <span>{loc.rep_name}</span>
                {loc.rep_phone && (
                  <ClickToCall phone={loc.rep_phone} contactName={loc.rep_name} className="text-primary hover:underline text-xs ml-1" showIcon={false} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
