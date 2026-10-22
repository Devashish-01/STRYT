# STRYT — Flow 11.1: Role & Hat Switching Navigation Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.1 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`RoleSwitcher.tsx`](file:///d:/zetax/name/STRYT/src/components/RoleSwitcher.tsx), [`AccountSwitcher.tsx`](file:///d:/zetax/name/STRYT/src/components/AccountSwitcher.tsx), [`useAccountOptions.ts`](file:///d:/zetax/name/STRYT/src/hooks/useAccountOptions.ts), [`HatSwitcherList.tsx`](file:///d:/zetax/name/STRYT/src/components/HatSwitcherList.tsx), [`HatSwitcherCard.tsx`](file:///d:/zetax/name/STRYT/src/components/HatSwitcherCard.tsx), [`FooterProfileTab.tsx`](file:///d:/zetax/name/STRYT/src/components/FooterProfileTab.tsx), [`PinGateSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinGateSheet.tsx), [`BusinessAccessGuard.tsx`](file:///d:/zetax/name/STRYT/src/components/BusinessAccessGuard.tsx), [`ProviderAccessGuard.tsx`](file:///d:/zetax/name/STRYT/src/components/ProviderAccessGuard.tsx)  
**Backend Services & Tables:** `userService.ts`, `businessService.ts`, `providerService.ts`, `businessAccessService.ts`, `entityPasswordService.ts`, `public.users`, `public.businesses`, `public.providers`, `public.business_access_sessions`, `public.entity_passwords`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (activeRole/activeContext State Desync, PIN Gate Bypass on Direct Navigation, Cold-Load Identity Shift, Delegated Businesses Dropped from Manage Hub)**

---

## 1. Executive Summary

Flow 11.1 governs identity virtualization and multi-role context navigation in STRYT. Under the platform's core paradigm—**"One login = all your hats"**—a single authenticated user can operate simultaneously as a local customer, an owner of up to five storefronts, a service provider/freelancer, a delivery agent, or a delegated team member. Context switching is mediated through two primary controls:
1. **Header Dropdown (`RoleSwitcher.tsx`):** Mounted on desktop sidebars and mobile manage dashboard headers (`ManageDashboard.tsx`, `ProviderDashboard.tsx`, `DeliveryConsole.tsx`).
2. **Bottom Sheet Drawer (`AccountSwitcher.tsx`):** Triggered by long-pressing the bottom navigation Profile tab (`FooterProfileTab.tsx`) or tapping the RoleSwitcher expansion.

