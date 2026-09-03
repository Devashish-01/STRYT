/**
 * What can actually be shared, per kind of thing — one definition, nine call sites.
 *
 * ShareCard used to take six loose strings (title/subtitle/image/meta/url/upiId)
 * and hand every subject the identical five channels, including "Print Stand" —
 * a merchant counter-stand poster hardcoded with "Official Local Business
 * Scanner" and "view our catalog, menu & offers". Sharing a lost-dog post
 * offered to print that dog a counter stand; a customer browsing someone else's
 * shop could print that shop's official signage, because nothing was gated on
 * who was looking.
 *
 * The fix is to stop treating a share as "a card with a URL" and start treating
 * it as a SUBJECT OF A KNOWN KIND. The kind — plus whether the viewer manages
 * it — is what decides which channels, which QR meaning, and which physical
 * artifact (if any) make sense. Pure and unit-tested, so the rules live in one
 * readable place rather than being re-derived per screen.
 */

import type { CommunityPostType } from "@/types";

/** A printable/downloadable physical thing. Deliberately NOT universal: most
 *  subjects support none, which is the whole point.
 *
 *  Only `counter-stand` exists today. The design's other two —
 *  `lost-found-flyer` (an A4 lamppost flyer, the CORRECT artifact for a
 *  LOST_FOUND post, where a counter stand never was) and `campaign-poster`
 *  (an in-store poster for an open bulk-buying campaign) — widen this union
 *  when their templates land. Until then the resolver returns null for them
 *  rather than promising a template that doesn't exist. */
export type ShareArtifact = "counter-stand" | null;

interface ShareSubjectBase {
  /** Preview-card fields. */
  title: string;
  subtitle: string;
  image?: string;
  meta?: string;
  /** Chip label, only used when this subject sits in a multi-subject switcher
   *  (Profile's "Personal / Shop / Provider"). */
  label?: string;
}

/**
 * The thing being shared. `viewerManages` is the ownership signal the old
 * component had no concept of — a shop's OWNER and a passing CUSTOMER were
 * handed identical options.
 */
export type ShareSubject =
  | (ShareSubjectBase & {
      kind: "business";
      id: string;
      viewerManages?: boolean;
      upiId?: string | null;
      paymentQrUrl?: string | null;
    })
  | (ShareSubjectBase & {
      kind: "provider";
      id: string;
      viewerManages?: boolean;
      upiId?: string | null;
      paymentQrUrl?: string | null;
    })
  | (ShareSubjectBase & { kind: "post"; id: string; postType?: CommunityPostType })
  | (ShareSubjectBase & { kind: "request"; id: string })
  | (ShareSubjectBase & { kind: "person"; id: string })
  | (ShareSubjectBase & { kind: "campaign"; id: string; businessId: string; viewerManages?: boolean });

export interface ShareCapabilities {
  /** Deep link, derived from the subject — never hand-built per screen. This is
   *  what stops a caller silently falling back to window.location.href (which
   *  RequestDetail did: correct only because it happened to render from the
   *  detail page). */
  url: string;
  /** Whether a QR tab is offered, and what scanning it actually gets you. The
   *  old sheet said "SCAN WITH PHONE CAMERA TO VISIT STORE" for every subject,
   *  including posts and people. */
  qr: { enabled: boolean; scanLabel: string; caption: string };
  /** Merchant payment QR — a managed business/provider with a UPI id only. */
  paymentQr: boolean;
  /** The single artifact this subject supports, or null for "no print tab". */
  artifact: ShareArtifact;
}

/** Deep link for a subject. Mirrors postShareUrl's relative-safe fallback
 *  (lib/postInteractions.ts) so a missing window never interpolates
 *  "undefined" into a shared URL. */
export function shareUrl(subject: ShareSubject, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  switch (subject.kind) {
    case "business":
      return `${base}/business/${subject.id}`;
    case "provider":
      return `${base}/provider/${subject.id}`;
    case "post":
      return `${base}/community/${subject.id}`;
    case "request":
      return `${base}/request/${subject.id}`;
    case "person":
      return `${base}/u/${subject.id}`;
    // A campaign has no standalone route — it lives in the business's bulk
    // feed, so its share link opens the shop running it.
    case "campaign":
      return `${base}/business/${subject.businessId}`;
  }
}

/** Everything the share sheet needs to decide what to render. */
export function shareCapabilities(subject: ShareSubject, origin?: string): ShareCapabilities {
  const url = shareUrl(subject, origin);

  switch (subject.kind) {
    case "business":
    case "provider": {
      const managed = subject.viewerManages === true;
      const isShop = subject.kind === "business";
      return {
        url,
        qr: {
          enabled: true,
          scanLabel: isShop ? "SCAN TO OPEN THIS SHOP" : "SCAN TO OPEN THIS PROFILE",
          caption: isShop
            ? "View catalog, hours, offers and book on STRYT"
            : "View services, portfolio and book on STRYT",
        },
        // Gated on managing it AND having something to pay to. Previously
        // implicit: only the two dashboards happened to pass upiId, so the
        // rule worked by convention rather than by being stated.
        paymentQr: managed && !!(subject.upiId || subject.paymentQrUrl),
        // The counter stand is signage a shop puts on its own till. A visitor
        // printing it is the bug this gate closes.
        artifact: managed ? "counter-stand" : null,
      };
    }

    case "post":
      return {
        url,
        qr: {
          enabled: true,
          scanLabel: "SCAN TO SEE THIS POST",
          caption: "Opens this neighbourhood post on STRYT",
        },
        paymentQr: false,
        // A LOST_FOUND post's right artifact is an A4 lamppost flyer, never a
        // counter stand — that template is the next step, so nothing is
        // offered here yet rather than offering the wrong one.
        artifact: null,
      };

    case "request":
      return {
        url,
        // Requests auto-expire in <=24h (AskCompose caps expiresInHrs at 24),
        // so a printed/saved QR pointing at one is stale almost immediately.
        qr: { enabled: false, scanLabel: "", caption: "" },
        paymentQr: false,
        artifact: null,
      };

    case "person":
      return {
        url,
        qr: {
          enabled: true,
          scanLabel: "SCAN TO OPEN THIS PROFILE",
          caption: "Connect with your neighbour on STRYT",
        },
        paymentQr: false,
        // Printing a poster of another member is not a thing anyone wants.
        artifact: null,
      };

    case "campaign":
      return {
        url,
        qr: {
          enabled: true,
          scanLabel: "SCAN TO JOIN THIS DEAL",
          caption: "Pledge into this bulk-buying campaign on STRYT",
        },
        paymentQr: false,
        // A campaign poster for the running business is the design's third
        // artifact — pending its template, same reasoning as the flyer above.
        artifact: null,
      };
  }
}
