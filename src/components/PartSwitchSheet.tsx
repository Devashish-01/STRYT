import { useNavigate, type NavigateOptions } from "react-router-dom";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/hooks/useApi";
import { businessService, providerService } from "@/services";
import { haptics } from "@/lib/haptics";
import { partOfContext, type Part } from "@/lib/partNavigation";

/**
 * "Switch to X?" — shown before a notification or push tap moves the user into a different part of the app
 * (personal, a business, the provider console, delivery). Switching goes through the app's own context switch, so a
 * business or provider password is still asked for; "Stay here" leaves everything as it was.
 */
export function PartSwitchSheet({ part, to, options, onClose }: {
  part: Part;
  to: string;
  options?: NavigateOptions;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const { user, activeContext, attemptSwitchContext, showToast } = useApp();
  const { t, tf } = useI18n();

  const entityId = part.type === "business" || part.type === "provider" ? part.id : "";
  // Same cache keys as the console screens, so the name is usually already there.
  const { data } = useQuery<{ name?: string; displayName?: string } | undefined>(
    () =>
      part.type === "business" ? businessService.get(entityId)
      : part.type === "provider" ? providerService.get(entityId)
      : Promise.resolve(undefined),
    [part.type, entityId],
    part.type === "business" || part.type === "provider" ? `${part.type}:${entityId}` : `part-switch:${part.type}`,
  );

  const labelOf = (p: Part, name?: string) =>
    p.type === "customer" ? t("personal_word")
    : p.type === "delivery" ? t("part_delivery")
    : p.type === "business" ? name || t("part_business_fallback")
    : name || t("part_provider_fallback");

  const targetName = (part.type === "business" ? data?.name : part.type === "provider" ? data?.displayName : undefined) ?? "";
  const targetLabel = labelOf(part, targetName);
  const here = partOfContext(activeContext);
  const hereLabel = labelOf(here, activeContext.name);

  function confirm() {
    haptics.selection();
    const ready = attemptSwitchContext(
      {
        type: part.type,
        id: part.type === "business" || part.type === "provider" ? part.id : null,
        name: part.type === "customer" ? user.name : part.type === "delivery" ? "Delivery" : targetName,
      },
      to,
    );
    onClose();
    if (!ready) return; // the password sheet takes over and finishes the navigation
    showToast(tf("part_switched_toast", { name: targetLabel }));
    nav(to, options);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet col gap-14" role="dialog" aria-modal="true" aria-label={tf("part_switch_title", { name: targetLabel })} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div>
          <h3 className="bold h2">{tf("part_switch_title", { name: targetLabel })}</h3>
          <p className="small muted" style={{ marginTop: 4 }}>{tf("part_switch_body", { from: hereLabel, to: targetLabel })}</p>
        </div>
        <div className="row gap-8">
          <button type="button" className="btn btn-outline grow" onClick={onClose}>{t("part_stay_here")}</button>
          <button type="button" className="btn btn-primary grow" onClick={confirm}>{t("part_switch_confirm")}</button>
        </div>
      </div>
    </div>
  );
}
