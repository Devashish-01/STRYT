# 1:1 Chat Messaging & Media Sharing — Bug & Gap Log

**Purpose:** Documenting every architectural defect, safety/compliance blocker, mobile touch hazard, realtime sync failure, and communication void in **Flow 6.1: 1:1 Chat Messaging & Media Sharing** (`src/screens/chat/ConversationList.tsx`, `src/screens/chat/ChatThread.tsx`, `src/components/ShareToChatSheet.tsx`, `src/services/engagement/chatService.ts`, `src/store/useNotificationBadges.ts`, `src/components/PhotoViewer.tsx`, `src/components/ReportSheet.tsx`, and Supabase migrations `migration_launch_hardening.sql`, `20260720_chat_upgrades.sql`, `20260811_chat_rls.sql`, `20260812_chat_indexes.sql`, `20260818_live_location_sharing.sql`, `20260892_community_comment_policy.sql`, `20260924_fix_block_filter_bidirectional.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **C1** | Zero Push Notifications or In-App Notifications for Incoming Chat Messages | 🔴 P0 (Communication Void & Core Functional Failure) | In `chatService.ts:189-210`, `send()` inserts into `public.messages` and updates `public.conversations`. Neither client code nor any Postgres database trigger inserts a row into `public.notifications`. Because STRYT's push notification pipeline (`20260731_push_on_every_notification.sql`) fires strictly on `AFTER INSERT ON public.notifications`, **recipients never receive any push notifications (Web Push, FCM, or Expo) when messaged while offline or backgrounded**. Inquiries to merchants and replies to customers sit unseen unless the recipient manually opens the app. |
| **C2** | Missing Safety & Moderation: Zero In-App User Blocking or Reporting in Chat Controls | 🔴 P0 (Google Play Store Policy Violation Blocker) | Google Play Store Developer Policy strictly mandates in-app reporting and user blocking for all apps supporting 1:1 communication. In `ChatThread.tsx:143-169`, the header provides only a Back button, avatar, and phone icon. There is zero "Block User" action, zero "Report Chat / User" option (despite `ReportSheet.tsx` supporting `"USER"`), and zero message moderation. Furthermore, in `20260811_chat_rls.sql`, the `insert_own_messages` policy does not check `user_blocks`, so blocked users can continue sending messages. This triggers immediate Google Play Store app rejection. |
| **C3** | In-Thread Incoming Messages Leave Inbox Badge Stuck as "Unread" | 🟠 P1 (Broken State Sync & Badge Inaccuracy) | In `ChatThread.tsx:50-59`, `chatService.markRead(id, conv)` is called only once upon mount. When the active user receives incoming messages in real-time via `chatService.subscribe(id, (msg) => ...)`, the sender's `send()` sets `conversations.has_unread_[a\|b] = true`. `ChatThread` does **not** call `markRead` for newly arrived messages. When the user exits the active conversation back to `/chats` or `/home`, the conversation and the bottom navigation bar remain falsely badged as "Unread". |
| **C4** | Mobile Keyboard Clashing, Safe-Area Blindspot & Input Expansion Occlusion | 🟠 P1 (Mobile Layout & Touch Usability Hazard) | In `ChatThread.tsx:260-273`, the chat input bar is styled with `position: "absolute"`, `bottom: 0`, and `padding: "10px 12px"`. It omits `var(--safe-area-bottom)`, causing the textarea and Send button to collide with Android gesture navigation bars and iOS home bars. When typing multi-line messages, the textarea auto-expands up to `maxHeight: 100`, but the messages container has a static `paddingBottom: 80`, causing the growing input bar to cover the latest message bubbles. |
| **C5** | Header Phone Icon Misleadingly Navigates to User Profile Instead of Calling | 🟠 P1 (Deceptive Mobile Affordance & Routing Defect) | In `ChatThread.tsx:163-167`, the header displays a telephone receiver button (`<Phone size={18} />`). When tapped, instead of prompting a phone call (`tel:`) or opening a call prompt, it performs `nav('/u/' + other.id)`. Navigating to a personal profile from a phone receiver icon violates mobile UX standards. Furthermore, for a business chat, `other.id` is the owner's personal user ID rather than the business profile (`/business/:id`), hiding the storefront and business phone number. |
| **C6** | Missing Optimistic Messaging & Silent Send Failures on Slow Networks | 🟡 P2 (Latency Perception & Error Feedback Void) | In `ChatThread.tsx:112-130`, when the user taps Send, the text input clears, but the message is not rendered in the thread until the asynchronous network roundtrip completes. On high-latency mobile networks, the UI appears frozen with no sent indicator. If the request fails, the text is restored to the input, but no error toast or retry button is displayed, leaving the user confused. |
| **C7** | Broken App Containment: External `window.open` for Image Attachments | 🟡 P2 (Mobile App Containment & Popup Blocker Trap) | In `ChatThread.tsx:208`, clicking an image attachment executes `window.open(msg.imageUrl!, "_blank")`. On mobile PWAs, WebViews, and Android browsers, this triggers popup blockers or forcibly ejects the user to an external browser tab instead of opening STRYT's built-in `PhotoViewer.tsx` modal. |
| **C8** | Unbounded Message Query Lacks Cursor Pagination | 🟡 P2 (Performance & Memory Degradation) | In `chatService.ts:177-186`, `chatService.messages(conversationId)` executes `select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true })` with no `limit` or pagination. For long-running customer-business threads, fetching hundreds or thousands of messages on every thread open will degrade memory and cause frame rate stutter on low-end devices. |
| **C9** | Hardcoded `#fff` Tokens Breaking Dark Mode in Chat Screens | 🟢 P3 (Theme & Visual Polish) | Hardcoded `#fff` in `ConversationList.tsx:131, 152` and `ChatThread.tsx:218, 266, 283` breaks dark mode styling, causing blinding white banners and input bars on dark screens. |

