import type { ReactNode } from "react";
import {
  BadgeCheck, CalendarClock, Clock, ImageIcon, Inbox, LayoutGrid,
  Megaphone, Package, Users, Wallet,
} from "@/components/Icons";
import type { ConsoleCapability } from "@/lib/businessPackages";

/**
 * Per-capability icon tint/accent. Keyed by capability — NOT by package key —
 * so adding a vertical never touches this file (businessPackages.ts's rule:
 * "no consumer should branch on a package key itself").
 */
export const CAPABILITY_TONE: Record<ConsoleCapability, { tint: string; accent: string }> = {
  catalog:  { tint: "var(--brand-50)",    accent: "var(--brand-600)" },
  photos:   { tint: "var(--pink-100)",    accent: "var(--pink-600)" },
  hours:    { tint: "var(--brand-50)",    accent: "var(--brand-700)" },
  bookings: { tint: "var(--brand-50)",    accent: "var(--brand-600)" },
  queue:    { tint: "var(--amber-100)",   accent: "var(--amber-700)" },
  delivery: { tint: "var(--delivery-50)", accent: "var(--delivery-600)" },
  payments: { tint: "var(--green-100)",   accent: "var(--green-600)" },
  verify:   { tint: "var(--green-100)",   accent: "var(--green-600)" },
  promote:  { tint: "var(--pink-100)",    accent: "var(--pink-600)" },
  inbox:    { tint: "var(--amber-100)",   accent: "var(--amber-700)" },
};

/** Per-capability icon, shared by both consoles so a tile looks the same
 *  wherever it appears. Keyed by capability, never by package key. */
export const CAPABILITY_ICON: Record<ConsoleCapability, ReactNode> = {
  catalog:  <LayoutGrid size={20} />,
  photos:   <ImageIcon size={20} />,
  hours:    <Clock size={20} />,
  bookings: <CalendarClock size={20} />,
  queue:    <Users size={20} />,
  delivery: <Package size={20} />,
  payments: <Wallet size={20} />,
  verify:   <BadgeCheck size={20} />,
  promote:  <Megaphone size={20} />,
  inbox:    <Inbox size={20} />,
};
