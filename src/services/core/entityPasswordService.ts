import { getSupabase } from "@/lib/supabaseClient";

export type EntityPasswordKind = "business" | "provider";

/** Preset recovery question ids — labels are rendered client-side (i18n). */
export type BusinessRecoveryQuestionId =
  | "first_shop"
  | "business_city"
  | "phone_last4"
  | "year_started"
  | "custom";

export type ProviderRecoveryQuestionId =
  | "first_service"
  | "work_city"
  | "upi_last4"
  | "custom";

export type EntityRecoveryQuestionId = BusinessRecoveryQuestionId | ProviderRecoveryQuestionId;

export type EntityRecoveryQuestion = {
  questionId: EntityRecoveryQuestionId;
  /** Present only when questionId is `custom`. */
  questionText: string | null;
};

export const BUSINESS_RECOVERY_QUESTION_IDS: BusinessRecoveryQuestionId[] = [
  "first_shop",
  "business_city",
  "phone_last4",
  "year_started",
  "custom",
];

export const PROVIDER_RECOVERY_QUESTION_IDS: ProviderRecoveryQuestionId[] = [
  "first_service",
  "work_city",
  "upi_last4",
  "custom",
];

/**
 * Business & Provider passwords — replaces the old single-account "switch
 * PIN" (see git history: switchPinService). Two independent secrets, both
 * set from the owner's own profile (Settings), and both entity-scoped on
 * verify so a delegate is checked against the OWNER's password, not their
 * own — closing the gap where a delegate never had to pass anything at all.
 */
export const entityPasswordService = {
  /** Is a password of this kind set on MY OWN account (Settings display + owner switch-in)? */
  async isSet(kind: EntityPasswordKind): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("is_entity_password_set", { p_kind: kind });
    if (error) return false;
    return !!data;
  },

  /** Set or change the password. `currentPassword` is required only when one is already set. */
  async set(kind: EntityPasswordKind, newPassword: string, currentPassword?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("set_entity_password", {
      p_kind: kind,
      p_new_password: newPassword,
      p_current_password: currentPassword ?? null,
    });
    if (error) throw new Error(error.message || "Couldn't save the password.");
  },

  /** Remove the password — requires the current one to confirm. */
  async clear(kind: EntityPasswordKind, currentPassword: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("clear_entity_password", {
      p_kind: kind,
      p_current_password: currentPassword,
    });
    if (error) throw new Error(error.message || "Couldn't remove the password.");
  },

  /**
   * Verify a password attempt against the entity's OWNER — works for both the
   * owner (their own business/provider) and a delegate opening someone else's
   * business; the server resolves the owner from `entityId`. Omit `entityId`
   * for a self-check (used when confirming your own current password).
   * Never throws — rate-limited server-side, a wrong guess and a locked-out
   * window both just resolve to false.
   */
  async verify(kind: EntityPasswordKind, entityId: string | undefined, password: string): Promise<boolean> {
    const sb = getSupabase();
    const fn = kind === "business" ? "verify_business_password" : "verify_provider_password";
    const idKey = kind === "business" ? "p_business_id" : "p_provider_id";
    const { data, error } = await (sb.rpc as any)(fn, { [idKey]: entityId ?? null, p_password: password });
    if (error) return false;
    return !!data;
  },

  /**
   * Batched: for every business delegated to me (active grant, not owned),
   * does its owner have a business password set? Populates the store's
   * switch-gate map in one round trip instead of one call per business.
   */
  async myDelegatedBusinessPasswordStatus(): Promise<Record<string, boolean>> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("my_delegated_business_password_status");
    if (error) return {};
    const map: Record<string, boolean> = {};
    for (const row of (data ?? []) as { business_id: string; required: boolean }[]) {
      map[row.business_id] = !!row.required;
    }
    return map;
  },

  /** Is a backup recovery question set for this kind on my account? */
  async isRecoverySet(kind: EntityPasswordKind): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("is_entity_recovery_set", { p_kind: kind });
    if (error) return false;
    return !!data;
  },

  /** Returns the owner's recovery prompt (preset id + optional custom text). */
  async getRecoveryQuestion(kind: EntityPasswordKind): Promise<EntityRecoveryQuestion | null> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("get_entity_recovery_question", { p_kind: kind });
    if (error || !data?.length) return null;
    const row = data[0] as { question_id: string; question_text: string | null };
    return {
      questionId: row.question_id as EntityRecoveryQuestionId,
      questionText: row.question_text,
    };
  },

  /** First-time setup: password + recovery question in one atomic RPC. */
  async setupWithRecovery(
    kind: EntityPasswordKind,
    password: string,
    questionId: EntityRecoveryQuestionId,
    answer: string,
    questionText?: string,
  ): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("setup_entity_password_with_recovery", {
      p_kind: kind,
      p_new_password: password,
      p_question_id: questionId,
      p_question_text: questionText ?? null,
      p_answer: answer,
    });
    if (error) throw new Error(error.message || "Couldn't save the password and recovery question.");
  },

  /** Update recovery Q&A — requires the current password. */
  async setRecovery(
    kind: EntityPasswordKind,
    questionId: EntityRecoveryQuestionId,
    answer: string,
    currentPassword: string,
    questionText?: string,
  ): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("set_entity_recovery", {
      p_kind: kind,
      p_question_id: questionId,
      p_question_text: questionText ?? null,
      p_answer: answer,
      p_current_password: currentPassword,
    });
    if (error) throw new Error(error.message || "Couldn't update the recovery question.");
  },

  /** Owner-only forgot-password flow via backup answer. */
  async resetViaRecovery(
    kind: EntityPasswordKind,
    answer: string,
    newPassword: string,
  ): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("reset_entity_password_via_recovery", {
      p_kind: kind,
      p_answer: answer,
      p_new_password: newPassword,
    });
    if (error) throw new Error(error.message || "Couldn't reset the password.");
  },
};
