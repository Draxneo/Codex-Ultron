/**
 * PayPage.tsx — Dedicated pay/paysheet page.
 * Renders PaysheetPanel with proper mobile/desktop layout.
 * Uses useEffectiveAuth so ViewAs impersonation works correctly.
 */

import { useIsMobile } from "@/hooks/use-mobile";
import { AppHeader } from "@/components/AppHeader";
import { PaysheetPanel } from "@/components/PaysheetPanel";

export default function PayPage() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <AppHeader />}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold tracking-tight mb-4">My Pay</h1>
        <PaysheetPanel />
      </main>
    </div>
  );
}
