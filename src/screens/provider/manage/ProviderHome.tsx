import { useState } from "react";
import type { Icon as ProviderToolIcon } from "@phosphor-icons/react";
import { Link, useNavigate } from "react-router-dom";
import { BadgeCheck, Camera, ChevronRight, LayoutDashboard, Megaphone, QrCode } from "@/components/Icons";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import { SetupChecklist } from "@/components/SetupChecklist";
import ConsoleStatusStrip from "@/components/console/ConsoleStatusStrip";
import ConsoleToolsSheet from "@/components/console/ConsoleToolsSheet";
import { ConsoleTile, ConsoleTileGrid } from "@/components/console/ConsoleTile";
import { CAPABILITY_TONE, CAPABILITY_ICON } from "@/components/console/capabilities";
import { useProviderOverview } from "@/features/provider-console/providerOverview";
import { useQuery } from "@/hooks/useApi";
import { BUSINESS_PACKAGES, resolvePackage, type ConsoleCapability } from "@/lib/businessPackages";
import { buildConsoleSteps, consoleFor, type CapabilityState } from "@/lib/consoleSteps";
import { useI18n } from "@/lib/i18n";
import { communityService } from "@/services/engagement/communityService";
import { DEFAULT_ONBOARD_WORKING_HOURS, parseHoursValue, serializeHoursValue } from "@/utils/availability";

const coreTools = [
  { id: "catalog", labelKey: "pphub_services" },
  { id: "hours", labelKey: "console_availability" },
  { id: "photos", labelKey: "pon_step_portfolio" },
  { id: "inbox", labelKey: "pphub_reachouts" },
] as const;

export default function ProviderHome() {
  const { id, base, provider, status, actions, unhandledLeads, openShare } = useProviderOverview();
  const { t, tf } = useI18n();
  const nav = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const { data: posts } = useQuery(() => communityService.byAuthorRef("provider", id), [id], `provider:${id}:posts`);

  const pkg = BUSINESS_PACKAGES[resolvePackage(provider)];
  const config = consoleFor(pkg, "provider");
  const composeState = { providerId: id, providerName: provider.displayName, providerAvatar: provider.avatar };
  const availabilitySet = Boolean(provider.availabilityNote)
    && serializeHoursValue(parseHoursValue(provider.availabilityNote)) !== serializeHoursValue(parseHoursValue(DEFAULT_ONBOARD_WORKING_HOURS));
  const capabilities: Partial<Record<ConsoleCapability, CapabilityState>> = {
    catalog: { done: (provider.catalog?.length ?? 0) > 0, onClick: () => nav(`${base}/catalog`) },
    hours: { done: availabilitySet, onClick: () => nav(`${base}/availability`) },
    photos: { done: (provider.portfolio?.length ?? 0) > 0, onClick: () => nav(`${base}/portfolio`) },
    inbox: { onClick: () => nav(`${base}/inbox`) },
    verify: {
      done: provider.isVerified || provider.verificationStatus === "UNDER_REVIEW",
      onClick: () => nav(`${base}/verify`),
    },
    promote: { done: (posts?.length ?? 0) > 0, onClick: () => nav("/community/new", { state: composeState }) },
    payments: { onClick: () => nav(`${base}/money`) },
    ...(status.bookingsOn ? { bookings: { done: availabilitySet, onClick: () => nav(`${base}/jobs`) } } : {}),
  };
  const checklist = buildConsoleSteps(config.setup, capabilities);
  const tools = [
    ["dashboard", "nav_dashboard"], ["jobs", "nav_jobs"], ["find-work", "nav_find_work"], ["money", "nav_money"],
    ["profile", "profile"], ["edit-profile", "pdash_edit_profile"], ["catalog", "pphub_services"],
    ["inventory", "pphub_inventory"], ["availability", "console_availability"], ["portfolio", "pon_step_portfolio"],
    ["inbox", "pphub_reachouts"], ["reviews", "provider_customer_reviews"], ["community", "community"],
    ["verify", "bset_verification"], ["settings", "settings"],
  ].map(([path, labelKey]) => ({ to: `${base}/${path}`, labelKey }));

  return (
    <>
      <AccountStatusBanner entityType="PROVIDER" entityId={id} status={provider.status} />
      <section className="page-pad">
        <ConsoleStatusStrip available={status.available} booking={status.booking} saving={status.saving} labelKey="provider_console_status"
          availabilityKey={status.available ? "provider_available_now" : "provider_available_for_three"}
          onAvailability={status.toggleAvailability} onBookings={status.toggleBookings} settingsPath={`${base}/settings`} />
      </section>

      <section className="page-pad col gap-8" style={{ paddingTop: 0 }}>
        <Link to={`${base}/dashboard`} className="card row gap-12 center-v" style={{ width: "100%", padding: 14 }}
          aria-label={actions.total > 0 ? tf("console_dashboard_actions", { n: actions.total }) : t("nav_dashboard")}>
          <LayoutDashboard size={21} color="var(--green-600)" aria-hidden="true" />
          <div className="grow">
            <div className="semi small">{t("nav_dashboard")}</div>
            <div className="tiny muted">{t("provider_dashboard_hint")}</div>
          </div>
          {actions.total > 0 && <span className="badge badge-amber">{actions.total}</span>}
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
        <button type="button" className="btn btn-outline btn-sm" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}>
          {t("console_all_tools")}
        </button>
      </section>

      {checklist.some(({ done }) => !done) && (
        <section className="page-pad" style={{ paddingTop: 0 }}>
          <SetupChecklist title={config.setupTitle} items={checklist} storageKey={`stryt_checklist_dismissed_${id}`} />
        </section>
      )}

      <section className="page-pad" style={{ paddingTop: 0 }}>
        <ConsoleTileGrid>
          {coreTools.map(({ id: tool, labelKey }) => {
            const tone = pkg.key === "generic" ? { tint: "var(--green-100)", accent: "var(--green-600)" } : CAPABILITY_TONE[tool];
            return <ConsoleTile key={tool} icon={CAPABILITY_ICON[tool]} label={t(labelKey)}
              tint={tone.tint} accent={tone.accent} badge={tool === "inbox" ? unhandledLeads : undefined}
              onClick={capabilities[tool]!.onClick} />;
          })}
        </ConsoleTileGrid>
      </section>

      <section className="page-pad" style={{ paddingTop: 0 }}>
        <h2 className="small semi muted" style={{ marginBottom: 10 }}>{t("mdash_grow")}</h2>
        <div className="provider-grow-grid">
          <GrowTile icon={Megaphone} label={t("pdash_post_update")} onClick={() => nav("/community/new", { state: composeState })} />
          <GrowTile icon={Camera} label={t("pdash_post_story")} onClick={() => nav("/story/new", { state: composeState })} />
          <GrowTile icon={QrCode} label={t("mdash_share_qr")} onClick={openShare} />
          <GrowTile icon={BadgeCheck} label={t(provider.isVerified ? "bset_verification" : "mdash_get_verified")} onClick={() => nav(`${base}/verify`)} />
        </div>
      </section>
      <ConsoleToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} items={tools} />
    </>
  );
}

function GrowTile({ icon: Icon, label, onClick }: { icon: ProviderToolIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="card row gap-8 center-v" style={{ padding: 12, textAlign: "start" }} onClick={onClick}>
      <Icon size={19} />
      <span className="small semi">{label}</span>
    </button>
  );
}
