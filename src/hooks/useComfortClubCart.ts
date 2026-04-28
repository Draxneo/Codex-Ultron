import { useMemo } from "react";
import { useCustomerAgreements, type ServiceAgreement } from "@/hooks/useServiceAgreements";
import { useMaintenancePlanTemplates, type PlanTemplate } from "@/hooks/useMaintenancePlanTemplates";
import {
  buildComfortClubCartSummary,
  type ComfortClubCartInput,
  type ComfortClubCartSummary,
  type ComfortClubPublicInfo,
} from "@/lib/comfortClubCart";

type ComfortClubHookSummary = ComfortClubCartSummary & {
  agreement: ServiceAgreement | null;
};

function isActiveAgreement(agreement: ServiceAgreement, today: Date): boolean {
  if (agreement.status !== "active") return false;
  if (!agreement.end_date) return true;

  const end = new Date(`${agreement.end_date}T23:59:59`);
  return end >= today;
}

function pickComfortClubTemplate(templates: PlanTemplate[] | undefined): PlanTemplate | null {
  if (!templates?.length) return null;
  return templates.find((template) => template.name.toLowerCase().includes("comfort")) || templates[0];
}

function pickActiveAgreement(agreements: ServiceAgreement[] | undefined): ServiceAgreement | null {
  const today = new Date();
  return [...(agreements || [])]
    .filter((agreement) => isActiveAgreement(agreement, today))
    .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime())[0] || null;
}

export function useComfortClubCartSummary(
  customerId: string | null | undefined,
  input: ComfortClubCartInput = {},
): ComfortClubHookSummary {
  const { data: agreements, isLoading: agreementsLoading } = useCustomerAgreements(customerId || undefined);
  const { data: templates, isLoading: templatesLoading } = useMaintenancePlanTemplates(true);

  return useMemo(() => {
    const activeAgreement = pickActiveAgreement(agreements);
    const template = pickComfortClubTemplate(templates);

    const membership: ComfortClubPublicInfo = activeAgreement
      ? {
          hasAgreement: true,
          discountPercent: activeAgreement.agreement_discount_percent,
          planName: activeAgreement.plan_name || template?.name || null,
          planSource: activeAgreement.plan_source || null,
          planAnnualPrice: Number(activeAgreement.price) || Number(template?.price) || null,
          perks: template?.perks || null,
          endDate: activeAgreement.end_date,
        }
      : {
          hasAgreement: false,
          planName: template?.name || null,
          planAnnualPrice: Number(template?.price) || null,
          perks: template?.perks || null,
        };

    return {
      ...buildComfortClubCartSummary(membership, input),
      isLoading: agreementsLoading || templatesLoading,
      agreement: activeAgreement,
    };
  }, [agreements, agreementsLoading, input, templates, templatesLoading]);
}

export type { ComfortClubCartInput, ComfortClubPublicInfo } from "@/lib/comfortClubCart";
