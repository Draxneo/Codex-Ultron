import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JarvisContextPayload } from "@/contexts/CopilotPanelContext";
import { useJarvisLauncher } from "@/hooks/useJarvisLauncher";
import { cn } from "@/lib/utils";

type AskJarvisButtonProps = {
  contextType: JarvisContextPayload["trigger"];
  contextId?: string | null;
  label?: string;
  prompt?: string;
  context?: Record<string, unknown>;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  iconOnly?: boolean;
  hideIcon?: boolean;
  stopPropagation?: boolean;
};

export function AskJarvisButton({
  contextType,
  contextId,
  label = "Ask JARVIS",
  prompt,
  context,
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
  hideIcon = false,
  stopPropagation = true,
}: AskJarvisButtonProps) {
  const { launchJarvis } = useJarvisLauncher();

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? "icon" : size}
      className={cn(iconOnly ? "h-7 w-7 rounded-full" : "gap-1.5", className)}
      title={label}
      aria-label={label}
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
          event.preventDefault();
        }
        launchJarvis({
          trigger: contextType,
          source: "ask_jarvis_button",
          contextId,
          label,
          prompt,
          context,
        });
      }}
    >
      {!hideIcon && <Sparkles className={cn(iconOnly ? "h-3.5 w-3.5" : "h-4 w-4")} />}
      {!iconOnly && label}
    </Button>
  );
}