---

## Detailed Gap Analyses

---

### #C1 — Zero Push Notifications or In-App Notifications for Incoming Chat Messages

**Area:** `src/services/engagement/chatService.ts:189-210`, `supabase/migrations/20260731_push_on_every_notification.sql`  
**Severity:** 🔴 P0 (Communication Void & Core Functional Failure)

**Root cause:**
1. In `chatService.ts:189-210`:
   ```ts
   async send(conversationId: string, body: string, conv: Conversation, imageUrl?: string): Promise<Message> {
     const sb = getSupabase();
     const uid = await currentUserId();
     if (!uid) throw new Error("Not authenticated");

     const { data: msg, error: msgErr } = await sb
       .from("messages")
       .insert({ conversation_id: conversationId, sender_id: uid, body, image_url: imageUrl ?? null })
       .select()
       .maybeSingle();
     throwIfError(msgErr);

     // Update conversation: preview, timestamp, other side's unread flag.
     const isA = uid === conv.participantA;
     await sb.from("conversations").update({
       last_message_at: new Date().toISOString(),
       last_message_preview: imageUrl ? "📷 Photo" : body.slice(0, 80),
       ...(isA ? { has_unread_b: true, has_unread_a: false } : { has_unread_a: true, has_unread_b: false }),
     }).eq("id", conversationId);

     return toCamel<Message>(msg);
   }
   ```
2. The `send()` function writes a row to `public.messages` and updates `public.conversations`. It does **not** insert into `public.notifications`.
3. Across the entire Supabase migrations directory, there is **zero trigger on `public.messages`** that inserts a row into `public.notifications`.
4. In STRYT's notification architecture, push notifications (FCM / Web Push / Expo) are dispatched exclusively through the trigger defined in `20260731_push_on_every_notification.sql`:
   ```sql
   CREATE TRIGGER tr_push_on_notification
   AFTER INSERT ON public.notifications
   FOR EACH ROW EXECUTE FUNCTION public.push_dispatch();
   ```
5. Consequently, when a customer messages a bakery, tailor, or tutor, or when a merchant replies to an inquiry, **zero push notifications and zero in-app notifications are ever created for the recipient**.
6. If the recipient does not actively have STRYT open in the foreground, they will never know they received a message until days later when they happen to launch the app. This cripples customer-to-merchant communications.

**Remediation Plan:**
1. Create a database trigger `tg_notify_on_chat_message` on `public.messages`:
   - Identify the other participant (`recipient_id`) from `public.conversations`.
   - Check `public.is_blocked_between(NEW.sender_id, recipient_id)` to ensure no notification is sent if blocked.
   - Insert a row into `public.notifications`:
     - `user_id = recipient_id`
     - `type = 'CHAT'`
     - `title = sender_name`
     - `body = COALESCE(NEW.body, 'Sent a photo')`
     - `deep_link = '/chat/' || NEW.conversation_id`
2. Ensure database-level trigger updates `last_message_at`, `last_message_preview`, and `has_unread_[a|b]` atomically on `messages` insert, preventing client-side dropped updates.

---

