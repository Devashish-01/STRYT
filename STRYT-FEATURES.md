# Stryt — Feature & Functionality Overview

**Date of analysis:** 2026-07-18
**Note:** Auto-generated from codebase analysis — verify with product team before external use.

---

## 1. Product Summary

STRYT is a hyperlocal community and marketplace app built for a single neighborhood at a time. On one side, customers browse nearby shops and independent service providers, post open "asks" for things they need and get quotes back, book appointments, join walk-in queues remotely, and keep up with a local social feed — all radius-limited to what's actually near them. On the other side, the same person can also list and run their own shop, or offer their services as an independent provider, from a dedicated management console, without needing a separate account. Every payment in the app is settled directly between the two people via UPI or cash — Stryt never touches the money itself, it just tracks who claimed to have paid and lets the other side confirm it. The app is built for India first (₹ pricing, UPI payments, Hindi/Marathi/English), ships as both a website and a native Android app, and is explicitly designed around trust between real neighbors — real names are private by default, verification badges are only ever granted by a human reviewer, and location history is never stored, only the last known spot.

---

## 2. User Roles

- **Guest (signed out)** — Can browse everything within 1 km of their device: shop and provider profiles, requests, and the community feed. Every action that requires an account (booking, messaging, following, joining a queue, posting) shows a single "sign in to continue" prompt instead of a broken button.
- **Customer** — The default role every signed-in person has. Can browse without a distance limit, book appointments, post requests and accept quotes, join queues, chat, follow people/shops, save favorites, post to the community feed, and manage their own privacy settings.
- **Business Owner** — A customer who has also listed a shop/outlet. Gets a separate management console to run that listing: catalog, hours, live queue, bookings, payments, staff access, and more. A person can own more than one business.
- **Provider** — A customer who has also set up an independent-service profile (e.g. a plumber, tutor, or freelancer working solo, not a shop). Gets a leaner management console covering their own bookings, services, earnings, and availability. A person can hold exactly one provider profile.
- **Admin / Super Admin** — Internal Stryt staff, signed in through a completely separate admin login. Reviews new listings, approves verification badges, resolves disputes and reports, and can suspend or delete accounts. Super Admin is a stricter tier required specifically for deleting a customer account.

Business Owner and Provider are not separate logins — one person can be a Customer, run a shop, *and* offer services independently, all from the same account, switching between these "hats" from their profile.

---

## 3. Core Modules & Features

### Module: Getting Started

#### Sign In with Google
- **What it does:** New and returning users tap one "Continue with Google" button to create or access their account — no separate password to remember.
- **Where it lives:** The very first screen after the welcome splash.
- **Who can use it:** Everyone, on both the website and the native Android app.
- **Why it matters:** Removes the biggest friction point in signing up — one tap and you're in.

#### Look Around First (Guest Browsing)
- **What it does:** A visitor can explore the app without creating an account at all — shops, providers, requests, and the community feed are all visible, capped to what's within 1 km.
- **Where it lives:** A "Look around first" option on the welcome screen.
- **Who can use it:** Anyone, before signing in.
- **Why it matters:** Lets someone see real value in their own neighborhood before being asked to commit to an account.

#### First-Time Profile Setup
- **What it does:** After signing in for the first time, a short setup walks the new user through their name, neighborhood, a profile photo (or one of 10 emoji avatars), phone number, preferred language, and how far they'd like alerts/discovery to reach. A "Skip for now" option is always available.
- **Where it lives:** Immediately after first sign-in.
- **Who can use it:** New accounts.
- **Why it matters:** Gets a person to a useful, personalized home screen as fast as possible.

#### One-Time Location Permission
- **What it does:** Asks once for location access so the app can show what's actually nearby; if declined, it's not asked again and the app is upfront that results will be less relevant without it.
- **Where it lives:** Right after profile setup, only if no location is saved yet.
- **Who can use it:** New users.
- **Why it matters:** Location is the entire premise of the app — this gets it set up with minimal friction while being honest about the trade-off if skipped.

---

### Module: Discovering What's Nearby

#### Home Dashboard
- **What it does:** A personalized landing screen: a live weather-and-time-of-day themed header, a "Your day" strip showing any active queue position, upcoming appointment, or in-progress deal, a stories bar, category shortcuts, a "Need something? Ask your street" button, and rails of nearby shops and providers.
- **Where it lives:** The Home tab.
- **Who can use it:** Everyone, including guests (view-only version).
- **Why it matters:** One screen that always shows "what's relevant to me, right now" instead of a generic feed.

#### Explore
- **What it does:** Browse every shop ("Shops") and independent provider ("Helpers") near you, filterable by category and adjustable search radius.
- **Where it lives:** The Explore tab.
- **Who can use it:** Everyone, including guests (capped to 1 km).
- **Why it matters:** The main "show me everything nearby" browsing screen.

#### Search
- **What it does:** Type-ahead search across shops, providers, and categories; keeps a list of recent searches; suggests trending nearby searches.
- **Where it lives:** Search icon on Home/Explore.
- **Who can use it:** Everyone.
- **Why it matters:** Fast way to find something specific instead of browsing.

#### Saved Search Alerts
- **What it does:** Save any search term (e.g. "electrician") as an alert — Stryt notifies you the moment a matching new listing joins nearby.
- **Where it lives:** Search screen, bell icon.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Lets someone stop actively searching and instead be told the moment what they need becomes available.

#### Category Browsing
- **What it does:** A full grid of every category (with live counts of nearby shops and providers in each), plus a dedicated listing screen for any category with subcategory filters.
- **Where it lives:** "All categories" and individual category pages.
- **Who can use it:** Everyone.
- **Why it matters:** A structured way to browse when you know the type of help you need but not a specific name.

