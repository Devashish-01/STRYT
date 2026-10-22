# STRYT — UX Flaw Report
Full audit: what the user cannot see but should, per function/workflow/variable. Grounded in code (file:line verified), not guesses. Severity: 🔴 blocks trust/task · 🟠 friction · 🟡 polish.

---

## 1. LOCATION (root-cause section)

### Why fetching was slower than Google
| # | Root cause | File | Status |
|---|-----------|------|--------|
| 1 | Every call forced a **cold high-accuracy GPS-chip fix** (`enableHighAccuracy:true, maximumAge:0`). Indoors that needs 10–30s. Google apps use the fused provider + accept a cached last-known fix (instant), then refine. | `nativeGeolocation.ts` | ✅ FIXED — two-phase: fast fused/cached fix (3s budget, ≤30s-old cache) → high-accuracy fallback (≥12s budget) |
| 2 | Timeouts (5s map / 8s sheets) were **shorter than a cold GPS lock** → the fix aborted right before succeeding. | `MapControllers.tsx:69`, `LocationPickerSheet.tsx` | ✅ FIXED — phase-2 budget ≥12s |
| 3 | After the fix, UI waits serially for reverseGeocode (Mapbox) + DB write + refreshUser (3 network round-trips) before showing anything. | `LocationPickerSheet.handleGPS` | 🟠 Open — could show coords instantly, resolve name async |

### Why "relocate" didn't change the location
| # | Root cause | File | Status |
|---|-----------|------|--------|
| 1 | **GPS timeout → silently kept the old saved location.** Recenter button's error path re-centres on the stale coords with only a soft toast. Every re-tap repeated the same too-short attempt → same timeout → nothing ever changed. | `MapControllers.tsx:65-68` | ✅ FIXED at wrapper level (fix now succeeds); error paths still recentre-old by design |
| 2 | **Lying success toast**: `setLocation` DB failure was swallowed (`catch ignore`) but "Location set ✓" shown anyway. Feeds read `user.lat` from the DB → old location persisted despite the ✓. | `LocationPickerSheet.tsx:46-57` | ✅ FIXED — honest error toast, success only after DB write |
| 3 | Permission denied surfaced as generic "GPS access denied" with no path to fix; retry can never work once OS-denied. | same | ✅ FIXED — explicit "enable in phone settings" message; denial skips futile retry |
| 4 | `autoRefreshLocation` runs **once per session** (`loc_synced` flag) and skips moves <250 m — user travelling mid-session never gets re-synced. | `store.tsx:293-324` | 🟠 Open — deliberate battery trade-off; add manual refresh in Settings if needed |
| 5 | No GPS & no saved location → map silently falls back to `config.defaultLocation` (wrong city, unexplained). | `MapControllers.tsx:33-34` | 🟡 Open — should badge "approximate/default location" |

---

## 2. WHAT THE APP NEEDS BEYOND OTP LOGIN (auth/session UX)
| Need | Why user-visible | Sev |
|------|------------------|-----|
| Session-expiry handling | 401 mid-action currently = silent failures/toasts; needs "signed out, tap to re-login" interstitial preserving the screen they were on (`returnTo` exists, reuse it) | 🔴 |
| Account recovery path | Phone lost / email changed → no self-serve recovery; only Support screen | 🟠 |
| Logout confirmation + device clarity | Logout is instant; no "are you sure", no session list | 🟡 |
| Delete-account flow visibility | Deletion-pending screen exists; entry point buried in Settings | 🟡 |
| Rate-limit feedback | OTP resend spam → Supabase 429 shows raw error text; should show cool-down timer | 🟠 |
| SMS autofill | OTP boxes: `one-time-code` only on box 1; Android may fill only first digit (paste path works) | 🟡 |
| Biometric re-entry (native) | Standard for local apps handling payments/PII | 🟡 backlog |

---

