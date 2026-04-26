import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Store, Hash, Phone, Globe, Mail, Pencil, Trash2, Loader2, MessageSquare, Users, ChevronDown, ChevronRight, User } from "lucide-react";
import { ClickToCall } from "@/components/ClickToCall";
import { SmsButton } from "@/components/SmsButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SupplyHouse {
  id: string;
  name: string;
  website_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  account_number: string | null;
  notes: string | null;
  is_active: boolean | null;
  ordering_url: string | null;
  text_support_phone: string | null;
  brand_affinity: string[] | null;
}

interface VendorContact {
  id: string;
  supply_house_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  notes: string | null;
  is_primary: boolean | null;
}

export function VendorManager() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["supply_houses_full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supply_houses")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as SupplyHouse[];
    },
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: ["vendor_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_contacts")
        .select("*")
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return data as VendorContact[];
    },
  });

  const upsertVendor = useMutation({
    mutationFn: async (vendor: Partial<SupplyHouse> & { name: string }) => {
      if (vendor.id) {
        const { error } = await supabase.from("supply_houses").update(vendor).eq("id", vendor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("supply_houses").insert(vendor as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_houses_full"] });
      queryClient.invalidateQueries({ queryKey: ["supply_houses"] });
      toast({ title: "Vendor saved" });
      setAddOpen(false);
      setEditingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteVendor = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("supply_houses").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply_houses_full"] });
      queryClient.invalidateQueries({ queryKey: ["supply_houses"] });
      toast({ title: "Vendor deactivated" });
    },
  });

  const active = vendors.filter((v) => v.is_active !== false);
  const inactive = vendors.filter((v) => v.is_active === false);

  const contactsByVendor = (id: string) => allContacts.filter(c => c.supply_house_id === id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage the supply houses and vendors you purchase from. Contacts are auto-harvested from inbound emails.
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
            </DialogHeader>
            <VendorForm
              onSave={(v) => upsertVendor.mutate(v)}
              isPending={upsertVendor.isPending}
              onCancel={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : active.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No vendors yet. Click "Add Vendor" to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              contacts={contactsByVendor(v.id)}
              isEditing={editingId === v.id}
              onEdit={() => setEditingId(editingId === v.id ? null : v.id)}
              onSave={(updates) => upsertVendor.mutate({ ...updates, id: v.id, name: updates.name || v.name })}
              onDeactivate={() => deleteVendor.mutate(v.id)}
              isPending={upsertVendor.isPending}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
            {inactive.length} inactive vendor{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-1">
            {inactive.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded border bg-muted/30">
                <span className="text-muted-foreground">{v.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => upsertVendor.mutate({ id: v.id, name: v.name, is_active: true })}
                >
                  Reactivate
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ─── Vendor Card ─── */
function VendorCard({
  vendor,
  contacts,
  isEditing,
  onEdit,
  onSave,
  onDeactivate,
  isPending,
}: {
  vendor: SupplyHouse;
  contacts: VendorContact[];
  isEditing: boolean;
  onEdit: () => void;
  onSave: (v: Partial<SupplyHouse> & { name: string }) => void;
  onDeactivate: () => void;
  isPending: boolean;
}) {
  const [contactsOpen, setContactsOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4 text-muted-foreground" />
            {vendor.name}
            {contacts.length > 0 && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Users className="h-3 w-3" /> {contacts.length}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDeactivate}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {vendor.account_number && (
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-mono text-foreground">{vendor.account_number}</span>
          </div>
        )}
        {vendor.contact_phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            <ClickToCall phone={vendor.contact_phone} contactName={vendor.name} className="text-primary hover:underline" iconClassName="h-4 w-4" showIcon={false} />
            <SmsButton phone={vendor.contact_phone} iconClassName="h-3.5 w-3.5" />
          </div>
        )}
        {vendor.contact_email && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={`mailto:${vendor.contact_email}`} className="text-primary hover:underline truncate">{vendor.contact_email}</a>
          </div>
        )}
        {vendor.website_url && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={vendor.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
              {vendor.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          </div>
        )}
        {vendor.ordering_url && (
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={vendor.ordering_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
              Order Portal
            </a>
          </div>
        )}
        {vendor.text_support_phone && (
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <a href={`sms:${vendor.text_support_phone}`} className="text-primary hover:underline">{vendor.text_support_phone}</a>
            <span className="text-[10px] text-muted-foreground">Text Support</span>
          </div>
        )}
        {vendor.brand_affinity && vendor.brand_affinity.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {vendor.brand_affinity.map(b => (
              <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>
            ))}
          </div>
        )}
        {vendor.notes && (
          <p className="text-xs text-muted-foreground pt-1 border-t">{vendor.notes}</p>
        )}
        {!vendor.account_number && !vendor.contact_phone && !vendor.contact_email && !vendor.website_url && !vendor.notes && (
          <p className="text-xs text-muted-foreground italic">No details yet — click edit to add account info.</p>
        )}

        {isEditing && (
          <div className="pt-2 border-t">
            <VendorForm
              initial={vendor}
              onSave={onSave}
              isPending={isPending}
              onCancel={onEdit}
              compact
            />
          </div>
        )}

        {/* Contacts Section */}
        <VendorContactsSection vendorId={vendor.id} contacts={contacts} isOpen={contactsOpen} onToggle={() => setContactsOpen(!contactsOpen)} />
      </CardContent>
    </Card>
  );
}

/* ─── Contacts Section ─── */
function VendorContactsSection({ vendorId, contacts, isOpen, onToggle }: {
  vendorId: string;
  contacts: VendorContact[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const [addingContact, setAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const upsertContact = useMutation({
    mutationFn: async (c: Partial<VendorContact> & { name: string }) => {
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
      setAddingContact(false);
      setEditingContactId(null);
      toast({ title: "Contact saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteContact = useMutation({
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
    <Collapsible open={isOpen} onOpenChange={onToggle} className="pt-2 border-t">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Users className="h-3.5 w-3.5" />
          Contacts {contacts.length > 0 && `(${contacts.length})`}
        </CollapsibleTrigger>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); setAddingContact(!addingContact); }}>
          <Plus className="h-3 w-3 mr-0.5" /> Add
        </Button>
      </div>
      <CollapsibleContent className="mt-2 space-y-2">
        {addingContact && (
          <ContactForm
            onSave={(c) => upsertContact.mutate(c)}
            isPending={upsertContact.isPending}
            onCancel={() => setAddingContact(false)}
          />
        )}
        {contacts.length === 0 && !addingContact && (
          <p className="text-[11px] text-muted-foreground italic">No contacts yet — they'll auto-populate from emails.</p>
        )}
        {contacts.map(c => (
          <div key={c.id} className="flex items-start gap-2 p-2 rounded bg-muted/40 text-xs">
            <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            {editingContactId === c.id ? (
              <ContactForm
                initial={c}
                onSave={(upd) => upsertContact.mutate({ ...upd, id: c.id })}
                isPending={upsertContact.isPending}
                onCancel={() => setEditingContactId(null)}
              />
            ) : (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{c.name}</span>
                  {c.is_primary && <Badge variant="outline" className="text-[9px] h-4">Primary</Badge>}
                  {c.title && <span className="text-muted-foreground">· {c.title}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-muted-foreground">
                  {c.email && <a href={`mailto:${c.email}`} className="text-primary hover:underline truncate">{c.email}</a>}
                  {c.phone && (
                    <>
                      <ClickToCall phone={c.phone} contactName={c.name} className="text-primary hover:underline" showIcon={false} />
                      <SmsButton phone={c.phone} iconClassName="h-3 w-3" />
                    </>
                  )}
                </div>
                {c.notes && <p className="text-muted-foreground mt-0.5">{c.notes}</p>}
              </div>
            )}
            {editingContactId !== c.id && (
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingContactId(c.id)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteContact.mutate(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─── Contact Form ─── */
function ContactForm({ initial, onSave, isPending, onCancel }: {
  initial?: Partial<VendorContact>;
  onSave: (c: Partial<VendorContact> & { name: string }) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 w-full">
      <div className="grid grid-cols-2 gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name *" className="h-7 text-xs" required />
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="h-7 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="h-7 text-xs" type="email" />
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="h-7 text-xs" />
      </div>
      <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className="h-7 text-xs" />
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" className="h-6 text-[10px] px-2" disabled={isPending || !name.trim()}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/* ─── Vendor Form ─── */
function VendorForm({
  initial,
  onSave,
  isPending,
  onCancel,
  compact = false,
}: {
  initial?: Partial<SupplyHouse>;
  onSave: (v: Partial<SupplyHouse> & { name: string }) => void;
  isPending: boolean;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [accountNumber, setAccountNumber] = useState(initial?.account_number || "");
  const [phone, setPhone] = useState(initial?.contact_phone || "");
  const [email, setEmail] = useState(initial?.contact_email || "");
  const [website, setWebsite] = useState(initial?.website_url || "");
  const [orderingUrl, setOrderingUrl] = useState(initial?.ordering_url || "");
  const [textSupport, setTextSupport] = useState(initial?.text_support_phone || "");
  const [brandAffinity, setBrandAffinity] = useState((initial?.brand_affinity || []).join(", "));
  const [notes, setNotes] = useState(initial?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const brands = brandAffinity.split(",").map(b => b.trim()).filter(Boolean);
    onSave({
      name: name.trim(),
      account_number: accountNumber.trim() || null,
      contact_phone: phone.trim() || null,
      contact_email: email.trim() || null,
      website_url: website.trim() || null,
      ordering_url: orderingUrl.trim() || null,
      text_support_phone: textSupport.trim() || null,
      brand_affinity: brands.length > 0 ? brands : null,
      notes: notes.trim() || null,
    });
  };

  const inputCls = compact ? "h-8 text-sm" : "";
  const labelCls = "text-xs font-medium text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className={labelCls}>Vendor Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Johnstone Supply" className={inputCls} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={labelCls}>Account Number</Label>
          <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 12345" className={`${inputCls} font-mono`} />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(210) 555-1234" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={labelCls}>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="orders@vendor.com" className={inputCls} type="email" />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Website</Label>
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={labelCls}>Ordering Portal URL</Label>
          <Input value={orderingUrl} onChange={(e) => setOrderingUrl(e.target.value)} placeholder="https://order.carrier.com" className={inputCls} />
        </div>
        <div className="space-y-1">
          <Label className={labelCls}>Text Support Line</Label>
          <Input value={textSupport} onChange={(e) => setTextSupport(e.target.value)} placeholder="(210) 555-9999" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className={labelCls}>Brand Affinity</Label>
          <Input value={brandAffinity} onChange={(e) => setBrandAffinity(e.target.value)} placeholder="Carrier, Bryant" className={inputCls} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className={labelCls}>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery schedule, credit terms, etc." className={inputCls} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
