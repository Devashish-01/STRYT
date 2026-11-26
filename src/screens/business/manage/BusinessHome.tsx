import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, LayoutDashboard, Plus } from "@/components/Icons";
import {
  communityService, deliveryService, notificationService,
} from "@/services";
import { chatService } from "@/services/engagement/chatService";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { AppBar } from "@/components/common";
import { ErrorView, Skeleton } from "@/components/states";
import { useApp } from "@/store";
import { useI18n } from "@/lib/i18n";
import ManageNav from "./ManageNav";
import ShareCard from "@/components/ShareCard";
import { AccountStatusBanner } from "@/components/AccountStatusBanner";
import BusinessConsoleHeader from "@/components/console/BusinessConsoleHeader";
import ConsoleStatusStrip from "@/components/console/ConsoleStatusStrip";
import { SetupChecklist } from "@/components/SetupChecklist";
import ConsoleToolsSheet from "@/components/console/ConsoleToolsSheet";
import AccountSwitcher from "@/components/AccountSwitcher";
import { businessToolLinks, resolveBusinessToolVisibility } from "@/lib/businessTools";
import { ConsoleTile, ConsoleTileGrid } from "@/components/console/ConsoleTile";
import { CAPABILITY_ICON, CAPABILITY_TONE } from "@/components/console/capabilities";
import { featureIcon, featureTone } from "@/components/console/featureIcons";
import { BUSINESS_PACKAGES, resolvePackage } from "@/lib/businessPackages";
import { buildConsoleSteps, consoleFor } from "@/lib/consoleSteps";
import { rankFeatures } from "@/lib/businessFeatures";
import { DELIVERY_AGENT_ENABLED } from "@/lib/features";
import { useBusinessAccess } from "@/lib/businessAccess";
import { useAmbientTheme } from "@/features/ambient/useAmbientTheme";
import { buildBusinessCapabilities } from "@/features/business-home/capabilities";
import { useBusinessConsoleData } from "@/features/business-home/businessConsoleData";
import { featureContextFor } from "@/features/business-home/featureContext";

/**
 * The console's front door: who you are, the services you run (named in your trade's own words), what needs a look right now,
 * and a few suggestions for what to switch on next. Deliberately light — the heavy lifting (action queue, money, every
 * appointment) lives on the Dashboard one tab over, and every other tool is a circle in the dial on the Home button.
 */
