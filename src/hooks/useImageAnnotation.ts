import { useCallback, useRef, useState } from "react";

export type AnnotationTool = "pen" | "arrow" | "rect" | "text";

export interface AnnotationStroke {
  tool: AnnotationTool;
  color: string;
  width: number;
  // pen: array of points; arrow/rect: [start, end]; text: [point]
  points: Array<{ x: number; y: number }>;
  text?: string;
}

/**
 * Stroke stack with undo/redo and a flatten-to-blob helper.
 * Coordinates are in image-pixel space (not screen space) so the
 * output composites cleanly at original resolution.
 */
export function useImageAnnotation() {
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const redoStack = useRef<AnnotationStroke[]>([]);

  const push = useCallback((s: AnnotationStroke) => {
    setStrokes((prev) => [...prev, s]);
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      redoStack.current.push(prev[prev.length - 1]);
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    const item = redoStack.current.pop();
    if (!item) return;
    setStrokes((prev) => [...prev, item]);
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
    redoStack.current = [];
  }, []);

  return { strokes, push, undo, redo, clear, canUndo: strokes.length > 0, canRedo: redoStack.current.length > 0 };
}

/** Draw a single stroke onto a 2D context (image-pixel coords). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  s: AnnotationStroke,
) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (s.tool === "pen" && s.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.stroke();
  } else if (s.tool === "rect" && s.points.length >= 2) {
    const [a, b] = s.points;
    ctx.strokeRect(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
    );
  } else if (s.tool === "arrow" && s.points.length >= 2) {
    const [a, b] = s.points;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // arrowhead
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(12, s.width * 4);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (s.tool === "text" && s.points.length >= 1 && s.text) {
    const fontSize = Math.max(16, s.width * 6);
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    ctx.textBaseline = "top";
    // background pill for legibility
    const metrics = ctx.measureText(s.text);
    const padX = 6, padY = 4;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(
      s.points[0].x - padX,
      s.points[0].y - padY,
      metrics.width + padX * 2,
      fontSize + padY * 2,
    );
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, s.points[0].x, s.points[0].y);
  }

  ctx.restore();
}

/** Composite source image + strokes into a PNG Blob at full resolution. */
export async function flattenToBlob(
  imageUrl: string,
  strokes: AnnotationStroke[],
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0);
  for (const s of strokes) drawStroke(ctx, s);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))), "image/png", 0.92);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}
