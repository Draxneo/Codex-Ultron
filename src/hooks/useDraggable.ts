import { useState, useRef, useCallback, useEffect } from "react";
import { useUserPreferences } from "@/hooks/useUserPreferences";

interface Position { x: number; y: number }

export function useDraggable(storageKey: string, defaultPos: Position) {
  const { copilot_position, setCopilotPosition } = useUserPreferences();

  const [pos, setPos] = useState<Position>(() => {
    // Use DB position if available, otherwise default
    if (copilot_position) return copilot_position;
    return defaultPos;
  });

  // Sync from DB when it loads
  useEffect(() => {
    if (copilot_position) {
      setPos(copilot_position);
    }
  }, [copilot_position]);

  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const newX = Math.max(0, Math.min(window.innerWidth - 48, e.clientX - offset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 48, e.clientY - offset.current.y));
    setPos({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setPos(p => {
      // Save to database instead of localStorage
      setCopilotPosition(p);
      return p;
    });
  }, [setCopilotPosition]);

  // Clamp on resize
  useEffect(() => {
    const handler = () => {
      setPos(p => ({
        x: Math.min(p.x, window.innerWidth - 48),
        y: Math.min(p.y, window.innerHeight - 48),
      }));
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const style: React.CSSProperties = {
    position: "fixed",
    left: pos.x,
    top: pos.y,
    right: "auto",
    bottom: "auto",
    touchAction: "none",
    cursor: "grab",
  };

  const dragProps = { onPointerDown, onPointerMove, onPointerUp };

  return { style, dragProps, pos };
}