#### Interactive Map
- **What it does:** A live map showing shops, providers, open requests, and stories as pins, with toggleable layers, a search radius ring, and an "⚡ Available now" filter. Supports dropping a pin to set your location manually, long-press-to-set-location, and a special "World" mode that removes the distance filter entirely and shows the newest listings globally.
- **Where it lives:** The Map tab.
- **Who can use it:** Everyone, including guests (capped to 1 km, radius controls hidden).
- **Why it matters:** A visual, spatial way to browse that a list view can't offer.

#### Nearby Sheet
- **What it does:** A floating "X places within Y km" button on the map opens a tabbed list (Shops / Providers / Stories / Requests) of the same results without leaving the map.
- **Where it lives:** Map screen.
- **Who can use it:** Everyone.
- **Why it matters:** Combines the map's visual browsing with a scannable list, without a screen change.

---

### Module: Business & Provider Profile Pages

#### Shop Profile Page
- **What it does:** A shop's full public page — photos, hours, live open/closed status, tags, reviews with a rating breakdown, a Q&A section customers can ask questions on, a menu/catalog with an add-to-cart option, past-work photos, community posts, and one-tap Call/Directions/Message/Follow.
- **Where it lives:** Tap any shop card anywhere in the app.
- **Who can use it:** Everyone can view (Call and Directions work even for guests); booking, messaging, following, reviewing, and asking questions require signing in.
- **Why it matters:** Everything a customer needs to decide whether to visit or book, in one place.

#### Provider Profile Page
- **What it does:** A provider's full public page — bio, skills, service area, pricing, portfolio of past work, reviews, Vouches and skill Endorsements from neighbors, availability, and one-tap Call/Message/Book.
- **Where it lives:** Tap any provider card anywhere in the app.
- **Who can use it:** Everyone can view; booking, messaging, vouching, and endorsing require signing in.
- **Why it matters:** Builds trust in an independent worker the way a shop's storefront and reviews build trust in a business.

#### Save, Follow & Share a Listing
- **What it does:** Bookmark a shop or provider for later, follow them for updates, save them into a custom personal list, or share a card with their rating/QR code.
- **Where it lives:** Icons on every shop/provider profile and card.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Lets people build their own shortlist of trusted local favorites.

#### Report a Listing
- **What it does:** Flag a shop, provider, or request as spam, a scam, offensive, miscategorized, or fake, with an optional note — reports are anonymous and go to the moderation team.
- **Where it lives:** Every profile and request detail page.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Keeps the marketplace trustworthy by giving neighbors a way to flag bad actors.

---

### Module: Asking the Neighborhood ("Requests")

#### Post a Request
- **What it does:** Describe what you need — with optional quick-start templates (e.g. Birthday cake, Plumber, AC service, Daily tiffin) that pre-fill smart fields, voice-to-text dictation, up to 4 photos, a budget range (fixed or hourly), a preferred date/time, an auto-expiry (up to 24 hours), how far around you it should be shown, and options to mark it urgent, recurring, or post anonymously.
- **Where it lives:** The "Need something? Ask your street" button on Home, or the Requests tab.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Turns "I need someone to fix my tap" into a post that gets real, local quotes back — instead of a generic online search.

#### Browse & Respond to Requests
- **What it does:** Nearby shops, providers, and other customers can see open requests filtered by category, urgency, or group-buy, and send back a priced quote with a pitch and timing.
- **Where it lives:** The Requests feed.
- **Who can use it:** Any signed-in user can browse; sending a quote works the same whether responding as yourself, your business, or your provider profile.
- **Why it matters:** Turns the request into a live, competitive marketplace of real local offers.

#### Negotiate a Quote
- **What it does:** The person who posted the request can counter-offer a proposal's price, message the responder directly, or accept a quote outright — with the full back-and-forth negotiation history visible to both sides.
- **Where it lives:** Request detail page.
- **Who can use it:** The requester and whoever sent that specific quote.
- **Why it matters:** Real price discussions happen before any commitment, not after.

#### "Prioritize My Offer" (Free Boost)
- **What it does:** A responder can pin their quote to the top of the requester's list at no cost.
- **Where it lives:** Submit-a-quote screen.
- **Who can use it:** Anyone responding to a request.
- **Why it matters:** Gives sellers a simple, free way to stand out on a competitive request.

#### Group Buy Requests
- **What it does:** A request can be marked as a group buy; other interested customers tap "me too" to join, shown as a progress bar toward unlocking bulk pricing. A responder can broadcast one quote to everyone who joined at once.
- **Where it lives:** Request cards and detail pages.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Lets neighbors pool demand for better group pricing without organizing it themselves.

---

### Module: Deals & Agreements

#### Accepting a Quote Creates a Deal
- **What it does:** When a requester accepts a quote, it becomes a tracked "Deal" (technically an Agreement) between exactly those two people, with a 10-minute window for both sides to confirm before it expires.
- **Where it lives:** Automatic, from the Request detail page.
- **Who can use it:** The two people involved.
- **Why it matters:** Turns a casual quote into a committed, trackable arrangement both sides agreed to.

#### Deal Progress Tracker
- **What it does:** A visual 5-stage progress bar (Confirmed → Deposit → In progress → Review → Done) plus a plain-language "what happens next" explainer tailored to whichever side you're on.
- **Where it lives:** The Deal/Agreement screen.
- **Who can use it:** The two people in the deal.
- **Why it matters:** Removes the guesswork of "whose turn is it to do something" in an informal local arrangement.

#### Live Job Status & Location Tracking
- **What it does:** The responder can mark themselves Leaving now, On the way, Arrived, or Working — the requester sees this update live, and can generate a shareable live-tracking link so someone else (like a family member) can watch the responder's live location en route, no account required.
- **Where it lives:** The Deal/Agreement screen; the tracking link opens on its own public page.
- **Who can use it:** Both people in the deal (status updates); anyone with the link (viewing only).
- **Why it matters:** The same reassurance a delivery-tracking link gives, applied to a local service visit.

