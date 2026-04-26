import { useState, useRef } from "react";
import { Upload, FileText, Loader2, Package, DollarSign, Hash, Cpu, ClipboardCopy, RefreshCw, Camera, RotateCcw, Pencil, Check, X, Receipt, Banknote, Calendar as CalendarIcon, Mail, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJobInvoices, useUploadInvoice, useSupplyHouses, getInvoiceUrl } from "@/hooks/useJobInvoices";

import { useJobEquipment } from "@/hooks/useJobEquipment";
import { DataSourcesIndicator } from "@/components/DataSourcesIndicator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useTechFormRealtime } from "@/hooks/useTechFormRealtime";

type InvoiceItem = {
  name: string;
  part_number?: string;
  quantity?: number;
};

function useTechFormPhotos(jobId: string) {
  return useQuery({
    queryKey: ["tech_form_photos", jobId],
    queryFn: async () => {
      const { data: forms } = await supabase.from("tech_forms").select("id, equipment_serial, equipment_model").eq("job_id", jobId);
      if (!forms || forms.length === 0) return { photos: [], forms: [] };
      const formIds = forms.map(f => f.id);
      const { data: photos, error } = await supabase
        .from("tech_form_photos")
        .select("*")
        .in("tech_form_id", formIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { photos: photos || [], forms };
    },
  });
}

function useTechFormResponses(jobId: string) {
  return useQuery({
    queryKey: ["tech_form_responses", jobId],
    queryFn: async () => {
      const { data: forms } = await supabase.from("tech_forms").select("id").eq("job_id", jobId);
      if (!forms || forms.length === 0) return [];
      const formIds = forms.map(f => f.id);
      const { data, error } = await supabase
        .from("tech_form_responses")
        .select("*, tech_form_fields:field_id(label, field_type)")
        .in("tech_form_id", formIds);
      if (error) throw error;
      return data || [];
    },
  });
}

function getFormPhotoUrl(filePath: string) {
  const { data } = supabase.storage.from("tech-form-photos").getPublicUrl(filePath);
  return data.publicUrl;
}

function FinanceInfoCard({ jobId }: { jobId: string }) {
  const { data: job, refetch } = useQuery({
    queryKey: ["jobs_finance", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("payment_method, finance_email, finance_dob, finance_paperwork_at").eq("id", jobId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");

  if (!job || job.payment_method !== "financed") return null;

  const handleSave = async () => {
    await supabase.from("jobs").update({
      finance_email: email || null,
      finance_dob: dob || null,
    } as any).eq("id", jobId);
    await supabase.from("activity_log").insert({
      job_id: jobId,
      action: "finance_info_updated",
      performed_by: "Office",
      details: `Finance email: ${email || "cleared"}, DOB: ${dob || "cleared"}`,
    });
    setEditing(false);
    refetch();
    toast({ title: "Finance info updated" });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Banknote className="h-4 w-4 text-primary" /> Financing Info
      </h3>
      {job.finance_paperwork_at && (
        <Badge variant="default" className="text-[10px]">Paperwork Complete</Badge>
      )}
      <div className="space-y-2">
        {editing ? (
          <>
            <Input placeholder="DocuSign Email" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-xs" type="email" />
            <Input placeholder="Applicant DOB (MM/DD/YYYY)" value={dob} onChange={e => setDob(e.target.value)} className="h-8 text-xs" />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave} className="h-7 text-xs"><Check className="h-3 w-3 mr-0.5" /> Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs"><X className="h-3 w-3" /></Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-medium flex items-center gap-1"><Mail className="h-3 w-3" /> DocuSign Email</p>
              <p className="text-sm font-medium mt-0.5">{job.finance_email || "—"}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-medium flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Applicant DOB</p>
              <p className="text-sm font-medium mt-0.5">{job.finance_dob || "—"}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
              setEmail(job.finance_email || "");
              setDob(job.finance_dob || "");
              setEditing(true);
            }}>
              <Pencil className="h-3 w-3 mr-0.5" /> Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

import { PAY_CATEGORIES, PAY_CATEGORY_LABELS } from "@/lib/resolvePayCategory";

function PayCategoryCard({ jobId }: { jobId: string }) {
  const { data: job, refetch } = useQuery({
    queryKey: ["jobs_pay_category", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("pay_category, job_type").eq("id", jobId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const handleChange = async (value: string) => {
    await supabase.from("jobs").update({ pay_category: value } as any).eq("id", jobId);
    await supabase.from("activity_log").insert({ job_id: jobId, action: "pay_category_changed", details: `Pay category changed to ${value}` });
    refetch();
    toast({ title: "Pay category updated" });
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Tag className="h-4 w-4 text-primary" /> Pay Category
      </h3>
      <p className="text-[10px] text-muted-foreground">Determines which tech pay rate applies to this job.</p>
      <Select value={(job as any)?.pay_category || ""} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Auto (from job type)" />
        </SelectTrigger>
        <SelectContent>
          {PAY_CATEGORIES.map(cat => (
            <SelectItem key={cat} value={cat} className="text-xs">{PAY_CATEGORY_LABELS[cat]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export function JobDataTab({ jobId, jobDescription, jobType }: { jobId: string; jobDescription?: string | null; jobType?: string | null }) {
  useTechFormRealtime(jobId); // live updates as tech fills in fields
  const { data: invoices, isLoading, refetch } = useJobInvoices(jobId);
  const { data: supplyHouses } = useSupplyHouses();
  const { data: techPhotoData, refetch: refetchPhotos } = useTechFormPhotos(jobId);
  const { data: equipmentSummary } = useJobEquipment(jobId);
  const techPhotos = techPhotoData?.photos || [];
  const techForms = techPhotoData?.forms || [];
  const { data: formResponses } = useTechFormResponses(jobId);
  const uploadInvoice = useUploadInvoice();
  const fileRef = useRef<HTMLInputElement>(null);
  const [generatingOrder, setGeneratingOrder] = useState<string | null>(null);
  const [orderText, setOrderText] = useState<string | null>(null);
  const [reExtracting, setReExtracting] = useState<string | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [editModel, setEditModel] = useState("");
  const [editSerial, setEditSerial] = useState("");

  const handleReExtract = async (photo: any, type: string = "data_plate") => {
    setReExtracting(photo.id);
    try {
      const { data: urlData } = supabase.storage.from("tech-form-photos").getPublicUrl(photo.file_path);
      await supabase.functions.invoke("extract-equipment-photo", {
        body: { photo_id: photo.id, image_url: urlData.publicUrl, type },
      });
      toast({ title: "Re-extraction started", description: type === "supply_ticket" ? "AI is reading the ticket..." : "AI is reading the data plate again..." });
      setTimeout(() => { refetchPhotos(); setReExtracting(null); }, 3000);
    } catch {
      toast({ title: "Re-extraction failed", variant: "destructive" });
      setReExtracting(null);
    }
  };

  const handleManualSave = async (photoId: string) => {
    await supabase.from("tech_form_photos").update({
      extracted_model: editModel || null,
      extracted_serial: editSerial || null,
      extraction_status: "done",
    }).eq("id", photoId);
    setEditingPhoto(null);
    refetchPhotos();
    toast({ title: "Saved manually" });
  };

  const startEditing = (photo: any) => {
    setEditingPhoto(photo.id);
    setEditModel(photo.extracted_model || "");
    setEditSerial(photo.extracted_serial || "");
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadInvoice.mutate({ jobId, file });
    e.target.value = "";
    toast({ title: "Invoice uploading...", description: "AI will extract data automatically" });
    // Workflow engine handles step completion via timestamps
  };

  // Aggregate data
  const allItems: InvoiceItem[] = [];
  let totalSpent = 0;

  (invoices || []).forEach((inv: any) => {
    if (inv.total_amount) totalSpent += Number(inv.total_amount);
    if (inv.extracted_items && Array.isArray(inv.extracted_items)) {
      (inv.extracted_items as InvoiceItem[]).forEach((item) => allItems.push(item));
    }
  });

  const dataPlatePhotos = (techPhotos || []).filter((p: any) =>
    p.photo_type?.toLowerCase().includes("data plate")
  );
  const supplyTicketPhotos = (techPhotos || []).filter((p: any) =>
    p.photo_type?.toLowerCase().includes("supply house") || p.photo_type?.toLowerCase().includes("pickup ticket")
  );
  const otherPhotos = (techPhotos || []).filter((p: any) => {
    const t = p.photo_type?.toLowerCase() || "";
    return !t.includes("data plate") && !t.includes("supply house") && !t.includes("pickup ticket");
  });

  // Deduplicated serials/models from invoices + data plate photos + tech forms
  const models: string[] = [];
  const serials: string[] = [];
  (invoices || []).forEach((inv: any) => {
    if (inv.model_number && !models.includes(inv.model_number)) models.push(inv.model_number);
    if (inv.serial_number && !serials.includes(inv.serial_number)) serials.push(inv.serial_number);
  });
  dataPlatePhotos.forEach((p: any) => {
    if (p.extracted_model && !models.includes(p.extracted_model)) models.push(p.extracted_model);
    if (p.extracted_serial && !serials.includes(p.extracted_serial)) serials.push(p.extracted_serial);
  });
  techForms.forEach((f: any) => {
    if (f.equipment_model && !models.includes(f.equipment_model)) models.push(f.equipment_model);
    if (f.equipment_serial && !serials.includes(f.equipment_serial)) serials.push(f.equipment_serial);
  });

  // Supply ticket items
  const ticketItems: InvoiceItem[] = [];
  let ticketTotal = 0;
  supplyTicketPhotos.forEach((p: any) => {
    if (p.extracted_total) ticketTotal += Number(p.extracted_total);
    if (p.extracted_items && Array.isArray(p.extracted_items)) {
      (p.extracted_items as InvoiceItem[]).forEach(item => ticketItems.push(item));
    }
  });

  // Old unit responses
  const oldUnitResponses = (formResponses || []).filter((r: any) =>
    r.tech_form_fields?.label?.toLowerCase().includes("old") && r.value
  );

  // Group other photos by type
  const otherByType: Record<string, any[]> = {};
  otherPhotos.forEach((p: any) => {
    const type = p.photo_type || "General";
    if (!otherByType[type]) otherByType[type] = [];
    otherByType[type].push(p);
  });

  const handleGenerateOrder = async (supplyHouseId: string, supplyHouseName: string) => {
    setGeneratingOrder(supplyHouseId);
    try {
      const { data: parts } = await supabase
        .from("parts_catalog")
        .select("*, part_supply_house_numbers!inner(part_number, supply_house_id, supply_houses(name))")
        .eq("part_supply_house_numbers.supply_house_id", supplyHouseId);
      const partsList = (parts || []).map((p: any) => ({
        name: p.name,
        partNumber: p.part_supply_house_numbers?.[0]?.part_number || "N/A",
      }));
      const emailText = `To: ${supplyHouseName}\nSubject: Parts Order\n\nHi,\n\nPlease prepare the following parts for pickup/delivery:\n\n${partsList.map((p: any, i: number) => `${i + 1}. ${p.name} — Part # ${p.partNumber}`).join("\n")}\n\nPlease confirm availability and let me know when ready.\n\nThank you`;
      setOrderText(emailText);
    } catch {
      toast({ title: "Error generating order", variant: "destructive" });
    } finally {
      setGeneratingOrder(null);
    }
  };

  const copyOrder = () => {
    if (orderText) {
      navigator.clipboard.writeText(orderText);
      toast({ title: "Copied to clipboard" });
    }
  };

  const isInstall = jobType === "install";
  const isServiceOrRepair = jobType === "service" || jobType === "repair";

  return (
    <div className="space-y-4 p-4">
      {/* Upload button — install & service/repair (techs buy parts) */}
      {(isInstall || isServiceOrRepair) && (
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploadInvoice.isPending}>
            {uploadInvoice.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload Invoice
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { refetch(); refetchPhotos(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleUpload} />
        </div>
      )}
      {/* Data Sources Indicator — install only */}
      {isInstall && equipmentSummary && Object.values(equipmentSummary.sources).some(Boolean) && (
        <DataSourcesIndicator
          sources={equipmentSummary.sources}
          hasConflicts={equipmentSummary.hasConflicts}
          totalsDifference={equipmentSummary.totalsDifference}
          invoiceTotal={equipmentSummary.invoiceTotal}
          ticketTotal={equipmentSummary.ticketTotal}
        />
      )}

      {/* Equipment Data — install only */}
      {isInstall && (models.length > 0 || serials.length > 0 || totalSpent > 0) && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" /> Equipment Data
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {models.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Model</p>
                <p className="text-sm font-bold text-primary mt-0.5">{models.join(", ")}</p>
              </div>
            )}
            {serials.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Serial</p>
                <p className="text-sm font-bold text-primary mt-0.5">{serials.join(", ")}</p>
              </div>
            )}
          </div>
          {totalSpent > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Total Spent (Our Cost)</p>
              <p className="text-lg font-bold text-primary">${totalSpent.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* Old Unit Info — install only */}
      {isInstall && oldUnitResponses.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" /> Old Equipment Removed
          </h3>
          {oldUnitResponses.map((r: any) => (
            <div key={r.id} className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">{r.tech_form_fields?.label}</p>
              <p className="text-sm font-mono font-semibold mt-0.5">{r.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data Plate Photos — install only */}
      {isInstall && dataPlatePhotos.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> Data Plate Photos
          </h3>
          <div className="space-y-2">
            {dataPlatePhotos.map((photo: any) => (
              <div key={photo.id} className="flex gap-3 items-start">
                <a href={getFormPhotoUrl(photo.file_path)} target="_blank" rel="noopener" className="relative shrink-0">
                  <img src={getFormPhotoUrl(photo.file_path)} alt={photo.photo_type} className="h-20 w-20 object-cover rounded-lg border hover:ring-2 hover:ring-primary/30 transition-all" />
                  {(photo.extraction_status === "processing" || reExtracting === photo.id) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}
                </a>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase">{photo.photo_type}</p>
                  {editingPhoto === photo.id ? (
                    <div className="space-y-1.5">
                      <Input placeholder="Model #" value={editModel} onChange={e => setEditModel(e.target.value)} className="h-7 text-xs" />
                      <Input placeholder="Serial #" value={editSerial} onChange={e => setEditSerial(e.target.value)} className="h-7 text-xs" />
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" className="h-6 text-[10px] px-2" onClick={() => handleManualSave(photo.id)}>
                          <Check className="h-3 w-3 mr-0.5" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setEditingPhoto(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {photo.extracted_model && <p className="text-xs"><span className="text-muted-foreground">Model:</span> <span className="font-mono font-semibold">{photo.extracted_model}</span></p>}
                      {photo.extracted_serial && <p className="text-xs"><span className="text-muted-foreground">Serial:</span> <span className="font-mono font-semibold">{photo.extracted_serial}</span></p>}
                      {photo.extraction_status === "error" && <p className="text-[10px] text-destructive font-medium">Extraction failed</p>}
                      {photo.extraction_status === "none" && <p className="text-[10px] text-muted-foreground">Not extracted</p>}
                      <div className="flex gap-1 mt-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handleReExtract(photo)} disabled={reExtracting === photo.id}>
                          {reExtracting === photo.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-0.5" />} Re-extract
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => startEditing(photo)}>
                          <Pencil className="h-3 w-3 mr-0.5" /> Edit
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supply House Ticket Photos — install only */}
      {isInstall && supplyTicketPhotos.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Supply House Tickets
          </h3>
          {ticketTotal > 0 && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-medium">Ticket Total</p>
              <p className="text-lg font-bold text-primary">${ticketTotal.toFixed(2)}</p>
            </div>
          )}
          {ticketItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Extracted Items</p>
              {ticketItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-muted/50">
                  <span className="text-xs font-medium flex-1">{item.name}</span>
                  {item.part_number && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      <Hash className="h-2.5 w-2.5 mr-0.5" />{item.part_number}
                    </Badge>
                  )}
                  {item.quantity && <span className="text-[10px] text-muted-foreground">×{item.quantity}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {supplyTicketPhotos.map((photo: any) => (
              <div key={photo.id} className="space-y-1">
                <a href={getFormPhotoUrl(photo.file_path)} target="_blank" rel="noopener" className="relative block">
                  <img src={getFormPhotoUrl(photo.file_path)} alt="Supply ticket" className="h-20 w-20 object-cover rounded-lg border hover:ring-2 hover:ring-primary/30 transition-all" />
                  {(photo.extraction_status === "processing" || reExtracting === photo.id) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}
                </a>
                <div className="flex items-center gap-1">
                  {photo.extracted_supply_house && <Badge variant="secondary" className="text-[10px]">{photo.extracted_supply_house}</Badge>}
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
                    photo.extraction_status === "done" && "text-primary",
                    photo.extraction_status === "error" && "text-destructive",
                  )}>{photo.extraction_status}</Badge>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 w-full" onClick={() => handleReExtract(photo, "supply_ticket")} disabled={reExtracting === photo.id}>
                  {reExtracting === photo.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-0.5" />} Re-extract
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Jobsite Photos */}
      {Object.keys(otherByType).length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> Jobsite Photos
          </h3>
          {Object.entries(otherByType).map(([type, photos]) => (
            <div key={type} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">{type}</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo: any) => (
                  <a key={photo.id} href={getFormPhotoUrl(photo.file_path)} target="_blank" rel="noopener">
                    <img src={getFormPhotoUrl(photo.file_path)} alt={type} className="h-20 w-20 object-cover rounded-lg border hover:ring-2 hover:ring-primary/30 transition-all" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Items purchased from invoices — install only */}
      {isInstall && allItems.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Items Purchased
          </h3>
          <div className="space-y-1">
            {allItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50">
                <span className="text-xs font-medium flex-1">{item.name}</span>
                {item.part_number && (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    <Hash className="h-2.5 w-2.5 mr-0.5" />{item.part_number}
                  </Badge>
                )}
                {item.quantity && <span className="text-[10px] text-muted-foreground">×{item.quantity}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoices — install & service/repair */}
      {(isInstall || isServiceOrRepair) && invoices && invoices.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Invoices ({invoices.length})
          </h3>
          <div className="space-y-2">
            {invoices.map((inv: any) => (
              <a key={inv.id} href={getInvoiceUrl(inv.file_path)} target="_blank" rel="noopener" className="flex items-center gap-3 p-2 rounded-lg border hover:bg-muted/30 transition-colors">
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">
                      {inv.invoice_number ? `#${inv.invoice_number}` : "Invoice"}
                      {inv.supply_houses?.name && ` — ${inv.supply_houses.name}`}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                      {inv.source === "photo" ? "From Photo" : inv.source === "email" ? "From Email" : inv.source === "scraper" ? "Scraper" : "Manual Upload"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {inv.total_amount && <span className="text-[10px] font-semibold text-primary">${Number(inv.total_amount).toFixed(2)}</span>}
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0",
                      inv.extraction_status === "done" && "text-primary",
                      inv.extraction_status === "processing" && "text-muted-foreground",
                      inv.extraction_status === "error" && "text-destructive",
                    )}>
                      {inv.extraction_status === "processing" && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
                      {inv.extraction_status}
                    </Badge>
                  </div>
                </div>
                {inv.invoice_date && <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(inv.invoice_date), "M/d/yy")}</span>}
              </a>
            ))}
          </div>
          {/* Running total */}
          {(() => {
            const confirmedTotal = (invoices || [])
              .filter((inv: any) => inv.match_status !== "rejected")
              .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0);
            return confirmedTotal > 0 ? (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">Total parts cost</span>
                <span className="text-sm font-bold text-primary">${confirmedTotal.toFixed(2)}</span>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Generate order email — install jobs only */}
      {jobType === "install" && supplyHouses && supplyHouses.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Generate Order Email
          </h3>
          <p className="text-xs text-muted-foreground">Pick a supply house to generate a parts order email using their part numbers.</p>
          <div className="flex flex-wrap gap-2">
            {supplyHouses.map((sh: any) => (
              <Button key={sh.id} variant="outline" size="sm" className="text-xs" disabled={generatingOrder === sh.id} onClick={() => handleGenerateOrder(sh.id, sh.name)}>
                {generatingOrder === sh.id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {sh.name}
              </Button>
            ))}
          </div>
          {orderText && (
            <div className="space-y-2">
              <pre className="text-xs bg-muted/50 rounded-lg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto">{orderText}</pre>
              <Button size="sm" onClick={copyOrder} className="w-full">
                <ClipboardCopy className="h-3.5 w-3.5 mr-1" /> Copy to Clipboard
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Financing Info — financed install jobs */}
      {jobType === "install" && (
        <FinanceInfoCard jobId={jobId} />
      )}

      {/* Pay Category Override */}
      <PayCategoryCard jobId={jobId} />
      {/* Job description */}
      {jobDescription && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Job Description</h3>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
            {jobDescription}
          </pre>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
      )}
      {!isLoading && (!invoices || invoices.length === 0) && models.length === 0 && Object.keys(otherByType).length === 0 && dataPlatePhotos.length === 0 && supplyTicketPhotos.length === 0 && (
        <div className="text-center py-8">
          <Upload className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No invoices yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Upload a supply house invoice to extract equipment data and costs.</p>
        </div>
      )}
    </div>
  );
}
