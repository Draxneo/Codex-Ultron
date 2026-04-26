import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Pencil, ArrowUpRight, Square, Type, Undo2, Redo2, Trash2, Save, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useImageAnnotation,
  drawStroke,
  flattenToBlob,
  type AnnotationStroke,
  type AnnotationTool,
} from "@/hooks/useImageAnnotation";
import { toast } from "sonner";

interface MediaAnnotatorProps {
  imageUrl: string;
  fileName?: string;
  onSave: (blob: Blob) => Promise<void> | void;
  onCancel: () => void;
}

const COLORS = [
  { name: "red", value: "#ef4444" },
  { name: "yellow", value: "#eab308" },
  { name: "green", value: "#22c55e" },
  { name: "blue", value: "#3b82f6" },
  { name: "white", value: "#ffffff" },
  { name: "black", value: "#000000" },
];

const WIDTHS = [
  { label: "S", value: 3 },
  { label: "M", value: 6 },
  { label: "L", value: 12 },
];

export function MediaAnnotator({ imageUrl, fileName, onSave, onCancel }: MediaAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(WIDTHS[1].value);
  const [saving, setSaving] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  const { strokes, push, undo, redo, clear, canUndo, canRedo } = useImageAnnotation();
  const drawingRef = useRef<AnnotationStroke | null>(null);

  // Load image once to get natural size
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImgLoaded(true);
    };
    img.onerror = () => toast.error("Failed to load image for annotation");
    img.src = imageUrl;
  }, [imageUrl]);

  // Compute display size (fit-to-container, maintain aspect)
  useEffect(() => {
    if (!imgLoaded) return;
    const fit = () => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const ratio = imgSize.w / imgSize.h;
      let w = cw, h = cw / ratio;
      if (h > ch) { h = ch; w = ch * ratio; }
      setDisplaySize({ w: Math.floor(w), h: Math.floor(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [imgLoaded, imgSize]);

  // Render strokes on canvas in image-pixel space, scaled by DPR
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !imgLoaded) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = imgSize.w * dpr;
    cvs.height = imgSize.h * dpr;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, imgSize.w, imgSize.h);
    for (const s of strokes) drawStroke(ctx, s);
    if (drawingRef.current) drawStroke(ctx, drawingRef.current);
  }, [strokes, imgSize, imgLoaded, displaySize]);

  // Map pointer event → image-pixel coordinates
  const toImageCoords = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cvs = canvasRef.current!;
      const rect = cvs.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * imgSize.w;
      const y = ((e.clientY - rect.top) / rect.height) * imgSize.h;
      return { x, y };
    },
    [imgSize],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = toImageCoords(e);

    if (tool === "text") {
      const text = window.prompt("Text label:")?.trim();
      if (!text) return;
      push({ tool: "text", color, width, points: [p], text });
      return;
    }

    drawingRef.current = { tool, color, width, points: [p] };
    // For shapes, second point = first until move
    if (tool !== "pen") drawingRef.current.points.push(p);
    // trigger redraw
    redrawDraft();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d) return;
    const p = toImageCoords(e);
    if (d.tool === "pen") {
      d.points.push(p);
    } else {
      d.points[1] = p;
    }
    redrawDraft();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    drawingRef.current = null;
    if (!d) return;
    // discard zero-length shapes
    if (d.tool !== "pen" && d.tool !== "text") {
      const [a, b] = d.points;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
    }
    if (d.tool === "pen" && d.points.length < 2) return;
    push(d);
  };

  // Force redraw including in-progress stroke
  const redrawDraft = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, imgSize.w, imgSize.h);
    for (const s of strokes) drawStroke(ctx, s);
    if (drawingRef.current) drawStroke(ctx, drawingRef.current);
  }, [strokes, imgSize]);

  const handleSave = async () => {
    if (saving) return;
    if (!strokes.length) {
      toast.info("Add some markup before saving");
      return;
    }
    setSaving(true);
    try {
      const blob = await flattenToBlob(imageUrl, strokes);
      await onSave(blob);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save annotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-1 sm:gap-2 px-2 py-2 border-b bg-muted/30 flex-wrap">
        <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={<Pencil className="h-4 w-4" />} label="Pen" />
        <ToolBtn active={tool === "arrow"} onClick={() => setTool("arrow")} icon={<ArrowUpRight className="h-4 w-4" />} label="Arrow" />
        <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} icon={<Square className="h-4 w-4" />} label="Box" />
        <ToolBtn active={tool === "text"} onClick={() => setTool("text")} icon={<Type className="h-4 w-4" />} label="Text" />

        <span className="mx-1 h-6 w-px bg-border" />

        {/* Colors */}
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              title={c.name}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition",
                color === c.value ? "border-foreground scale-110" : "border-border/50",
              )}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>

        <span className="mx-1 h-6 w-px bg-border" />

        {/* Widths */}
        <div className="flex items-center gap-1">
          {WIDTHS.map((w) => (
            <Button
              key={w.value}
              size="sm"
              variant={width === w.value ? "default" : "outline"}
              className="h-7 w-8 px-0 text-[11px]"
              onClick={() => setWidth(w.value)}
            >
              {w.label}
            </Button>
          ))}
        </div>

        <span className="mx-1 h-6 w-px bg-border" />

        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Undo">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Redo">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={clear} disabled={!canUndo} title="Clear all">
          <Trash2 className="h-4 w-4" />
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
            <X className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Cancel</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !strokes.length}>
            {saving ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <Save className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-black/80 flex items-center justify-center overflow-hidden p-2"
      >
        {!imgLoaded ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        ) : (
          <div
            className="relative"
            style={{ width: displaySize.w, height: displaySize.h }}
          >
            <img
              src={imageUrl}
              alt={fileName || "annotate"}
              className="absolute inset-0 w-full h-full select-none pointer-events-none"
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ touchAction: "none" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBtn({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className="h-8 px-2"
      title={label}
    >
      {icon}
      <span className="hidden md:inline ml-1.5 text-xs">{label}</span>
    </Button>
  );
}
