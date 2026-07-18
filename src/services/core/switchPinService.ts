import { getSupabase } from "@/lib/supabaseClient";

export const switchPinService = {
  /** Is a switch PIN currently set for this account? */
  async isSet(): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("is_switch_pin_set");
    if (error) return false;
    return !!data;
  },

  /** Set or change the PIN. `currentPin` is required only when one is already set. */
  async set(newPin: string, currentPin?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("set_switch_pin", {
      p_new_pin: newPin,
      p_current_pin: currentPin ?? null,
    });
    if (error) throw new Error(error.message || "Couldn't save the PIN.");
  },

  /** Remove the PIN — requires the current PIN to confirm. */
  async clear(currentPin: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await (sb.rpc as any)("clear_switch_pin", { p_current_pin: currentPin });
    if (error) throw new Error(error.message || "Couldn't remove the PIN.");
  },

  /** Verify a PIN attempt. Never throws — rate-limited server-side, a wrong
   *  guess and a locked-out window both just resolve to false. */
  async verify(pin: string): Promise<boolean> {
    const sb = getSupabase();
    const { data, error } = await (sb.rpc as any)("verify_switch_pin", { p_pin: pin });
    if (error) return false;
    return !!data;
  },
};
