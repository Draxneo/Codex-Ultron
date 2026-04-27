import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Printer,
  Receipt,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_COMPANY_NAME } from "@/lib/companyDefaults";
import { formatCurrency, formatPhone } from "@/lib/formatters";

type RecordType = "job" | "estimate" | "invoice";

type DocumentLineItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  optionId?: string | null;
  optionName?: string | null;
  itemType?: string | null;
  detailUnavailable?: boolean;
};

type RelatedLink = {
  label: string;
  href: string;
  meta?: string;
};

type RecordDocumentData = {
  type: RecordType;
  id: string;
  title: string;
  number: string;
  status: string | null;
  description: string | null;
  createdAt: string | null;
  scheduledDate: string | null;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  assignedTo: string | null;
  customer: {
    id: string | null;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  sourcePage: string;
  hcpUrl: string | null;
  lineItems: DocumentLineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: Array<{ id: string; body: string; author: string | null; createdAt: string | null }>;
  attachments: Array<{ id: string; fileName: string; fileType: string | null }>;
  related: RelatedLink[];
};

function isRecordType(type: string | undefined): type is RecordType {
  return type === "job" || type === "estimate" || type === "invoice";
}

function dateLabel(value: string | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) return "-";
  try {
    return format(new Date(value), pattern);
  } catch {
    return "-";
  }
}

function timeLabel(value: string | null | undefined) {
  if (!value) return null;
  if (!value.includes("T")) return value;
  try {
    return format(new Date(value), "h:mm a");
  } catch {
    return value;
  }
}

