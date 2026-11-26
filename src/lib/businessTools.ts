import type { Scope } from "@/services/marketplace/businessAccessService";

export interface BusinessToolAccess {
  isOwner: boolean;
  hasScope: (scope: Scope) => boolean;
  hasActiveDeliveries: boolean;
}

/** Authorization only. Package preferences and counts decide where to promote a tool. */
export function resolveBusinessToolVisibility(access: BusinessToolAccess, deliveryEnabled: boolean) {
  return {
    owner: access.isOwner,
    appointments: access.hasScope("appointments"),
    queue: access.hasScope("queue"),
    catalog: access.hasScope("catalog"),
    leads: access.hasScope("leads"),
    liveDeliveries: deliveryEnabled && access.hasScope("appointments"),
    myDeliveries: deliveryEnabled && (access.hasScope("delivery") || access.hasActiveDeliveries),
  };
}

type BusinessVisibility = ReturnType<typeof resolveBusinessToolVisibility>;

export function businessToolLinks(businessId: string, allowed: BusinessVisibility, queueUsed: boolean) {
  const base = `/business/${businessId}/manage`;
  return [
    ...(allowed.appointments ? [{ to: `${base}/appointments`, labelKey: "nav_appointments" }] : []),
    ...(allowed.queue ? [{ to: `${base}/queue`, labelKey: queueUsed ? "nav_queue" : "console_queue_setup" }] : []),
    ...(allowed.liveDeliveries ? [{ to: `${base}/deliveries`, labelKey: "bdial_live_deliveries" }] : []),
    ...(allowed.myDeliveries ? [{ to: `${base}/my-deliveries`, labelKey: "console_my_deliveries" }] : []),
    ...(allowed.catalog ? [
      { to: `${base}/store`, labelKey: "console_store_tools" },
      { to: `${base}/catalog`, labelKey: "scope_catalog" },
      { to: `${base}/inventory`, labelKey: "pphub_inventory" },
      { to: `${base}/bulk-deals`, labelKey: "console_bulk_deals" },
      { to: `${base}/portfolio`, labelKey: "pon_step_portfolio" },
      { to: `${base}/hours`, labelKey: "bdial_hours" },
    ] : []),
    ...(allowed.leads ? [
      { to: `${base}/inbox`, labelKey: "console_reachouts" },
      { to: `/chats?scope=BUSINESS&id=${encodeURIComponent(businessId)}`, labelKey: "messages_header" },
      { to: `${base}/qna`, labelKey: "qna_title" },
      { to: `${base}/requests`, labelKey: "console_find_requests" },
    ] : []),
    ...(allowed.owner ? [
      { to: `${base}/profile`, labelKey: "profile" },
      { to: `${base}/reviews`, labelKey: "bdial_reviews" },
      { to: `${base}/payments`, labelKey: "bdial_payments" },
      { to: `${base}/community`, labelKey: "community" },
      { to: `${base}/features`, labelKey: "bdial_features" },
      { to: `${base}/settings`, labelKey: "settings" },
    ] : []),
  ];
}
