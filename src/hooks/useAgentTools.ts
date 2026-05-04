/**
 * useAgentTools.ts — CRUD hooks for the AI Copilot's tool registry
 * 
 * The agent_tools table controls which tools the Copilot can use at runtime.
 * Each row represents a tool with:
 * - name: Human-readable display name (e.g., "Send SMS")
 * - function_name: Must match the key in ai-task-agent's allToolsMap
 * - description: What the tool does (shown in Agent Training UI)
 * - is_enabled: Toggle on/off without deleting
 * - config: Optional JSON config (reserved for future per-tool settings)
 * 
 * HOW TOOLS WORK:
 * 1. Tool code is defined in ai-task-agent/index.ts (tool definition + handler)
 * 2. Tool is registered in allToolsMap (maps function_name → definition)
 * 3. Tool row in agent_tools table (this table) controls runtime enable/disable
 * 4. A Tool-* entry in copilot_training teaches the AI when/how to use it
 * 
 * At runtime, ai-task-agent reads enabled tools from this table and only
 * sends those tool definitions to the AI model. This means you can disable
 * a tool instantly from the Agent Training UI without touching code.
 * 
 * IMPORTANT: If a tool exists in code but NOT in this table, it won't be
 * available to the Copilot. All four pieces must be in sync.
 * 
 * USED BY: ToolsRegistry component in Agent Training page
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  function_name: string;
  is_enabled: boolean;
  config: Record<string, any>;
  created_at: string;
  agent_id: string | null;
  ai_agents?: { name: string; label: string } | null;
};

/** Fetch all tools, ordered alphabetically */
export function useAgentTools() {
  return useQuery({
    queryKey: ["agent_tools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_tools")
        .select("*, ai_agents(name, label)")
        .order("name");
      if (error) throw error;
      return data as AgentTool[];
    },
  });
}

/** Toggle a tool's is_enabled flag */
export function useToggleAgentTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase.from("agent_tools").update({ is_enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent_tools"] }),
  });
}

/** Add a new tool to the registry */
export function useAddAgentTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tool: { name: string; description: string; function_name: string }) => {
      const { error } = await supabase.from("agent_tools").insert(tool);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_tools"] });
      toast({ title: "Tool added" });
    },
  });
}

/** Update a tool's metadata (name, description, function_name) */
export function useUpdateAgentTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; description?: string; function_name?: string }) => {
      const { error } = await supabase.from("agent_tools").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_tools"] });
      toast({ title: "Tool updated" });
    },
  });
}

/** Permanently delete a tool from the registry */
export function useDeleteAgentTool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_tools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent_tools"] });
      toast({ title: "Tool deleted" });
    },
  });
}