#### Cancel, Dispute & Report a Deal
- **What it does:** Either side can cancel before payment moves, raise a dispute with a written reason if something goes wrong mid-job, or flag a problem — Stryt's team resolves disputes by releasing or cancelling the held payment.
- **Where it lives:** The Deal/Agreement screen.
- **Who can use it:** The two people in the deal.
- **Why it matters:** Gives both sides a safety net and a neutral referee if an arrangement breaks down.

#### Rate & Tip After a Deal
- **What it does:** Leave a 1–5 star rating with quick tags (On time, Great quality, Fair price, etc.), a comment, and an optional cash tip (noted as paid in person, not through the app).
- **Where it lives:** Automatically shown after marking a deal complete.
- **Who can use it:** The requester, about the person who helped them.
- **Why it matters:** Builds the local reputation system that makes future quotes more trustworthy.

---

### Module: Appointments & Bookings

#### Book an Appointment
- **What it does:** Pick a service/package, a date and time slot from the shop or provider's real availability, add notes or a reference photo, and confirm — some sellers require payment upfront, others let you pay around the time of service.
- **Where it lives:** "Book appointment" on any shop or provider profile.
- **Who can use it:** Signed-in customers.
- **Why it matters:** A direct, no-negotiation way to book a known shop or provider, separate from the request/quote system.

#### Shopping Cart & Checkout
- **What it does:** Add multiple items from a shop's catalog to a running cart, then check out by picking a pickup/collection time slot.
- **Where it lives:** A shop's Menu/Catalog tab.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Lets a customer order several things at once instead of booking each item separately.

#### My Appointments
- **What it does:** See all upcoming and past bookings, their status, cancel or reschedule an upcoming one, or quickly "book again" for a past one.
- **Where it lives:** Appointments tab / Home tile.
- **Who can use it:** Signed-in customers.
- **Why it matters:** One place to manage every booking across every shop and provider.

---

### Module: Live Queues (Walk-In Lines)

#### Join a Live Queue Remotely
- **What it does:** If a shop is running a live walk-in queue, a customer can join from their phone (picking a party size) instead of standing in line — seeing their position, people ahead, and a live estimated wait time.
- **Where it lives:** A shop's profile page.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Removes the need to physically wait in a shop just to hold a spot.

#### Live Turn Notification
- **What it does:** When it's your turn, your queue status flips to "Called" with a prominent "head in now" alert, both on the shop page and as a live card on your Home screen.
- **Where it lives:** My Queues / Home.
- **Who can use it:** Anyone with an active queue token.
- **Why it matters:** You can run other errands nearby and know the instant you're needed.

#### Leave or Cancel a Queue Spot
- **What it does:** Leave a queue instantly while just waiting; once called or served, leaving requires a confirmation warning that you'd lose your place.
- **Where it lives:** My Queues.
- **Who can use it:** The customer who joined.
- **Why it matters:** Prevents accidental loss of a place while still allowing an easy exit early on.

---

### Module: Payments

#### Pay via UPI or Cash — Claim & Confirm
- **What it does:** Every payment in Stryt — for an appointment, a deal, a queue visit, or a walk-in purchase — works the same way: the payer pays via a UPI QR code/deep link (or hands over cash), then taps "I have paid." The other side must then explicitly confirm they received it, or reject the claim if they can't verify it.
- **Where it lives:** Wherever a payment is due — appointments, deals, queue visits, and shop profiles.
- **Who can use it:** Signed-in customers, business owners, and providers.
- **Why it matters:** Gives both sides proof and a say in the transaction, without Stryt ever needing to hold or process the money itself.

#### Pay as a Walk-In Customer
- **What it does:** Even with no prior booking, a customer standing in a shop can open its profile, pick catalog items and quantities, and pay directly — no appointment or queue entry needed first.
- **Where it lives:** Shop profile "Pay now."
- **Who can use it:** Signed-in customers.
- **Why it matters:** Covers the common case of someone paying in person for something they didn't pre-book.

#### Request Payment (Nudge)
- **What it does:** A business or provider can send a one-tap reminder to a customer who owes an outstanding payment.
- **Where it lives:** Business/provider payment screens.
- **Who can use it:** Business owners and providers.
- **Why it matters:** A polite, low-friction way to follow up instead of chasing someone manually.

---

### Module: Reviews, Trust & Reputation

#### Write a Review
- **What it does:** Leave a star rating and comment on any shop or provider; if it's tied to a real completed booking, it's marked with a "Verified booking" badge.
- **Where it lives:** Shop/provider profile pages.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Verified-booking badges help other customers tell a real experience from an unverifiable one.

#### Vouch & Endorse (Providers)
- **What it does:** Separately from star ratings, any neighbor can give a provider a one-tap "I vouch for this person," or endorse them for a specific listed skill — both shown as simple counts and avatar stacks.
- **Where it lives:** Provider profile pages.
- **Who can use it:** Signed-in customers.
- **Why it matters:** A lightweight trust signal for people who haven't formally booked yet but want to say "I trust this person."

#### Leaderboard
- **What it does:** A monthly, local ranking of top providers and top helpful neighbors in your area.
- **Where it lives:** Leaderboard screen.
- **Who can use it:** Everyone signed in can view.
- **Why it matters:** Recognizes and surfaces the most active, helpful people in a neighborhood.

#### Achievements
- **What it does:** Personal unlockable badges for milestones — posting your first request, completing your first deal, helping 5 neighbors, getting a 5-star rating, and more.
- **Where it lives:** Achievements screen (from your Profile).
- **Who can use it:** Signed-in customers.
- **Why it matters:** A light gamification layer that rewards active, helpful participation.

