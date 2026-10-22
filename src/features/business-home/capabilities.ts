import type { NavigateFunction } from "react-router-dom";
import type { AppointmentRecord, Business } from "@/types";
import type { BusinessPackage, ConsoleCapability } from "@/lib/businessPackages";
import type { CapabilityState } from "@/lib/consoleSteps";
import type { Scope } from "@/services/marketplace/businessAccessService";
import { DEFAULT_ONBOARD_WORKING_HOURS, parseHoursValue, serializeHoursValue } from "@/utils/availability";

/**
 * What each console capability DOES for a business, shared by the two screens that show them (the Dashboard's checklist and
 * the Home page's service tiles). The package decides which capabilities appear and what they're called; this decides where
 * each one goes and what live number sits under it. Neither screen branches on a package key.
 */
export interface CapabilityInputs {
  base: string;
  nav: NavigateFunction;
  business: Business | undefined;
  pkg: BusinessPackage;
  hasScope: (scope: Scope) => boolean;
  bookingsOn: boolean;
  deliveryOn: boolean;
  waitingForRider: number;
  queue: { isOpen?: boolean; waiting: readonly unknown[] } | undefined;
  upcomingCount: number;
  paymentClaims: number;
  postsCount: number;
  composeState: Record<string, unknown>;
  tf: (key: string, vars: Record<string, string | number>) => string;
}

/** Compares normalised schedules, so the legacy default string and the JSON equivalent both count as "still the onboarding default". */
export function hoursAreDefault(hours: string | undefined | null): boolean {
  return !hours || serializeHoursValue(parseHoursValue(hours)) === serializeHoursValue(parseHoursValue(DEFAULT_ONBOARD_WORKING_HOURS));
}

export function buildBusinessCapabilities(i: CapabilityInputs): Partial<Record<ConsoleCapability, CapabilityState>> {
  const { base, nav, business, hasScope } = i;
  const isDefaultHours = hoursAreDefault(business?.hours);
  const listed = business?.catalog?.length ?? 0;
  return {
    catalog: {
      done: listed > 0,
      onClick: () => nav(`${base}/catalog`),
      value: listed > 0 ? `${listed} listed` : undefined,
    },
    photos: {
      done: (business?.gallery?.length ?? 0) > 0,
      onClick: () => nav(`${base}/edit-profile`),
    },
    hours: { done: !isDefaultHours, onClick: () => nav(`${base}/hours`) },
    verify: { done: !!business?.verificationStatus, onClick: () => nav(`${base}/verify`) },
    promote: {
      done: i.postsCount > 0,
      onClick: () => nav("/community/new", { state: i.composeState }),
    },
    payments: {
      onClick: () => nav(`${base}/payments`),
      value: i.paymentClaims > 0 ? `${i.paymentClaims} to confirm` : undefined,
    },
    ...(i.bookingsOn && hasScope("appointments") ? {
      bookings: {
        done: !isDefaultHours,
        onClick: () => nav(`${base}/appointments`),
        value: i.upcomingCount > 0 ? `${i.upcomingCount} upcoming` : undefined,
      },
    } : {}),
    ...(hasScope("queue") ? {
      queue: {
        done: i.queue?.isOpen === true,
        onClick: () => nav(`${base}/queue`),
        value: (i.queue?.waiting.length ?? 0) > 0 ? `${i.queue!.waiting.length} waiting` : undefined,
      },
    } : {}),
    ...(i.deliveryOn ? {
      delivery: {
        done: true,
        onClick: () => nav(i.waitingForRider > 0 ? `${base}/appointments?tab=deliveries` : `${base}/deliveries`),
        value: i.waitingForRider > 0 ? i.tf("dlv_awaiting_count", { n: i.waitingForRider }) : undefined,
      },
    } : {}),
  };
}

const isLive = (a: AppointmentRecord) => a.status === "PENDING" || a.status === "ACCEPTED";

/** Live bookings on today's date, soonest first. */
export function todaysAppointments(appts: AppointmentRecord[], now = new Date()): AppointmentRecord[] {
  return appts
    .filter((a) => isLive(a) && new Date(a.scheduledForISO).toDateString() === now.toDateString())
    .sort((a, b) => +new Date(a.scheduledForISO) - +new Date(b.scheduledForISO));
}

/** Live bookings from tomorrow on, soonest first. Copies the date before moving it, so the caller's `now` is left alone. */
export function upcomingAppointments(appts: AppointmentRecord[], limit = 5, now = new Date()): AppointmentRecord[] {
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setHours(0, 0, 0, 0);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  return appts
    .filter((a) => isLive(a) && new Date(a.scheduledForISO).getTime() >= startOfTomorrow.getTime())
    .sort((a, b) => +new Date(a.scheduledForISO) - +new Date(b.scheduledForISO))
    .slice(0, limit);
}
