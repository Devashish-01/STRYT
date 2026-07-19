# STRYT — Cookie & Local Storage Policy

**Effective Date:** [To be set by STRYT on publication]
**Last Updated:** 19 July 2026
**Version:** 1.0 (draft for legal review)

This Cookie & Local Storage Policy explains how the STRYT website (**https://stryt.in**) and app use cookies, browser **local storage**, and similar technologies. It forms part of, and should be read with, our [Privacy Policy](privacy-policy.md) and [Terms & Conditions](terms-and-conditions.md).

> Grounding note: STRYT is a single-page application that relies primarily on **browser local storage** (not classic tracking cookies) for sign-in and preferences. This Policy describes both, and is written from a reading of the actual client code (35+ modules use local storage for the session, language, guest location, recently-viewed items, dismissed prompts, and similar). Confirm the exact analytics cookie behaviour of Vercel Analytics with your provider settings before publication.

---

## 1. What these technologies are

- **Cookies** — small text files a website stores in your browser.
- **Local storage / session storage** — browser storage a web app uses to keep information (like your sign-in session or preferences) on your device. STRYT uses this heavily.
- **Device identifiers / push tokens** — on the app, a push token used to deliver notifications (covered by the Privacy Policy).

We refer to all of these together as "cookies and similar technologies" in this Policy.

---

## 2. How STRYT uses them

We use these technologies in the following categories.

### 2.1 Strictly necessary (always on)
These are essential for the Platform to function and cannot be switched off through the app.

- **Sign-in / session** — keeping you securely signed in between visits. Our authentication provider (Supabase, using Google Sign-In) stores your session token in browser local storage so you don't have to log in on every page.
- **Security and integrity** — supporting access controls and preventing misuse.

### 2.2 Functional / preferences
These remember your choices to improve your experience.

- **Language** — your chosen language (English, Hindi, or Marathi).
- **Guest location and guest mode** — the approximate location and browsing state used before you sign in.
- **Recently viewed and recent searches** — so you can quickly return to shops/providers and searches.
- **Saved quote templates** and other convenience inputs you create.
- **Dismissed prompts and UI state** — for example remembering that you closed a setup checklist or a one-time notice so it doesn't keep reappearing.

### 2.3 Analytics / performance
- **Vercel Analytics and Speed Insights** collect **anonymous, aggregate** usage and performance data on the website to help us understand traffic and improve speed and reliability. These are designed to be privacy-friendly and are not used to identify you personally.

### 2.4 What we do **not** use
- We do **not** use advertising or cross-site tracking cookies.
- We do **not** sell your data or share it with ad networks.

---

## 3. Third-party technologies

Some technologies are set by the third-party services that power the Platform:

- **Google / Firebase** — for Google Sign-In and, on the app, push notifications.
- **Supabase** — session and infrastructure.
- **Vercel** — hosting and anonymous analytics.

These providers process the relevant data under their own terms and privacy notices. See the [Privacy Policy](privacy-policy.md) Section 8 for the list of providers.

---

## 4. Your choices and how to control them

- **Browser controls.** You can block or delete cookies and clear local storage through your browser settings. Note that clearing the **strictly necessary** session storage will sign you out, and clearing preferences will reset choices like language and dismissed prompts.
- **Preferences in-app.** You can change your language and many settings directly in the app.
- **Analytics.** Where your browser or region provides do-not-track / privacy controls, we honour applicable requirements. **(Flagged for STRYT: if you operate in regions requiring a cookie-consent banner, add one before enabling any non-essential cookies there.)**
- **Push notifications.** Enable or disable them via your browser or device settings; see Terms Section 31.

Because much of what STRYT stores is **strictly necessary** or **your own saved preferences**, disabling it may break sign-in or degrade functionality.

---

## 5. Changes

We may update this Policy as the Platform or our providers change. We will update the "Last Updated" date and, for material changes, give notice through the Platform.

---

## 6. Contact

Questions about this Policy: contact@stryt.in, or **Account → Help & Support** in the app. For data-rights requests, see the [Grievance Redressal Policy](grievance-redressal-policy.md).

---

*This document is a draft prepared for legal review and is not yet in force.*
