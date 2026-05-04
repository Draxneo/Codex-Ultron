import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSmsTemplates } from "@/hooks/useSmsTemplates";
import { useMemo, useState } from "react";

export interface SmsTemplateOption {
  id: string;
  name: string;
  category: string;
  template_body: string;
  is_active?: boolean | null;
}

interface Props {
  onSelect?: (body: string) => void;
  onSelectTemplate?: (template: SmsTemplateOption) => void;
  categoryFilter?: string[];
  buttonVariant?: "ghost" | "outline" | "secondary";
  buttonLabel?: string;
  align?: "start" | "center" | "end";
}

export function SmsTemplatePicker({
  onSelect,
  onSelectTemplate,
  categoryFilter,
  buttonVariant = "ghost",
  buttonLabel,
  align = "start",
}: Props) {
  const { data: templates } = useSmsTemplates();
  const [open, setOpen] = useState(false);

  const normalizedFilter = useMemo(
    () => categoryFilter?.map((item) => item.toLowerCase().trim()).filter(Boolean) || [],
    [categoryFilter]
  );

  const active = useMemo(() => {
    return ((templates || []) as SmsTemplateOption[]).filter((template) => {
      if (template.is_active === false) return false;
      if (normalizedFilter.length === 0) return true;
      return normalizedFilter.includes((template.category || "general").toLowerCase());
    });
  }, [normalizedFilter, templates]);

  const grouped = active.reduce<Record<string, SmsTemplateOption[]>>((acc, t) => {
    const cat = t.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={buttonVariant} size={buttonLabel ? "sm" : "icon"} className={buttonLabel ? "gap-1.5" : "h-8 w-8"} title="Insert template">
          <FileText className="h-4 w-4" />
          {buttonLabel ? <span>{buttonLabel}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align={align}>
        <div className="px-3 py-2 border-b">
          <p className="text-xs font-semibold">SMS Templates</p>
        </div>
        <ScrollArea className="max-h-64">
          {Object.entries(grouped).map(([cat, tpls]) => (
            <div key={cat}>
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{cat}</p>
              {tpls.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelect?.(t.template_body);
                    onSelectTemplate?.(t);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                >
                  <p className="text-xs font-medium">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{t.template_body?.slice(0, 80)}</p>
                </button>
              ))}
            </div>
          ))}
          {active.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No templates</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
