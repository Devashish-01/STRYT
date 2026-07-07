// Flat, 2-color empty-state illustrations — brand-token driven so they move
// with the palette automatically. Replaces raw emoji-as-illustration in
// EmptyState (see DESIGN_POLISH_ROADMAP.md section B) on the highest-traffic
// screens; emoji remains the fallback for the long tail of rare states.
//
// Style: a soft rounded backdrop (--brand-50 / --ink-100) with a simple
// line-art glyph on top (--brand-400 stroke, --ink-300 for secondary marks).
// All illustrations share the same 120x120 viewBox and prop shape so they're
// interchangeable in EmptyState.

import type { ReactNode } from "react";

interface IllustrationProps {
  size?: number;
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="52" fill="var(--brand-50)" />
      {children}
    </svg>
  );
}

export function NoResultsIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <circle cx="52" cy="52" r="22" stroke="var(--brand-400)" strokeWidth="5" fill="#fff" />
        <path d="M68 68 L84 84" stroke="var(--brand-500)" strokeWidth="6" strokeLinecap="round" />
        <path d="M43 52 L61 52" stroke="var(--ink-300)" strokeWidth="4" strokeLinecap="round" />
      </Backdrop>
    </div>
  );
}

export function EmptyListIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <rect x="34" y="40" width="52" height="42" rx="8" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <path d="M34 54 H86" stroke="var(--brand-400)" strokeWidth="4" />
        <rect x="44" y="63" width="24" height="5" rx="2.5" fill="var(--ink-200)" />
        <rect x="44" y="72" width="16" height="5" rx="2.5" fill="var(--ink-200)" />
      </Backdrop>
    </div>
  );
}

export function NoAppointmentsIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <rect x="32" y="38" width="56" height="48" rx="8" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <path d="M32 52 H88" stroke="var(--brand-400)" strokeWidth="4" />
        <path d="M46 32 V44" stroke="var(--brand-500)" strokeWidth="5" strokeLinecap="round" />
        <path d="M74 32 V44" stroke="var(--brand-500)" strokeWidth="5" strokeLinecap="round" />
        <circle cx="47" cy="65" r="4" fill="var(--ink-200)" />
        <circle cx="60" cy="65" r="4" fill="var(--ink-200)" />
        <circle cx="73" cy="65" r="4" fill="var(--ink-200)" />
        <circle cx="47" cy="76" r="4" fill="var(--ink-200)" />
        <circle cx="60" cy="76" r="4" fill="var(--accent-400)" />
      </Backdrop>
    </div>
  );
}

export function NoQueueIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <rect x="36" y="42" width="48" height="34" rx="6" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <circle cx="60" cy="59" r="9" stroke="var(--brand-500)" strokeWidth="4" strokeDasharray="3 4" fill="none" />
        <path d="M44 84 H76" stroke="var(--ink-200)" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 7" />
      </Backdrop>
    </div>
  );
}

export function NoNotificationsIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <path d="M60 34 C48 34 42 43 42 54 V64 L36 72 H84 L78 64 V54 C78 43 72 34 60 34 Z" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" strokeLinejoin="round" />
        <path d="M52 78 A8 8 0 0 0 68 78" stroke="var(--brand-500)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="78" cy="40" r="6" fill="var(--green-500)" />
        <path d="M75.5 40 L77.5 42 L81 38" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </Backdrop>
    </div>
  );
}

export function NoMessagesIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <path d="M34 44 h44 a8 8 0 0 1 8 8 v14 a8 8 0 0 1 -8 8 H54 l-12 10 v-10 h-8 a8 8 0 0 1 -8 -8 V52 a8 8 0 0 1 8 -8 Z" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="48" cy="60" r="3.4" fill="var(--ink-200)" />
        <circle cx="60" cy="60" r="3.4" fill="var(--ink-200)" />
        <circle cx="72" cy="60" r="3.4" fill="var(--accent-400)" />
      </Backdrop>
    </div>
  );
}

export function NoDealsIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <path d="M36 60 L48 48 L58 56 L84 34" stroke="var(--brand-400)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M70 34 H84 V48" stroke="var(--brand-400)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="34" y="70" width="52" height="14" rx="7" fill="var(--ink-100)" />
        <rect x="34" y="70" width="24" height="14" rx="7" fill="var(--brand-300)" />
      </Backdrop>
    </div>
  );
}

export function NetworkErrorIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <path d="M40 54 a28 20 0 0 1 40 0" stroke="var(--ink-300)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M47 64 a17 12 0 0 1 26 0" stroke="var(--ink-300)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="76" r="4.5" fill="var(--ink-300)" />
        <path d="M40 40 L80 78" stroke="var(--red-500)" strokeWidth="5" strokeLinecap="round" />
      </Backdrop>
    </div>
  );
}

export function NoPeopleIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <circle cx="60" cy="48" r="12" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <path d="M36 86 c0 -15 11 -24 24 -24 s24 9 24 24" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" strokeLinecap="round" />
      </Backdrop>
    </div>
  );
}

export function LockedIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <rect x="40" y="56" width="40" height="30" rx="6" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <path d="M48 56 V46 a12 12 0 0 1 24 0 V56" stroke="var(--brand-400)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="70" r="4" fill="var(--brand-500)" />
      </Backdrop>
    </div>
  );
}

export function SuccessIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <circle cx="60" cy="60" r="24" fill="#fff" stroke="var(--green-500)" strokeWidth="5" />
        <path d="M50 60 L57 67 L72 51" stroke="var(--green-500)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Backdrop>
    </div>
  );
}

export function NoPhotosIllustration({ size = 96 }: IllustrationProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Backdrop>
        <rect x="32" y="42" width="56" height="42" rx="8" fill="#fff" stroke="var(--brand-400)" strokeWidth="4" />
        <circle cx="47" cy="57" r="6" stroke="var(--brand-400)" strokeWidth="3.5" fill="none" />
        <path d="M32 78 L50 62 L62 72 L74 60 L88 74" stroke="var(--ink-300)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Backdrop>
    </div>
  );
}

export const illustrations = {
  results: NoResultsIllustration,
  list: EmptyListIllustration,
  appointments: NoAppointmentsIllustration,
  queue: NoQueueIllustration,
  notifications: NoNotificationsIllustration,
  messages: NoMessagesIllustration,
  deals: NoDealsIllustration,
  network: NetworkErrorIllustration,
  people: NoPeopleIllustration,
  locked: LockedIllustration,
  success: SuccessIllustration,
  photos: NoPhotosIllustration,
} as const;

export type IllustrationKey = keyof typeof illustrations;
