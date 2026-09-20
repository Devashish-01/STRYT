import { beforeEach, describe, expect, it, vi } from "vitest";
import { onboardingService } from "./onboardingService";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => ({ rpc }) }));
beforeEach(() => rpc.mockReset());
describe("account-backed onboarding", () => {
  it("reads account progress, not localStorage", async () => {
    rpc.mockResolvedValue({ data: { onboardingStep: 2, ageConfirmedAt: "2026-09-20" }, error: null });
    expect(await onboardingService.save("read")).toEqual({ onboardingStep: 2, ageConfirmedAt: "2026-09-20" });
    expect(rpc).toHaveBeenCalledWith("customer_onboarding", { p_action: "read", p_payload: {} });
  });
  it("propagates a rejected save so the UI cannot advance", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "Handle taken" } });
    await expect(onboardingService.save("handle", { alias: "taken" })).rejects.toThrow();
  });
  it("allows explicit skips without manufactured preferences", async () => {
    rpc.mockResolvedValue({ data: { onboardingStep: 3, ageConfirmedAt: "2026-09-20" }, error: null });
    await onboardingService.save("location", { skip: true });
    expect(rpc).toHaveBeenLastCalledWith("customer_onboarding", { p_action: "location", p_payload: { skip: true } });
    await onboardingService.save("finish", { interests: [] });
    expect(rpc).toHaveBeenLastCalledWith("customer_onboarding", { p_action: "finish", p_payload: { interests: [] } });
  });
  it("rejects missing progress instead of bypassing onboarding", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(onboardingService.save("read")).rejects.toThrow();
  });
});