export default function BusinessHome() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { user, notifUnread, signOut } = useApp();
  const { t, tf } = useI18n();
  const ambient = useAmbientTheme(user.lat, user.lng, "business");
  // No RequireScope on this route: it self-filters by scope. Anything added here is visible to every grantee unless it is
  // gated on hasScope()/isOwner explicitly.
  const access = useBusinessAccess();
  const { isOwner, consoleMode, scopeLabel } = access;
  const tools = resolveBusinessToolVisibility(access, DELIVERY_AGENT_ENABLED);
  const base = `/business/${id}/manage`;
  const [share, setShare] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const work = useBusinessConsoleData();
  const { shop: { data: business, loading }, status, actionCount, hasCurrentWork } = work;
  const queue = work.queue.data;
  const { data: posts } = useQuery(
    () => isOwner ? communityService.byAuthorRef("business", id) : Promise.resolve(undefined),
    [id, isOwner], isOwner ? `business:${id}:posts` : undefined,
  );
  const deliveryOn = DELIVERY_AGENT_ENABLED && business?.deliveryEnabled === true;
  // Orders accepted for delivery that nobody is carrying yet; empty (never an error) on a database without 20261001.
  const { data: awaiting } = useQuery(
    () => (deliveryOn && tools.liveDeliveries ? deliveryService.awaitingDriver(id).catch(() => []) : Promise.resolve([])),
    [id, deliveryOn, tools.liveDeliveries],
    tools.liveDeliveries ? `delivery:awaiting:${id}` : undefined,
  );
  const { data: notificationUnread } = useQueryWithRealtime(
    () => notificationService.getUnreadCount({ scope: "BUSINESS", id }), "notifications", [id, user.id], user.id ? `user_id=eq.${user.id}` : undefined, `notif:business:${id}`,
  );
  const { data: chatUnread } = useQueryWithRealtime(
    () => chatService.totalUnread({ scope: "BUSINESS", id }), "conversations", [id], undefined, `chat:business:${id}`,
  );

  if (!id) {
    return <div className="screen"><AppBar title={t("home")} /><ErrorView error={{ code: "BAD_REQUEST", message: "Missing target ID parameter." } as any} /></div>;
  }
  if (loading && !business) {
    return (
      <div className="screen with-nav">
        <AppBar title={t("home")} />
        <div className="page-pad col gap-14" style={{ marginTop: 12 }}>
          <Skeleton h={120} r={20} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
          <Skeleton h={90} r={16} mb={0} />
        </div>
      </div>
    );
  }

  const { paymentClaims } = work.money;
  const pendingCount = work.appointments.data?.filter((appointment) => appointment.status === "PENDING").length ?? 0;
  const todayCount = work.today.length;
  const upcomingCount = work.upcoming.length;
  const waiting = queue?.waiting.length ?? 0;

  const pkg = BUSINESS_PACKAGES[resolvePackage(business ?? {})];
  const consoleCfg = consoleFor(pkg);
  const { bookingsOn } = status;
  const composeState = { businessId: id, businessName: business?.name, businessAvatar: business?.coverImage };

  const capabilityInputs = {
    base, nav, business, pkg, tools, deliveryOn, waitingForRider: (awaiting ?? []).length, queue,
    upcomingCount, paymentClaims, postsCount: posts?.length ?? 0, composeState, tf,
  };
  const capabilities = buildBusinessCapabilities({ ...capabilityInputs, bookingsOn: bookingsOn || hasCurrentWork });
  const tiles = buildConsoleSteps(consoleCfg.actions, capabilities);
  const checklist = buildConsoleSteps(consoleCfg.setup, buildBusinessCapabilities({ ...capabilityInputs, bookingsOn }));
  // A tile's own count, where one means "something is waiting on you".
  const badgeFor = (cap: string): number | undefined => {
    if (cap === "bookings") return pendingCount || undefined;
    if (cap === "queue") return waiting || undefined;
    if (cap === "payments") return paymentClaims || undefined;
    return undefined;
  };

  const glance = [
    actionCount > 0 && { key: "review", label: t("bhome_stat_review"), value: actionCount, go: dashboardPath(base), tone: "var(--amber-700)", tint: "var(--amber-100)" },
    tools.appointments && todayCount > 0 && { key: "today", label: t("bhome_stat_today"), value: todayCount, go: `${base}/appointments`, tone: "var(--brand-700)", tint: "var(--brand-50)" },
    tools.queue && waiting > 0 && { key: "queue", label: t("bhome_stat_queue"), value: waiting, go: `${base}/queue`, tone: "var(--green-600)", tint: "var(--green-100)" },
  ].filter((x): x is { key: string; label: string; value: number; go: string; tone: string; tint: string } => !!x);
  const staffLinks = [
    tools.appointments && { to: `${base}/appointments`, label: t("nav_appointments"), count: work.ordersRightNow.length || todayCount },
    tools.queue && { to: `${base}/queue`, label: t("nav_queue"), count: waiting },
    tools.myDeliveries && { to: `${base}/my-deliveries`, label: t("console_my_deliveries"), count: 0 },
    actionCount > 0 && { to: dashboardPath(base), label: t("mdash_action_needed"), count: actionCount },
  ].filter((link): link is { to: string; label: string; count: number } => Boolean(link));

  const featureCtx = featureContextFor({ business, queueUsed: !!queue?.hasEverUsedQueue, bookingsOn, deliveryFlag: DELIVERY_AGENT_ENABLED, isOwner });
  const suggested = isOwner ? rankFeatures(pkg.key, consoleCfg.actions.map((a) => a.id), featureCtx).recommended.slice(0, 3) : [];

  const headerSubtitle = isOwner
    ? `${ambient.greeting} · ${business?.ratingAvg ?? 0}★`
    : consoleMode === "full_delegate" ? t("mdash_delegated_full") : tf("mdash_team_access", { scope: scopeLabel });

  return (
    <div className="screen with-nav">
      <BusinessConsoleHeader
        id={id}
        business={business}
        isOwner={isOwner}
        consoleMode={consoleMode}
        ambient={ambient}
        subtitle={headerSubtitle}
        notificationUnread={notificationUnread ?? 0}
        totalNotificationUnread={notifUnread}
        chatUnread={chatUnread ?? 0}
        canOpenMessages={tools.leads}
        onShare={() => setShare(true)}
      />

      <div className="screen-scroll">
        <div className="row gap-8 page-pad" style={{ paddingTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline btn-sm" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}>{t("console_all_tools")}</button>
          {!isOwner && <button type="button" className="btn btn-outline btn-sm" aria-haspopup="dialog" onClick={() => setSwitcherOpen(true)}>{t("console_switch_account")}</button>}
        </div>
        {isOwner && (
          <div style={{ paddingTop: 12 }}>
            <AccountStatusBanner entityType="BUSINESS" entityId={id} status={business?.status} rejectionReason={business?.rejectionReason} />
          </div>
        )}

        {business && (
          <section className="page-pad" style={{ paddingTop: 12 }}>
            <ConsoleStatusStrip available={status.available} booking={status.booking}
              availabilityKey={status.available ? "bhome_open_now" : "bhome_closed_now"}
              saving={status.saving}
              onAvailability={isOwner ? status.toggleAvailability : undefined}
              onBookings={isOwner ? status.toggleBookings : undefined}
              settingsPath={isOwner ? `${base}/settings` : undefined} />
          </section>
        )}
        {business && isOwner && checklist.some(({ done }) => !done) && (
          <section className="page-pad" style={{ paddingTop: 4 }}>
            <SetupChecklist title={consoleCfg.setupTitle} items={checklist} storageKey={`stryt_checklist_dismissed_${id}`} />
          </section>
        )}
        {!isOwner && staffLinks.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 4 }}>
            <div className="card col gap-8" style={{ padding: 14 }}>
              <h2 className="semi small">{t("console_your_live_work")}</h2>
              {staffLinks.map(({ to, label, count }) => (
                <Link to={to} key={to} className="row center-v gap-8 btn btn-outline btn-sm">
                  <span className="grow">{label}</span>
                  {count > 0 && <span className="badge badge-amber">{count}</span>}
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="page-pad" style={{ paddingTop: 14 }}>
          <div style={{ marginBottom: 8 }}>
            <div className="semi">{t("bhome_services")}</div>
            <div className="tiny muted">{t("bhome_services_hint")}</div>
          </div>
          <ConsoleTileGrid>
            {tiles.map((tile) => (
              <ConsoleTile
                key={tile.id}
                icon={CAPABILITY_ICON[tile.id]}
                label={tile.label}
                sub={tile.hint}
                tint={CAPABILITY_TONE[tile.id].tint}
                accent={CAPABILITY_TONE[tile.id].accent}
                badge={badgeFor(tile.id)}
                onClick={tile.onClick}
              />
            ))}
            {isOwner && (
              <ConsoleTile
                icon={<Plus size={20} />}
                label={t("bdial_features")}
                sub={t("bfeat_sub")}
                tint="var(--brand-50)"
                accent="var(--brand-600)"
                onClick={() => nav(`${base}/features`)}
              />
            )}
          </ConsoleTileGrid>
        </section>

        {glance.length > 0 && (
          <section className="page-pad" style={{ paddingTop: 0 }}>
            <div className="row gap-8">
              {glance.map((g) => (
                <button key={g.key} className="card col grow" onClick={() => nav(g.go)} style={{ padding: "12px 12px", textAlign: "left", gap: 2, background: g.tint, border: "none" }}>
                  <span className="bold" style={{ fontSize: 22, color: g.tone, lineHeight: 1.1 }}>{g.value}</span>
                  <span className="tiny semi" style={{ color: g.tone }}>{g.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {suggested.length > 0 && (
          <section style={{ paddingTop: 4 }}>
            <div className="row between center-v page-pad" style={{ paddingBottom: 8, paddingTop: 0 }}>
              <div>
                <div className="semi">{t("bhome_suggested")}</div>
                <div className="tiny muted">{t("bhome_suggested_hint")}</div>
              </div>
              <button className="see-all" onClick={() => nav(`${base}/features`)}>{t("bhome_see_all")}</button>
            </div>
            <div className="row gap-10" style={{ overflowX: "auto", padding: "2px 16px 6px", scrollSnapType: "x proximity" }}>
              {suggested.map((f) => {
                const tone = featureTone(f);
                return (
                  <button
                    key={f.id}
                    className="card col gap-8"
                    onClick={() => nav(`${base}/features`)}
                    style={{ minWidth: 214, maxWidth: 214, padding: 14, textAlign: "left", scrollSnapAlign: "start", flexShrink: 0 }}
                  >
                    <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: tone.tint, color: tone.accent }}>
                      {featureIcon(f)}
                    </span>
                    <span className="semi small">{t(f.titleKey)}</span>
                    <span className="tiny muted clamp-2" style={{ lineHeight: 1.4 }}>{t(f.pitchKey)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="page-pad" style={{ paddingTop: 10 }}>
          <button className="card row gap-12 center-v" style={{ width: "100%", textAlign: "left" }} onClick={() => nav(dashboardPath(base))}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand-50)", display: "grid", placeItems: "center", color: "var(--brand-600)" }}>
              <LayoutDashboard size={20} />
            </span>
            <div className="grow">
              <div className="semi small">{t("bhome_dashboard")}</div>
              <div className="tiny muted">{t("bhome_dashboard_hint")}</div>
            </div>
            <ChevronRight size={18} color="var(--ink-300)" />
          </button>
        </section>
        <div style={{ height: 24 }} />
      </div>

      <ManageNav bizId={id} />
      <ConsoleToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)}
        items={businessToolLinks(id, tools, !!queue?.hasEverUsedQueue)}
        onSignOut={() => { signOut(); nav("/"); }} />
      {switcherOpen && <AccountSwitcher onClose={() => setSwitcherOpen(false)} />}
      {share && (
        <ShareCard
          subjects={{
            kind: "business",
            id,
            // Reached only through BusinessAccessGuard, so the viewer manages this shop by definition.
            viewerManages: true,
            upiId: business?.upiId || undefined,
            paymentQrUrl: localStorage.getItem(`stryt_upi_qr_${id}`) || undefined,
            title: business?.name || "Business",
            subtitle: `${business?.subCategory || "Local business"} · ${business?.city || "STRYT"}`,
            image: business?.coverImage || "",
            meta: `⭐ ${business?.ratingAvg || 0} (${business?.ratingCount || 0})`,
          }}
          onClose={() => setShare(false)}
        />
      )}
    </div>
  );
}

const dashboardPath = (base: string) => `${base}/dashboard`;
