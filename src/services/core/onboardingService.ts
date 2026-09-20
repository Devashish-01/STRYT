import { getSupabase } from "@/lib/supabaseClient";
import { throwIfError } from "@/lib/supabasePage";
import type { Json } from "@/types/database.types";

export type OnboardingState = { onboardingStep: number; ageConfirmedAt: string | null };
export const onboardingService = {
  async save(action: "read" | "identity" | "handle" | "location" | "finish", payload: Record<string, Json | undefined> = {}): Promise<OnboardingState> {
    const { data, error } = await getSupabase().rpc("customer_onboarding", { p_action: action, p_payload: payload });
    throwIfError(error);
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.onboardingStep !== "number") {
      throw new Error("Couldn't load your setup. Please try again.");
    }
    return data as OnboardingState;
  },
};
