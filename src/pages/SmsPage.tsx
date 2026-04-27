import { useSearchParams } from "react-router-dom";
import { Phone } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { SmsPanel } from "@/components/SmsPanel";
import { useIsMobile } from "@/hooks/use-mobile";

export default function SmsPage({ embedded = false }: { embedded?: boolean }) {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const initialPhone = searchParams.get("phone");
  const initialDraft = searchParams.get("draft");

  return (
    <div className="h-full bg-background flex flex-col overflow-hidden">
      {!embedded && !isMobile && <AppHeader />}
      <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 bg-card">
        <Phone className="h-4 w-4 text-[hsl(var(--complete))]" />
        <h2 className="text-sm font-semibold">SMS</h2>
      </div>
      <div className="flex-1 min-h-0">
        <SmsPanel initialPhone={initialPhone} initialDraft={initialDraft} />
      </div>
    </div>
  );
}
