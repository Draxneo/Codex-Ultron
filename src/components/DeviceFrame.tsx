/**
 * DeviceFrame — Wraps content in a phone bezel for Admin "View As" device emulation.
 * Auto-scales down if the device viewport is taller than the admin browser viewport.
 */
import { useEffect, useRef, useState } from "react";
import { ViewAsDevice } from "@/lib/viewAsDevices";
import { cn } from "@/lib/utils";

interface DeviceFrameProps {
  device: ViewAsDevice;
  children: React.ReactNode;
}

export function DeviceFrame({ device, children }: DeviceFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const w = device.w ?? 360;
  const h = device.h ?? 780;
  const isIos = device.os === "ios";

  useEffect(() => {
    const compute = () => {
      const padTop = 56;       // banner allowance
      const padBottom = 64;    // device label + breathing room
      const padX = 80;         // bezel + side margin
      const availH = window.innerHeight - padTop - padBottom;
      const availW = window.innerWidth - padX;
      const sH = availH / (h + 24); // +24 bezel padding
      const sW = availW / (w + 24);
      setScale(Math.min(1, sH, sW));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [w, h]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[40] flex flex-col items-center justify-center bg-zinc-900 overflow-auto pt-14 pb-6"
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* Bezel */}
        <div
          className={cn(
            "relative bg-black p-3 shadow-2xl",
            isIos ? "rounded-[3rem]" : "rounded-[2.5rem]"
          )}
          style={{ width: w + 24, height: h + 24 }}
        >
          {/* Notch / punch-hole */}
          {isIos ? (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 h-7 w-32 rounded-full bg-black" />
          ) : (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 h-3.5 w-3.5 rounded-full bg-zinc-800 ring-1 ring-zinc-700" />
          )}

          {/* Screen */}
          <div
            className={cn(
              "relative bg-background overflow-hidden",
              isIos ? "rounded-[2.25rem]" : "rounded-[1.75rem]"
            )}
            style={{ width: w, height: h }}
          >
            <div className="w-full h-full overflow-auto">
              {children}
            </div>
          </div>
        </div>
      </div>

      {/* Label chip */}
      <div className="mt-4 text-xs font-medium text-zinc-300 bg-zinc-800/80 px-3 py-1.5 rounded-full">
        {device.label} · {w}×{h} @{device.dpr}x
      </div>
    </div>
  );
}
