import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Zap, Search, ArrowLeft, Wrench, Info, Briefcase, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { EquipmentCatalogBrowser } from "@/components/EquipmentCatalogBrowser";
import { RepairCatalogBrowser } from "@/components/RepairCatalogBrowser";
import { PartsCatalogBrowser } from "@/components/PartsCatalogBrowser";
import { CartAddonsManager } from "@/components/catalog/CartAddonsManager";
import AhriLookups from "@/components/AhriLookups";
import { SeedRepairCatalogButton } from "@/components/admin/SeedRepairCatalogButton";

export default function Catalog() {
  const isMobile = useIsMobile();

  const { data: counts } = useQuery({
    queryKey: ["catalog_counts"],
    queryFn: async () => {
      const [eq, rp, pt, ah] = await Promise.all([
        supabase.from("equipment_matchups" as any).select("id", { count: "exact", head: true }),
        supabase.from("repair_catalog").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("parts_catalog").select("id", { count: "exact", head: true }),
        supabase.from("ahri_lookups" as any).select("id", { count: "exact", head: true }),
      ]);
      return {
        equipment: eq.count ?? 0,
        repairs: rp.count ?? 0,
        parts: pt.count ?? 0,
        ahri: ah.count ?? 0,
      };
    },
  });

  const stats = [
    { label: "Equipment", value: counts?.equipment ?? "…", icon: Zap, color: "text-primary" },
    { label: "Repairs", value: counts?.repairs ?? "…", icon: Wrench, color: "text-rose-500" },
    { label: "Parts", value: counts?.parts ?? "…", icon: Package, color: "text-emerald-500" },
    { label: "AHRI Lookups", value: counts?.ahri ?? "…", icon: Search, color: "text-[hsl(var(--warning))]" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {!isMobile && <AppHeader />}
      <div className="px-4 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <Link to="/admin">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Package className="h-5 w-5 text-orange-500" /> Catalog & Pricebook
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Master line items — equipment, repairs, parts, and AHRI matchups.
              </p>
            </div>
          </div>
        </div>

        {/* Helper banner */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 text-xs">
            <span className="font-medium">Building a customer order?</span>{" "}
            <span className="text-muted-foreground">
              Open a job and use the <strong>Cart</strong> tab to add items from this catalog.
            </span>
          </div>
          <Link to="/">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
              <Briefcase className="h-3 w-3" /> Jobs
            </Button>
          </Link>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map(s => (
            <div key={s.label} className="rounded-lg border bg-card p-3 flex items-center gap-2">
              <s.icon className={`h-5 w-5 ${s.color}`} />
              <div>
                <div className="text-lg font-bold leading-none">{s.value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="equipment" className="w-full">
          <TabsList className="w-full bg-muted/60 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="equipment" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <Zap className="h-4 w-4" /> Equipment
            </TabsTrigger>
            <TabsTrigger value="repairs" className="flex-1 gap-1.5 data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Wrench className="h-4 w-4" /> Repairs
            </TabsTrigger>
            <TabsTrigger value="parts" className="flex-1 gap-1.5 data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Package className="h-4 w-4" /> Parts
            </TabsTrigger>
            <TabsTrigger value="ahri" className="flex-1 gap-1.5 data-[state=active]:bg-[hsl(var(--warning))] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Search className="h-4 w-4" /> AHRI
            </TabsTrigger>
            <TabsTrigger value="addons" className="flex-1 gap-1.5 data-[state=active]:bg-violet-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
              <Sparkles className="h-4 w-4" /> Add-Ons & Promos
            </TabsTrigger>
          </TabsList>
          <TabsContent value="equipment" className="mt-4">
            <EquipmentCatalogBrowser editable />
          </TabsContent>
          <TabsContent value="repairs" className="mt-4 space-y-3">
            <div className="flex justify-end">
              <SeedRepairCatalogButton />
            </div>
            <RepairCatalogBrowser editable />
          </TabsContent>
          <TabsContent value="parts" className="mt-4">
            <PartsCatalogBrowser />
          </TabsContent>
          <TabsContent value="ahri" className="mt-4">
            <AhriLookups />
          </TabsContent>
          <TabsContent value="addons" className="mt-4">
            <CartAddonsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