## 3. INVISIBLE STATE — things happening that the user can't see
| Flow | What's hidden | Should see | Sev |
|------|--------------|-----------|-----|
| Any data fetch fails | Generic toast "Couldn't load — check connection" (global, `useApi.ts`), screen may keep skeleton forever | Inline retry button per section (ErrorView exists but not used on every screen) | 🟠 |
| Offline | No global offline banner; only 5 screens check `navigator.onLine`; PWA precaches shell but data calls just fail | Global "You're offline" pill + queued-action hint | 🔴 |
| Push notification tap (native) | `pushNotifications.ts:50` does `window.location.href = data.url` → **full app reload**, splash again, state lost | SPA `nav()` via a deep-link handler | 🟠 |
| Request expiry | Requests auto-expire (3–24h) but an open RequestDetail shows no countdown; poster isn't warned before expiry | "Expires in 2h" chip + pre-expiry nudge notification | 🟠 |
| Proposal state changes | Responder isn't shown "seen/viewed" state; only ACCEPTED/REJECTED after the fact | "Viewed by requester" tick | 🟡 |
| Agreement auto-cancel | `cancel_expired_agreements` runs silently server-side; both parties just find it CANCELLED | Notification + reason line in AgreementScreen | 🟠 |
| Queue while app closed | Called in queue → only in-app realtime; if FCM not delivered/enabled the turn is missed | SMS/push fallback + "you were called at 4:31" history state | 🟠 |
| Appointment pending too long | Customer sees PENDING forever if owner ignores; no auto-expire or "no response" state | Auto-flag after N hrs + suggest alternatives | 🟠 |
| Payment/escrow status | `payments.escrow_status` (HELD/RELEASED) never rendered to customer | Escrow badge on agreement + payment history rows | 🔴 (money = trust) |
| Boost expiry | Owner buys 7-day boost; no countdown or expiry notice anywhere in console | "Boost active — 3d left" chip on dashboard | 🟡 |
| Verification review status | After doc upload: status UNDER_REVIEW visible only if user revisits the (now unlinked) verify screen | Push/inbox notice on approve/reject; dashboards no longer link verify at all — dead-ends the flow | 🟠 |
| Report outcomes | User files report (ReportSheet) → never hears back | "Report received/actioned" notification | 🟡 |
| Catalog stock flip | Owner toggles OUT_OF_STOCK; customers with item in cart get no signal until checkout attempt | Cart revalidation notice | 🟡 |

---

## 4. FEEDBACK GAPS — actions with no/false confirmation
| Action | Flaw | Sev |
|--------|------|-----|
| Save actions app-wide | Success toasts sometimes fire before DB write resolves (pattern found in LocationPickerSheet — fixed; audit remaining `showToast` before `await` orderings) | 🟠 |
| Follow/notify/bookmark | Optimistic with revert (good) but no revert *explanation* when it fails silently offline | 🟡 |
| Chat send | Restores text on failure (good) but no per-message "failed, tap to retry" bubble state | 🟠 |
| Proposal submit | Button spinner only; no post-submit "what happens next" screen — new users re-submit duplicates | 🟠 |
| Walk-in add / queue serve | Toast only; list reorders without animation — owner loses visual position tracking under load | 🟡 |
| Photo uploads | Single progress state "Uploading…" for multi-file batches; no per-file progress/failure isolation | 🟡 |

---

## 5. EMPTY / EDGE STATES
| Screen | Gap | Sev |
|--------|-----|-----|
| Home rails | Empty rails collapse silently — new city user sees a near-blank home with no "be the first / invite" CTA | 🟠 |
| Search | No recent-searches or popular fallback on empty query; zero-results gives no category suggestions | 🟡 |
| Map | Zero pins in radius → just an empty map; needs "widen radius" prompt (radius chip exists but unprompted) | 🟠 |
| Chat list | Empty state exists; but blocked/deleted counterpart conversations still render and dead-end | 🟠 |
| Reviews | Business with 0 reviews shows bare "Reviews" tab; no "first review" incentive copy | 🟡 |
| Filters | Explore/CategoryListing: active filters not shown as removable chips; user forgets why list is empty | 🟠 |
| Long lists | No pagination UI on community/requests feeds beyond cursor internals — infinite scroll not wired on all lists (some cap at 30 silently) | 🟠 |

---

## 6. WORKFLOW DEAD-ENDS / LOOPS
| Flow | Flaw | Sev |
|------|------|-----|
| Verify tiles removed (by request) | Routes alive but **no entry point** — sellers can never start verification; either re-add under Settings or hide status chips that reference it | 🔴 contradiction |
| Onboard skip | `onboarding_skipped` localStorage → new device re-prompts; fine — but user who skipped has no later "complete profile" nudge with benefit framing | 🟡 |
| Business under review | Status "Under Review" badge on dashboard, but no explanation of criteria/ETA | 🟡 |
| Agreement dispute | DISPUTED status set; customer sees no next step (admin contact/timeline) | 🟠 |
| Rebook cancelled appointment | MyAppointments rebook exists (good); but cancelled-by-owner reason not always propagated to customer card | 🟡 |
| Deep link while logged out | `returnTo` preserved (good); but post-login new-user onboarding chain can consume the deep link — verify order onboard→returnTo | 🟡 verify |

