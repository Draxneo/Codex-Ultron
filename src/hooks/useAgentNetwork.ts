import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AgentRow = {
  id: string;
  name: string;
  label: string;
  description: string;
  status: string;
  edge_function: string | null;
  tools: string[];
  triggers: string[];
  position: { x: number; y: number };
  type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentConnectionRow = {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  trigger_description: string;
  created_at: string;
};

export function useAgentNetwork() {
  const qc = useQueryClient();

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["ai_agents"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_agents")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data as AgentRow[];
    },
  });

  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ["ai_agent_connections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_agent_connections")
        .select("*");
      if (error) throw error;
      return data as AgentConnectionRow[];
    },
  });

  const updatePosition = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: { x: number; y: number } }) => {
      const { error } = await (supabase as any)
        .from("ai_agents")
        .update({ position, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_agents"] }),
  });

  const updateAgent = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<AgentRow>) => {
      const { error } = await (supabase as any)
        .from("ai_agents")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_agents"] }),
  });

  const addAgent = useMutation({
    mutationFn: async (agent: Partial<AgentRow>) => {
      const { error } = await (supabase as any)
        .from("ai_agents")
        .insert(agent);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_agents"] }),
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("ai_agents")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai_agents"] });
      qc.invalidateQueries({ queryKey: ["ai_agent_connections"] });
    },
  });

  const addConnection = useMutation({
    mutationFn: async (conn: Partial<AgentConnectionRow>) => {
      const { error } = await (supabase as any)
        .from("ai_agent_connections")
        .insert(conn);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_agent_connections"] }),
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("ai_agent_connections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_agent_connections"] }),
  });

  return {
    agents,
    connections,
    isLoading: agentsLoading || connectionsLoading,
    updatePosition,
    updateAgent,
    addAgent,
    deleteAgent,
    addConnection,
    deleteConnection,
  };
}
