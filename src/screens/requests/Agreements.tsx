import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isAgreementClosed } from "@/lib/machines/agreement";
import { AppBar, EmptyState, SafeImg } from "@/components/common";
import { inr } from "@/lib/format";
import { NoDealsIllustration, NoAppointmentsIllustration } from "@/components/illustrations";
import { requestService, appointmentService, businessService, providerService } from "@/services";
import { useQueryWithRealtime } from "@/hooks/useApi";
import { ListSkeleton, ErrorView } from "@/components/states";
import { ChevronRight, Package, Store, CreditCard } from "@/components/Icons";
import { useApp } from "@/store";
import { openProfile } from "@/lib/profileSheet";
import { AGREEMENT_STATUS_BADGE, APPOINTMENT_STATUS_BADGE } from "@/lib/statusBadges";
import { useI18n } from "@/lib/i18n";
import { CompactOrderCard } from "@/components/appointments/CompactOrderCard";
import DeliveryTrackControl from "@/components/delivery/DeliveryTrackControl";
import { OrderLines } from "@/components/OrderLines";
import { isLiveOrder, isOrderActivity } from "@/lib/orderLists";
import { amountDue } from "@/lib/orderLines";
import { PaymentSheet } from "@/components/PaymentSheet";
import ReviewSheet from "@/components/ReviewSheet";
import { PhotoPreviewModal } from "@/components/appointments/PhotoPreviewModal";
import { BUSINESS_PACKAGES, PACKAGE_KEYS, type BusinessPackageKey } from "@/lib/businessPackages";
import type { AppointmentRecord } from "@/types";

function vocabForRow(apt: AppointmentRecord) {
  const key = apt.targetPackageKey;
  const resolved = key && (PACKAGE_KEYS as string[]).includes(key) ? (key as BusinessPackageKey) : "generic";
  return BUSINESS_PACKAGES[resolved].vocabulary;
}