---

## 7. VARIABLES / DATA the user should see but doesn't
| Variable | Where it exists | Where it should surface |
|----------|-----------------|------------------------|
| `distanceKm` | computed on all cards | Missing on AppointmentSheet + WalkInModal package picker context |
| `expiresAt` | requests table | RequestCard + RequestDetail countdown |
| `escrow_status` | payments | AgreementScreen + payment rows |
| `is_boosted / boosted_until` | businesses | Owner dashboard chip; customer-side "Promoted" label (transparency) |
| `avg_service_min` | queue_settings | Customer join-queue sheet ("~8 min/person") — shown after join (MyQueues, added), not **before** joining |
| `responseTime` | providers | Shown on detail; missing on discovery cards where choice happens |
| `cancelledBy + note` | appointments | Customer card shows note only in some states |
| `sub_category` (new) | requests | RequestCard chip so responders see specificity |
| `radiusKm` of a request | requests | Poster's own card ("visible within 3 km") for confidence |
| Rating breakdown | ratings | Only avg+count; no star histogram on detail pages |

---

## 8. PERFORMANCE-FELT-AS-UX
| Issue | Evidence | Sev |
|-------|----------|-----|
| Main bundle ~513 kB gz 150 kB | build warning | 🟠 mid-range Android first-load |
| QrScannerSheet 344 kB lazy chunk loads on Profile open path — verify it's gated behind tap | build output | 🟡 |
| Feeds refetch on every lat/lng jitter (`[user.lat, user.lng]` deps) — GPS drift re-runs queries | Home/Hub queries | 🟡 debounce coords |
| Serial `await` chains in detail screens (queue→qna→reviews already parallel via hooks; AgreementScreen has serial RPC pair each open) | `cancel_expired_agreements` + `close_expired_requests` run on EVERY feed/get call — 2 extra RPCs per screen | 🟠 move to cron/edge schedule |
| No image `loading="lazy"`/size hints on card thumbs → jank on long feeds | cards.tsx | 🟡 |

---

## 9. PLATFORM/NATIVE UX
| Issue | Sev |
|-------|-----|
| No haptics anywhere (grep: zero) — taps/success/error feel flat vs native apps | 🟡 |
| Keyboard: resize native set; verify sheets with bottom inputs (ChatThread absolute-positioned input) aren't covered on small devices | 🟠 test |
| Android back on sheets/overlays closes the whole screen (history-based), not the sheet first | 🟠 |
| Status-bar contrast set globally purple; light screens (auth) may want dark icons per-screen | 🟡 |
| App shortcuts / share-target not configured (long-press icon → "Post request") | 🟡 backlog |

---

## 10. TRUST & TRANSPARENCY
| Gap | Sev |
|-----|-----|
| "Promoted/Boosted" results are not labeled in discovery — users can't tell paid placement | 🔴 (also policy risk) |
| Anonymous request: poster identity hidden, but avatar sometimes still the real one in proposals join — audit `is_anonymous` propagation on every requester render | 🔴 verify |
| Phone shared in community comment marked "shared with you" — but PUBLIC visibility rows render identically; distinction unclear | 🟡 |
| Review authenticity: no "verified booking" tag on ratings tied to completed agreements/appointments (data exists to derive) | 🟠 |
| Data-safety: Settings lacks "download my data" (deletion exists) | 🟡 |

---

## Priority queue (do in order)
1. 🔴 Offline banner + per-screen retry (§3)
2. 🔴 Escrow/payment status surfacing (§3/§7)
3. 🔴 Promoted-label transparency + anonymous-propagation audit (§10)
4. 🔴 Verification entry point restore-or-remove decision (§6)
5. 🟠 Session-expiry interstitial (§2)
6. 🟠 Request expiry countdown + agreement auto-cancel notices (§3)
7. 🟠 Push deep-link SPA nav (§3)
8. 🟠 Feed RPC diet: move expiry sweeps to schedule (§8)
9. 🟠 Back-button closes sheet-first (§9)
10. 🟡 Haptics + histogram + chips polish batch

*Location root causes: fixed this pass (see §1 status column). Everything else: report-only, no code touched.*
