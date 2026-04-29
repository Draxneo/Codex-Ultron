import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookOpen, FileText, Wrench, Brain, BookMarked, Info, Terminal, MessageSquare, ArrowLeft, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { KnowledgeBase } from "@/components/agent/KnowledgeBase";
import { InstructionsManager } from "@/components/agent/InstructionsManager";
import { ToolsRegistry } from "@/components/agent/ToolsRegistry";
import { ModelConfigPanel } from "@/components/agent/ModelConfigPanel";
import { LearningsLog } from "@/components/agent/LearningsLog";
import { SmsRulesPanel } from "@/components/agent/SmsRulesPanel";
import { JarvisCorePanel } from "@/components/agent/JarvisCorePanel";

import { SystemPromptViewer } from "@/components/agent/SystemPromptViewer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const sections = [
  { id: "core", label: "Core", icon: Activity, tooltip: "One control center for JARVIS's live rules, tools, approval queues, and knowledge layers." },
  { id: "prompt", label: "System Prompt", icon: Terminal, tooltip: "The full system prompt defining JARVIS's internal assistant identity, rules, and context injections." },
  { id: "knowledge", label: "Knowledge", icon: BookOpen, tooltip: "Classification rules, routing logic, and reference data JARVIS uses to understand inbound emails and calls." },
  { id: "instructions", label: "Instructions", icon: FileText, tooltip: "Behavioral rules for how JARVIS briefs the team, formats action items, summarizes jobs, and handles internal requests." },
  { id: "tools", label: "Tools", icon: Wrench, tooltip: "Internal tools JARVIS can call — scheduling, lookups, job management, team notifications. Customer-facing tools are disabled." },
  { id: "sms-analysis", label: "SMS Analysis", icon: MessageSquare, tooltip: "How JARVIS analyzes inbound customer SMS threads to extract intent and surface dispatcher action cards. JARVIS never sends replies." },
  { id: "learnings", label: "Learnings", icon: BookMarked, tooltip: "Corrections and lessons JARVIS has recorded. An audit trail of improvement." },
  { id: "model", label: "Model", icon: Brain, tooltip: "Select which AI model powers JARVIS." },
] as const;

type Section = typeof sections[number]["id"];

const sectionDescriptions: Record<Section, string> = {
  core: "The live JARVIS control center: source of truth, company brains, tool drift, knowledge layers, and approval queues in one place.",
  prompt: "The full system prompt defining JARVIS's internal assistant identity, rules, and context injections. Loaded from the database on every request.",
  knowledge: "Classification rules, routing logic, and reference data JARVIS uses to understand inbound emails and calls.",
  instructions: "Behavioral rules for how JARVIS briefs the team, formats action items, summarizes jobs, and handles internal requests. These override default behavior.",
  tools: "Internal tools JARVIS can call — scheduling, lookups, job management, team notifications. Customer-facing tools are disabled by default.",
  "sms-analysis": "Rules for how JARVIS analyzes inbound customer SMS threads to extract intent and surface suggestions to the dispatcher. JARVIS reads conversations but never replies directly — all outbound messages are sent by the dispatcher.",
  learnings: "Corrections and lessons JARVIS has recorded when you teach it something new. Each entry shows what triggered it and what was learned.",
  model: "Select which AI model powers JARVIS. More powerful models are slower and cost more but handle complex reasoning better.",
};

const AgentTraining = () => {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const initialSection = (sections.find(s => s.id === searchParams.get("section"))?.id ?? "core") as Section;
  const [active, setActive] = useState<Section>(initialSection);

  useEffect(() => {
    const param = searchParams.get("section");
    if (param && sections.some(s => s.id === param)) setActive(param as Section);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <div className="flex items-center gap-3 px-4 pt-4">
        <Link to="/copilot">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-xl font-bold">JARVIS Settings</h1>
      </div>
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-48 border-r bg-muted/30 min-h-[calc(100vh-7rem)] p-2 space-y-1 hidden sm:block pt-3">
          <TooltipProvider delayDuration={300}>
            {sections.map(s => (
              <Tooltip key={s.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2 text-sm h-9",
                      active === s.id && "bg-primary text-primary-foreground font-medium hover:bg-primary/90"
                    )}
                    onClick={() => setActive(s.id)}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs">
                  {s.tooltip}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </aside>

        {/* Mobile tabs */}
        <div className="sm:hidden w-full">
          <div className="flex border-b overflow-x-auto">
            {sections.map(s => (
              <button
                key={s.id}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors min-w-[60px]",
                  active === s.id ? "text-primary font-semibold border-b-2 border-primary" : "text-muted-foreground"
                )}
                onClick={() => setActive(s.id)}
              >
                <s.icon className="h-4 w-4" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-4 pb-8 max-w-3xl">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{sectionDescriptions[active]}</p>
          </div>
          {active === "core" && <JarvisCorePanel />}
          {active === "prompt" && <SystemPromptViewer />}
          {active === "knowledge" && <KnowledgeBase />}
          {active === "instructions" && <InstructionsManager />}
          {active === "tools" && <ToolsRegistry />}
          
          {active === "sms-analysis" && <SmsRulesPanel />}
          {active === "learnings" && <LearningsLog />}
          {active === "model" && <ModelConfigPanel />}
        </main>
      </div>
    </div>
  );
};

export default AgentTraining;
