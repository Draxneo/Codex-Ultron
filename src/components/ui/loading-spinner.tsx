import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullPage?: boolean;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingSpinner({ label, className, size = "md", fullPage = false }: LoadingSpinnerProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-2",
      fullPage && "min-h-screen",
      !fullPage && "py-12",
      className
    )}>
      <Loader2 className={cn("animate-spin text-primary", sizeMap[size])} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
