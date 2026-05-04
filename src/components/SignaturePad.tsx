import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  existingUrl?: string;
  disabled?: boolean;
}

export function SignaturePad({ onSave, existingUrl, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.strokeStyle = "hsl(var(--foreground))";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPoint = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDrawing(true);
    lastPoint.current = getPoint(e);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const point = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    setHasStrokes(true);
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    lastPoint.current = null;
    if (hasStrokes && canvasRef.current) {
      onSave(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasStrokes(false);
  };

  if (existingUrl && !hasStrokes) {
    return (
      <div className="space-y-2">
        <img src={existingUrl} alt="Signature" className="h-24 border rounded-md bg-background" />
        <Button variant="outline" size="sm" onClick={() => onSave("")}>
          <Eraser className="h-3.5 w-3.5 mr-1" /> Re-sign
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-muted-foreground/30 rounded-md bg-background">
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <p className="absolute bottom-1 left-2 text-[10px] text-muted-foreground pointer-events-none">
          Sign above
        </p>
      </div>
      {hasStrokes && (
        <Button variant="ghost" size="sm" onClick={clear}>
          <Eraser className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
      )}
    </div>
  );
}