While the unified hook [`useAccountOptions.ts`](file:///d:/zetax/name/STRYT/src/hooks/useAccountOptions.ts) elegantly integrates owned businesses, provider profiles, and realtime delegated grants, rigorous code-level tracing uncovered severe state desynchronization, permission bypasses, and layout instability:

1. **State Divergence between `activeRole` and `activeContext` (P0):** The app maintains two independent role states in `src/store.tsx`: legacy `activeRole` (string) and modern `activeContext` (`{ type, id, name }`). When a user switches hats in `AccountSwitcher` or `RoleSwitcher`, only `activeContext` is updated; `activeRole` remains stuck on `"customer"`. Core downstream features like [`Support.tsx`](file:///d:/zetax/name/STRYT/src/screens/Support.tsx#L25) and [`GuideIndex.tsx`](file:///d:/zetax/name/STRYT/src/screens/guide/GuideIndex.tsx#L29) read `activeRole`, causing support tickets and help requests filed while in merchant mode to be falsely attributed to `"CUSTOMER"`. Conversely, [`HatSwitcherCard.tsx`](file:///d:/zetax/name/STRYT/src/components/HatSwitcherCard.tsx#L114) mutates `activeRole` without updating `activeContext`, leaving header switchers stuck in business mode.
2. **Entity PIN Bypass on Direct URL Navigation / Refresh (P0):** The entity PIN verification sheet ([`PinGateSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/PinGateSheet.tsx)) is only triggered via `attemptSwitchContext()` when clicking an account card. Neither [`BusinessAccessGuard.tsx`](file:///d:/zetax/name/STRYT/src/components/BusinessAccessGuard.tsx) nor [`ProviderAccessGuard.tsx`](file:///d:/zetax/name/STRYT/src/components/ProviderAccessGuard.tsx) enforces PIN verification. Any user who bookmarks, directly enters, or refreshes `/business/:id/manage` bypasses the entity password entirely!
3. **Cold-Load Identity Flash & Layout Shift in `AccountSwitcher` (P0):** In `useAccountOptions.ts`, business, provider, and delegated session queries start unresolved on mount without fallback skeletons or cached seeds. For 300–800ms upon opening the drawer, the list flashes a customer-only identity and renders "Become a provider" / "Add a business" action buttons, which abruptly jump downwards when real profiles load.
4. **Delegated Businesses Excluded from `ManageHub` (`/manage`) (P1):** The central management hub ([`ManageHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/ManageHub.tsx#L12)) queries only `businessService.mine()` (owned stores). Team members and managers with active delegated access grants see zero businesses on `/manage`, despite `AccountSwitcher` naming it the *"Hub for all your businesses and profiles"*.
5. **Unbounded Menu Overflow & Clipping in `RoleSwitcher` (P1):** The dropdown in [`RoleSwitcher.tsx`](file:///d:/zetax/name/STRYT/src/components/RoleSwitcher.tsx#L87-L94) lacks `maxHeight` and `overflowY: auto`. On small mobile screens or landscape orientations, accounts and action links overflow below the viewport and cannot be scrolled into view.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **ROLE-1** | `activeRole` and `activeContext` State Divergence Corrupts Downstream Identity | 🔴 P0 (Critical State & Data Leak) | Switching hats updates `activeContext` but leaves `activeRole` as `"customer"`. Support tickets and guides record wrong identity; `HatSwitcherCard` desyncs headers. |
| **ROLE-2** | Entity PIN Protection Bypassed on Direct URL Navigation & Page Refresh | 🔴 P0 (Security & Access Vulnerability) | Access guards trust route parameters without checking if entity password was verified. Reloading or deep linking to `/business/:id/manage` bypasses the PIN. |
| **ROLE-3** | Cold-Load False Absence & Violent Layout Shift in `AccountSwitcher` | 🔴 P0 (UX Polish & Accidental Taps) | Opening the switcher flashes a customer-only list and "Add a business" buttons for ~500ms before accounts load, causing mis-clicks. |
| **ROLE-4** | Delegated Businesses Completely Missing from `ManageHub.tsx` (`/manage`) | 🟠 P1 (Broken Navigation Hub) | Delegated managers clicking "Manage all spaces" land on a blank `/manage` screen that only queries owned businesses. |
| **ROLE-5** | `RoleSwitcher` Dropdown Lacks Viewport Max-Height & Vertical Scroll | 🟠 P1 (Overflow & Mobile Truncation) | Accounts list has no scroll container, cutting off options and action buttons below the screen edge on mobile displays. |
| **ROLE-6** | `ProviderAccessGuard` Clears User Context Name on Access Denial | 🟡 P2 (Minor State Glitch) | Rejecting unauthorized provider access calls `setContext({ type: "customer", id: null, name: "" })`, blanking the user's name in headers. |
| **ROLE-7** | `RoleSwitcher` Header Pill Violates 44px Minimum Touch Target | 🟡 P2 (Accessibility / Mobile Polish) | The header pill has a 34px total height, causing frequent touch misses on mobile touchscreens. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 ROLE-1 (P0): `activeRole` and `activeContext` State Divergence Corrupts Downstream Identity

- **Location:** [`src/store.tsx:538-546`](file:///d:/zetax/name/STRYT/src/store.tsx#L538-L546), [`src/hooks/useAccountOptions.ts:121-126`](file:///d:/zetax/name/STRYT/src/hooks/useAccountOptions.ts#L121-L126), [`src/screens/Support.tsx:15-26`](file:///d:/zetax/name/STRYT/src/screens/Support.tsx#L15-L26), [`src/screens/guide/GuideIndex.tsx:17-30`](file:///d:/zetax/name/STRYT/src/screens/guide/GuideIndex.tsx#L17-L30), [`src/components/HatSwitcherCard.tsx:113-116`](file:///d:/zetax/name/STRYT/src/components/HatSwitcherCard.tsx#L113-L116)
- **Root Cause:**
  1. In `src/store.tsx`, two separate identity properties coexist:
     ```typescript
     const [activeRole, setActiveRole] = useState<Role>(...);
     const [activeContext, setActiveContext] = useState<ActiveContext>(...);
     ```
  2. When a user selects an account in `AccountSwitcher` or `RoleSwitcher`:
     ```typescript
     function pick(opt: AccountOption) {
       const ready = attemptSwitchContext({ type: opt.type, id: opt.id, name: opt.name }, opt.dest);
       if (!ready) return;
       showToast(`Switched to ${opt.name}`);
       nav(opt.dest);
     }
     ```
     `attemptSwitchContext()` invokes `setPersistedContext(ctx)`. It **never invokes `setPersistedActiveRole()`**!
  3. Consequently, if a user starts as a customer and switches to a business or provider hat:
     - `activeContext` is `{ type: "business", id: "biz_123", name: "Apex Salon" }`.
     - `activeRole` remains `"customer"`.
  4. In [`Support.tsx:23-26`](file:///d:/zetax/name/STRYT/src/screens/Support.tsx#L23-L26):
     ```typescript
     const { user, activeRole, showToast } = useApp();
     const [reporterRole, setReporterRole] = useState<ReporterRole>(() => defaultReporterRole(activeRole));
     ```
     The support ticket is logged as `reporter_role = "CUSTOMER"`, ignoring that the user is managing an open store issue.
  5. In [`HatSwitcherCard.tsx:114`](file:///d:/zetax/name/STRYT/src/components/HatSwitcherCard.tsx#L114), selecting "Customer" executes:
     ```typescript
     setActiveRole(r);
     nav("/home");
     ```
     It **fails to call `setContext({ type: "customer", id: null, name: user.name })`**! As a result, the desktop sidebar and header dropdown remain stuck rendering the old business or provider hat while the user is browsing customer home.
- **Recommended Remediation:**
  - Unify state mutations: inside `setPersistedContext(ctx)`, automatically synchronize `activeRole`:
    ```typescript
    const derivedRole: Role =
      ctx.type === "business" ? "business_owner" :
      ctx.type === "provider" ? "provider" :
      ctx.type === "delivery" ? "rider" : "customer";
    setActiveRole(derivedRole);
    localStorage.setItem("activeRole", derivedRole);
    ```
  - In `HatSwitcherCard.tsx:114`, replace `setActiveRole(r)` with `setContext({ type: "customer", id: null, name: user.name })`.
  - Update `Support.tsx` and `GuideIndex.tsx` to derive default roles directly from `activeContext.type`.

---

### 🔴 ROLE-2 (P0): Entity PIN Protection Bypassed on Direct URL Navigation & Page Refresh

- **Location:** [`src/store.tsx:574-590`](file:///d:/zetax/name/STRYT/src/store.tsx#L574-L590), [`src/components/BusinessAccessGuard.tsx:70-110`](file:///d:/zetax/name/STRYT/src/components/BusinessAccessGuard.tsx#L70-L110), [`src/components/ProviderAccessGuard.tsx:18-30`](file:///d:/zetax/name/STRYT/src/components/ProviderAccessGuard.tsx#L18-L30)
- **Root Cause:**
  1. STRYT supports entity passwords/PINs (`entity_passwords` table) so merchants can prevent unauthorized staff or device borrowers from opening manage dashboards.
  2. The check exists solely in `attemptSwitchContext()`:
     ```typescript
     const required =
       ctx.type === "business" ? (ctx.id ? businessPasswordRequired[ctx.id] ?? false : false)
       : ctx.type === "provider" ? providerPasswordIsSet
       : false;
     if (!required) {
       setPersistedContext(ctx);
       return true;
     }
     setPendingContextSwitch({ ctx, dest });
     return false;
     ```
  3. Neither `BusinessAccessGuard` nor `ProviderAccessGuard` checks whether the current session has verified the PIN:
     ```typescript
     // BusinessAccessGuard.tsx
     const isOwner = ownedBusinessIds.includes(id);
     ...
     if (isOwner) {
       setStatus("allowed");
       return;
     }
     ```
  4. If an employee, stranger, or customer with a shared device types `/business/:id/manage` into the browser, clicks a push notification, or hits F5 (refresh):
     - `attemptSwitchContext` is never called.
     - `BusinessAccessGuard` sees `isOwner = true` and grants immediate access.
     - The dashboard, revenue stats, customer chats, and order queues open with **zero password prompt**.
- **Recommended Remediation:**
  - Introduce an in-memory session unlock tracker in `store.tsx` (e.g. `unlockedEntityIds: Set<string>`).
  - In `BusinessAccessGuard` and `ProviderAccessGuard`, if `businessPasswordRequired[id]` is true and `!unlockedEntityIds.has(id)`, render `PinGateSheet` and block `<Outlet />` until verified.

---

### 🔴 ROLE-3 (P0): Cold-Load False Absence & Violent Layout Shift in `AccountSwitcher`

- **Location:** [`src/hooks/useAccountOptions.ts:35-57`](file:///d:/zetax/name/STRYT/src/hooks/useAccountOptions.ts#L35-L57), [`src/components/AccountSwitcher.tsx:90-98`](file:///d:/zetax/name/STRYT/src/components/AccountSwitcher.tsx#L90-L98)
- **Root Cause:**
  1. In `useAccountOptions.ts`:
     ```typescript
     const { data: myBiz } = useQuery(() => businessService.mine(), [user.id], `my-businesses:${user.id}`);
     const { data: myProv } = useQuery(() => providerService.mine(), [user.id], `my-providers:${user.id}`);
     const { data: mySessions } = useQueryWithRealtime(...);
     ```
  2. When `AccountSwitcher` mounts:
     - `myBiz`, `myProv`, and `mySessions` are `undefined`.
     - `options` defaults to `[{ type: "customer", id: null, ... }]`.
     - `canAddBusiness` evaluates to `true`, and `canBecomeProvider` evaluates to `true`.
  3. The modal displays only "Personal · Customer" and prominently shows the "Add a business" and "Become a provider" action buttons.
  4. ~400ms later, queries complete. 1–5 businesses and provider profiles render into the list, pushing the action buttons down by 200–300px.
  5. Users intending to switch to their second business frequently tap the exact screen coordinate where the card appears, accidentally clicking "Add a business" and launching the onboarding wizard.
- **Recommended Remediation:**
  - Expose `loading: boolean` from `useAccountOptions`.
  - When loading is true and cached data is not yet hydrated, render 2 skeleton card placeholders in `AccountSwitcher.tsx` and suppress the action cards until queries settle.

---

### 🟠 ROLE-4 (P1): Delegated Businesses Completely Missing from `ManageHub.tsx` (`/manage`)

- **Location:** [`src/screens/ManageHub.tsx:11-16`](file:///d:/zetax/name/STRYT/src/screens/ManageHub.tsx#L11-L16), [`src/screens/ManageHub.tsx:27-64`](file:///d:/zetax/name/STRYT/src/screens/ManageHub.tsx#L27-L64)
- **Root Cause:**
  1. In `AccountSwitcher.tsx:158` and `RoleSwitcher.tsx:102`, the "Manage all spaces" button links directly to `/manage`.
  2. In `ManageHub.tsx`:
     ```typescript
     const { ownedBusinessIds, ownedProviderId, roles, attemptSwitchContext } = useApp();
     const { data: myBiz, loading: bizLoading } = useQuery(() => businessService.mine(), ...);
     ```
  3. `businessService.mine()` only returns stores where `owner_user_id = uid`. It **does not return delegated businesses**.
  4. Team members, managers, and cashiers who were granted access via `business_access_sessions` see an empty list ("Businesses: None") when opening `/manage`.
  5. There is no section for delegated businesses, leaving team members stranded unless they navigate via specific direct URLs.
- **Recommended Remediation:**
  - Query `businessAccessService.mySessions()` in `ManageHub.tsx`.
  - Render a dedicated section: `"Team & Delegated Spaces"`, allowing team members to launch and manage businesses they have grants for.

---

### 🟠 ROLE-5 (P1): `RoleSwitcher` Dropdown Lacks Viewport Max-Height & Vertical Scroll

- **Location:** [`src/components/RoleSwitcher.tsx:87-94`](file:///d:/zetax/name/STRYT/src/components/RoleSwitcher.tsx#L87-L94)
- **Root Cause:**
  1. The dropdown menu container in `RoleSwitcher.tsx` has:
     ```typescript
     style={{
       position: "absolute", top: "calc(100% + 8px)",
       ...(alignRight ? { right: 0 } : { left: 0 }),
       zIndex: 500,
       width: PANEL_WIDTH, padding: 8, background: "#fff", color: "var(--ink-900)",
       boxShadow: "0 12px 32px rgba(0,0,0,0.18)", border: "1px solid var(--line)",
     }}
     ```
  2. It has no `maxHeight` and no `overflowY: auto`.
  3. For users with multiple businesses, a provider profile, and action items, the menu height exceeds 480px.
  4. On mobile devices, compact screens, or landscape orientations, the bottom half of the menu spills past the bottom edge of the viewport. The "Manage all", "Become a provider", and "Add a business" buttons cannot be seen or tapped.
- **Recommended Remediation:**
  - Add `maxHeight: "min(75vh, 420px)"` and `overflowY: "auto"` to the dropdown panel style.

---

### 🟡 ROLE-6 (P2): `ProviderAccessGuard` Clears User Context Name on Access Denial

- **Location:** [`src/components/ProviderAccessGuard.tsx:41-43`](file:///d:/zetax/name/STRYT/src/components/ProviderAccessGuard.tsx#L41-L43)
- **Root Cause:**
  1. When unauthorized access to a provider profile is detected:
     ```typescript
     setContext({ type: "customer", id: null, name: "" });
     showToast("You don't have access to that provider profile");
     return <Navigate to="/home" replace />;
     ```
  2. Setting `name: ""` overrides `activeContext.name` with an empty string, causing the top header pill to render blank or fallback to `"Personal"` until the next full page refresh.
- **Recommended Remediation:**
  - Pass `name: user.name` instead of `name: ""`.

---

### 🟡 ROLE-7 (P2): `RoleSwitcher` Header Pill Violates 44px Minimum Touch Target

- **Location:** [`src/components/RoleSwitcher.tsx:68-71`](file:///d:/zetax/name/STRYT/src/components/RoleSwitcher.tsx#L68-L71)
- **Root Cause:**
  1. The trigger button uses `padding: "6px 10px 6px 6px"` with a 22px icon, creating a total bounding height of ~34px.
  2. Mobile accessibility guidelines require a minimum 44x44px touch envelope.
- **Recommended Remediation:**
  - Enforce `minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center"`.

---

## 4. Architectural Relationship & Navigation Topology

```
                  ┌───────────────────────────────┐
                  │          Authenticated        │
                  │              User             │
                  └───────────────┬───────────────┘
                                  │
                   useAccountOptions() / store.tsx
                                  │
      ┌───────────────────────────┴───────────────────────────┐
      ▼                                                       ▼
[RoleSwitcher.tsx]                                  [AccountSwitcher.tsx]
 (Header Dropdown)                                   (Bottom Sheet Modal)
      │                                                       │
      ├───────────────────────┬───────────────────────────────┤
      ▼                       ▼                               ▼
 [Customer Hat]         [Business Hat]                  [Provider Hat]
  (/home)               (/business/:id/manage)          (/provider/:id/manage)
                            │                               │
                            ▼                               ▼
                      PIN Protection                  PIN Protection
                      ⚠️ Bypassed on Direct URL       ⚠️ Bypassed on Direct URL
```

---

## 5. Verification & Validation Steps

1. **State Synchronization Verification:**
   - Switch from Customer to Business in `AccountSwitcher`.
   - Open `/support`. Verify reporter role defaults to `"BUSINESS"`.
   - Open `/guide`. Verify guide defaults to `"business"`.
2. **PIN Protection Verification:**
   - Configure a business password in `/settings/security`.
   - In a new tab or after clearing in-memory state, navigate directly to `/business/:id/manage`.
   - Verify `PinGateSheet` prompts for the PIN before rendering dashboard data.
3. **Cold-Load Verification:**
   - Throttle network in devtools to Slow 3G.
   - Long-press Profile tab to open `AccountSwitcher`.
   - Verify skeleton card placeholders appear without layout shift or early action card flashing.
4. **TypeScript & Color Conformance:**
   - Run `npx tsc --noEmit` to guarantee zero type errors.
   - Run `npm run check-colors` to guarantee zero token violations.
