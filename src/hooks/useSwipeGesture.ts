/**
 * useSwipeGesture — Lightweight touch swipe detection hook.
 * Detects left, right, up, down swipes with configurable thresholds.
 * Returns a ref to attach to the swipeable element.
 */
import { useRef, useCallback, useEffect } from "react";

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  /** Min px distance to count as a swipe (default 60) */
  threshold?: number;
  /** Max ms for the gesture (default 400) */
  maxTime?: number;
  /** If true, only trigger edge swipes from the left 30px for onSwipeRight (default false) */
  edgeOnly?: boolean;
}

export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  callbacks: SwipeCallbacks,
) {
  const ref = useRef<T>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const isEdge = useRef(false);

  const threshold = callbacks.threshold ?? 60;
  const maxTime = callbacks.maxTime ?? 400;

  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    startTime.current = Date.now();
    isEdge.current = touch.clientX < 30;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    const dt = Date.now() - startTime.current;

    if (dt > maxTime) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Must have a dominant direction
    if (absDx < threshold && absDy < threshold) return;

    if (absDx > absDy) {
      // Horizontal swipe
      if (dx > 0) {
        if (cbRef.current.edgeOnly && !isEdge.current) return;
        cbRef.current.onSwipeRight?.();
      } else {
        cbRef.current.onSwipeLeft?.();
      }
    } else {
      // Vertical swipe
      if (dy > 0) {
        cbRef.current.onSwipeDown?.();
      } else {
        cbRef.current.onSwipeUp?.();
      }
    }
  }, [threshold, maxTime]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return ref;
}
