import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ArrowLeft } from "@/components/Icons";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { normalizeAlias } from "@/lib/publicName";
import { onboardingService } from "@/services/core/onboardingService";
import StreetScene from "@/components/StreetScene";
import BrandLockup from "@/components/BrandLockup";
import { BeatIdentity } from "./onboard/BeatIdentity";
import { BeatHandle } from "./onboard/BeatHandle";
import { BeatLocation, type PickedPlace } from "./onboard/BeatLocation";
import { BeatInterests } from "./onboard/BeatInterests";
import { LOCATION_SKIPPED_KEY, hasNoLocation } from "@/lib/locationPrompt";
import { returnTo } from "@/lib/returnTo";
import { errorCode, errorMessage } from "@/lib/errorMessage";
import { track } from "@/lib/analytics";

/** Each completed beat is saved server-side; device storage is never a gate. */
export default function UserOnboard() {
  const nav = useNavigate();
  const { user, refreshUser, setArea, showToast, signOut } = useApp();
  const { t } = useI18n();
  const [beat, setBeat] = useState(() => Math.min(Math.max(user.onboardingStep ?? 0, 0), 3));
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState({
    name: user.name, avatar: user.avatar || "", phone: user.phone || "",
    ageConfirmed: !!user.ageConfirmedAt,
  });
  const [alias, setAlias] = useState(user.alias || "");
  const [place, setPlace] = useState<PickedPlace | null>(() =>
    !hasNoLocation(user.lat, user.lng) && Number.isFinite(user.lat) && Number.isFinite(user.lng)
      ? { lat: user.lat, lng: user.lng, area: user.area } : null);

  async function step(save: () => Promise<void>, to: number) {
    if (busy) return;
    setBusy(true);
    try { await save(); setBeat(to); }
    catch (err) {
      showToast(errorCode(err) === "23505" ? t("ob_handle_taken") : t("ob_save_failed"));
    } finally { setBusy(false); }
  }

  function rememberLocation(skipped: boolean) {
    try {
      localStorage.setItem("locationPromptShown", "true");
      if (skipped) localStorage.setItem(LOCATION_SKIPPED_KEY, "true");
      else localStorage.removeItem(LOCATION_SKIPPED_KEY);
    } catch { /* Device hints cannot prevent saving onboarding. */ }
  }

  async function finish(interests: string[]) {
    if (busy) return;
    setBusy(true);
    try {
      await onboardingService.save("finish", { interests });
      // The end of the funnel that starts with a guest opening the app.
      // Count of interests only — not which ones, and nothing identifying.
      track("signup_completed", { interests: interests.length, skipped_location: !place });
      await refreshUser({ throwOnError: true });
      nav(returnTo.consume(), { replace: true });
    } catch (err) {
      showToast(errorMessage(err, t("ob_save_failed")));
    } finally { setBusy(false); }
  }

  return (
    <div className="ob-screen">
      <StreetScene litCount={beat} />
      <div className="ob-top"><BrandLockup glow={0.85} size={22} /></div>
      {beat > 0 && (
        <button className="ob-back" onClick={() => setBeat(beat - 1)} disabled={busy} aria-label={t("back_word")}>
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="ob-stage">
        {beat === 0 && (
          <BeatIdentity {...identity} email={user.email} busy={busy}
            onDone={data => void step(async () => {
              await onboardingService.save("identity", data); setIdentity(data);
            }, 1)} />
        )}
        {beat === 1 && (
          <BeatHandle name={identity.name} email={user.email} initialAlias={alias} busy={busy}
            onDone={value => void step(async () => {
              const normalized = normalizeAlias(value);
              await onboardingService.save("handle", { alias: normalized }); setAlias(normalized);
            }, 2)} />
        )}
        {beat === 2 && (
          <BeatLocation initial={place} busy={busy}
            onDone={value => void step(async () => {
              await onboardingService.save("location", { ...value });
              setPlace(value); if (value.area) setArea(value.area); rememberLocation(false);
            }, 3)}
            onSkip={() => void step(async () => {
              await onboardingService.save("location", { skip: true }); rememberLocation(!place);
            }, 3)} />
        )}
        {beat === 3 && (
          <BeatInterests initial={user.interestCategoryIds} busy={busy}
            onDone={value => void finish(value)} onSkip={() => void finish([])} />
        )}
      </div>
      <button className="ob-signout" disabled={busy} onClick={() => { signOut(); nav("/"); }}>
        <LogOut size={15} /> {t("sign_out")}
      </button>
    </div>
  );
}
