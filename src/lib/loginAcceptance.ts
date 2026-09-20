import { getSupabase } from "./supabaseClient";
import { LEGAL_VERSION } from "./legal";

const KEY = "stryt_google_acceptance_attempt";
const MAX_AGE_MS = 15 * 60 * 1000;
type Attempt = { id: string; version: string; startedAt: number };
let attempt: Attempt | null = null;
let settled: Promise<void> = Promise.resolve();
let release: (() => void) | undefined;

/** Only an explicit tap on the button beside the legal notice starts this. */
export function beginLoginAcceptance() {
  cancelLoginAcceptance();
  attempt = { id: crypto.randomUUID(), version: LEGAL_VERSION, startedAt: Date.now() };
  settled = new Promise<void>((resolve) => { release = resolve; });
  try { sessionStorage.setItem(KEY, JSON.stringify(attempt)); } catch { /* Popup/native still works. */ }
}

/** Called only when completing an actual Firebase redirect, never on session restoration. */
export function restoreLoginAcceptance() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null") as Attempt | null;
    if (!value || typeof value.id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.id) || value.version !== LEGAL_VERSION ||
        !Number.isFinite(value.startedAt) || Date.now() - value.startedAt > MAX_AGE_MS ||
        value.startedAt > Date.now()) {
      cancelLoginAcceptance();
      return;
    }
    attempt = value;
    settled = new Promise<void>((resolve) => { release = resolve; });
  } catch { cancelLoginAcceptance(); }
}

export function cancelLoginAcceptance() {
  attempt = null;
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be unavailable. */ }
  release?.();
  release = undefined;
}

/** Profile hydration waits so routing cannot race past the acceptance write. */
export function waitForLoginAcceptance() {
  if (attempt && Date.now() - attempt.startedAt > MAX_AGE_MS) cancelLoginAcceptance();
  return settled;
}

export async function completeLoginAcceptance() {
  const current = attempt;
  try {
    if (!current || Date.now() - current.startedAt > MAX_AGE_MS) return;
    const { error } = await getSupabase().rpc("record_login_acceptance", {
      p_version: current.version,
      p_attempt_id: current.id,
      p_user_agent: navigator.userAgent,
    }).abortSignal(AbortSignal.timeout(10000));
    if (error) console.warn("Login acceptance was not saved; the Terms screen will retry.");
  } catch {
    // Authentication succeeded. The normal terms gate handles missing acceptance.
    console.warn("Login acceptance was not saved; the Terms screen will retry.");
  } finally {
    if (current === attempt) cancelLoginAcceptance();
  }
}
