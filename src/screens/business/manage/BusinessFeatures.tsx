import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check } from "@/components/Icons";
import { bustBusinessGetCache, businessService } from "@/services";
import { invalidateQueryCache, useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { AppBar } from "@/components/common";
import { ErrorView, Skeleton } from "@/components/states";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";
import { haptics } from "@/lib/haptics";
import { featureIcon, featureTone } from "@/components/console/featureIcons";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { consoleFor } from "@/lib/consoleSteps";
import { featurePath, featureStatus, rankFeatures, type FeatureContext, type FeatureDef, type FeatureStatus } from "@/lib/businessFeatures";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { useBusinessAccess } from "@/lib/businessAccess";
import { featureContextFor } from "@/features/business-home/featureContext";
import ManageNav from "./ManageNav";

/**
 * "Add features" — a plain-language catalogue of what a business on STRYT can switch on, ordered for the kind of business it
 * is. Every card is something the app already does: it either flips a setting right here (bookings) or opens the screen where
 * that tool is set up. Owner-only (the route sits under RequireOwner), because turning tools on changes the public page.
 */
export default function BusinessFeatures() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { showToast } = useApp();
  const { t } = useI18n();
  const { isOwner } = useBusinessAccess();
  const base = `/business/${id}/manage`;
  const [busy, setBusy] = useState<string | null>(null);

  const { data: business, loading, error, refetch } = useQuery(() => businessService.get(id), [id], `business:${id}`);
  const { data: queue } = useQueryWithRealtime(
    () => businessService.queueOwnerState(id), "queue_tokens", [id], `business_id=eq.${id}`, `queue:${id}`,
  );

  if (!id) return <div className="screen"><AppBar title={t("bfeat_title")} /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;
  if (loading && !business) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("bfeat_title")} subtitle={t("bfeat_sub")} />
        <div className="page-pad col gap-12" style={{ marginTop: 12 }}>
          <Skeleton h={80} r={16} mb={0} /><Skeleton h={120} r={16} mb={0} /><Skeleton h={120} r={16} mb={0} />
        </div>
        <ManageNav bizId={id} />
      </div>
    );
  }
  if (error && !business) {
    return <div className="screen"><AppBar title={t("bfeat_title")} /><ErrorView error={error} onRetry={refetch} /></div>;
  }

  const pkg = BUSINESS_PACKAGES[resolvePackage(business ?? {})];
  const consoleCfg = consoleFor(pkg);
  const bookingsOn = business?.bookingsEnabled ?? pkg.bookingsDefault;
  const ctx: FeatureContext = featureContextFor({ business, queueUsed: !!queue?.hasEverUsedQueue, bookingsOn, deliveryFlag: DELIVERY_AGENT_ENABLED, isOwner });
  const ranked = rankFeatures(pkg.key, consoleCfg.actions.map((a) => a.id), ctx);
  const nothingLeft = ranked.recommended.length === 0 && ranked.more.length === 0;

  async function toggle(f: FeatureDef, next: boolean) {
    if (f.action.kind !== "toggle" || busy) return;
    setBusy(f.id);
    haptics.selection();
    try {
      await businessService.update(id, { [f.action.field]: next } as any);
      invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
      await refetch();
      showToast(next ? t("bfeat_saved_on") : t("bfeat_saved_off"));
    } catch (e) {
      showToast(errorMessage(e, t("bfeat_err")));
    } finally {
      setBusy(null);
    }
  }

  const section = (title: string, list: FeatureDef[]) =>
    list.length === 0 ? null : (
      <section className="col gap-10">
        <div className="small semi muted" style={{ textTransform: "uppercase", letterSpacing: .5 }}>{title}</div>
        {list.map((f) => (
          <FeatureCard
            key={f.id}
            def={f}
            status={featureStatus(f, ctx)}
            busy={busy === f.id}
            onToggle={(next) => toggle(f, next)}
            onOpen={(path) => nav(featurePath(base, path))}
          />
        ))}
      </section>
    );

  return (
    <div className="screen with-nav">
      <AppBar title={t("bfeat_title")} subtitle={t("bfeat_sub")} />
      <div className="screen-scroll">
        <div className="page-pad col gap-18" style={{ paddingTop: 12 }}>
          <p className="small muted" style={{ lineHeight: 1.5 }}>{t("bfeat_intro")}</p>
          {section(t("bfeat_recommended"), ranked.recommended)}
          {nothingLeft && (
            <div className="card row gap-10 center-v" style={{ padding: 14 }}>
              <Check size={18} color="var(--green-600)" />
              <span className="small">{t("bfeat_all_on")}</span>
            </div>
          )}
          {section(t("bfeat_more"), ranked.more)}
          {section(t("bfeat_active"), ranked.active)}
        </div>
        <div style={{ height: 24 }} />
      </div>
      <ManageNav bizId={id} />
    </div>
  );
}

function FeatureCard({
  def, status, busy, onToggle, onOpen,
}: {
  def: FeatureDef;
  status: FeatureStatus;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onOpen: (path: string) => void;
}) {
  const { t } = useI18n();
  const tone = featureTone(def);
  const on = status === "on";
  const bestFor = def.bestFor === "all" ? [] : def.bestFor.map((k) => BUSINESS_PACKAGES[k].label);
  const isToggle = def.action.kind === "toggle";

  return (
    <div className="card col gap-10" style={{ padding: 14 }}>
      <div className="row gap-12" style={{ alignItems: "flex-start" }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: tone.tint, color: tone.accent, flexShrink: 0 }}>
          {featureIcon(def)}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between center-v gap-8">
            <span className="semi">{t(def.titleKey)}</span>
            {status !== "tool" && (
              <span className={`badge ${on ? "badge-green" : status === "todo" ? "badge-amber" : "badge-gray"}`}>
                {on ? t("bfeat_on") : status === "todo" ? t("bfeat_todo") : t("bfeat_off")}
              </span>
            )}
          </div>
          <div className="small muted" style={{ marginTop: 3, lineHeight: 1.45 }}>{t(def.pitchKey)}</div>
          {bestFor.length > 0 && (
            <div className="tiny muted" style={{ marginTop: 6 }}>
              <span className="semi">{t("bfeat_best_for")}:</span> {bestFor.slice(0, 4).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <div className="row gap-8">
        {isToggle ? (
          <>
            {on && def.manage && (
              <button className="btn btn-primary btn-sm grow" onClick={() => onOpen(def.manage!)}>{t("bfeat_open")}</button>
            )}
            <button
              className={`btn btn-sm grow ${on ? "btn-outline" : "btn-primary"}`}
              disabled={busy}
              onClick={() => onToggle(!on)}
            >
              {busy ? "…" : on ? t("bfeat_turn_off") : t("bfeat_turn_on")}
            </button>
          </>
        ) : (
          <button
            className={`btn btn-sm btn-block ${on || status === "tool" ? "btn-outline" : "btn-primary"}`}
            onClick={() => def.action.kind === "route" && onOpen(def.action.path)}
          >
            {on || status === "tool" ? t("bfeat_open") : t("bfeat_set_up")}
          </button>
        )}
      </div>
    </div>
  );
}
