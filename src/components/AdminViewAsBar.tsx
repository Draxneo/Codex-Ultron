/**
 * AdminViewAsBar — Banner for active impersonation / device emulation.
 * Shows currently impersonated employee + device, with inline device swap.
 */
import { useAuth } from "@/hooks/useAuth";
import { useViewAs } from "@/contexts/ViewAsContext";
import { Eye, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VIEW_AS_DEVICES, DEVICE_KEYS, ViewAsDeviceKey } from "@/lib/viewAsDevices";

export function AdminViewAsBar() {
  const { role: realRole } = useAuth();
  const viewAs = useViewAs();
  const isSmallScreen = typeof window !== "undefined" && window.innerWidth < 768;

  // Show banner whenever impersonating OR a device frame is active
  const deviceActive = viewAs.device !== "none";
  if (!viewAs.active && !deviceActive) return null;
  if (realRole !== "admin") return null;

  return (
    <div className={cn(
      "fixed left-0 right-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 text-amber-950 px-4 py-1.5 text-sm font-medium shadow-md",
      isSmallScreen ? "top-12" : "top-0"
    )}>
      {viewAs.active ? (
        <>
          <Eye className="h-4 w-4" />
          <span>Viewing as: {viewAs.employeeName} ({viewAs.role})</span>
        </>
      ) : (
        <>
          <Smartphone className="h-4 w-4" />
          <span>Device preview</span>
        </>
      )}

      <div className="flex items-center gap-1.5 border-l border-amber-700/40 pl-3">
        <Smartphone className="h-3.5 w-3.5" />
        <Select
          value={viewAs.device}
          onValueChange={(val) => viewAs.setDevice(val as ViewAsDeviceKey)}
        >
          <SelectTrigger className="h-7 w-[200px] bg-amber-100/70 border-amber-700/40 text-amber-950 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DEVICE_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {VIEW_AS_DEVICES[key].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(viewAs.active || deviceActive) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-amber-950 hover:bg-amber-600 hover:text-amber-950"
          onClick={() => {
            if (viewAs.active) {
              viewAs.stopViewAs();
              return;
            }
            viewAs.setDevice("none");
          }}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Exit
        </Button>
      )}
    </div>
  );
}
