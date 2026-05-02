/**
 * useCanvasPositions — Shared hook for persisting React Flow node positions.
 * Stores positions in company_settings as JSON keyed by canvasKey.
 */
import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Node } from "@xyflow/react";

type PositionMap = Record<string, { x: number; y: number }>;
type SavePositionOptions = { silent?: boolean };

function settingsKey(canvasKey: string) {
  return `canvas_positions_${canvasKey}`;
}

async function loadPositions(canvasKey: string): Promise<PositionMap | null> {
  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("key", settingsKey(canvasKey))
    .maybeSingle();
  if (data?.value) {
    try { return JSON.parse(data.value); } catch { return null; }
  }
  return null;
}

async function persistPositions(canvasKey: string, positions: PositionMap) {
  const key = settingsKey(canvasKey);
  const value = JSON.stringify(positions);
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("company_settings").update({ value } as any).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("company_settings").insert({ key, value } as any);
    if (error) throw error;
  }
}

export function useCanvasPositions(canvasKey: string) {
  const loaded = useRef(false);
  const positionsRef = useRef<PositionMap | null>(null);
  const [ready, setReady] = useState(false);

  // Load saved positions on mount
  useEffect(() => {
    loadPositions(canvasKey).then((saved) => {
      positionsRef.current = saved;
      loaded.current = true;
      setReady(true);
    });
  }, [canvasKey]);

  /** Apply saved positions to a set of nodes (call during node init or sync) */
  const applyPositions = useCallback(<T extends Node>(nodes: T[]): T[] => {
    const saved = positionsRef.current;
    if (!saved) return nodes;
    return nodes.map((n) => ({
      ...n,
      position: saved[n.id] ?? n.position,
    }));
  }, []);

  /** Save current node positions to DB */
  const savePositions = useCallback(async (nodes: Node[], options: SavePositionOptions = {}) => {
    const posMap: PositionMap = {};
    nodes.forEach((n) => { posMap[n.id] = n.position; });
    positionsRef.current = posMap;
    try {
      await persistPositions(canvasKey, posMap);
      if (!options.silent) {
        toast({ title: "Layout saved", description: "Canvas positions saved" });
      }
    } catch (error: any) {
      if (!options.silent) {
        toast({
          title: "Layout did not save",
          description: error?.message || "Canvas positions could not be saved.",
          variant: "destructive",
        });
      }
      throw error;
    }
  }, [canvasKey]);

  return { applyPositions, savePositions, positionsReady: ready };
}