export default function Agreements() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, showToast } = useApp();
  const { t, tf } = useI18n();

  // Primary mode: Store Orders & Deliveries vs Street Deals
  const sectionParam = searchParams.get("section");
  const [section, setSection] = useState<"orders" | "deals">(
    sectionParam === "deals" ? "deals" : "orders"
  );

  const [tab, setTab] = useState<"active" | "completed">("active");

  // Secondary submodal states for orders
  const [payingApt, setPayingApt] = useState<AppointmentRecord | null>(null);
  const [payBizUpiId, setPayBizUpiId] = useState<string | null>(null);
  const [payDepositPercent, setPayDepositPercent] = useState<number | undefined>(undefined);
  const [loadingPay, setLoadingPay] = useState<string | null>(null);
  const [reviewingApt, setReviewingApt] = useState<AppointmentRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // 1. Street Deals Query
  const {
    data: dealsData,
    loading: dealsLoading,
    error: dealsError,
    refetch: refetchDeals,
  } = useQueryWithRealtime(
    () => requestService.agreements(),
    "agreements",
    [user.id],
    undefined,
    `home:agreements:${user.id}`
  );

  // 2. Store Orders Query
  const {
    data: ordersData,
    loading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useQueryWithRealtime<AppointmentRecord[]>(
    () => appointmentService.listForCustomer(user.id),
    "appointments",
    [user.id],
    user.id ? `customer_user_id=eq.${user.id}` : undefined
  );

  // Deals Partitioning
  const agreements = dealsData ?? [];
  const activeDeals = agreements.filter((a) => !isAgreementClosed(a.status));
  const completedDeals = agreements.filter((a) => isAgreementClosed(a.status));

  // Orders Partitioning
  const allOrders = useMemo(() => {
    return (ordersData ?? []).filter(isOrderActivity);
  }, [ordersData]);

  const activeOrders = useMemo(() => {
    return allOrders
      .filter(isLiveOrder)
      .sort((a, b) => new Date(b.createdAtISO).getTime() - new Date(a.createdAtISO).getTime());
  }, [allOrders]);

  const completedOrders = useMemo(() => {
    return allOrders
      .filter((a) => !isLiveOrder(a))
      .sort((a, b) => new Date(b.scheduledForISO || b.createdAtISO).getTime() - new Date(a.scheduledForISO || a.createdAtISO).getTime());
  }, [allOrders]);

  function switchSection(next: "orders" | "deals") {
    setSection(next);
    setSearchParams({ section: next }, { replace: true });
  }

  async function openPay(apt: AppointmentRecord) {
    setLoadingPay(apt.id);
    try {
      let upiId: string | null = null;
      let deposit: number | undefined;
      if (apt.targetType === "BUSINESS") {
        const b = await businessService.get(apt.targetId);
        upiId = b?.upiId ?? null;
        deposit = (b as any)?.depositPercent;
      } else {
        const p = await providerService.get(apt.targetId);
        upiId = p?.upiId ?? null;
        deposit = (p as any)?.depositPercent;
      }
      setPayBizUpiId(upiId);
      setPayDepositPercent(deposit);
      setPayingApt(apt);
    } catch {
      setPayBizUpiId(null);
      setPayDepositPercent(undefined);
      setPayingApt(apt);
    } finally {
      setLoadingPay(null);
    }
  }

  function openRebook(apt: AppointmentRecord) {
    nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`);
  }

  return (
    <div className="screen screen-boxed">
      <AppBar
        title={t("my_deals") || "My Deals & Orders"}
        subtitle="Track active purchases, orders & street deals"
      />

      {/* Primary Section Switcher: Store Orders & Deliveries vs Street Deals */}
      <div
        className="row"
        style={{
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          padding: "6px 12px 0 12px",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => switchSection("orders")}
          className="semi row gap-6 center"
          style={{
            flex: 1,
            padding: "10px 0",
            fontSize: 13.5,
            color: section === "orders" ? "var(--brand-700)" : "var(--ink-500)",
            borderBottom: section === "orders" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          <span>🛍️</span>
          <span>Store Orders ({activeOrders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => switchSection("deals")}
          className="semi row gap-6 center"
          style={{
            flex: 1,
            padding: "10px 0",
            fontSize: 13.5,
            color: section === "deals" ? "var(--brand-700)" : "var(--ink-500)",
            borderBottom: section === "deals" ? "2.5px solid var(--brand-700)" : "2.5px solid transparent",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
          }}
        >
          <span>🤝</span>
          <span>Street Deals ({activeDeals.length})</span>
        </button>
      </div>

      {/* Subtabs: Active vs History / Completed */}
      <div className="row" style={{ borderBottom: "1px solid var(--line)", background: "var(--ink-50)" }}>
        {(
          [
            [
              "active",
              `${t("active")} (${section === "orders" ? activeOrders.length : activeDeals.length})`,
            ],
            [
              "completed",
              `${t("agreements_history_tab") || "History"} (${
                section === "orders" ? completedOrders.length : completedDeals.length
              })`,
            ],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className="semi"
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 13,
              color: tab === tabKey ? "var(--brand-800)" : "var(--ink-500)",
              borderBottom: tab === tabKey ? "2px solid var(--brand-600)" : "2px solid transparent",
              background: "none",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="screen-scroll page-pad col gap-12" style={{ paddingTop: 10 }}>
        {/* ── Section A: Store Orders & Deliveries ── */}
        {section === "orders" && (
          <>
            {ordersLoading ? (
              <ListSkeleton count={3} type="appointment" />
            ) : ordersError ? (
              <ErrorView error={ordersError} onRetry={refetchOrders} />
            ) : (tab === "active" ? activeOrders : completedOrders).length === 0 ? (
              <EmptyState
                illustration={<NoAppointmentsIllustration />}
                emoji="🛍️"
                title={tab === "active" ? "No active orders" : "No completed orders yet"}
                text={
                  tab === "active"
                    ? "Orders placed from nearby shops will appear here with live tracking & delivery updates."
                    : "Past orders from local stores will appear here as compact receipts you can tap to view or reorder."
                }
                action={
                  <button className="btn btn-primary row gap-6 center" onClick={() => nav("/explore")}>
                    <Store size={16} /> Browse Local Shops
                  </button>
                }
              />
            ) : tab === "active" ? (
              activeOrders.map((apt) => {
                const isDelivery = apt.fulfillmentType === "DELIVERY";
                const isPayable = apt.status === "PENDING" || apt.status === "ACCEPTED" || apt.status === "COMPLETED";
                const isUnpaid = !apt.paymentStatus || apt.paymentStatus === "UNPAID" || apt.paymentStatus === "REJECTED";
                const due = amountDue(apt);

                return (
                  <div key={apt.id} className="card col gap-10 queue-row-enter" style={{ padding: 14 }}>
                    <div className="row between center-v">
                      <div>
                        <div className="bold small" style={{ color: "var(--ink-900)" }}>
                          {apt.targetName}
                        </div>
                        <div className="tiny muted row gap-4 center-v" style={{ marginTop: 2 }}>
                          <Package size={12} color="var(--delivery-600)" />
                          <span>
                            {apt.isAsap
                              ? `${t("dlv_asap_tag") || "ASAP"} · by ${new Date(apt.scheduledForISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                              : `${apt.dateLabel} · at ${apt.timeLabel}`}
                          </span>
                        </div>
                      </div>

                      <div className="col gap-4" style={{ alignItems: "flex-end" }}>
                        <span
                          className={`badge ${APPOINTMENT_STATUS_BADGE[apt.status].cls}`}
                          style={{ fontSize: 10, padding: "3px 9px" }}
                        >
                          {APPOINTMENT_STATUS_BADGE[apt.status].label}
                        </span>
                        {isPayable && (
                          <span
                            className={`badge ${apt.paymentStatus === "PAID" ? "badge-green" : "badge-gray"}`}
                            style={{ fontSize: 9, padding: "2px 7px" }}
                          >
                            {apt.paymentStatus === "PAID" ? t("paid_status") : t("unpaid_status")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Live delivery tracking control */}
                    {isDelivery && (
                      <DeliveryTrackControl
                        appointmentId={apt.id}
                        fallbackEtaText={apt.deliveryEtaText}
                        orderStatus={apt.status}
                        readyAt={apt.readyAt}
                      />
                    )}

                    {/* Order line items */}
                    {apt.items && apt.items.length > 0 && (
                      <div className="col gap-6" style={{ background: "var(--ink-50)", padding: 10, borderRadius: 10 }}>
                        <OrderLines lines={apt.items} fee={isDelivery ? apt.deliveryFee : undefined} />
                        {isDelivery && apt.deliveryAddressLine && (
                          <div className="tiny" style={{ color: "var(--ink-700)", marginTop: 4 }}>
                            📍 <strong>{t("ord_deliver_to") || "Deliver to"}:</strong> {apt.deliveryAddressLine}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="row gap-8 between center-v" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      {isPayable && isUnpaid && due > 0 ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm row gap-6 center"
                          disabled={loadingPay === apt.id}
                          onClick={() => openPay(apt)}
                        >
                          <CreditCard size={13} />
                          <span>{loadingPay === apt.id ? t("loading_ellipsis") : tf("pay_amount", { amount: due })}</span>
                        </button>
                      ) : (
                        <div className="tiny semi" style={{ color: "var(--green-700)" }}>
                          {apt.paymentStatus === "PAID" ? "Paid ✓" : "Pay on delivery / pickup"}
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12 }}
                        onClick={() => nav(`/${apt.targetType.toLowerCase()}/${apt.targetId}`)}
                      >
                        {t("view_shop") || "View Shop"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              /* Completed Orders rendered via CompactOrderCard (short by default, expand on touch!) */
              completedOrders.map((apt) => (
                <CompactOrderCard
                  key={apt.id}
                  apt={apt}
                  onRebook={(a) => openRebook(a)}
                  onReview={(a) => setReviewingApt(a)}
                  onPay={(a) => openPay(a)}
                  onPreviewPhoto={(url) => setPreviewPhoto(url)}
                />
              ))
            )}
          </>
        )}

        {/* ── Section B: Street Deals (Agreements) ── */}
        {section === "deals" && (
          <>
            {dealsLoading ? (
              <ListSkeleton count={3} type="appointment" />
            ) : dealsError ? (
              <ErrorView error={dealsError} onRetry={refetchDeals} />
            ) : (tab === "active" ? activeDeals : completedDeals).length === 0 ? (
              <EmptyState
                illustration={<NoDealsIllustration />}
                emoji="🤝"
                title={t("no_agreements_title") || "No deals yet"}
                text={t("no_agreements_desc") || "Agreed deals with neighbours & providers appear here."}
              />
            ) : (
              (tab === "active" ? activeDeals : completedDeals).map((a) => {
                const M = AGREEMENT_STATUS_BADGE[a.status];
                const isRequester = a.requesterUserId === user.id;
                const otherName = isRequester ? a.responderName : a.requesterName;
                const otherAvatar = isRequester ? a.responderAvatar : a.requesterAvatar;

                // When deal is completed, render a clean compact card format
                const isDealCompleted = isAgreementClosed(a.status);

                return (
                  <button
                    key={a.id}
                    className="card"
                    style={{ textAlign: "left", width: "100%" }}
                    onClick={() => nav(`/agreement/${a.id}`)}
                  >
                    <div className="row between center-v">
                      <span className={`badge ${M.cls}`}>{M.label}</span>
                      <span className="tiny muted">{a.scheduledFor}</span>
                    </div>

                    <div className="row gap-10 center-v" style={{ marginTop: 10 }}>
                      <SafeImg
                        src={otherAvatar}
                        variant="avatar"
                        className="avatar"
                        style={{ width: 44, height: 44, cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openProfile(isRequester ? a.responderUserId : a.requesterUserId, "USER", {
                            name: otherName,
                            avatar: otherAvatar,
                          });
                        }}
                      />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="semi small ellipsis">{a.requestTitle}</div>
                        <div className="tiny muted">{tf("with_person", { name: otherName })}</div>
                      </div>
                      <div className="col" style={{ alignItems: "flex-end" }}>
                        <span className="bold tabular-nums" style={{ color: "var(--green-600)" }}>
                          {inr(a.agreedPrice)}
                        </span>
                        <ChevronRight size={18} color="var(--ink-300)" />
                      </div>
                    </div>

                    {isDealCompleted && a.status === "COMPLETED" && (
                      <button
                        className="btn btn-ghost btn-sm btn-block"
                        style={{ marginTop: 10 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          nav(`/rate/${a.id}`);
                        }}
                      >
                        {tf("rate_person", { name: otherName })}
                      </button>
                    )}
                  </button>
                );
              })
            )}
          </>
        )}
      </div>

      {/* Sheets & Dialogs */}
      {payingApt && (
        <PaymentSheet
          appointment={payingApt}
          businessUpiId={payBizUpiId}
          businessName={payingApt.targetName}
          depositPercent={payDepositPercent}
          vocabulary={vocabForRow(payingApt)}
          onPaid={() => {
            setPayingApt(null);
            refetchOrders();
          }}
          onClose={() => setPayingApt(null)}
        />
      )}

      {reviewingApt && (
        <ReviewSheet
          targetName={reviewingApt.targetName}
          onSubmit={async (rating, comment) => {
            if (reviewingApt.targetType === "PROVIDER") {
              await providerService.addReview(reviewingApt.targetId, rating, comment);
            } else {
              await businessService.addReview(reviewingApt.targetId, rating, comment);
            }
            showToast("Thank you for your review! ⭐");
            refetchOrders();
            setReviewingApt(null);
          }}
          onClose={() => setReviewingApt(null)}
        />
      )}

      {previewPhoto && (
        <PhotoPreviewModal src={previewPhoto} onClose={() => setPreviewPhoto(null)} />
      )}
    </div>
  );
}
