import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { isUnusableName, normalizeAlias } from "@/lib/publicName";
import { userService } from "@/services";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import { BeatIdentity } from "./onboard/BeatIdentity";
import { BeatHandle } from "./onboard/BeatHandle";
import { BeatLocation, type PickedPlace } from "./onboard/BeatLocation";
import { BeatInterests } from "./onboard/BeatInterests";

/**
 * First-run onboarding — "light up your street".
 *
 * Replaces a single page of seven inputs (name, handle, location, avatar
 * upload, emoji picker, phone, language, radius slider) with four
 * one-question beats, of which two are a single tap and two are skippable.
 * Avatar, phone and radius are gone from signup entirely — Google already
 * supplies an avatar, phone means something at first booking rather than here,
 * and a radius slider is a settings-screen control that can't mean anything to
 * someone who hasn't seen the app yet. All three remain in ProfileEdit.
 *
 * The progress indicator is the street itself: StreetScene renders exactly
 * four lamps, so each answered beat lights one. Nothing new was invented for
 * it — an existing brand asset just became functional.
 *
 * Every beat commits as it completes and `onboardingCompletedAt` is written
 * only at the very end, so abandoning halfway loses nothing and returning
 * resumes at the right question instead of restarting.
 */

/** Remembers how far an abandoned run got, for the two optional beats. The
 *  required beats resolve from real saved data instead, so this can never
 *  skip someone past a question they haven't actually answered. */
const BEAT_KEY = "ob_beat";
const TOTAL_BEATS = 4;

export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, setArea, showToast, signOut } = useApp();
  const { t } = useI18n();

  // Resolved once, as the initial state rather than in an effect: an effect
  // would render beat 1 for a frame before correcting itself, so anyone
  // resuming would see the flow flick past a question they already answered.
  // Safe to read `user` here — the router only mounts this screen once the
  // real profile has loaded (it gates on `user.id`).
  const [beat, setBeat] = useState(() => {
    if (isUnusableName(user.name)) return 0;
    if (!user.alias) return 1;
    const saved = Number(localStorage.getItem(BEAT_KEY) ?? 2);
    return Math.min(Math.max(Number.isFinite(saved) ? saved : 2, 2), TOTAL_BEATS - 1);
  });
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  // Held locally so a beat can use the freshly-entered value before the
  // profile round-trip has landed (the handle suggestions need the name).
  const [name, setName] = useState(user.name);

  function advance(to: number) {
    localStorage.setItem(BEAT_KEY, String(to));
    setBeat(to);
  }

  /** Wraps a save so one failure can never strand someone mid-flow. */
  async function step(save: () => Promise<void>, to: number) {
    setBusy(true);
    try {
      await save();
      advance(to);
    } catch (err: any) {
      const isDuplicate = err?.code === "23505" || /duplicate|unique|alias/i.test(err?.message ?? "");
      showToast(isDuplicate ? t("ob_handle_taken") : err?.message || "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(interestCategoryIds: string[]) {
    setBusy(true);
    try {
      await userService.update({
        interestCategoryIds,
        onboardingCompletedAt: new Date().toISOString(),
      });
      localStorage.removeItem(BEAT_KEY);
      await refreshUser();
      // The payoff: all four lamps lit before Home takes over. Kept short, and
      // skipped outright when the viewer has asked for reduced motion.
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) { nav("/home", { replace: true }); return; }
      setRevealing(true);
      setTimeout(() => nav("/home", { replace: true }), 1100);
    } catch (err: any) {
      showToast(err?.message || "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  const litCount = revealing ? TOTAL_BEATS : beat;

  return (
    <div className="ob-screen">
      <StreetScene litCount={litCount} />

      <div className="ob-top">
        <BrandLockup glow={0.85} size={22} />
      </div>

      <div className="ob-stage">
        {revealing ? (
          <div className="ob-reveal">{t("ob_reveal")}</div>
        ) : (
          <>
            {beat === 0 && (
              <BeatIdentity
                name={user.name}
                avatar={user.avatar}
                busy={busy}
                onDone={(n) =>
                  step(async () => {
                    await userService.update({ name: n });
                    setName(n);
                  }, 1)
                }
              />
            )}

            {beat === 1 && (
              <BeatHandle
                name={name}
                email={user.email}
                busy={busy}
                onDone={(alias) =>
                  step(() => userService.update({ alias: normalizeAlias(alias) }).then(() => {}), 2)
                }
              />
            )}

            {beat === 2 && (
              <BeatLocation
                busy={busy}
                onDone={(p: PickedPlace) =>
                  step(async () => {
                    await userService.setLocation(p.lat, p.lng, p.area || undefined);
                    if (p.area) setArea(p.area);
                    // Kept so a client still running the previous build can't
                    // re-prompt with the old standalone location screen.
                    localStorage.setItem("locationPromptShown", "true");
                  }, 3)
                }
                onSkip={() => {
                  localStorage.setItem("locationPromptShown", "true");
                  advance(3);
                }}
              />
            )}

            {beat === 3 && (
              <BeatInterests
                initial={user.interestCategoryIds}
                busy={busy}
                onDone={finish}
                onSkip={() => void finish([])}
              />
            )}
          </>
        )}
      </div>

      {!revealing && (
        <button className="ob-signout" onClick={() => { signOut(); nav("/"); }}>
          <LogOut size={15} /> {t("sign_out")}
        </button>
      )}
    </div>
  );
}
