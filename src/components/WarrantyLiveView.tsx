import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Monitor, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "connecting" | "filling" | "done" | "failed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liveViewUrl: string | null;
  status: Status;
  result?: {
    submitted?: boolean;
    confirmationNumber?: string | null;
    errorDetail?: string;
    message?: string;
  };
  onClose?: () => void;
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: typeof Loader2 }> = {
  connecting: { label: "Connecting to browser…", color: "bg-muted text-muted-foreground", icon: Loader2 },
  filling: { label: "Filling registration form…", color: "bg-primary/10 text-primary", icon: Loader2 },
  done: { label: "Registration complete", color: "bg-complete-bg text-[hsl(var(--complete))]", icon: Check },
  failed: { label: "Registration failed", color: "bg-overdue-bg text-destructive", icon: X },
};

export default function WarrantyLiveView({ open, onOpenChange, liveViewUrl, status, result, onClose }: Props) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const isSpinning = status === "connecting" || status === "filling";

  const handleClose = () => {
    onOpenChange(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85dvh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <DialogTitle className="text-sm font-semibold">Warranty Auto-Registration</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-xs gap-1.5 py-0.5", config.color)}>
                <Icon className={cn("h-3 w-3", isSpinning && "animate-spin")} />
                {config.label}
              </Badge>
              {liveViewUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => window.open(liveViewUrl, "_blank")}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Pop out
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Live browser iframe */}
        <div className="flex-1 relative bg-muted/30 overflow-hidden">
          {liveViewUrl ? (
            <iframe
              src={liveViewUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title="Live warranty registration browser"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Starting browser session…</p>
              </div>
            </div>
          )}
        </div>

        {/* Result footer */}
        {(status === "done" || status === "failed") && result && (
          <div className={cn("px-4 py-3 border-t flex-shrink-0", status === "done" ? "bg-complete-bg" : "bg-overdue-bg")}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{result.message}</p>
                {result.confirmationNumber && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Confirmation: <span className="font-mono">{result.confirmationNumber}</span>
                  </p>
                )}
                {result.errorDetail && (
                  <p className="text-xs text-destructive mt-0.5 truncate">{result.errorDetail}</p>
                )}
              </div>
              <Button size="sm" onClick={handleClose}>
                {status === "done" ? "Done" : "Close"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}