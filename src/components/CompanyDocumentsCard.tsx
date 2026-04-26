import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FileText, Download, Eye, Loader2 } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MediaViewer } from "@/components/ui/media-viewer";
import jsPDF from "jspdf";
import logoSrc from "@/assets/logo.png";

// Brand colors (from index.css tokens)
const NAVY = { r: 25, g: 42, b: 70 };       // --primary  hsl(213,55%,22%)
const NAVY_LIGHT = { r: 55, g: 78, b: 110 }; // --navy-light hsl(213,45%,32%)
const ACCENT = { r: 247, g: 165, b: 18 };    // --accent   hsl(35,92%,52%)
const SLATE = { r: 100, g: 116, b: 139 };    // muted text

export function CompanyDocumentsCard() {
  const { settings, isLoading } = useCompanySettings();
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [generatingDownload, setGeneratingDownload] = useState(false);
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string | null>(null);

  const buildLetterheadPdf = async (): Promise<jsPDF> => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 60;

    // ─── Top accent stripe ───
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.rect(0, 0, pageW, 6, "F");
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.rect(0, 6, pageW, 2, "F");

    // Load logo
    const logoImg = await new Promise<HTMLImageElement>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.src = logoSrc;
    });

    const logoH = 50;
    const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
    doc.addImage(logoImg, "PNG", margin, 20, logoW, logoH);

    // Company name — navy
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text(settings.company_name || "Company Name", pageW - margin, 42, { align: "right" });

    // Address block
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);
    const addressLines = [
      settings.company_address,
      [settings.company_city, settings.company_state, settings.company_zip].filter(Boolean).join(", "),
    ].filter(Boolean);

    let headerY = 56;
    addressLines.forEach((line) => {
      doc.text(line, pageW - margin, headerY, { align: "right" });
      headerY += 13;
    });

    // Contact line
    const contactParts = [settings.company_phone, settings.company_email].filter(Boolean);
    if (contactParts.length > 0) {
      doc.text(contactParts.join("  •  "), pageW - margin, headerY, { align: "right" });
      headerY += 13;
    }

    // Divider — navy with accent dot
    const dividerY = Math.max(headerY + 10, 95);
    doc.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
    doc.setLineWidth(1);
    doc.line(margin, dividerY, pageW - margin, dividerY);
    // Small accent square on divider
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.rect(margin, dividerY - 2, 20, 4, "F");

    // Date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    doc.text(today, margin, dividerY + 36);

    // ─── FOOTER ───
    const footerY = pageH - 55;

    // Footer accent stripe
    doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    doc.rect(0, footerY, pageW, 1.5, "F");
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.rect(0, footerY + 1.5, pageW, 1, "F");

    doc.setFontSize(8);
    doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);

    const footerLeft = settings.tacla_number ? `TACLA# ${settings.tacla_number}` : "";
    const footerCenter = settings.company_name || "";
    const footerRight = [settings.company_phone, settings.company_email].filter(Boolean).join("  •  ");

    const footerTextY = footerY + 18;
    doc.text(footerLeft, margin, footerTextY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text(footerCenter, pageW / 2, footerTextY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SLATE.r, SLATE.g, SLATE.b);
    doc.text(footerRight, pageW - margin, footerTextY, { align: "right" });

    return doc;
  };

  const handlePreview = async () => {
    setGeneratingPreview(true);
    try {
      const doc = await buildLetterheadPdf();
      const blob = doc.output("blob");
      const safeCompany = (settings.company_name || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const path = `letterheads/${safeCompany}-${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("invoices")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("invoices").getPublicUrl(path);

      setPreviewPublicUrl(publicUrl);
    } catch (error: any) {
      toast({ title: "Preview failed", description: error?.message || "Could not generate preview.", variant: "destructive" });
    } finally {
      setGeneratingPreview(false);
    }
  };

  const handleDownload = async () => {
    setGeneratingDownload(true);
    try {
      const doc = await buildLetterheadPdf();
      doc.save(`${(settings.company_name || "Company").replace(/\s+/g, "_")}_Letterhead.pdf`);
    } finally {
      setGeneratingDownload(false);
    }
  };

  if (isLoading) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Company Documents
          </CardTitle>
          <CardDescription className="text-xs">Official templates auto-filled from your Company Settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Company Letterhead</p>
                <p className="text-[10px] text-muted-foreground">Header with logo & address • Footer with TACLA# & contact</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={generatingPreview || generatingDownload}>
                {generatingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                <span className="ml-1 text-xs">Preview</span>
              </Button>
              <Button size="sm" onClick={handleDownload} disabled={generatingPreview || generatingDownload}>
                {generatingDownload ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                <span className="ml-1 text-xs">Download</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!previewPublicUrl} onOpenChange={(open) => !open && setPreviewPublicUrl(null)}>
        <DialogContent className="max-w-5xl">
          <DialogTitle>Letterhead Preview</DialogTitle>
          <DialogDescription>Preview rendered via document viewer.</DialogDescription>
          {previewPublicUrl && (
            <MediaViewer url={previewPublicUrl} fileName="letterhead.pdf" category="pdf" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
