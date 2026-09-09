# STRYT — Flow 8.4: Direct Leads & Inquiries Inbox Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.4 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`LeadsInbox.tsx`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx), [`ProviderDashboard.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx), [`ProviderProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderProfileHub.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx)  
**Backend Services & Tables:** `providerService.ts`, `businessService.ts`, `chatService.ts`, `public.leads`, `public.users`  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Non-Actionable Customer Leads & P0 Blind Chat Redirection**

---

## 1. Executive Summary

Flow 8.4 governs direct customer reachouts and inbound leads for solo service providers (`/provider/:id/manage/inbox`). When prospective clients discover a provider on the map or category directory and tap **Call** or **Message** on the provider's public showcase (`/p/:id`), a trackable interaction record is created in `public.leads`. These reachouts are presented in the provider's **Reachouts** console.

While `LeadsInbox.tsx` successfully unifies lead presentation across businesses and solo providers, the audit revealed critical operational and architectural gaps that prevent providers from converting inquiries into paying jobs:
1. **Non-Actionable Dead-End Calls (P0):** When a customer calls a provider, a lead is logged (`kind: "CALL"`). However, `providerService.leads(id)` never returns `from_user_id` or customer contact info. On the inbox screen, call leads have no click handler (`hasDestination: false`). The provider sees "Rahul Sharma called you 15m ago" with a checkmark to dismiss, but **cannot call back, cannot message Rahul, and cannot view his profile**.
2. **Blind Redirection on Message Leads (P0):** When tapping a `MESSAGE` lead, `openLead()` executes `nav("/chats")`. This dumps the provider onto their generic conversation list without specifying a conversation ID or recipient. If the provider has multiple active threads, they have no way of knowing which chat corresponds to the incoming lead.
3. **Missing Realtime Subscription (P1):** Although `public.leads` is registered in `supabase_realtime`, `LeadsInbox.tsx` relies on basic `useQuery()` without realtime change detection. On-duty providers keeping their inbox open never receive live incoming reachouts without manually reloading.
4. **Silent Mutation Failures on `markLeadHandled` (P1):** Neither `providerService.markLeadHandled()` nor `businessService.markLeadHandled()` checks modified row counts or calls `.select("id")`. If an RLS policy rejects the update, PostgREST returns HTTP 204 with 0 rows modified. The UI optimistically dims the card and toasts success, but the lead remains unhandled in the database and resurrects on reload.
5. **No Status Triage or Undo (P2):** Handled and unhandled reachouts are mixed in a single flat list. Once marked handled, the checkmark button vanishes with zero undo capability.
6. **Zero Dashboard Discovery (P2):** `ProviderDashboard.tsx` fetches `providerService.analytics(id)` on every load (which queries lead counts) but completely ignores the data. Inbound leads are completely invisible on the provider's "Today" dashboard.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **LEAD-1** | Non-Actionable Customer Leads & Dead-End Call Reconnect | 🔴 P0 (Core Commercial Loop Failure) | When a customer taps "Call", a lead is recorded. But `providerService.leads` omits `from_user_id` and contact info. `LeadsInbox.tsx` disables click interaction for call leads. The provider cannot call the customer back, cannot message them, and cannot open their profile. |
| **LEAD-2** | Blind Redirection on Message Leads Loses Conversation Context | 🔴 P0 (Disoriented Communication) | Tapping a message lead executes `nav("/chats")`, dumping the provider onto their general conversation list without opening the customer's specific chat thread or passing the customer ID. |
| **LEAD-3** | Missing Realtime Subscription Leaves Console Blind to Inbound Leads | 🟠 P1 (Stale Operational Triage) | `leads` is in `supabase_realtime`, but `LeadsInbox.tsx` uses basic `useQuery()`. Incoming calls and reachouts never appear live; providers must manually refresh. |
| **LEAD-4** | Silent Mutation Failures on `markLeadHandled` Mask Database Rejections | 🟠 P1 (False-Positive UI Confirmation) | `markLeadHandled` does not call `.select("id")` or `assertRowsUpdated()`. If RLS or an invalid ID causes 0 rows to update, the UI still toasts success, but the lead resurrects on next reload. |
| **LEAD-5** | Irreversible Handled State with Zero Undo or Unmark Capability | 🟡 P2 (Accidental Dismissal Hazard) | Tapping the checkmark unmounts the button permanently. There is no unmark button, no undo toast action, and no service method to toggle handled back to false. |
| **LEAD-6** | Unsegmented Flat List Clutters Active Triage Workflow | 🟡 P2 (Cognitive Overhead) | Handled leads remain in the main list at `opacity: 0.6`. Providers with 20+ historical leads must scroll past old records to find pending inquiries. No "Pending / Handled" filter tabs exist. |
| **LEAD-7** | Mobile Touch Hazard on 34px Button Nested in Clickable Card | 🟡 P2 (Touchscreen Mis-Navigation) | The checkmark button is 34×34px (violating 44×44px WCAG standards) and sits inside a card with an `onClick` navigation handler. Tapping slightly off-center accidentally navigates away from the inbox. |
| **LEAD-8** | Zero Dashboard Visibility for Inbound Leads | 🟡 P2 (Hidden Revenue Inquiries) | `ProviderDashboard.tsx` loads analytics but never displays pending reachouts. Providers only discover leads by drilling into Profile Hub → Reachouts. |
| **LEAD-9** | Misleading Provider Empty State Copy | 🟢 P3 (UX Inconsistency) | The empty state reads "Calls and customer questions appear here", but questions belong strictly to business Q&A. Providers only receive calls and messages. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 LEAD-1 (P0): Non-Actionable Customer Leads & Dead-End Call Reconnect

