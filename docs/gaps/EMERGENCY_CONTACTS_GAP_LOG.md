# STRYT — Flow 10.1: Emergency Contacts & SOS Alerts Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 10.1 — Domain 10 (Safety, Emergency & Location Sharing)  
**Primary Components:** [`EmergencyContacts.tsx`](file:///d:/zetax/name/STRYT/src/screens/safety/EmergencyContacts.tsx), [`SafetyHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/safety/SafetyHub.tsx), [`MyPeopleToggle.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/MyPeopleToggle.tsx), [`useLiveShare.tsx`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx)  
**Backend Services & Tables:** `emergencyService.ts`, `public.emergency_contacts`, `public.live_shares`, `public.live_share_recipients`, DB RPC `start_live_share` (migration `20260818_live_location_sharing.sql`)  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Chicken-and-Egg Contact Trap, Phantom Zero-Recipient Broadcast, Accidental Removal Risk)**

---

## 1. Executive Summary

Flow 10.1 governs emergency identity management and crisis alerting in STRYT. Replacing legacy SMS-based SOS concepts, the platform provides "My People"—an in-app live location broadcast system. When activated via the header toggle on Home (`MyPeopleToggle.tsx`) or the Safety Hub (`SafetyHub.tsx`), the user's real-time GPS coordinates stream to designated emergency contacts, rendering an interactive moving map card inside their existing chat threads.

While the underlying schema utilizes authenticated PostgreSQL `SECURITY DEFINER` RPCs (`start_live_share`, `update_live_share`, `stop_live_share`), end-to-end tracing revealed critical architectural traps that prevent normal users from configuring safety contacts and create dangerous false senses of security:

1. **The "Chicken-and-Egg" Contact Addition Trap (P0):** In `emergencyService.candidateContacts()`, candidates are drawn exclusively from `chatService.conversations()`. However, STRYT only creates chats through commercial interactions (inquiring on a storefront, booking a service, or proposing on an ask). A user cannot search for family members or trusted neighbors by phone number or alias. New users setting up safety features are met with: *"No one to add yet — start a chat with someone first"*, rendering emergency contact setup impossible for real-world family and friends.
2. **Phantom Live Share to Zero Recipients (P0):** If a user taps `MyPeopleToggle` on Home with 0 emergency contacts, `start_live_share` creates an `ACTIVE` database session, starts background location polling on the device, and displays toast: *"Live location shared with My People"*. The device drains battery streaming coordinates, but **zero people receive the broadcast**. Neither the client nor the database guards against broadcasting with zero configured contacts.
3. **Zero-Confirmation Accidental Contact Removal (P0):** In `EmergencyContacts.tsx`, tapping "Remove" immediately deletes the emergency contact with no confirmation modal or undo capability. An accidental brush while scrolling drops a loved one from the safety broadcast network.
4. **Silent Error Masking in `listContacts()` (P1):** In `emergencyService.ts`, any Supabase read failure executes `if (error) return []`. A transient network failure displays the empty state ("No emergency contacts yet"), misleading users into believing their safety network was erased.
5. **Unbounded Contact List Fan-Out (P1):** The database lacks an upper limit on emergency contacts. In `start_live_share`, a single transaction inserts messages and notifications in a loop over all contacts, risking transaction timeouts for large contact lists.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **ECON-1** | "Chicken-and-Egg" Contact Addition Trap Prevents Adding Family & Friends | 🔴 P0 (Critical Workflow Blocker) | Contacts can only be added from existing commercial chats. Users have zero way to add or search family members, spouses, or trusted neighbors. |
| **ECON-2** | Phantom Live Share to Zero Recipients Gives Dangerous False Security | 🔴 P0 (Safety & Life-Critical Hazard) | Tapping the Home toggle with 0 contacts activates background GPS streaming and confirms "Live location shared", broadcasting to nobody. |
| **ECON-3** | Zero-Confirmation Instant Deletion of Emergency Contacts | 🔴 P0 (Accidental Data Destruction) | Tapping "Remove" on an emergency contact immediately destroys the relationship without confirmation, dropping critical safety recipients. |
| **ECON-4** | `listContacts()` Returns Empty Array on Network Error | 🟠 P1 (False State Panic) | Transient network or auth drops catch errors and return `[]`, falsely displaying the "No emergency contacts" empty state. |
| **ECON-5** | Unbounded Contact List Fan-Out Threatens RPC Latency | 🟠 P1 (Transaction Contention) | No upper boundary on contact count. `start_live_share` performs synchronous N-ary inserts inside a single database transaction. |
| **ECON-6** | Missing Realtime Channel for Emergency Contact Updates | 🟠 P1 (Multi-Device Stale State) | `EmergencyContacts.tsx` uses plain `useQuery` without realtime subscriptions, failing to reflect multi-device changes. |
| **ECON-7** | Candidate Contact Mobile Touch Target Violations | 🟡 P2 (Accessibility / Mobile Polish) | Candidate list "Add" buttons lack 44px minimum touch targets and accessible labels. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 ECON-1 (P0): "Chicken-and-Egg" Contact Addition Trap Prevents Adding Family & Friends

