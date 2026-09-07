import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ArrowLeft } from "@/components/Icons";
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
import { LOCATION_SKIPPED_KEY } from "@/lib/locationPrompt";

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
 *  skip someone past a question they haven't actually answered.
 *
 *  #3 — scoped per user. This was a single global `ob_beat` key, so a shared
 *  or handed-down phone carried one account's progress into the next: a
 *  brand-new user signing in after someone who had reached beat 3 was dropped
 *  straight at Interests, skipping Location entirely and landing on an
 *  unranked Home with no idea why. */
function beatKey(userId?: string) {
  return `ob_beat:${userId || "anon"}`;
}
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
    // #1 — this used to be `if (isUnusableName(user.name)) return 0;`, so
    // anyone arriving from Google (who by definition HAS a usable name) was
    // dropped at beat 1 and never saw beat 0 at all. Beat 0 is where the
    // language switcher lives, so a Hindi or Marathi speaker signing in with
    // Google had no way to change language during onboarding — they read the
    // entire flow in English and only found the setting afterwards. Anyone who
    // hasn't got as far as choosing a handle now starts at 0; it's one tap for
    // a name they only need to confirm, and it's the one screen where picking
    // a language still helps.
    if (!user.alias) return 0;
    const saved = Number(localStorage.getItem(beatKey(user.id)) ?? 2);
    return Math.min(Math.max(Number.isFinite(saved) ? saved : 2, 2), TOTAL_BEATS - 1);
  });
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  // #6 — the reveal's navigation timer used to be fire-and-forget, so tapping
  // "Sign out" during the 1.1s celebration signed you out and THEN pushed you
  // to /home anyway, landing a signed-out user on the authed route. Held here
  // so unmount can cancel it.
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
  }, []);
  // Held locally so a beat can use the freshly-entered value before the
  // profile round-trip has landed (the handle suggestions need the name).
  const [name, setName] = useState(user.name);

  function advance(to: number) {
    localStorage.setItem(beatKey(user.id), String(to));
    setBeat(to);
  }

  // #7 — there was no way back. A misspelled name or a handle picked in haste
  // could not be corrected without finishing the whole flow and hunting for
  // ProfileEdit. Every beat commits as it completes, so stepping back just
  // re-opens a question whose answer is already saved; re-answering overwrites
  // it. Beat 0 has nothing behind it, and the reveal is past the point of
  // changing anything.
  const canGoBack = beat > 0 && !revealing && !busy;

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
      localStorage.removeItem(beatKey(user.id));
      await refreshUser();
      // The payoff: all four lamps lit before Home takes over. Kept short, and
      // skipped outright when the viewer has asked for reduced motion.
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduced) { nav("/home", { replace: true }); return; }
      setRevealing(true);
      revealTimer.current = setTimeout(() => nav("/home", { replace: true }), 1100);
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

      {canGoBack && (
        <button
          className="ob-back"
          onClick={() => advance(beat - 1)}
          aria-label={t("back_word")}
          style={{
            position: "absolute", top: 14, left: 14, zIndex: 3,
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <ArrowLeft size={18} />
        </button>
      )}

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
                    localStorage.removeItem(LOCATION_SKIPPED_KEY);
                  }, 3)
                }
                onSkip={() => {
                  localStorage.setItem("locationPromptShown", "true");
                  // #8 — skipping leaves lat/lng at the seed 0,0. Discovery
                  // already degrades that to "no location" (`user.lat ||
                  // undefined`), so the feed is merely unranked rather than
                  // ranked against the Gulf of Guinea — but nothing told the
                  // user that, and Home showed an example area as if it were
                  // theirs. This flag is what lets Home say so and offer the
                  // one control that fixes it.
                  localStorage.setItem(LOCATION_SKIPPED_KEY, "true");
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
