import type { ReactNode } from "react";
import {
  BadgeCheck, CalendarClock, Clock, Globe, HelpCircle, ImageIcon, LayoutGrid, Megaphone, Package, Tag, UserPlus, Users, Wallet,
} from "@/components/Icons";
import type { FeatureDef, FeatureIcon } from "@/lib/businessFeatures";
import { CAPABILITY_TONE } from "@/components/console/capabilities";

const ICONS: Record<FeatureIcon, (size: number) => ReactNode> = {
  calendar: (s) => <CalendarClock size={s} />,
  users: (s) => <Users size={s} />,
  package: (s) => <Package size={s} />,
  grid: (s) => <LayoutGrid size={s} />,
  image: (s) => <ImageIcon size={s} />,
  clock: (s) => <Clock size={s} />,
  wallet: (s) => <Wallet size={s} />,
  tag: (s) => <Tag size={s} />,
  megaphone: (s) => <Megaphone size={s} />,
  help: (s) => <HelpCircle size={s} />,
  team: (s) => <UserPlus size={s} />,
  badge: (s) => <BadgeCheck size={s} />,
  globe: (s) => <Globe size={s} />,
};

export const featureIcon = (f: FeatureDef, size = 22): ReactNode => ICONS[f.icon](size);

/** Ideas that line up with a console capability share its colours; the rest take the brand's. */
export function featureTone(f: FeatureDef): { tint: string; accent: string } {
  return f.capability ? CAPABILITY_TONE[f.capability] : { tint: "var(--brand-50)", accent: "var(--brand-600)" };
}
