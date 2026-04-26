import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "react-router-dom";
import { ExternalLink, Users, FileText, Star, Wrench, ClipboardCheck } from "lucide-react";

interface Props {
  stage: { id: string; label: string; count: number; description: string } | null;
  open: boolean;
  onClose: () => void;
}

const STAGE_CONFIG: Record<string, {
  icon: React.ElementType;
  links: { label: string; to: string }[];
  tips: string[];
}> = {
  lead: {
    icon: Users,
    links: [{ label: "View All Leads", to: "/customers" }],
    tips: ["New inquiries from calls, web forms, and referrals land here.", "Use Sequence Builder to set up auto-follow-up drips for new leads."],
  },
  estimate: {
    icon: FileText,
    links: [{ label: "View Estimates", to: "/jobs?filter=estimate" }],
    tips: ["Estimates awaiting customer approval.", "Send a sales presentation to boost conversion rates."],
  },
  job_scheduled: {
    icon: ClipboardCheck,
    links: [{ label: "View Scheduled Jobs", to: "/jobs" }],
    tips: ["Jobs with a confirmed date on the calendar.", "Day-before and morning-of reminders are sent automatically."],
  },
  job_complete: {
    icon: Wrench,
    links: [{ label: "View Completed Jobs", to: "/jobs" }],
    tips: ["Work is done — invoice and review request are next.", "Completion summaries are auto-sent to the customer."],
  },
  review: {
    icon: Star,
    links: [{ label: "View Review Requests", to: "/admin" }],
    tips: ["Automated review requests are sent post-payment.", "Configure timing and template in Sequence Builder."],
  },
  maintenance: {
    icon: ClipboardCheck,
    links: [{ label: "View Agreements", to: "/agreements" }],
    tips: ["Active maintenance plan members.", "Send agreement renewal presentations from the Agreements page."],
  },
};

export function JourneyNodeDetail({ stage, open, onClose }: Props) {
  if (!stage) return null;

  const cfg = STAGE_CONFIG[stage.id] || { icon: Users, links: [], tips: [] };
  const Icon = cfg.icon;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[380px] sm:w-[420px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <SheetTitle className="text-base">{stage.label}</SheetTitle>
          </div>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{stage.count} records</Badge>
          </div>

          <p className="text-sm text-muted-foreground">{stage.description}</p>

          {cfg.tips.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                {cfg.tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <span className="text-muted-foreground">{tip}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {cfg.links.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                {cfg.links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                      <ExternalLink className="h-3 w-3" /> {link.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
