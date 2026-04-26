import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Wrench, Shield, Award, Settings2, Receipt, ClipboardCheck, DollarSign, Mail, UserPlus, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PresentationBlocksManager from "@/components/brochure/PresentationBlocksManager";
import ComparisonBlocksManager from "@/components/brochure/ComparisonBlocksManager";
import AddonsManager from "@/components/brochure/AddonsManager";
import SalesPresentationPreview from "@/components/brochure/SalesPresentationPreview";
import RepairPresentationPreview from "@/components/brochure/RepairPresentationPreview";
import AgreementPresentationPreview from "@/components/brochure/AgreementPresentationPreview";
import MaintenanceReportPreview from "@/components/brochure/MaintenanceReportPreview";
import CertificateGallery from "@/components/brochure/CertificateGallery";
import { supabase } from "@/integrations/supabase/client";
import type { BrochureBlock, ComparisonBlock } from "@/components/SalesPresentationLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BrandProfilesEditor } from "@/components/brochure/BrandProfilesEditor";
import { PresentationSectionsEditor } from "@/components/brochure/PresentationSectionsEditor";
import { MaintenancePlanTemplatesCard } from "@/components/MaintenancePlanTemplatesCard";
import InvoicePreview from "@/components/brochure/InvoicePreview";
import CpsRebatePreview from "@/components/brochure/CpsRebatePreview";

import IntakeFormPreview from "@/components/brochure/IntakeFormPreview";
import DesignStudioJobPicker, { type SelectedJob } from "@/components/brochure/DesignStudioJobPicker";
import { Badge } from "@/components/ui/badge";

export default function SalesPresentationAdmin() {
  const isMobile = useIsMobile();
  const [blocks, setBlocks] = useState<BrochureBlock[]>([]);
  const [compBlocks, setCompBlocks] = useState<ComparisonBlock[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<SelectedJob | null>(null);

  useEffect(() => {
    const load = async () => {
      const [b, c, a] = await Promise.all([
        supabase.from("brochure_blocks").select("*").order("sort_order"),
        supabase.from("comparison_blocks").select("*").order("sort_order"),
        supabase.from("addons").select("*").eq("active", true).order("sort_order"),
      ]);
      if (b.data) setBlocks(b.data.map((d: any) => ({ ...d, features: d.features || [] })));
      if (c.data) setCompBlocks(c.data.map((d: any) => ({ ...d, rows: d.rows || [] })));
      if (a.data) setAddons(a.data);
    };
    load();
  }, []);

  const jobId = selectedJob?.id;

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="p-4 pb-8 max-w-6xl mx-auto">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/admin?tab=tools">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">Presentation Design Studio</h1>
            <p className="text-sm text-muted-foreground">Preview and manage all customer-facing documents from one place</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedJob && (
              <Badge variant="secondary" className="text-[10px]">Live Data</Badge>
            )}
            <DesignStudioJobPicker selectedJob={selectedJob} onSelect={setSelectedJob} />
          </div>
        </div>

        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList className="grid grid-cols-10 w-full max-w-5xl">
            <TabsTrigger value="sales" className="gap-1 text-xs"><Eye className="h-3.5 w-3.5" /> Sales</TabsTrigger>
            <TabsTrigger value="repair" className="gap-1 text-xs"><Wrench className="h-3.5 w-3.5" /> Repair</TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-1 text-xs"><ClipboardCheck className="h-3.5 w-3.5" /> Maint.</TabsTrigger>
            <TabsTrigger value="agreement" className="gap-1 text-xs"><Shield className="h-3.5 w-3.5" /> Agreement</TabsTrigger>
            <TabsTrigger value="invoice" className="gap-1 text-xs"><Receipt className="h-3.5 w-3.5" /> Invoice</TabsTrigger>
            <TabsTrigger value="rebate" className="gap-1 text-xs"><DollarSign className="h-3.5 w-3.5" /> Rebate</TabsTrigger>
            <TabsTrigger value="intake" className="gap-1 text-xs"><UserPlus className="h-3.5 w-3.5" /> Intake</TabsTrigger>
            <TabsTrigger value="certificates" className="gap-1 text-xs"><Award className="h-3.5 w-3.5" /> Certificates</TabsTrigger>
            <TabsTrigger value="content" className="gap-1 text-xs"><Settings2 className="h-3.5 w-3.5" /> Content</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <SalesPresentationPreview blocks={blocks} compBlocks={compBlocks} addons={addons} jobId={jobId} />
          </TabsContent>

          <TabsContent value="repair">
            <RepairPresentationPreview jobId={jobId} />
          </TabsContent>

          <TabsContent value="maintenance">
            <MaintenanceReportPreview jobId={jobId} />
          </TabsContent>

          <TabsContent value="agreement" className="space-y-6">
            <AgreementPresentationPreview />
            <MaintenancePlanTemplatesCard />
          </TabsContent>

          <TabsContent value="invoice">
            <InvoicePreview jobId={jobId} />
          </TabsContent>

          <TabsContent value="rebate">
            <CpsRebatePreview jobId={jobId} />
          </TabsContent>

          <TabsContent value="intake">
            <IntakeFormPreview />
          </TabsContent>


          <TabsContent value="certificates">
            <CertificateGallery />
          </TabsContent>

          <TabsContent value="content">
            <Accordion type="multiple" defaultValue={["brands", "sections"]} className="space-y-2">
              <AccordionItem value="brands" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold">Brand Profiles</AccordionTrigger>
                <AccordionContent><BrandProfilesEditor /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="sections" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold">Presentation Sections</AccordionTrigger>
                <AccordionContent><PresentationSectionsEditor /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="blocks" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold">System Blocks (Good / Better / Best)</AccordionTrigger>
                <AccordionContent><PresentationBlocksManager /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="comparison" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold">Comparison Tables</AccordionTrigger>
                <AccordionContent><ComparisonBlocksManager /></AccordionContent>
              </AccordionItem>
              <AccordionItem value="addons" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-semibold">Add-Ons</AccordionTrigger>
                <AccordionContent><AddonsManager /></AccordionContent>
              </AccordionItem>
            </Accordion>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
