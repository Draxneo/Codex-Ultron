import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TOOL_CARDS, ALL_SETTINGS } from "@/config/adminNavigation";

export function AdminToolsGrid() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
          <LayoutGrid className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 max-h-[80vh] overflow-y-auto" align="end" sideOffset={8}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tools</p>
        <div className="grid grid-cols-3 gap-1">
          {TOOL_CARDS.map((tool) => (
            <Link key={tool.path + tool.label} to={tool.path}
              className="flex flex-col items-center gap-1 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-center">
              <tool.icon className={`h-5 w-5 ${tool.color}`} />
              <span className="text-[10px] font-medium leading-tight">{tool.label}</span>
            </Link>
          ))}
        </div>
        <div className="border-t border-border/50 mt-3 pt-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Admin</p>
          <div className="grid grid-cols-3 gap-1">
            {ALL_SETTINGS.map((link) => (
              <Link key={link.section + link.label} to={`/admin?section=${link.section}`}
                className="flex flex-col items-center gap-1 p-2.5 rounded-lg hover:bg-muted/60 transition-colors text-center">
                <link.icon className={`h-4 w-4 ${link.color}`} />
                <span className="text-[10px] font-medium leading-tight">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