#### Public Profile & Community Badges
- **What it does:** Every user has a public profile showing their reputation at a glance — rating, vouches, followers, verification status, and earned badges like "Good Neighbor" or "Top Helper" — with privacy controls to hide any section.
- **Where it lives:** Tap any user's name/avatar.
- **Who can use it:** Everyone can view (subject to that person's privacy settings); editing your own is for signed-in users.
- **Why it matters:** Gives every neighbor, not just sellers, a visible track record in the community.

---

### Module: Community Feed & Stories

#### Community Feed
- **What it does:** A local public feed for neighborhood posts — Ask Neighbors (recommendations), Lost & Found, Alerts, Giveaways, Polls, and Shoutouts — with likes, threaded comments, and a "Trending nearby" sort.
- **Where it lives:** Community tab.
- **Who can use it:** Everyone can browse (including guests); posting, liking, commenting, and voting require signing in.
- **Why it matters:** A hyperlocal version of a neighborhood group chat, built into the same app as the marketplace.

#### Post as Your Business or Provider Identity
- **What it does:** A shop owner or provider can post to the community feed under their business/provider name instead of their personal one.
- **Where it lives:** Community compose, and each business/provider's own dashboard.
- **Who can use it:** Business owners and providers.
- **Why it matters:** Lets sellers participate in the local conversation as their brand, building visibility beyond paid discovery.

#### Stories
- **What it does:** Short-lived photo posts (from 1 hour up to 7 days) that appear in a bar at the top of the app and disappear after they expire; owners can pin favorites permanently as "Highlights." Supports emoji reactions and shows the poster who viewed it.
- **Where it lives:** The Stories bar on Home; posted via "Post a story."
- **Who can use it:** Signed-in customers, business owners, and providers can post; everyone (including guests) can watch.
- **Why it matters:** A familiar, low-effort way to share quick local updates or shop moments.

#### "Neighborhood Today" Pulse
- **What it does:** A live snapshot card of what's happening in your area right now — active alerts, requests waiting for help, new shops that opened, and providers currently available.
- **Where it lives:** Home screen.
- **Who can use it:** Everyone.
- **Why it matters:** Surfaces real-time local activity without having to go looking for it.

---

### Module: Messaging

#### Direct Messages
- **What it does:** Real-time 1:1 chat with photo attachments, typing indicators, and read receipts — with separate inboxes for your personal chats, your business's customer messages, and your provider messages.
- **Where it lives:** Chats tab.
- **Who can use it:** Signed-in users.
- **Why it matters:** Keeps every conversation — personal, shop, and service-related — organized in one place without mixing them together.

#### QR Code Scanner
- **What it does:** Scan a Stryt QR code to jump straight to a shop, provider, profile, or request, or to redeem a loyalty stamp.
- **Where it lives:** Chats inbox header, and other entry points.
- **Who can use it:** Signed-in users.
- **Why it matters:** A fast, offline-friendly way to connect a physical location to its Stryt page.

---

### Module: Safety & Location Sharing

#### Live Location Sharing with "My People"
- **What it does:** Instantly share your continuously-updating live location with your designated emergency contacts, delivered as a live map inside your chat with each of them, until you manually stop.
- **Where it lives:** A persistent icon/banner, and the Safety Hub.
- **Who can use it:** Signed-in users.
- **Why it matters:** A real personal-safety tool for meeting people from the app in person.

#### Emergency Contacts
- **What it does:** Choose who your live-location shares go to — limited to people you've already chatted with in the app, as a built-in trust boundary.
- **Where it lives:** Safety Hub → Emergency contacts.
- **Who can use it:** Signed-in users.
- **Why it matters:** Ensures location sharing only ever goes to someone you've actually interacted with, never a stranger.

#### Request Someone's Exact Location
- **What it does:** Ask a specific person to reveal their exact location just once; they must approve before it's shown, and it's time-limited and revocable.
- **Where it lives:** Any user's public profile; approvals happen in Settings.
- **Who can use it:** Signed-in users.
- **Why it matters:** Balances genuine need (e.g. meeting up) with the fact that exact location is private by default.

---

### Module: Your Profile & Account

#### Edit Profile & Privacy Controls
- **What it does:** Set your display name, a public @handle, photo, and neighborhood, plus individual privacy switches for your real name, posts, requests, badges, phone, email, city, rating, and exact location — most are private by default.
- **Where it lives:** Profile → Edit.
- **Who can use it:** Signed-in users.
- **Why it matters:** Real name and contact details stay private until you choose to share them — Stryt doesn't assume everyone wants to be fully public.

#### Notification & Privacy Settings
- **What it does:** Control your discovery/alert radius, quiet hours, which notification types you get, what shows on your public profile, and your app language (English, Hindi, or Marathi).
- **Where it lives:** Settings.
- **Who can use it:** Signed-in users.
- **Why it matters:** Puts the user in control of how much the app reaches out to them and shows about them.

#### Saved, Following & Custom Lists
- **What it does:** See everything you've bookmarked (shops, providers, requests) and everyone you follow, or organize saves into your own named lists (e.g. "Favorite restaurants").
- **Where it lives:** Bookmarks and Lists screens.
- **Who can use it:** Signed-in customers.
- **Why it matters:** Lets people build a personal, organized shortlist instead of re-searching every time.

#### My Activity Archive
- **What it does:** A personal archive of your own posted Stories (plus saved Highlights) and Community posts, in one place.
- **Where it lives:** My Activity.
- **Who can use it:** Signed-in users (shows your business/provider activity too, if you're acting as one).
- **Why it matters:** Gives users a record of their own content over time.

#### Request Account Deletion
- **What it does:** Submit a reason and request deletion; the account enters a 30-day grace period (hidden from others but recoverable with one tap) before Stryt permanently removes it.
- **Where it lives:** Settings.
- **Who can use it:** Signed-in users.
- **Why it matters:** Gives people real control over leaving the platform, with a safety net against an accidental or impulsive request.

---

### Module: Switching Between Customer, Business & Provider

#### Switch Your "Hat"
- **What it does:** From your Profile, switch which identity you're currently using the app as — Customer, one of your businesses, or your provider profile — via a simple switcher.
- **Where it lives:** Profile screen and a quick-switch menu available throughout the manage consoles.
- **Who can use it:** Anyone who owns a business or provider profile.
- **Why it matters:** One login covers every role a person plays locally — shopper, shop owner, and independent worker — without juggling accounts.

#### Switch PIN
- **What it does:** Set an optional 4–6 digit PIN that's required every time you switch *into* your business or provider console (never required to switch back to your personal Customer view).
- **Where it lives:** Settings → Security (only shown once you own a business or provider profile).
- **Who can use it:** Business owners and providers.
- **Why it matters:** Protects the business/provider dashboard on a shared device (like a shop's counter phone) from being casually opened by anyone else picking it up.

---

### Module: Notifications

#### In-App Notification Feed
- **What it does:** A running list of everything relevant to you — new offers, proposal replies, deal updates, queue turns, appointment changes, community replies, and more — with unread counts and one tap to jump to the relevant screen.
- **Where it lives:** The notification bell, present throughout the app.
- **Who can use it:** Signed-in users.
- **Why it matters:** One consistent place to catch up on everything, no matter which part of the app it came from.

*(See Section 5 for the full list of what triggers a notification and how it's delivered.)*

---

### Module: Running a Business — The Business Console

#### List Your Business
- **What it does:** A 4-step setup — name/category/reach, pinned location and address, up to 4 photos plus an optional opening offer, and contact details with weekly hours — after which the shop goes live immediately while a verification review happens in the background.
- **Where it lives:** "Add a business" from Profile or the Manage hub.
- **Who can use it:** Any signed-in customer.
- **Why it matters:** Gets a real local shop discoverable in the app in minutes.

#### The "Today" Dashboard
- **What it does:** The owner's daily command center — a setup checklist, an instant "mark shop open now" toggle, a live queue snapshot, an "Action needed" worklist (pending bookings, payment claims, unanswered questions), today's bookings, a payments summary, matching nearby job leads, and quick actions to post an update or share the shop's QR code.
- **Where it lives:** The Today tab of the Business console.
- **Who can use it:** Business owners.
- **Why it matters:** Everything that needs a same-day response, in one glance, instead of hunting across screens.

#### Catalog / Menu Management
- **What it does:** Add products or services with photos, price (and an optional sale price), and a stock mode — either "Always available" (unlimited, like a haircut) or "Limited stock" (a countable quantity that automatically sells out and restocks).
- **Where it lives:** Store → Catalog.
- **Who can use it:** Business owners.
- **Why it matters:** Works for both a restaurant menu and a shop's limited-inventory products with the same tool.

#### Past Work Portfolio
- **What it does:** A captioned photo gallery of completed work or finished projects, separate from the sellable catalog.
- **Where it lives:** Store → Portfolio.
- **Who can use it:** Business owners.
- **Why it matters:** Lets a shop show quality of work, not just what's for sale.

#### Hours & Slot Setup
- **What it does:** Set weekly working hours (or 24×7), an instant "open right now" override, the length of each bookable appointment slot, and holiday/special-date notes.
- **Where it lives:** Store → Hours.
- **Who can use it:** Business owners.
- **Why it matters:** Drives every booking slot a customer sees, and keeps the public "open/closed" status accurate.

#### Live Queue Management
- **What it does:** Open or close the walk-in queue, set the average time per customer (which drives everyone's wait estimate), call the next customer, mark them arrived or served, and remove a no-show — plus confirm or reject payment claims right from the queue.
- **Where it lives:** Queue tab.
- **Who can use it:** Business owners.
- **Why it matters:** Turns a physical waiting line into something the owner can manage from anywhere in the shop.

#### Booking Management
- **What it does:** Accept or decline appointment requests with a note, cancel a confirmed booking with a reason, mark no-shows, block off slots or whole days (including recurring blocks), manually add a walk-in booking, and see a day's bookings with a shareable WhatsApp-style summary.
- **Where it lives:** Bookings tab.
- **Who can use it:** Business owners.
- **Why it matters:** Full control over the schedule, including the walk-in and last-minute cases a purely online system would miss.

#### Payments Dashboard
- **What it does:** One screen showing every payment claim waiting for confirmation, every outstanding unpaid booking or queue visit (with a one-tap reminder), and a history of everything already confirmed paid.
- **Where it lives:** Business → Payments.
- **Who can use it:** Business owners.
- **Why it matters:** A single place to reconcile money owed and received, instead of checking each booking individually.

#### Payment Setup
- **What it does:** Add a UPI ID (auto-generates a payment QR) or upload your own QR image, and choose whether customers must pay before you accept a booking or can pay around the time of service.
- **Where it lives:** Business → Settings.
- **Who can use it:** Business owners.
- **Why it matters:** Lets each shop set its own payment policy to match how it actually operates.

#### Customer Q&A
- **What it does:** Customers can publicly ask a question on the shop's page; the owner answers, and answered/upvoted questions surface for future visitors.
- **Where it lives:** Business → Q&A, and inline on the Today dashboard.
- **Who can use it:** Business owners (answering); customers (asking).
- **Why it matters:** Answers common questions once, publicly, instead of repeatedly in private messages.

#### Reply to Reviews
- **What it does:** Publicly respond to any customer review, and report a review to moderation if needed.
- **Where it lives:** Business → Reviews.
- **Who can use it:** Business owners.
- **Why it matters:** Lets an owner address feedback in public, which builds trust with future customers.

#### Customer Reachouts (Leads Inbox)
- **What it does:** A log of every customer interaction that isn't a formal booking — calls, directions taps, story replies, coupon claims, and questions — each markable as handled.
- **Where it lives:** Business → Customer reachouts.
- **Who can use it:** Business owners.
- **Why it matters:** Surfaces interest that would otherwise be invisible, so nothing falls through the cracks.

#### Find Local Job Requests
- **What it does:** See open customer requests that match the shop's category and area, and send a quote to compete for the job.
- **Where it lives:** Business → Find requests.
- **Who can use it:** Business owners.
- **Why it matters:** A second channel for winning customers, beyond people finding the shop directly.

#### Business Settings
- **What it does:** Control whether the shop is publicly visible at all, local notification preferences, contact-detail privacy, a basic staff roster (name/phone/role), and a "temporarily close shop" switch.
- **Where it lives:** Business → Settings.
- **Who can use it:** Business owners.
- **Why it matters:** Central control panel for how the business shows up and who's associated with it.

---

### Module: Working as a Provider — The Provider Console

#### Set Up Your Provider Profile
- **What it does:** A 4-step setup — professional name and category (or propose a new one), location/bio/starting price/service radius/availability, up to 5 portfolio photos, and a required face photo — after which the profile goes live immediately.
- **Where it lives:** "Become a provider" from Profile or the Manage hub.
- **Who can use it:** Any signed-in customer.
- **Why it matters:** Gets an independent worker discoverable and bookable in minutes, no shop required.

#### "Today" Triage Screen
- **What it does:** A live worklist of what needs a response right now (payment claims, pending bookings), today's schedule, a "Go available now" toggle for immediate jobs, a money snapshot, and a nudge when open requests match your skills.
- **Where it lives:** The Today tab of the Provider console.
- **Who can use it:** Providers.
- **Why it matters:** Built for someone checking their phone between jobs, not sitting at a desk.

#### "Available Now" Toggle
- **What it does:** One tap makes you visible to nearby customers as available for immediate work for a set window of time (default 3 hours).
- **Where it lives:** Today dashboard and Availability screen.
- **Who can use it:** Providers.
- **Why it matters:** Captures same-day, urgent demand that a fixed schedule would miss.

#### Services Catalog
- **What it does:** List fixed-price services with photos, an optional sale price, and either unlimited or countable-stock availability.
- **Where it lives:** Profile Hub → Services.
- **Who can use it:** Providers.
- **Why it matters:** Gives customers clear, upfront pricing before they even message.

#### Schedule & Availability
- **What it does:** Set recurring working days and hours, and the length of each bookable slot, with a live preview of exactly how it reads to customers.
- **Where it lives:** Profile Hub → Schedule.
- **Who can use it:** Providers.
- **Why it matters:** Keeps bookings limited to times you're actually free.

#### Find Work
- **What it does:** Browse open customer requests matching your category and area, respond with a quote (with reusable saved quote templates), track sent quotes, and negotiate.
- **Where it lives:** Find work tab.
- **Who can use it:** Providers.
- **Why it matters:** An active pipeline of new job leads, not just waiting to be found.

#### Jobs (Booking Calendar)
- **What it does:** Accept/decline requests, cancel with a reason, mark no-shows, block time off, add a walk-in booking, and see a day's schedule with a shareable summary.
- **Where it lives:** Jobs tab.
- **Who can use it:** Providers.
- **Why it matters:** The same day-to-day booking control a shop owner gets, sized for a solo operator.

#### Money & Earnings
- **What it does:** See total earnings, this week's earnings, jobs completed, a full itemized earnings history, confirm or reject payment claims, and set up how you get paid (UPI/QR, and payment timing policy).
- **Where it lives:** Money tab.
- **Who can use it:** Providers.
- **Why it matters:** One place to track income and manage getting paid, without a separate accounting tool.

#### Portfolio
- **What it does:** A captioned gallery of past work.
- **Where it lives:** Profile Hub → Portfolio.
- **Who can use it:** Providers.
- **Why it matters:** Visual proof of quality, which matters even more for a solo provider without a storefront.

#### Provider Settings
- **What it does:** Control profile visibility, contact-detail privacy, and local notification preferences.
- **Where it lives:** Profile Hub → Settings.
- **Who can use it:** Providers.
- **Why it matters:** Same self-service control businesses get, sized for a single person.

**Note for marketing:** Provider accounts are intentionally a lighter, solo-operator toolkit. Unlike businesses, providers currently do not have: a live walk-in queue, a public Q&A board, the ability to publicly reply to reviews, or staff/delegated login access — these are shop-specific tools that don't apply to a one-person operation.

---

### Module: Delegated Access & Team Management

#### Grant Business Access to Someone
- **What it does:** A business owner can instantly grant another Stryt user (identified by their phone, email, or @handle) full management access to the business — no separate login needed, and access lasts until the owner revokes it.
- **Where it lives:** Account Settings → Business access.
- **Who can use it:** Business owners (granting); any Stryt user (receiving).
- **Why it matters:** Lets a trusted family member or manager help run the shop from their own phone and account.

#### Manage & Revoke Access
- **What it does:** See everyone with access to a business, revoke it instantly, and review a history of past access grants.
- **Where it lives:** Account Settings → Business access.
- **Who can use it:** Business owners.
- **Why it matters:** Full, real-time control over who can act on the business's behalf.

#### Team Roster
- **What it does:** A simple list of staff/managers by name, phone, and role, kept for reference on the business's Settings page.
- **Where it lives:** Business → Settings → Team.
- **Who can use it:** Business owners.
- **Why it matters:** A quick internal record of who's on the team, separate from who has app login access.

---

### Module: Getting Verified

#### STRYT Verified Badge
- **What it does:** A business or provider uploads supporting documents; a real member of the Stryt team manually reviews them and either approves the "STRYT Verified" badge (shown publicly on the profile) or rejects it with a written reason and a chance to resubmit.
- **Where it lives:** Business/Provider → Verification.
- **Who can use it:** Business owners and providers.
- **Why it matters:** A trust signal that's always backed by an actual human check — never automatic — which protects the badge's credibility.

---

### Module: Support & Help

#### Contact Support
- **What it does:** Submit a support request by category (complaint, general inquiry, account issue, listing issue, or suggestion) with an email and message.
- **Where it lives:** Account Settings → Help & support.
- **Who can use it:** Signed-in users.
- **Why it matters:** A direct channel to the Stryt team for anything the app itself can't resolve.

#### Report a Bug
- **What it does:** Describe an app problem, tagged with which "hat" (Customer/Business/Provider) you were using at the time, with an option to use an external bug-tracking sheet instead.
- **Where it lives:** Account Settings → Report a bug.
- **Who can use it:** Signed-in users.
- **Why it matters:** Gives real users a direct line to flag problems as they find them.

---

### Module: The Admin Console

#### Listing Approval Queue
- **What it does:** Review and approve or reject new business, provider, and category submissions — approving notifies both the new owner and nearby users.
- **Where it lives:** Admin → Queue.
- **Who can use it:** Admins.
- **Why it matters:** A human check before new listings go fully live in the community.

#### Verification Review
- **What it does:** Review uploaded documents and approve, reject, or suspend a business/provider's verification — this is the only path that can ever grant the Verified badge, by design.
- **Where it lives:** Admin → Verification.
- **Who can use it:** Admins.
- **Why it matters:** Keeps the Verified badge meaningful by making it impossible to grant any other way.

#### Dispute Resolution
- **What it does:** Review a disputed deal and either release the held payment (mark complete) or cancel the job.
- **Where it lives:** Admin → Disputes.
- **Who can use it:** Admins.
- **Why it matters:** A neutral referee for the rare case a deal goes wrong between two neighbors.

#### Appeals
- **What it does:** Review a suspended business or provider's request to be reactivated, and approve or reject it with a note.
- **Where it lives:** Admin → Appeals.
- **Who can use it:** Admins.
- **Why it matters:** Gives a suspended account a documented path back onto the platform.

#### Reports & Bug Triage
- **What it does:** Review user-submitted reports on content/people and bug reports, and dismiss or act on each.
- **Where it lives:** Admin → Reports / Bugs.
- **Who can use it:** Admins.
- **Why it matters:** Keeps the community-flagged issues visible and actioned.

#### User & Listing Directory
- **What it does:** Search every customer, business, and provider; suspend or reactivate a business/provider; permanently delete a profile (with a full impact preview and a typed confirmation step); manage the account-deletion queue.
- **Where it lives:** Admin → Profiles.
- **Who can use it:** Admins (Super Admin required to delete a customer account).
- **Why it matters:** The full toolkit for keeping the platform's user base clean and accountable.

---

### Module: Native Android App

#### Full Native App
- **What it does:** Stryt is available as a downloadable native Android app (in addition to the website), using the device's native Google sign-in picker and faster, native-GPS-based location.
- **Where it lives:** Download link on the sign-in screen (hidden automatically once you're already using the app).
- **Who can use it:** Anyone with an Android device.
- **Why it matters:** A faster, more integrated experience than the website for regular users.

#### Over-the-Air App Updates
- **What it does:** The Android app can receive updates automatically without going through the Play Store each time.
- **Where it lives:** Background app behavior.
- **Who can use it:** Native app users.
- **Why it matters:** Faster fixes and new features reach users without waiting on app-store review cycles.

---

## 4. Integrations & Third-Party Services

- **Google Sign-In (via Firebase Authentication)** — powers the app's sign-in; Firebase is used only for authentication, not for storing any app data.
- **Supabase** — the backend that stores all app data, manages accounts/sessions, and enforces who can see or change what.
- **OpenStreetMap (Leaflet + Nominatim)** — powers the interactive map and converts addresses to/from map coordinates. Not Google Maps or Mapbox.
- **UPI Payment Links & QR Codes** — generates scannable QR codes and app deep-links for any UPI app (GPay, PhonePe, Paytm, BHIM, etc.) so payments can be made directly between customer and seller. Stryt does not process or hold payments itself.
- **QR Code Scanning** — an in-app camera-based scanner for reading Stryt QR codes (shop/provider links, loyalty stamps).
- **Web Push Notifications** — browser-based push notifications for users on the website.
- **Firebase Cloud Messaging** — the intended delivery method for push notifications on the native Android app. *(Note: configuration for this appears incomplete as of this analysis — confirm with engineering before promoting native push as fully live.)*
- **Vercel Analytics & Speed Insights** — anonymous usage and performance analytics for the website.
- **Smart Price Suggestions** — when posting a request, the app can suggest a fair price range based on recent similar requests nearby. This is a statistics-based comparison of recent local pricing, not a general AI assistant or chatbot — please don't market it as "AI-powered" without checking with the product team first.
- **Support Ticket Email Delivery** — support requests submitted in-app are emailed to the Stryt team.

**Confirmed not currently integrated:** No online payment gateway (e.g. Razorpay, Stripe) is wired up — an earlier integration was removed in favor of the UPI-link approach described above. No SMS provider is currently active (the phone-based sign-in flow that would use it is built but not turned on — see Section 6).

---

## 5. Notifications & Communications

Stryt delivers alerts two ways at once for almost every event below: an entry in the in-app notification bell, and a push notification (web push on the website, Firebase push on the native app — see the native-push caveat in Section 4). Every one of the following actions automatically triggers both:

- A new business or provider opens nearby
- A request is posted nearby that matches what a business/provider offers
- Someone sends a proposal/quote on your request
- A deal/agreement is updated (confirmed, payment status changes, disputed, completed)
- An offer or deal-related update occurs
- Someone taps "me too" on your group-buy request
- A group buy you joined unlocks bulk pricing
- A responder broadcasts a quote to a group-buy request you joined
- Someone requests to see your exact location, or approves your request to see theirs
- Someone comments on your community post
- A report you filed is resolved
- Someone reacts to your story
- A saved search alert matches a new nearby listing
- Your verification is approved, rejected, or your account is suspended
- Your queue position changes, or it becomes your turn
- An appointment is booked, accepted, declined, or changes status
- Someone is granted or has revoked access to manage your business
- General system/account notices

**Also worth noting:**
- **Support ticket confirmation** — an email is sent when you contact support.
- **New chat message** — shown as an unread badge on the Chats tab and the specific conversation, in real time (not a separate push category, but effectively instant).
- **"Now open" heads-up** — when a new business is approved, nearby users get a silent notification that it's opened.

---

## 6. Upcoming / In Development

The following exist in the codebase but are **not** available to real users today. They are either fully built screens with no way to navigate to them, or capabilities with no working purchase/payment flow behind them yet.

- **Wallet** — a loyalty-stamps, saved-coupons, and payment-history hub. Built, but not linked anywhere in the current app.
- **Loyalty Stamp Card Setup** — lets a business owner configure a "buy N, get a reward" stamp card for customers. Built, not linked.
- **Business Boosts / Promotion** — paid options to boost a listing's visibility (radius boost, featured placement, re-announcement to nearby users). The screen exists but explicitly tells the user boosts are "billed offline for now" since no in-app payment method is wired up.
- **Business Pro Plans & Provider Lead Packs** — three paid subscription tiers for businesses (Basic/Pro/Premium) and pay-per-lead credit packs for providers, fully priced out in the code, but the purchase screen shows a "coming soon, not available for purchase yet" message — there is no live payment provider behind it.
- **Recurring Service Subscriptions** — a way to track an informal recurring arrangement (e.g. a daily milk delivery or a maid service) with an attendance calendar and monthly cost summary. Built, not linked.
- **Society / Apartment Complex Module** — a substantial, fully-built feature for residential societies: joining or registering a society, resident/admin roles, a member-approval queue, and a gate-pass system for letting service providers in. Entirely built but not reachable by any current user.
- **"Available Now" Standalone List** — a dedicated screen listing every provider currently marked available (the toggle itself, on a provider's own dashboard, is live — this is just the separate customer-facing browse screen for it).
- **Neighborhood Pulse Hub** — a larger, dedicated version of the "Neighborhood Today" widget already live on Home, combining more local stats into one screen. Built, not linked.
- **Business Photo Gallery Manager (standalone)** — a dedicated screen for managing a shop's general photo gallery, separate from its Portfolio (past-work) and Catalog photos. Built, not linked.
- **Business Story Composer (standalone screen)** — posting a Story as a business already works from the dashboard's quick actions; this is a separate, more detailed compose screen for it that isn't currently linked.
- **Phone Number & Email Sign-In (OTP)** — a complete phone-number and email verification-code sign-in flow exists and works, but is currently turned off in favor of Google Sign-In only; it can be re-enabled without new development.
- **A More Advanced Staff-Login System** — beyond the "grant access by phone/email/handle" system that's live today (Section 3), a more elaborate system exists behind the scenes where an owner could set up a dedicated shop login ID and password (with optional approval-required and time-limited sessions) for someone who doesn't need their own Stryt account. Built at the technical level, but has no screen for an owner to actually turn it on yet.

---

## 7. Glossary

Consistent terms for marketing copy to use:

- **Stryt** — the product name; the tagline used in-app is "Your street. Your people."
- **Hat** *(internal term — use "role" or "profile" in customer-facing copy)* — the identity a user is currently acting as: Customer, a specific Business, or their Provider profile.
- **Ask / Request** — a post from a customer describing something they need, that nearby shops/providers/neighbors can respond to with quotes.
- **Proposal / Quote** — a priced response to a Request.
- **Deal / Agreement** — the tracked arrangement created once a customer accepts a quote; "Deal" is the customer-facing name for this.
- **Appointment / Booking** — a directly scheduled booking made straight from a shop or provider's page, separate from the Ask/Quote system.
- **Live Queue** — a shop's virtual walk-in line that customers can join remotely instead of waiting in person.
- **STRYT Verified** — the trust badge granted only after a human reviewer approves a business or provider's submitted documents.
- **Vouch** — a simple, one-tap "I trust this person" signal neighbors give a provider, distinct from a star rating.
- **Endorse** — a skill-specific version of a vouch, tied to one of a provider's listed skills.
- **My People** — the app's personal-safety live-location-sharing feature, limited to your emergency contacts.
- **Switch PIN** — the optional PIN that protects switching into a Business or Provider console on a shared device.
- **Delegated / Business Access** — granting another Stryt user permission to help manage a business.
- **Reachouts** — the log of calls, direction-taps, and other informal customer interest a business or provider sees on their dashboard, distinct from formal bookings or chat.
- **Highlights** — a Story a user has chosen to keep permanently on their profile past its normal expiry.
- **Me Too** — tapping to join someone else's group-buy request.
- **Group Buy** — a request multiple customers join together to unlock bulk pricing from a responder.
- **Boost** *(not yet purchasable — see Section 6)* — a paid option to increase a listing's visibility.

---

## Files & Folders Scanned

**Project-level:** `CODEBASE_MAP.md`, `package.json`, `.env.example`, `src/config.ts`

**Routing:** `src/App.tsx` (full route table)

**Screens (`src/screens/`)** — every `.tsx` file across: root customer screens, `admin/`, `auth/`, `business/` and `business/manage/`, `chat/`, `future-enhancement/`, `manage/`, `MapView/`, `provider/` and `provider/manage/`, `requests/`, `safety/`

**Components (`src/components/`)** — all top-level shared components plus `appointments/` subfolder

**Features (`src/features/`)** — `ambient/`, `live-share/`, `neighborhood-today/`

**Services (`src/services/`)** — all files across `core/`, `engagement/`, `marketplace/`, plus the barrel file

**Types (`src/types/`)** — all domain type files plus generated database types

**Lib (`src/lib/`)** — integration and utility files (auth, geocode, push notifications, Firebase, QR handling, etc.)

**Backend (`supabase/`)** — `migrations/` folder (75 files, sampled for named features), `functions/` (Edge Functions directory listing and key function contents)

**Global state:** `src/store.tsx` (read in full)
