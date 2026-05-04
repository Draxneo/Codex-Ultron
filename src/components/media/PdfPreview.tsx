import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface PdfPreviewProps {
  url: string;
  /** Max height for the scrollable container, default 70vh */
  maxHeight?: string;
  /** Hi-DPI render multiplier, default 2 */
  pixelRatio?: number;
}

/**
 * Robust PDF preview using pdfjs-dist canvas rendering.
 * Works with private/signed URLs (no Google Docs iframe dependency).
 * Lazy-loads pdfjs-dist to keep main bundle small.
 */
export function PdfPreview({ url, maxHeight = "70vh", pixelRatio = 2 }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const resp = await fetch(url);
        if (!resp.ok) throw new Error("fetch failed");
        const arrayBuffer = await resp.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const containerWidth = container.clientWidth || 700;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth / baseViewport.width) * pixelRatio;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / pixelRatio}px`;
          canvas.style.height = `${viewport.height / pixelRatio}px`;
          canvas.style.display = "block";
          if (i > 1) canvas.style.marginTop = "8px";
          container.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
        }

        if (!cancelled) setStatus("done");
      } catch (e) {
        console.error("PDF render error:", e);
        if (!cancelled) setStatus("error");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [url, pixelRatio]);

  if (status === "error") {
    return (
      <div className="flex h-40 items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        Could not render preview — open in a new tab to view.
      </div>
    );
  }

  return (
    <div className="relative bg-muted/30">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} className="overflow-auto p-2" style={{ maxHeight }} />
    </div>
  );
}