function timeWindowLabel(start: string | null | undefined, end: string | null | undefined) {
  const startLabel = timeLabel(start);
  const endLabel = timeLabel(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || null;
}

function customerNameFrom(row: any, customer?: any) {
  const fromCustomer = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim();
  return fromCustomer || row?.customer_name || "Customer";
}

function addressFrom(row: any, customer?: any) {
  const customerAddress = [customer?.address, customer?.city, customer?.state, customer?.zip]
    .filter(Boolean)
    .join(", ");
  return customerAddress || row?.address || null;
}

function numberValue(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function sumItems(items: DocumentLineItem[]) {
  return items.reduce((sum, item) => sum + numberValue(item.total), 0);
}

function normalizeJobItems(items: any[] | null | undefined): DocumentLineItem[] {
  return (items || []).map((item) => ({
    id: item.id,
    name: item.name || item.description || "Line item",
    description: item.description || null,
    quantity: numberValue(item.quantity || 1),
    unitPrice: numberValue(item.unit_price),
    total: numberValue(item.total_price),
  }));
}

function normalizeEstimateItems(items: any[] | null | undefined): DocumentLineItem[] {
  const normalized = (items || []).map((item) => ({
    id: item.id,
    name: item.name || item.description || item.option_name || "Line item",
    description: item.description || item.option_name || null,
    quantity: numberValue(item.quantity || 1),
    unitPrice: numberValue(item.unit_price),
    total: numberValue(item.total_price),
    optionId: item.hcp_option_id || null,
    optionName: item.option_name || null,
    itemType: item.item_type || item.kind || null,
    detailUnavailable: item.item_type === "estimate_option",
  }));

  const optionIdsWithRealItems = new Set(
    normalized
      .filter((item) => item.itemType === "estimate_line_item")
      .map((item) => item.optionId)
      .filter(Boolean),
  );

  return normalized.filter((item) => {
    const isOptionShell = item.itemType === "estimate_option" || item.itemType === "option" || item.name.toLowerCase().startsWith("option #");
    return !(isOptionShell && item.optionId && optionIdsWithRealItems.has(item.optionId));
  });
}

function normalizeInvoiceItems(items: any[] | null | undefined): DocumentLineItem[] {
  return (items || []).map((item) => ({
    id: item.id,
    name: item.description || "Line item",
    description: null,
    quantity: numberValue(item.quantity || 1),
    unitPrice: numberValue(item.unit_price),
    total: numberValue(item.total),
  }));
}

async function fetchCustomer(customerId: string | null | undefined) {
  if (!customerId) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("id, first_name, last_name, phone, email, address, city, state, zip")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchNotes(customerId: string | null | undefined, entityId: string) {
  if (!customerId) return [];
  const { data, error } = await supabase
    .from("customer_notes")
    .select("id, body, author_name, created_at")
    .eq("customer_id", customerId)
    .or(`entity_id.eq.${entityId},entity_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return [];
  return (data || []).map((note) => ({
    id: note.id,
    body: note.body,
    author: note.author_name,
    createdAt: note.created_at,
  }));
}

async function fetchHcpAttachments(filterColumn: "job_id" | "estimate_id", id: string) {
  const { data, error } = await supabase
    .from("hcp_attachments" as any)
    .select("id, file_name, file_type")
    .eq(filterColumn, id)
    .eq("archive_status", "archived")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) return [];
  return ((data || []) as any[]).map((file) => ({
    id: file.id,
    fileName: file.file_name || "Attachment",
    fileType: file.file_type || null,
  }));
}

async function fetchJobDocument(id: string): Promise<RecordDocumentData> {
  const { data: job, error } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!job) throw new Error("Job not found");

  const customer = await fetchCustomer(job.customer_id);
  const [lineItemsRes, invoicesRes, estimateRes, notes, attachments] = await Promise.all([
    supabase.from("job_line_items").select("*").eq("job_id", id).order("created_at", { ascending: true }),
    supabase
      .from("customer_invoices")
      .select("id, invoice_number, status, total, created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    job.estimate_id
      ? supabase.from("estimates").select("id, estimate_number, work_status").eq("id", job.estimate_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as any),
    fetchNotes(job.customer_id, id),
    fetchHcpAttachments("job_id", id),
  ]);

  if (lineItemsRes.error) throw lineItemsRes.error;
  if (invoicesRes.error) throw invoicesRes.error;

  const lineItems = normalizeJobItems(lineItemsRes.data as any[]);
  const subtotal = numberValue(job.revenue) || sumItems(lineItems);
  const related = [
    ...((invoicesRes.data || []) as any[]).map((invoice) => ({
      label: `Invoice #${invoice.invoice_number || invoice.id.slice(0, 8)}`,
      href: `/records/invoice/${invoice.id}`,
      meta: `${invoice.status || "invoice"} - ${formatCurrency(numberValue(invoice.total))}`,
    })),
    estimateRes.data
      ? {
          label: `Estimate #${(estimateRes.data as any).estimate_number || (estimateRes.data as any).id.slice(0, 8)}`,
          href: `/records/estimate/${(estimateRes.data as any).id}`,
          meta: (estimateRes.data as any).work_status || "estimate",
        }
      : null,
  ].filter(Boolean) as RelatedLink[];

  return {
    type: "job",
    id,
    title: "Job",
    number: job.job_number || job.hcp_job_number || id.slice(0, 8),
    status: job.status || job.hcp_status,
    description: job.description || job.hcp_note || null,
    createdAt: job.created_at,
    scheduledDate: job.scheduled_date,
    arrivalStart: job.arrival_start,
    arrivalEnd: job.arrival_end,
    assignedTo: job.assigned_to,
    customer: {
      id: job.customer_id,
      name: customerNameFrom(job, customer),
      phone: customer?.phone || job.customer_phone,
      email: customer?.email || job.customer_email,
      address: addressFrom(job, customer),
    },
    sourcePage: `/jobs/${id}`,
    hcpUrl: job.hcp_id ? `https://pro.housecallpro.com/app/jobs/${job.hcp_id}` : null,
    lineItems,
    subtotal,
    taxAmount: 0,
    total: subtotal,
    notes,
    attachments,
    related,
  };
}