### #C2 — Missing Safety & Moderation: Zero In-App User Blocking or Reporting in Chat Controls

**Area:** `src/screens/chat/ChatThread.tsx:143-169`, `supabase/migrations/20260811_chat_rls.sql`, `supabase/migrations/20260892_community_comment_policy.sql`  
**Severity:** 🔴 P0 (Google Play Store Policy Violation Blocker)

**Root cause:**
1. **Google Play Store Requirement:**  
   Google Play Developer Policy regarding User Generated Content (UGC) and direct messaging states:
   > *"Apps that contain or feature UGC must provide an in-app mechanism for blocking users, reporting objectionable content or abusive users, and an effective moderation system."*
2. In `ChatThread.tsx:143-169`, the header consists only of:
   ```tsx
   <header className="appbar">
     <button className="icon-btn" onClick={() => nav(-1)}><ArrowLeft size={20} /></button>
     <button className="row gap-8 grow" onClick={() => other && nav(`/u/${other.id}`)}>
       <SafeImg src={other?.avatar} variant="avatar" ... />
       <div>{other?.name ?? "Chat"}</div>
     </button>
     {other && (
       <button className="icon-btn" onClick={() => nav(`/u/${other.id}`)}><Phone size={18} /></button>
     )}
   </header>
   ```
   There is **no 3-dots overflow menu (`...`)**, **no Report action**, **no Block action**, and **no Clear/Delete thread action**.
3. While `src/components/ReportSheet.tsx` exists and accepts `targetType="USER"`, it is **never imported or rendered** in `ChatThread.tsx`.
4. While `public.user_blocks` exists in `20260892_community_comment_policy.sql`, the RLS policy for inserting messages (`20260811_chat_rls.sql:59-70`) does **not** check `user_blocks`:
   ```sql
   create policy insert_own_messages on public.messages
     for insert with check (
       auth.role() = 'authenticated'
       and sender_id = auth.uid()::text
       and exists (
         select 1 from public.conversations c
         where c.id = conversation_id
           and (c.participant_a = auth.uid()::text or c.participant_b = auth.uid()::text)
       )
     );
   ```
   Even if a user was blocked in community posts, the blocked person can continue sending messages in 1:1 chat without restriction.

**Remediation Plan:**
1. Add an overflow menu button (`MoreVertical`) in `ChatThread.tsx` header with:
   - "Report User" -> opens `<ReportSheet targetType="USER" targetId={other.id} name={other.name} />`.
   - "Block User" -> calls `socialService.blockUser(other.id)`.
2. In `ChatThread.tsx`, if the other user is blocked, disable the input bar and display: `"You have blocked this user. Unblock to send messages."`
3. Update `insert_own_messages` RLS policy in PostgreSQL to reject inserts if `public.is_blocked_between(sender_id, other_id)` returns true.

---

### #C3 — In-Thread Incoming Messages Leave Inbox Badge Stuck as "Unread"

**Area:** `src/screens/chat/ChatThread.tsx:48-84`, `src/services/engagement/chatService.ts:213-222`  
**Severity:** 🟠 P1 (Broken State Sync & Badge Inaccuracy)

**Root cause:**
1. In `ChatThread.tsx:48-84`:
   ```tsx
   useEffect(() => {
     if (!conv) return;
     chatService.markRead(id, conv).then(() => {
       const scope = inboxScopeFor(conv, user.id);
       if (scope.scope === "CUSTOMER") {
         chatService.totalUnread({ scope: "CUSTOMER" }).then(setChatUnread);
       }
       refetchConvs();
     });
     const unsub = chatService.subscribe(id, (msg) => {
       setMessages((prev) => {
         if (prev.some((m) => m.id === msg.id)) return prev;
         return [...prev, msg];
       });
     });
     ...
   }, [id, conv, user.id, setChatUnread]);
   ```
2. `chatService.markRead(id, conv)` is called **only once**, when the component initially mounts.
3. While the user has the chat open and active:
   - The other participant sends a new message.
   - The other participant's `chatService.send()` updates `public.conversations` with `has_unread_[a|b] = true`.
   - The message arrives via `chatService.subscribe()` and appends to `messages`.
   - But `ChatThread.tsx` **never calls `chatService.markRead()` on incoming messages**!
4. The user reads the message, replies, and exits the chat.
5. In `ConversationList.tsx` and in the bottom navigation bar (`chatUnread`), the conversation still has `has_unread = true`! The user sees an unread badge for a message they literally just read and replied to.
6. The user has to tap into the thread a second time just to clear the ghost badge.