- **Location:** [`LeadsInbox.tsx:85-92`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L85-L92), [`providerService.ts:340-357`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L340-L357), [`types/marketplace.ts:345-355`](file:///d:/zetax/name/STRYT/src/types/marketplace.ts#L345-L355)
- **Root Cause:**
  1. In [`providerService.ts:281-286`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L281-L286), when a client clicks "Call" on `ProviderDetail.tsx`:
     ```typescript
     async recordInteraction(id: string, kind: "CALL" | "MESSAGE") {
       const sb = getSupabase();
       const uid = await currentUserId();
       if (uid) await sb.from("leads").insert({ provider_id: id, from_user_id: uid, kind });
       return { ok: true };
     }
     ```
  2. When fetching leads in [`providerService.ts:338-357`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L338-L357):
     ```typescript
     const { data, error } = await sb
       .from("leads")
       .select("id, provider_id, kind, note, handled, created_at, from:users!from_user_id(name, avatar)")
       .eq("provider_id", id)
       .order("created_at", { ascending: false })
       .limit(100);
     ```
     `from_user_id` is joined only for `name` and `avatar`. The user ID itself and contact handles are completely dropped.
  3. In [`LeadsInbox.tsx:85-91`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L85-L91):
     ```tsx
     const hasDestination = lead.kind === "MESSAGE" || (lead.kind === "QUESTION" && isBusiness);
     return (
       <div
         key={lead.id}
         className="card row gap-12 center-v"
         style={{ padding: 12, opacity: done ? .6 : 1, cursor: hasDestination ? "pointer" : "default" }}
         onClick={hasDestination ? () => openLead(lead) : undefined}
       >
     ```
     For `lead.kind === "CALL"`, `hasDestination` is `false`. The card is non-interactive. The provider sees that a customer called, but cannot tap to call back, cannot message them, and cannot open their profile.
- **Remediation Plan:**
  1. Include `fromUserId: l.from_user_id` in `Lead` and `providerService.leads()`.
  2. Add an action to connect with the customer: allow starting a chat thread via `chatService.getOrCreate(lead.fromUserId)` ("Hi, saw you called via STRYT...") and allow opening `UserProfileSheet` to see profile details.

---

### 🔴 LEAD-2 (P0): Blind Redirection on Message Leads Loses Conversation Context

- **Location:** [`LeadsInbox.tsx:50-53`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L50-L53)
- **Root Cause:**
  ```typescript
  function openLead(lead: Lead) {
    if (lead.kind === "QUESTION" && isBusiness) nav(`/business/${id}/manage/qna`);
    else if (lead.kind === "MESSAGE") nav("/chats");
  }
  ```
  When a provider taps a message lead, the app invokes `nav("/chats")`. This navigates to the generic conversation list. The user is not taken to the specific message thread with the customer who created the lead. If the provider has multiple threads or the conversation was scoped differently, the provider cannot locate the lead's message.
- **Remediation Plan:**
  Resolve the conversation using `chatService.getOrCreate(lead.fromUserId)` and navigate directly to `/chat/${conv.id}`.

---

### 🟠 LEAD-3 (P1): Missing Realtime Subscription Leaves Console Blind to Inbound Leads

- **Location:** [`LeadsInbox.tsx:40`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L40), [`20260708_lead_trends_live.sql:91`](file:///d:/zetax/name/STRYT/supabase/migrations/20260708_lead_trends_live.sql#L91)
- **Root Cause:**
  Migration `20260708_lead_trends_live.sql` added `public.leads` to the `supabase_realtime` publication.
  However, `LeadsInbox.tsx` uses standard `useQuery()`:
  ```typescript
  const { data, loading, error, refetch } = useQuery<Lead[]>(() => service.leads(id) as Promise<Lead[]>, [id]);
  ```
  It does not establish a Postgres changes subscription. Providers keeping the reachouts tab open on a tablet or mobile workstation will never see new incoming leads without manually pulling to refresh or reloading the screen.
- **Remediation Plan:**
  Replace `useQuery` with `useQueryWithRealtime(..., "leads", [id], isBusiness ? "business_id=eq." + id : "provider_id=eq." + id)`.

---

### 🟠 LEAD-4 (P1): Silent Mutation Failures on `markLeadHandled` Mask Database Rejections

- **Location:** [`providerService.ts:358-363`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L358-L363), [`businessService.ts:964-969`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L964-L969)
- **Root Cause:**
  ```typescript
  async markLeadHandled(leadId: string) {
    const sb = getSupabase();
    const { error } = await sb.from("leads").update({ handled: true }).eq("id", leadId);
    throwIfError(error);
    return { ok: true };
  }
  ```
  PostgREST does not return an error when 0 rows match the update filter or when RLS silently filters out the target row.
  Because neither `providerService` nor `businessService` selects updated rows or verifies `assertRowsUpdated(data)`, 0-row updates return `{ ok: true }`.
  The UI displays a "Marked handled" toast, but the database remains un-mutated. On next visit, the lead is unhandled again.
- **Remediation Plan:**
  Add `.select("id")` and call `assertRowsUpdated(data)` in `markLeadHandled()`.

---

### 🟡 LEAD-5 (P2): Irreversible Handled State with Zero Undo or Unmark Capability

- **Location:** [`LeadsInbox.tsx:84, 95`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L95)
- **Root Cause:**
  ```tsx
  {!done && (
    <button className="icon-btn" aria-label="Mark handled" ... onClick={(e) => { e.stopPropagation(); markHandled(lead); }}>
      <Check size={16} />
    </button>
  )}
  ```
  When `done` is true, the button unmounts. There is no un-mark button, no undo action in the toast, and no service method to set `handled: false`. Accidental clicks on mobile screens permanently dismiss leads with no recovery path.
- **Remediation Plan:**
  Provide an "Undo" action in the toast, and support toggling handled status back to false.

---

### 🟡 LEAD-6 (P2): Unsegmented Flat List Clutters Active Triage Workflow

- **Location:** [`LeadsInbox.tsx:78-100`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L78-L100)
- **Root Cause:**
  All historical and active reachouts are displayed in a single unpaginated vertical list. Once a provider has handled 20+ inquiries, unhandled leads get lost among dimmed items. There are no filter tabs (`Pending` / `Handled` / `All`).
- **Remediation Plan:**
  Add a segmented filter bar (`All (12)`, `Pending (2)`, `Handled (10)`) allowing providers to focus strictly on open leads.

---

### 🟡 LEAD-7 (P2): Mobile Touch Hazard on 34px Button Nested in Clickable Card

- **Location:** [`LeadsInbox.tsx:87-96`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L87-L96)
- **Root Cause:**
  The checkmark button is 34×34px (`style={{ width: 34, height: 34 }}`), violating the 44×44px mobile touch target standard. Because the card itself has an `onClick` navigation handler, an imprecise tap on mobile triggers `openLead()`, navigating the provider away instead of marking the lead handled.
- **Remediation Plan:**
  Expand touch target to 44×44px and isolate button clicks cleanly.

---

### 🟡 LEAD-8 (P2): Zero Dashboard Visibility for Inbound Leads

- **Location:** [`ProviderDashboard.tsx:66, 618-630`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderDashboard.tsx#L66), [`ProviderProfileHub.tsx:118`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderProfileHub.tsx#L118)
- **Root Cause:**
  `ProviderDashboard.tsx:66` calls `providerService.analytics(id)`, which executes 6 parallel queries including lead counts, but `analytics` is never referenced anywhere in the dashboard JSX. Inbound leads have zero visual indicator on the Today screen or in the bottom navigation. Providers must navigate through Profile Hub to even discover reachouts.
- **Remediation Plan:**
  Render an alert banner or quick tile on `ProviderDashboard.tsx` when there are pending unhandled reachouts.

---

### 🟢 LEAD-9 (P3): Misleading Provider Empty State Copy

- **Location:** [`LeadsInbox.tsx:80`](file:///d:/zetax/name/STRYT/src/screens/manage/LeadsInbox.tsx#L80)
- **Root Cause:**
  The empty state text reads: `"Calls and customer questions appear here."`
  For solo providers, the Q&A feature does not exist (it is business-only).
- **Remediation Plan:**
  Use `"Calls and messages from customers appear here."` when `entityType === "PROVIDER"`.

---

## 4. Verification & Testing Checklist

- [ ] Leads returned by `providerService.leads(id)` include `fromUserId`.
- [ ] Tapping a `MESSAGE` lead deep-links directly to `/chat/:chatId` with the inquiry sender.
- [ ] Tapping a `CALL` lead displays contact options (message sender or view customer profile sheet).
- [ ] New incoming leads trigger realtime updates in `LeadsInbox.tsx` without manual refresh.
- [ ] `markLeadHandled()` verifies modified row count via `assertRowsUpdated()`.
- [ ] Touching "Mark handled" provides an undo action.
- [ ] Inbox provides filter controls for `All`, `Pending`, and `Handled`.
- [ ] Action buttons meet 44×44px mobile touch target standards.
- [ ] Unhandled reachouts show a counter or alert on `ProviderDashboard.tsx`.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
