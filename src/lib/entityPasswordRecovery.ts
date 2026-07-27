import type {
  BusinessRecoveryQuestionId,
  EntityPasswordKind,
  EntityRecoveryQuestionId,
  ProviderRecoveryQuestionId,
} from "@/services/core/entityPasswordService";

/** Human-readable preset labels — i18n keys can replace these in Phase 3 UI. */
export const RECOVERY_QUESTION_LABELS: Record<EntityRecoveryQuestionId, string> = {
  first_shop: "What was the name of your first shop or business?",
  business_city: "In which city did you register this business?",
  phone_last4: "What are the last 4 digits of your business phone?",
  year_started: "What year did you start this business?",
  first_service: "What was the first service you offered as a provider?",
  work_city: "Which city do you usually work in?",
  upi_last4: "What are the last 4 digits of your UPI or phone on your profile?",
  custom: "Write your own question",
};

export function recoveryQuestionLabel(id: EntityRecoveryQuestionId, customText?: string | null): string {
  if (id === "custom" && customText?.trim()) return customText.trim();
  return RECOVERY_QUESTION_LABELS[id];
}

export function recoveryIsSetForKind(
  kind: EntityPasswordKind,
  flags: { businessRecoveryIsSet: boolean; providerRecoveryIsSet: boolean },
): boolean {
  return kind === "business" ? flags.businessRecoveryIsSet : flags.providerRecoveryIsSet;
}

export function presetQuestionsForKind(kind: EntityPasswordKind): EntityRecoveryQuestionId[] {
  if (kind === "business") {
    return ["first_shop", "business_city", "phone_last4", "year_started", "custom"] satisfies BusinessRecoveryQuestionId[];
  }
  return ["first_service", "work_city", "upi_last4", "custom"] satisfies ProviderRecoveryQuestionId[];
}