async function fetchEstimateDocument(id: string): Promise<RecordDocumentData> {
  const { data: estimate, error } = await supabase.from("estimates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!estimate) throw new Error("Estimate not found");

  const customer = await fetchCustomer(estimate.customer_id);
  const [lineItemsRes, convertedJobRes, notes, attachments] = await Promise.all([
    supabase
      .from("estimate_line_items" as any)
      .select("*")
      .eq("estimate_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("jobs")
      .select("id, job_number, status")
      .eq("estimate_id", id)
      .maybeSingle(),
    fetchNotes(estimate.customer_id, id),
    fetchHcpAttachments("estimate_id", id),
  ]);

  if (lineItemsRes.error) throw lineItemsRes.error;
  const lineItems = normalizeEstimateItems(lineItemsRes.data as any[]);
  const subtotal = numberValue((estimate as any).total_amount) || sumItems(lineItems);
  const related = convertedJobRes.data
    ? [
        {
          label: `Job #${(convertedJobRes.data as any).job_number || (convertedJobRes.data as any).id.slice(0, 8)}`,
          href: `/records/job/${(convertedJobRes.data as any).id}`,
          meta: (convertedJobRes.data as any).status || "job",
        },
      ]
    : [];

  return {
    type: "estimate",
    id,
    title: "Estimate",
    number: estimate.estimate_number || id.slice(0, 8),
    status: estimate.work_status || estimate.status,
    description: estimate.description,
    createdAt: estimate.created_at,
    scheduledDate: estimate.scheduled_date,
    arrivalStart: estimate.arrival_start,
    arrivalEnd: estimate.arrival_end,
    assignedTo: estimate.assigned_to,
    customer: {
      id: estimate.customer_id,
      name: customerNameFrom(estimate, customer),
      phone: customer?.phone || estimate.customer_phone,
      email: customer?.email || estimate.customer_email,
      address: addressFrom(estimate, customer),
    },
    sourcePage: `/estimates/${id}`,
    hcpUrl: estimate.hcp_id ? `https://pro.housecallpro.com/app/estimates/${estimate.hcp_id}` : null,
    lineItems,
    subtotal,
    taxAmount: 0,
    total: subtotal,
    notes,
    attachments,
    related,
  };
}

async function fetchInvoiceDocument(id: string): Promise<RecordDocumentData> {
  const { data: invoice, error } = await supabase
    .from("customer_invoices")
    .select("*, customer_invoice_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) throw new Error("Invoice not found");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", invoice.job_id)
    .maybeSingle();
  if (jobError) throw jobError;

  const customer = await fetchCustomer((job as any)?.customer_id);
  const lineItems = normalizeInvoiceItems((invoice as any).customer_invoice_items || []);
  const notes = await fetchNotes((job as any)?.customer_id, id);

  return {
    type: "invoice",
    id,
    title: "Invoice",
    number: invoice.invoice_number || id.slice(0, 8),
    status: invoice.status,
    description: invoice.notes || (job as any)?.description || null,
    createdAt: invoice.created_at,
    scheduledDate: (job as any)?.scheduled_date || null,
    arrivalStart: null,
    arrivalEnd: null,
    assignedTo: (job as any)?.assigned_to || null,
    customer: {
      id: (job as any)?.customer_id || null,
      name: customerNameFrom(job, customer),
      phone: customer?.phone || (job as any)?.customer_phone || null,
      email: customer?.email || (job as any)?.customer_email || null,
      address: addressFrom(job, customer),
    },
    sourcePage: invoice.job_id ? `/jobs/${invoice.job_id}?tab=invoice` : "/payments",
    hcpUrl: invoice.hcp_invoice_id ? `https://pro.housecallpro.com/app/invoices/${invoice.hcp_invoice_id}` : null,
    lineItems,
    subtotal: numberValue(invoice.subtotal) || sumItems(lineItems),
    taxAmount: numberValue(invoice.tax_amount),
    total: numberValue(invoice.total),
    notes,
    attachments: [],
    related: invoice.job_id
      ? [
          {
            label: `Job #${(job as any)?.job_number || (job as any)?.hcp_job_number || invoice.job_id.slice(0, 8)}`,
            href: `/records/job/${invoice.job_id}`,
            meta: (job as any)?.status || "job",
          },
        ]
      : [],
  };
}

async function fetchRecordDocument(type: RecordType, id: string) {
  if (type === "job") return fetchJobDocument(id);
  if (type === "estimate") return fetchEstimateDocument(id);
  return fetchInvoiceDocument(id);
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function RecordDocument() {
  const params = useParams();
  const navigate = useNavigate();
  const type = isRecordType(params.type) ? params.type : null;
  const id = params.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["record-document", type, id],
    enabled: !!type && !!id,
    queryFn: () => fetchRecordDocument(type!, id),
  });

  const documentDate = useMemo(() => dateLabel(data?.createdAt || data?.scheduledDate || null, "MMMM d, yyyy"), [data]);

  if (!type) {
    return <div className="p-8 text-sm text-muted-foreground">Unknown record type.</div>;
  }

  if (isLoading) {
    return <LoadingSpinner label="Loading record..." />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/30 p-6">
        <Card className="mx-auto max-w-2xl p-8">
          <p className="text-lg font-bold">Record not found</p>
          <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "We could not load this record."}</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 print:bg-white">
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to={data.sourcePage}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open app page
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <Card className="mx-auto max-w-5xl overflow-hidden border bg-white shadow-sm print:border-0 print:shadow-none">
        <div className="bg-primary px-8 py-7 text-primary-foreground">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">{DEFAULT_COMPANY_NAME}</p>
              <h1 className="mt-2 text-3xl font-bold">
                {data.title} #{data.number}
              </h1>
              <p className="mt-1 text-primary-foreground/75">{documentDate}</p>
            </div>
            <div className="text-left md:text-right">
              <Badge className="border-0 bg-white/15 text-primary-foreground hover:bg-white/15">
                {data.status || "open"}
              </Badge>
              {data.hcpUrl && (
                <a
                  href={data.hcpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center gap-1 text-sm text-primary-foreground/75 hover:text-primary-foreground md:justify-end"
                >
                  Open in HCP <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="h-2 bg-accent" />

        <div className="space-y-8 px-8 py-8">
          <section className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border bg-card p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Customer</p>
              <div className="space-y-3">
                <InfoRow icon={User} label="Name" value={data.customer.name} />
                <InfoRow icon={Phone} label="Phone" value={formatPhone(data.customer.phone) || data.customer.phone} />
                <InfoRow icon={Mail} label="Email" value={data.customer.email} />
                <InfoRow icon={MapPin} label="Address" value={data.customer.address} />
              </div>
              {data.customer.id && (
                <Button className="mt-4" variant="outline" size="sm" asChild>
                  <Link to={`/customers/${data.customer.id}`}>Open customer</Link>
                </Button>
              )}
            </div>

            <div className="rounded-lg border bg-card p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Schedule</p>
              <div className="space-y-3">
                <InfoRow icon={Calendar} label="Scheduled" value={dateLabel(data.scheduledDate)} />
                <InfoRow
                  icon={Briefcase}
                  label="Arrival window"
                  value={timeWindowLabel(data.arrivalStart, data.arrivalEnd)}
                />
                <InfoRow icon={User} label="Assigned" value={data.assignedTo} />
              </div>
            </div>
          </section>

          {data.description && (
            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Summary</p>
              <div className="rounded-lg border bg-card p-5 text-sm leading-6 text-foreground">{data.description}</div>
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Line Items</p>
              <p className="text-sm text-muted-foreground">{data.lineItems.length} items</p>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-primary text-primary-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="w-20 px-4 py-3 text-right font-semibold">Qty</th>
                    <th className="w-28 px-4 py-3 text-right font-semibold">Unit</th>
                    <th className="w-28 px-4 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lineItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                        No line items stored for this record.
                      </td>
                    </tr>
                  ) : (
                    data.lineItems.map((item, index) => (
                      <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                        <td className="px-4 py-3">
                          {item.optionName && item.optionName !== item.name && (
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-accent">{item.optionName}</p>
                          )}
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.detailUnavailable ? (
                            <p className="mt-0.5 text-xs text-amber-700">
                              HCP archived this option total, but did not expose the itemized option details for this older estimate.
                            </p>
                          ) : item.description && item.description !== item.name && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-2 rounded-lg border bg-card p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatCurrency(data.subtotal)}</span>
                </div>
                {data.taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium">{formatCurrency(data.taxAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(data.total)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Related Records</p>
              <div className="rounded-lg border bg-card">
                {data.related.length === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground">No linked records yet.</p>
                ) : (
                  data.related.map((link) => (
                    <Link key={link.href} to={link.href} className="flex items-center justify-between gap-4 border-b p-4 text-sm last:border-b-0 hover:bg-muted/40">
                      <span className="flex items-center gap-2 font-semibold">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        {link.label}
                      </span>
                      <span className="text-muted-foreground">{link.meta}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Attachments</p>
              <div className="rounded-lg border bg-card">
                {data.attachments.length === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground">No archived attachments found for this record.</p>
                ) : (
                  data.attachments.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-4 border-b p-4 text-sm last:border-b-0">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{file.fileName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{file.fileType || "file"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Notes</p>
            <div className="rounded-lg border bg-card">
              {data.notes.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No notes found for this record.</p>
              ) : (
                data.notes.map((note) => (
                  <div key={note.id} className="border-b p-4 last:border-b-0">
                    <div className="mb-1 flex items-center justify-between gap-4 text-xs text-muted-foreground">
                      <span>{note.author || "Note"}</span>
                      <span>{dateLabel(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{note.body}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}