**Remediation Plan:**
1. In `ChatThread.tsx`, inside `chatService.subscribe(id, (msg) => { ... })`:
   - If `msg.senderId !== user.id` and document is focused (`document.hasFocus()`), immediately call `chatService.markRead(id, conv)` to keep read receipts and unread flags in sync.
2. Add a `window.addEventListener('focus', ...)` listener to re-invoke `markRead` when the user switches back to the STRYT tab/app with the thread open.

---

### #C4 — Mobile Keyboard Clashing, Safe-Area Blindspot & Input Expansion Occlusion

**Area:** `src/screens/chat/ChatThread.tsx:171-181, 260-273, 313-320`  
**Severity:** 🟠 P1 (Mobile Layout & Touch Usability Hazard)

**Root cause:**
1. **Missing Safe-Area Padding:**
   In `ChatThread.tsx:260-273`:
   ```tsx
   <div
     style={{
       position: "absolute",
       bottom: 0,
       left: 0,
       right: 0,
       background: "#fff",
       borderTop: "1px solid var(--line)",
       padding: "10px 12px",
       ...
     }}
   >
   ```
   There is no `paddingBottom: "calc(10px + var(--safe-area-bottom))"`. On devices with gesture navigation bars (e.g. Android 10+ and iPhone X+), the system navigation pill directly overlaps the input box, file attachment button, and Send button.
2. **Dynamic Height Occlusion:**
   The messages container at line 179 has a fixed, hardcoded:
   ```tsx
   paddingBottom: 80,
   ```
   When the user types a longer message (2–4 lines), the textarea auto-expands at line 318 (`e.target.style.height = e.target.scrollHeight + "px"`), increasing the input container height to 120–150px.
   Because `paddingBottom: 80` is static, the expanded input bar sits directly on top of the bottommost message bubbles, hiding what the other person just sent.

**Remediation Plan:**
1. Replace `position: "absolute"` with a flex-based layout:
   - `<div className="screen" style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>`
   - Messages container: `style={{ flex: 1, minHeight: 0, overflowY: "auto" }}`
   - Input container: `style={{ flexShrink: 0, paddingBottom: "calc(10px + var(--safe-area-bottom))" }}`
2. Using flex layout with `100dvh` natively adapts when the virtual keyboard pops up and when the textarea grows, completely eliminating bottom padding mismatches and keyboard occlusion.

---

### #C5 — Header Phone Icon Misleadingly Navigates to User Profile Instead of Calling

**Area:** `src/screens/chat/ChatThread.tsx:163-168`, `src/services/engagement/chatService.ts:12-23`  
**Severity:** 🟠 P1 (Deceptive Mobile Affordance & Routing Defect)

**Root cause:**
1. In `ChatThread.tsx:163-168`:
   ```tsx
   {other && (
     <button className="icon-btn" onClick={() => nav(`/u/${other.id}`)} aria-label="View profile & contact">
       <Phone size={18} />
     </button>
   )}
   ```
2. A button displaying a phone receiver icon (`<Phone />`) standardly initiates a telephone call (`tel:`) or opens a dialer action sheet. In `ChatThread`, it navigates to `/u/:id`.
3. In business/provider inquiries, `conv.subjectId` references the business (e.g., `biz_abc`), but `other.id` is the owner's personal account ID (`usr_xyz`). Navigating to `/u/usr_xyz` shows the owner's private or personal profile rather than the business storefront (`/business/biz_abc`) where the store hours, catalog, and actual business phone number reside!
4. Furthermore, there is no subject context pill or banner inside the chat thread. If an owner operates two businesses or receives an inquiry about a specific listing, neither party can see which listing or request is being discussed.

**Remediation Plan:**
1. If the other party has a phone number, make the `<Phone />` button trigger `window.location.href = 'tel:' + phone` (with confirmation modal).
2. If `conv.subjectType === "business"` or `"provider"`, render a pinned context header banner (e.g., `"Chatting about Kaveri Bakery"`) linking directly to the business/provider storefront (`/business/${conv.subjectId}`).

---

### #C6 — Missing Optimistic Messaging & Silent Send Failures on Slow Networks

**Area:** `src/screens/chat/ChatThread.tsx:112-131`  
**Severity:** 🟡 P2 (Latency Perception & Error Feedback Void)

