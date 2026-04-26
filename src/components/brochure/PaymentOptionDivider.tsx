/**
 * A circular "OR" badge positioned between two payment option cards.
 * Desktop (sm+): vertically centered in the gap between grid columns.
 * Mobile: horizontal line with centered "OR" circle between stacked cards.
 */
export function PaymentOptionDivider() {
  return (
    <>
      {/* Desktop: absolute-centered circle between two grid columns */}
      <div className="hidden sm:flex absolute inset-y-0 left-1/2 -translate-x-1/2 items-center z-10 pointer-events-none">
        <div className="w-12 h-12 rounded-full bg-muted border-2 border-border flex items-center justify-center shadow-md">
          <span className="text-sm font-black uppercase tracking-wide text-muted-foreground">OR</span>
        </div>
      </div>

      {/* Mobile: horizontal divider with centered circle */}
      <div className="flex sm:hidden items-center gap-3 -my-1">
        <div className="flex-1 h-px bg-border" />
        <div className="w-10 h-10 rounded-full bg-muted border-2 border-border flex items-center justify-center shrink-0">
          <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">OR</span>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
    </>
  );
}

/**
 * A "YOU SAVE" ribbon badge for Option B cards.
 */
export function SavingsBadge({ amount }: { amount: string }) {
  return (
    <div className="absolute -top-3 -right-2 z-10">
      <div className="bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
        <span>Save {amount}</span>
      </div>
    </div>
  );
}
