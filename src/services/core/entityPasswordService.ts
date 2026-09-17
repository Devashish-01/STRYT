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
    const { data, error } = await sb.rpc("is_entity_password_set", { p_kind: kind });
    if (error) return false;
    return !!data;
  },

  /** Set or change the password. `currentPassword` is required only when one is already set. */
  async set(kind: EntityPasswordKind, newPassword: string, currentPassword?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("set_entity_password", {
      p_kind: kind,
      p_new_password: newPassword,
      p_current_password: currentPassword ?? undefined,
    });
    if (error) throw new Error(error.message || "Couldn't save the password.");
  },

  /** Remove the password — requires the current one to confirm. */
  async clear(kind: EntityPasswordKind, currentPassword: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.rpc("clear_entity_password", {
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
    // Both functions take the id as a nullable text parameter with no default: null means "whatever
    // entity the caller owns" (see verify_business_password in 20260941). The generated Args type
    // marks it non-null because the SQL has no DEFAULT, so the deliberate null is asserted past it —
    // omitting the key instead would send no argument at all and the call would fail.
    const id = (entityId ?? null) as unknown as string;
    const { data, error } = kind === "business"
      ? await sb.rpc("verify_business_password", { p_business_id: id, p_password: password })
      : await sb.rpc("verify_provider_password", { p_provider_id: id, p_password: password });
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
    const { data, error } = await sb.rpc("my_delegated_business_password_status");
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
    const { data, error } = await sb.rpc("is_entity_recovery_set", { p_kind: kind });
    if (!error) return !!data;
    // Called right after sign-in, this can run before the session is attached and come back 401 — reading that as
    // "no backup question" would hide the recovery route from someone who has one (E2E-002). Wait for the session
    // and ask once more before giving up.
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    const retry = await sb.rpc("is_entity_recovery_set", { p_kind: kind });
    return retry.error ? false : !!retry.data;
  },

  /** Returns the owner's recovery prompt (preset id + optional custom text). */
  async getRecoveryQuestion(kind: EntityPasswordKind): Promise<EntityRecoveryQuestion | null> {
    const sb = getSupabase();
    const { data, error } = await sb.rpc("get_entity_recovery_question", { p_kind: kind });
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
    const { error } = await sb.rpc("setup_entity_password_with_recovery", {
      p_kind: kind,
      p_new_password: password,
      p_question_id: questionId,
      p_question_text: questionText ?? undefined,
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
    const { error } = await sb.rpc("set_entity_recovery", {
      p_kind: kind,
      p_question_id: questionId,
      p_question_text: questionText ?? undefined,
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
    const { error } = await sb.rpc("reset_entity_password_via_recovery", {
      p_kind: kind,
      p_answer: answer,
      p_new_password: newPassword,
    });
    if (error) throw new Error(error.message || "Couldn't reset the password.");
  },

  /** Check whether an entity console session has been unlocked via PIN in this browser session. */
  isSessionUnlocked(entityId: string): boolean {
    if (!entityId) return false;
    try {
      const raw = sessionStorage.getItem(`stryt_pin_unlocked_${entityId}`);
      if (!raw) return false;
      const expiresAt = Number(raw);
      if (isNaN(expiresAt) || Date.now() > expiresAt) {
        sessionStorage.removeItem(`stryt_pin_unlocked_${entityId}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /** Mark an entity console session unlocked for 2 hours. */
  markSessionUnlocked(entityId: string): void {
    if (!entityId) return;
    try {
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      sessionStorage.setItem(`stryt_pin_unlocked_${entityId}`, String(Date.now() + TWO_HOURS_MS));
    } catch {
      // ignore storage errors
    }
  },

  /** Clear the session unlock status for an entity. */
  clearSessionUnlock(entityId: string): void {
    if (!entityId) return;
    try {
      sessionStorage.removeItem(`stryt_pin_unlocked_${entityId}`);
    } catch {
      // ignore
    }
  },
};

