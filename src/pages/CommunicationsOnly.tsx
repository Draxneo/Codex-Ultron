import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MessageSquare, Phone, Settings } from "lucide-react";
import CallsPage from "@/pages/CallsPage";
import SmsPage from "@/pages/SmsPage";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export default function CommunicationsOnly() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"phone" | "sms">("phone");

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Clean Communications</p>
            <h1 className="truncate text-lg font-bold">Phone + SMS</h1>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link to="/dispatch">
              <Button variant="outline" size="icon" className="h-10 w-10" title="Open schedule">
                <CalendarDays className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/admin">
              <Button variant="outline" size="icon" className="h-10 w-10" title="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {isMobile ? (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "phone" | "sms")} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-card px-3 py-2">
            <TabsList className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="phone" className="gap-2">
                <Phone className="h-4 w-4" /> Phone
              </TabsTrigger>
              <TabsTrigger value="sms" className="gap-2">
                <MessageSquare className="h-4 w-4" /> SMS
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="phone" className="m-0 min-h-0 flex-1">
            <CallsPage embedded />
          </TabsContent>
          <TabsContent value="sms" className="m-0 min-h-0 flex-1">
            <SmsPage embedded />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
          <section className="min-h-0 border-r">
            <PanelChrome icon={Phone} title="Phone">
              <CallsPage embedded />
            </PanelChrome>
          </section>
          <section className="min-h-0">
            <PanelChrome icon={MessageSquare} title="SMS">
              <SmsPage embedded />
            </PanelChrome>
          </section>
        </div>
      )}
    </div>
  );
}

function PanelChrome({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Phone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-muted/30 px-4">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