- **Location:** [`src/services/engagement/emergencyService.ts:34-51`](file:///d:/zetax/name/STRYT/src/services/engagement/emergencyService.ts#L34-L51), [`src/screens/safety/EmergencyContacts.tsx:106-112`](file:///d:/zetax/name/STRYT/src/screens/safety/EmergencyContacts.tsx#L106-L112)
- **Root Cause:**
  1. In `emergencyService.candidateContacts()`:
     ```typescript
     const [convs, existing] = await Promise.all([
       chatService.conversations(),
       this.listContacts(),
     ]);
     const taken = new Set(existing.map((c) => c.id));
     const out: ContactUser[] = [];
     for (const c of convs) {
       const o = c.otherUser;
       if (!o || o.id === uid || taken.has(o.id) || seen.has(o.id)) continue;
       out.push({ id: o.id, name: o.name, avatar: o.avatar });
     }
     return out;
     ```
  2. The code restricts candidate contacts strictly to users who already appear in `chatService.conversations()`.
  3. In STRYT, chats cannot be started arbitrarily; conversations are strictly transactional (e.g. asking a shop about an item or booking a service).
  4. A user onboarding to STRYT who wants to add their spouse, parent, child, or neighbor as an emergency contact has zero conversations.
  5. The candidate sheet displays:
     `"No one to add yet — start a chat with someone first, then add them here."`
  6. The user is completely blocked from adding actual personal emergency contacts.
- **Remediation Plan:**
  - Provide a search-by-alias or search-by-phone-number mechanism for trusted contacts in `EmergencyContacts.tsx`.
  - Allow sending an "Emergency Contact Connection Request" to any registered STRYT user.

---

### 🔴 ECON-2 (P0): Phantom Live Share to Zero Recipients Gives Dangerous False Security

- **Location:** [`src/features/live-share/MyPeopleToggle.tsx:49-53`](file:///d:/zetax/name/STRYT/src/features/live-share/MyPeopleToggle.tsx#L49-L53), [`src/features/live-share/useLiveShare.tsx:92-108`](file:///d:/zetax/name/STRYT/src/features/live-share/useLiveShare.tsx#L92-L108), [`supabase/migrations/20260818_live_location_sharing.sql:102-157`](file:///d:/zetax/name/STRYT/supabase/migrations/20260818_live_location_sharing.sql#L102-L157)
- **Root Cause:**
  1. When a user taps `MyPeopleToggle` on `Home.tsx`:
     ```typescript
     async function beginShare() {
       const id = await start();
       if (id) showToast("Live location shared with My People");
     }
     ```
  2. `useLiveShare.start()` invokes `emergencyService.startShare(lat, lng)`.
  3. In PostgreSQL function `start_live_share`:
     ```sql
     insert into public.live_shares (sharer_user_id, lat, lng) values (v_uid, p_lat, p_lng) returning id into v_share;
     for r in select contact_user_id from public.emergency_contacts where owner_user_id = v_uid loop
       ...
     end loop;
     return v_share;
     ```
  4. If `public.emergency_contacts` has 0 rows for `v_uid`, the loop executes 0 times.
  5. The function returns `v_share` as a non-null ID.
  6. The client sets `activeShareId = id`, starts the background location tracker, and shows toast: `"Live location shared with My People"`.
  7. In an emergency, the user believes they are being tracked by family, but no messages or notifications were dispatched.
- **Remediation Plan:**
  - In `start_live_share` SQL RPC, raise an exception or return an explicit status `NO_CONTACTS` if `count(emergency_contacts) = 0`.
  - In `MyPeopleToggle.tsx` and `useLiveShare.tsx`, check `contacts.length === 0` before starting, and navigate to `/safety/contacts` with an alert: `"Add an emergency contact before sharing your location"`.

---

### 🔴 ECON-3 (P0): Zero-Confirmation Instant Deletion of Emergency Contacts

- **Location:** [`src/screens/safety/EmergencyContacts.tsx:41-51, 81-89`](file:///d:/zetax/name/STRYT/src/screens/safety/EmergencyContacts.tsx#L41-L51)
- **Root Cause:**
  ```tsx
  <button
    className="btn btn-outline btn-sm"
    disabled={busyId === c.id}
    onClick={() => void remove(c.id)}
    style={{ color: "var(--red-600)", borderColor: "var(--red-200)" }}
  >
    Remove
  </button>
  ```
  The "Remove" button invokes `emergencyService.removeContact(id)` immediately upon click.
  There is no confirmation dialog, confirmation sheet, or undo toast. A single mis-tap while scrolling on mobile deletes the contact.
- **Remediation Plan:**
  Add a stateful confirmation prompt (e.g. `<ConfirmModal>` or two-step "Tap again to confirm") before executing `removeContact`.

---

### 🟠 ECON-4 (P1): `listContacts()` Returns Empty Array on Network Error

- **Location:** [`src/services/engagement/emergencyService.ts:58-63`](file:///d:/zetax/name/STRYT/src/services/engagement/emergencyService.ts#L58-L63)
- **Root Cause:**
  ```typescript
  const { data, error } = await sb
    .from("emergency_contacts")
    .select(...)
    .eq("owner_user_id", uid)
    .order("created_at", { ascending: true });
  if (error) return [];
  ```
  If a network error occurs, `error` is silently swallowed and `[]` is returned.
  In `EmergencyContacts.tsx`, the component renders:
  `<EmptyState title="No emergency contacts yet" ... />`
  The user is given false feedback that their contacts have been wiped out.
- **Remediation Plan:**
  Call `throwIfError(error)` instead of returning `[]`, allowing `useQuery` to surface a retryable error view.

---

### 🟠 ECON-5 (P1): Unbounded Contact List Fan-Out Threatens RPC Latency

- **Location:** [`supabase/migrations/20260818_live_location_sharing.sql:118-154`](file:///d:/zetax/name/STRYT/supabase/migrations/20260818_live_location_sharing.sql#L118-L154)
- **Root Cause:**
  There is no limit on `emergency_contacts` per user.
  In `start_live_share`, each contact incurs:
  - 1 conversation select / insert
  - 1 message insert
  - 1 conversation update
  - 1 recipient insert
  - 1 notification insert
  If a user has 20 contacts, starting a live share executes 100 queries sequentially in a single transaction.
- **Remediation Plan:**
  Enforce a sensible limit (e.g. maximum 5 or 10 emergency contacts, matching industry safety standards in Apple/Google safety features) at both the UI and database level.

---

## 4. Master Tracker Registration

- **Domain:** Domain 10 — Safety, Emergency & Location Sharing
- **Flow Identifier:** Flow 10.1 — Emergency Contacts & SOS Alerts
- **Audit Date:** September 9, 2026
- **Status:** 🔴 **Audited — Blocked by P0 Contact Trap, Phantom Share & Deletion Hazard**
- **Gap Log File:** [`docs/gaps/EMERGENCY_CONTACTS_GAP_LOG.md`](file:///d:/zetax/name/STRYT/docs/gaps/EMERGENCY_CONTACTS_GAP_LOG.md)
