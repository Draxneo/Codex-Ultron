import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Loader2, Mail, MapPin, Phone, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { formatPhone, formatPhoneInput } from "@/lib/formatters";

type BusinessUnitDocumentSettings = {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  primary_phone_number: string;
  is_default: boolean;
  document_logo_url: string | null;
  billing_name: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_email: string | null;
  billing_phone: string | null;
};

type Draft = Pick<
  BusinessUnitDocumentSettings,
  | "document_logo_url"
  | "billing_name"
  | "billing_address"
  | "billing_city"
  | "billing_state"
  | "billing_zip"
  | "billing_email"
  | "billing_phone"
>;

const cleanFileName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

const emptyToNull = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
};

function draftFromUnit(unit: BusinessUnitDocumentSettings): Draft {
  return {
    document_logo_url: unit.document_logo_url || "",
    billing_name: unit.billing_name || unit.legal_name || unit.display_name || "",
    billing_address: unit.billing_address || "",
    billing_city: unit.billing_city || "",
    billing_state: unit.billing_state || "TX",
    billing_zip: unit.billing_zip || "",
    billing_email: unit.billing_email || "",
    billing_phone: unit.billing_phone || unit.primary_phone_number || "",
  };
}

export function BusinessUnitDocumentsCard() {
  const queryClient = useQueryClient();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data: units = [], isLoading } = useQuery({
    queryKey: ["business-unit-document-settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_units")
        .select(
          "id, slug, display_name, legal_name, primary_phone_number, is_default, document_logo_url, billing_name, billing_address, billing_city, billing_state, billing_zip, billing_email, billing_phone"
        )
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data || []) as BusinessUnitDocumentSettings[];
    },
  });

  const hydratedDrafts = useMemo(() => {
    const next: Record<string, Draft> = {};
    for (const unit of units) {
      next[unit.id] = drafts[unit.id] || draftFromUnit(unit);
    }
    return next;
  }, [drafts, units]);

  const setField = (unit: BusinessUnitDocumentSettings, key: keyof Draft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [unit.id]: {
        ...(prev[unit.id] || draftFromUnit(unit)),
        [key]: value,
      },
    }));
  };

  const saveUnit = async (unit: BusinessUnitDocumentSettings) => {
    const draft = hydratedDrafts[unit.id] || draftFromUnit(unit);
    setSavingId(unit.id);
    try {
      const { error } = await (supabase as any)
        .from("business_units")
        .update({
          document_logo_url: emptyToNull(draft.document_logo_url),
          billing_name: emptyToNull(draft.billing_name),
          billing_address: emptyToNull(draft.billing_address),
          billing_city: emptyToNull(draft.billing_city),
          billing_state: emptyToNull(draft.billing_state),
          billing_zip: emptyToNull(draft.billing_zip),
          billing_email: emptyToNull(draft.billing_email),
          billing_phone: emptyToNull(draft.billing_phone),
          updated_at: new Date().toISOString(),
        })
        .eq("id", unit.id);
      if (error) throw error;
      toast({ title: `${unit.display_name} document settings saved` });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[unit.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["business-unit-document-settings"] });
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
    } catch (error) {
      toast({ title: "Could not save document settings", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const uploadLogo = async (unit: BusinessUnitDocumentSettings, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Logo must be an image", variant: "destructive" });
      return;
    }

    setUploadingId(unit.id);
    try {
      const path = `${unit.slug}/logos/${Date.now()}-${cleanFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      setField(unit, "document_logo_url", publicUrl);

      const { error: updateError } = await (supabase as any)
        .from("business_units")
        .update({ document_logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", unit.id);
      if (updateError) throw updateError;

      toast({ title: `${unit.display_name} logo uploaded` });
      queryClient.invalidateQueries({ queryKey: ["business-unit-document-settings"] });
    } catch (error) {
      toast({ title: "Logo upload failed", description: errorMessage(error), variant: "destructive" });
    } finally {
      setUploadingId(null);
      const input = fileInputs.current[unit.id];
      if (input) input.value = "";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading document branding...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" /> Customer Document Branding
        </CardTitle>
        <CardDescription className="text-xs">
          Logos and billing addresses customers see on invoices, carts, and quote documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {units.map((unit) => {
          const draft = hydratedDrafts[unit.id] || draftFromUnit(unit);
          const busy = savingId === unit.id || uploadingId === unit.id;
          return (
            <div key={unit.id} className="rounded-lg border bg-muted/10 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-background">
                    {draft.document_logo_url ? (
                      <img src={draft.document_logo_url} alt={`${unit.display_name} logo`} className="h-full w-full object-contain p-1" />
                    ) : (
                      <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{unit.display_name}</h3>
                      {unit.is_default && <Badge variant="outline">Default</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatPhone(unit.primary_phone_number) || unit.primary_phone_number}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={(node) => { fileInputs.current[unit.id] = node; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => uploadLogo(unit, event.target.files?.[0])}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputs.current[unit.id]?.click()} disabled={busy}>
                    {uploadingId === unit.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                    Upload logo
                  </Button>
                  <Button type="button" size="sm" onClick={() => saveUnit(unit)} disabled={busy}>
                    {savingId === unit.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Document / Billing Name</Label>
                  <Input value={draft.billing_name || ""} onChange={(event) => setField(unit, "billing_name", event.target.value)} placeholder={unit.legal_name || unit.display_name} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Logo URL</Label>
                  <Input value={draft.document_logo_url || ""} onChange={(event) => setField(unit, "document_logo_url", event.target.value)} placeholder="Upload a logo or paste a public image URL" />
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3" /> Billing Street Address</Label>
                  <Input value={draft.billing_address || ""} onChange={(event) => setField(unit, "billing_address", event.target.value)} placeholder="Street address shown on customer documents" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">City</Label>
                    <Input value={draft.billing_city || ""} onChange={(event) => setField(unit, "billing_city", event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">State</Label>
                    <Input value={draft.billing_state || ""} onChange={(event) => setField(unit, "billing_state", event.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ZIP</Label>
                    <Input value={draft.billing_zip || ""} onChange={(event) => setField(unit, "billing_zip", event.target.value)} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" /> Billing Phone</Label>
                    <Input
                      value={draft.billing_phone || ""}
                      onChange={(event) => setField(unit, "billing_phone", formatPhoneInput(event.target.value))}
                      placeholder={formatPhone(unit.primary_phone_number) || unit.primary_phone_number}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" /> Billing Email</Label>
                    <Input value={draft.billing_email || ""} onChange={(event) => setField(unit, "billing_email", event.target.value)} type="email" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
