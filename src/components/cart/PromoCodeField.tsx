import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tag, X, Loader2, Check } from "lucide-react";
import { validateDiscountCode } from "@/hooks/useCartAddons";
import { toast } from "sonner";

interface Props {
  subtotal: number;
  appliedCode: string | null;
  appliedAmount: number;
  onApply: (code: string, amount: number) => Promise<void> | void;
  onRemove: () => Promise<void> | void;
  compact?: boolean;
}

export function PromoCodeField({ subtotal, appliedCode, appliedAmount, onApply, onRemove, compact }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleApply = async () => {
    setBusy(true);
    try {
      const res = await validateDiscountCode(code, subtotal);
      if (res.ok) {
        await onApply(res.discount.code, res.amount);
        toast.success(`Saved $${res.amount.toFixed(2)}!`);
        setCode("");
      } else {
        toast.error(res.reason);
      }
    } finally {
      setBusy(false);
    }
  };

  if (appliedCode) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2">
        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide">{appliedCode}</p>
          <p className="text-[11px] text-muted-foreground">−${Number(appliedAmount).toFixed(2)} applied</p>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove()}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Tag className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Promo code"
          className={`pl-8 ${compact ? "h-8 text-xs" : "h-9 text-sm"} uppercase tracking-wide`}
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
        />
      </div>
      <Button onClick={handleApply} disabled={!code.trim() || busy} size={compact ? "sm" : "default"} className={compact ? "h-8 text-xs" : "h-9"}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
      </Button>
    </div>
  );
}
