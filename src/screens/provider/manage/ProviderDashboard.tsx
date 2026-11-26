import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, Check, ChevronRight, Inbox, Search, Wallet, X } from "@/components/Icons";
import { SafeImg } from "@/components/common";
import ConsoleStatusStrip from "@/components/console/ConsoleStatusStrip";
import { Skeleton } from "@/components/states";
import { useProviderAppointments } from "@/features/provider-console/providerAppointments";
import { useProviderOverview } from "@/features/provider-console/providerOverview";
import { useQuery, useQueryWithRealtime } from "@/hooks/useApi";
import { requestMatchesCategory } from "@/lib/categoryMatch";
import { errorMessage } from "@/lib/errorMessage";
import { inr } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { providerService, requestService, catalogService } from "@/services";
import { appointmentService, ownerVisibleCustomerName } from "@/services/engagement/appointmentService";
import { useApp } from "@/store";
import type { AppointmentRecord, RequestPost } from "@/types";

export default function ProviderDashboard() {
  const { id, base, provider, status, actions, unhandledLeads, leadsLoading, leadsError, refetchLeads } = useProviderOverview();
  const appointments = useProviderAppointments();
  const { showToast } = useApp();
  const { t, tf } = useI18n();
  const [busy, setBusy] = useState(false);
  const jobs = `${base}/jobs`;

  const { data: analytics } = useQuery(() => providerService.analytics(id), [id], `provider:${id}:analytics`);
  const { data: categoryParents } = useQuery(() => catalogService.parentMap(), [], "catalog:parent-map");
  const { data: requests } = useQueryWithRealtime(
    () => requestService.feed({ lat: provider.lat, lng: provider.lng, radiusKm: provider.serviceRadiusKm }),
    "requests", [id, provider.lat, provider.lng, provider.serviceRadiusKm], undefined, `provider:${id}:find-work`,
  );

  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const scheduled = (appointments.data ?? []).filter(({ status: state }) => state === "ACCEPTED" || state === "PENDING")
    .sort((a, b) => new Date(a.scheduledForISO).getTime() - new Date(b.scheduledForISO).getTime());
  const todaysJobs = scheduled.filter((item) => new Date(item.scheduledForISO).toDateString() === today.toDateString());
  const upcomingJobs = scheduled.filter((item) => new Date(item.scheduledForISO) >= tomorrow).slice(0, 5);
  const matchingRequests = ((requests?.data ?? []) as RequestPost[])
    .filter((request) => request.status === "OPEN" && requestMatchesCategory(request.categoryId, provider.categoryId, categoryParents ?? {}));

  const loading = (appointments.loading && !appointments.data) || leadsLoading;
  const unavailable = Boolean(appointments.error) || leadsError;
  const waitingForPayment = (item: AppointmentRecord) => provider.paymentTiming === "AT_BOOKING" && item.paymentStatus !== "PAID";

  async function runAction(write: () => Promise<unknown>, successKey: string) {
    if (busy) return;
    setBusy(true);
    try {
      await write();
      showToast(t(successKey));
      appointments.refetch();
    } catch (error) {
      showToast(errorMessage(error, t("cpd_update_failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="page-pad col gap-8">
        <h2 className="semi">{t("nav_dashboard")}</h2>
        <ConsoleStatusStrip available={status.available} booking={status.booking} editPath={base} labelKey="provider_console_status"
          availabilityKey={status.available ? "provider_available_now" : "provider_unavailable"} />
      </section>

      <section className="page-pad col gap-10" style={{ paddingTop: 0 }}>
        <div className="row between center-v">
          <h2 className="small semi muted">{t("mdash_action_needed")}</h2>
          {actions.total > 0 && <span className="badge badge-amber">{actions.total}</span>}
        </div>
        {unavailable && (
          <div className="card row gap-8 between center-v" style={{ padding: 14 }}>
            <span className="small muted">{t("provider_actions_unavailable")}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { appointments.refetch(); refetchLeads(); }}>{t("retry")}</button>
          </div>
        )}
        {loading && actions.total === 0 && !unavailable && <Skeleton h={60} />}
        {actions.total === 0 && !loading && !unavailable && (
          <div className="card small muted" style={{ padding: 18 }}>{t("pdash_all_caught_up")}</div>
        )}
        {actions.claims.map((appointment) => (
          <div key={appointment.id} className="card col gap-10" style={{ padding: 14 }}>
            <div className="row gap-10 center-v">
              <Wallet size={20} color="var(--amber-600)" aria-hidden="true" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small ellipsis">{tf("mdash_claims_row", {
                  name: ownerVisibleCustomerName(appointment), amount: inr(appointment.paymentAmount ?? appointment.packagePrice ?? 0),
                })}</div>
                <div className="tiny muted">{appointment.paymentReference
                  ? tf("mdash_ref_code", { ref: appointment.paymentReference })
                  : t("provider_confirm_receipt")}</div>
              </div>
            </div>
            <div className="row gap-8">
              <button type="button" className="btn btn-green grow btn-sm" disabled={busy}
                onClick={() => void runAction(() => appointmentService.confirmPayment(appointment.id), "notif_pay_confirmed_toast")}>
                <Check size={14} /> {t("confirm")}
              </button>
              <button type="button" className="btn btn-outline grow btn-sm" disabled={busy}
                onClick={() => void runAction(() => appointmentService.rejectPaymentClaim(appointment.id), "pdash_payment_rejected")}>
                <X size={14} /> {t("mdash_reject")}
              </button>
            </div>
          </div>
        ))}
        {actions.pending.map((appointment) => (
          <div key={appointment.id} className="card col gap-10" style={{ padding: 14 }}>
            <div className="row gap-10 center-v">
              <SafeImg src={appointment.customerAvatar} variant="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="semi small ellipsis">{ownerVisibleCustomerName(appointment)}</div>
                <div className="tiny muted">{[appointment.dateLabel, appointment.timeLabel, appointment.packageName].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            {waitingForPayment(appointment) ? (
              <Link className="btn btn-outline btn-sm btn-block" to={jobs}>{t("provider_open_unpaid_job")}</Link>
            ) : (
              <div className="row gap-8">
                <button type="button" className="btn btn-green grow btn-sm" disabled={busy}
                  onClick={() => void runAction(() => appointmentService.updateStatus(appointment.id, "ACCEPTED"), "provider_booking_accepted")}>
                  <Check size={14} /> {t("notif_apt_accept")}
                </button>
                <button type="button" className="btn btn-outline grow btn-sm" disabled={busy}
                  onClick={() => void runAction(() => appointmentService.updateStatus(appointment.id, "REJECTED"), "provider_booking_declined")}>
                  <X size={14} /> {t("notif_apt_decline")}
                </button>
              </div>
            )}
          </div>
        ))}
        {unhandledLeads > 0 && (
          <DashboardLink to={`${base}/inbox`} icon={<Inbox size={20} />} title={t("pphub_reachouts")}
            subtitle={tf("provider_reachouts_waiting", { n: unhandledLeads })} />
        )}
      </section>

      <ProviderSchedule title={t("pdash_todays_schedule")} items={todaysJobs} to={jobs} showStatus />
      <ProviderSchedule title={t("mdash_upcoming")} items={upcomingJobs} to={jobs} />

      <section className="page-pad col gap-10">
        <DashboardLink to={`${base}/money`} icon={<Wallet size={20} color="var(--orange-500)" />}
          title={analytics ? tf("provider_earned_total", { amount: inr(analytics.earnings) }) : t("nav_money")}
          subtitle={actions.claims.length > 0 ? tf("provider_claims_waiting", { n: actions.claims.length }) : t("pphub_money_hint")} />
        {matchingRequests.length > 0 && (
          <DashboardLink to={`${base}/find-work`} icon={<Search size={20} color="var(--green-600)" />}
            title={tf("provider_matches", { n: matchingRequests.length })} subtitle={t("pdash_send_proposal")} />
        )}
      </section>
    </>
  );
}

function ProviderSchedule({ title, items, to, showStatus = false }: {
  title: string; items: AppointmentRecord[]; to: string; showStatus?: boolean;
}) {
  const { t } = useI18n();
  if (!items.length) return null;

  return (
    <section>
      <div className="row between page-pad" style={{ paddingBottom: 0 }}>
        <h2 className="semi small">{title}</h2>
        <Link className="see-all" to={to}>{t("mdash_view_all")}</Link>
      </div>
      <div className="hscroll today-rail" style={{ paddingTop: 10 }}>
        {items.map((appointment) => (
          <Link key={appointment.id} to={to} className="today-card provider-today-card">
            <div className="today-card-head">
              <Calendar size={16} aria-hidden="true" />
              <span className="today-card-kicker grow">{showStatus
                ? t(appointment.status === "PENDING" ? "provider_job_requested" : "provider_job_confirmed")
                : appointment.dateLabel}</span>
            </div>
            <div className="today-card-title">{ownerVisibleCustomerName(appointment)}</div>
            <div className="today-card-stat">{appointment.timeLabel}</div>
            {appointment.packageName && <div className="today-card-sub">{appointment.packageName}</div>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function DashboardLink({ to, icon, title, subtitle }: { to: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Link to={to} className="card row gap-12 center-v" style={{ padding: 14 }}>
      <span aria-hidden="true">{icon}</span>
      <div className="grow">
        <div className="semi small">{title}</div>
        <div className="tiny muted">{subtitle}</div>
      </div>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}
