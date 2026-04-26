import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { MapPin, ExternalLink, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SupplyHouseLocations from "@/components/SupplyHouseLocations";
import { QuickLinksGrid } from "@/components/QuickLinksGrid";

export default function LocationsPage() {
  const isMobile = useIsMobile();
  return (
    <div className="min-h-screen bg-background pb-20">
      {!isMobile && <AppHeader />}
      <div className="px-4 py-4 space-y-4">
        {!isMobile && (
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <Link to="/">
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
              </Link>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MapPin className="h-5 w-5 text-[hsl(var(--complete))]" /> Supply Houses
              </h2>
            </div>
          </div>
        )}
        <Tabs defaultValue="locations" className="w-full">
          <TabsList className="w-full bg-muted/60">
            <TabsTrigger value="locations" className="flex-1 gap-1.5 data-[state=active]:bg-[hsl(var(--complete))] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <MapPin className="h-4 w-4" /> Locations
            </TabsTrigger>
            <TabsTrigger value="portals" className="flex-1 gap-1.5 data-[state=active]:bg-[hsl(var(--sky))] data-[state=active]:text-white data-[state=active]:shadow-sm">
              <ExternalLink className="h-4 w-4" /> Portals
            </TabsTrigger>
          </TabsList>
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
