import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCopilotPanel, type JarvisContextPayload } from "@/contexts/CopilotPanelContext";

type JarvisRecord = Record<string, unknown>;

export type JarvisLaunchOptions = {
  trigger: JarvisContextPayload["trigger"];
  source?: string;
  contextId?: string | null;
  label?: string;
  prompt?: string;
  context?: JarvisRecord;
  snapshot?: JarvisRecord;
};

export function useJarvisLauncher() {
  const navigate = useNavigate();
  const { startRecordSession } = useCopilotPanel();

  const launchJarvis = useCallback((options: JarvisLaunchOptions) => {
    startRecordSession({
      contextType: options.trigger,
      contextId: options.contextId,
      label: options.label,
      prompt: options.prompt,
      context: {
        ...(options.context || {}),
        ...(options.snapshot ? { snapshot: options.snapshot } : {}),
        jarvis_launch_source: options.source || "manual",
      },
    });
    navigate("/copilot");
  }, [navigate, startRecordSession]);

  return { launchJarvis };
}
