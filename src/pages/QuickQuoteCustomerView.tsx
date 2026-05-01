/**
 * QuickQuoteCustomerView — Public /q/:token page.
 *
 * Renders the price-first customer narrative in a globally-saved section order
 * (via the universal `useSectionOrder` hook). Authenticated staff see an
 * "Edit Layout" toolbar that turns sections into drag-and-drop blocks.
 */
import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuickQuoteLinkByToken, trackQuickQuoteView } from "@/hooks/useQuickQuoteLinks";
import { useSectionOrder } from "@/hooks/useSectionOrder";
import {
  CUSTOMER_QUOTE_SECTION_IDS,
  CUSTOMER_QUOTE_SECTION_LABELS,
  type CustomerQuoteSectionId,
} from "@/components/quote/customer/sections";

import { QuoteHero } from "@/components/quote/customer/QuoteHero";
import { ApprovePaymentButtons } from "@/components/quote/customer/ApprovePaymentButtons";
import { EquipmentSpecsSection } from "@/components/quote/customer/EquipmentSpecsSection";
import { InstallIncludedSection } from "@/components/quote/customer/InstallIncludedSection";
import { ProtectionSection } from "@/components/quote/customer/ProtectionSection";
import { RebateSection } from "@/components/quote/customer/RebateSection";
import { WhyUsSection } from "@/components/quote/customer/WhyUsSection";
import { ContactSection } from "@/components/quote/customer/ContactSection";
import { SortableSectionShell } from "@/components/layout/SortableSectionShell";
import { SectionReorderToolbar } from "@/components/layout/SectionReorderToolbar";

export default function QuickQuoteCustomerView() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { data: link, isLoading } = useQuickQuoteLinkByToken(token);

  const {
    draftOrder,
    setDraftOrder,
    editing,
    setEditing,
    dirty,
    save,
    reset,
    cancel,
    isSaving,
  } = useSectionOrder<CustomerQuoteSectionId>("customer_quote", CUSTOMER_QUOTE_SECTION_IDS);

  // Track view once when link loads
  useEffect(() => {
    if (link && token) {
      trackQuickQuoteView(token, link.view_count).catch((err) => {
        console.warn("[QuickQuoteCustomerView] Could not track quote view:", err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraftOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as CustomerQuoteSectionId);
        const newIdx = prev.indexOf(over.id as CustomerQuoteSectionId);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const sectionMap = useMemo(() => {
    if (!link) return {} as Record<CustomerQuoteSectionId, React.ReactNode>;
    const m = link.matchup_snapshot;
    return {
      hero: <QuoteHero matchup={m} customerName={link.customer_name} preparedAt={link.created_at} />,
      investment: (
        <ApprovePaymentButtons
          token={link.token}
          matchup={m}
          rendered={link.rendered_snapshot}
          approvedOption={link.selected_payment as any}
        />
      ),
      specs: <EquipmentSpecsSection matchup={m} />,
      included: <InstallIncludedSection />,
      protection: <ProtectionSection brand={m.brand} />,
      rebate: <RebateSection matchup={m} />,
      whyus: <WhyUsSection />,
      contact: <ContactSection company={link.company_snapshot} />,
    } as Record<CustomerQuoteSectionId, React.ReactNode>;
  }, [link]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!link) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-foreground mb-2">Quote not found</h1>
          <p className="text-muted-foreground">This link may have expired or been removed. Please contact us for a new quote.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      {user && (
        <SectionReorderToolbar
          editing={editing}
          dirty={dirty}
          isSaving={isSaving}
          onEdit={() => setEditing(true)}
          onSave={save}
          onReset={reset}
          onCancel={cancel}
          hint="Staff preview"
        />
      )}

      <main className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draftOrder} strategy={verticalListSortingStrategy}>
            {draftOrder.map((id) => (
              <SortableSectionShell
                key={id}
                id={id}
                editing={editing}
                label={CUSTOMER_QUOTE_SECTION_LABELS[id]}
              >
                {sectionMap[id]}
              </SortableSectionShell>
            ))}
          </SortableContext>
        </DndContext>
      </main>
    </div>
  );
}