**Root cause:**
1. In `ChatThread.tsx:112-131`:
   ```tsx
   async function send() {
     if ((!body.trim() && !pendingImage) || !conv) return;
     setSending(true);
     const text = body.trim();
     const image = pendingImage ?? undefined;
     setBody("");
     setPendingImage(null);
     try {
       const msg = await chatService.send(id, text, conv, image);
       setMessages((prev) => {
         if (prev.some((m) => m.id === msg.id)) return prev;
         return [...prev, msg];
       });
     } catch {
       setBody(text); // restore on failure
       setPendingImage(image ?? null);
     } finally {
       setSending(false);
     }
   }
   ```
2. When the user taps Send, the text input clears immediately, but the message does **not** appear in the thread until `chatService.send()` returns from the server.
3. On patchy mobile 3G/4G networks, the app appears completely unresponsive for 1–3 seconds with an empty input and no outgoing bubble.
4. If sending fails (e.g., offline or network error), the `catch` block restores `setBody(text)`, but does **not** call `showToast()` or display an error message. The user does not know why their message was not sent.

**Remediation Plan:**
1. Append an optimistic message with a temporary ID (`tmp_${Date.now()}`) and status `'sending'`.
2. If `send()` fails, mark the optimistic bubble as `'failed'` with a tap-to-retry action, and display `showToast("Failed to send message. Tap to retry.")`.

---

### #C7 — Broken App Containment: External `window.open` for Image Attachments

**Area:** `src/screens/chat/ChatThread.tsx:203-210`  
**Severity:** 🟡 P2 (Mobile App Containment & Popup Blocker Trap)

**Root cause:**
1. In `ChatThread.tsx:203-210`:
   ```tsx
   {msg.imageUrl && (
     <img
       src={msg.imageUrl}
       alt=""
       style={{ maxWidth: "60%", borderRadius: 14, marginBottom: msg.body ? 4 : 0, cursor: "pointer" }}
       onClick={() => window.open(msg.imageUrl!, "_blank")}
     />
   )}
   ```
2. In PWA/TWA and Android WebView environments, `window.open(..., "_blank")` triggers popup blocking or launches an external web browser, ejecting the user from the application.
3. STRYT already includes an in-app photo lightbox (`src/components/PhotoViewer.tsx`) used across `Profile.tsx`, `BusinessDetail.tsx`, `ProviderDetail.tsx`, and `CommunityPostDetail.tsx`.

**Remediation Plan:**
1. Import and render `<PhotoViewer photos={[{ url: activeImage }]} startIndex={0} onClose={() => setActiveImage(null)} />` when an image attachment is tapped.

---

### #C8 — Unbounded Message Query Lacks Cursor Pagination

**Area:** `src/services/engagement/chatService.ts:177-186`  
**Severity:** 🟡 P2 (Performance & Memory Degradation)

**Root cause:**
1. In `chatService.ts:177-186`:
   ```ts
   async messages(conversationId: string): Promise<Message[]> {
     const sb = getSupabase();
     const { data, error } = await sb
       .from("messages")
       .select("*")
       .eq("conversation_id", conversationId)
       .order("created_at", { ascending: true });
     throwIfError(error);
     return toCamel<Message[]>(data ?? []);
   }
   ```
2. There is no `limit` clause and no cursor pagination.
3. Over time, active conversations between frequent buyers and local sellers accumulate hundreds or thousands of messages. Fetching and rendering every historical message degrades device memory and causes scroll hitching on mobile devices.

**Remediation Plan:**
1. Add pagination support to `chatService.messages(conversationId, { limit = 50, before?: string })`.
2. In `ChatThread.tsx`, render a "Load older messages" button or trigger reverse infinite scrolling when reaching the top.

---

### #C9 — Hardcoded `#fff` Tokens Breaking Dark Mode in Chat Screens

**Area:** `src/screens/chat/ConversationList.tsx:131, 152`, `src/screens/chat/ChatThread.tsx:218, 266, 283`  
**Severity:** 🟢 P3 (Theme & Visual Polish)

**Root cause:**
1. In `ConversationList.tsx:131`: `background: unread ? "var(--brand-50)" : "#fff"`. In dark mode, every read conversation row is painted bright white.
2. In `ConversationList.tsx:152`: `border: "2px solid #fff"` on avatar badge.
3. In `ChatThread.tsx:266`: `background: "#fff"` on the bottom input container.
4. In `ChatThread.tsx:283`: `border: "2px solid #fff"` on image delete tag.

**Remediation Plan:**
1. Replace `#fff` with `var(--surface)` or `var(--card)`.
2. Replace unread highlight with `var(--brand-50)` / `var(--brand-900)` in dark mode.
