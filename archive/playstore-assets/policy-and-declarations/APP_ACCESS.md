# Play Console — App access (copy/paste)

**App:** STRYT · `in.stryt.app`
**Console location:** App content → **App access**
**Rewritten 2026-10-24** — delivery ships in this release, and sign-in is now **phone + one-time code**, so reviewers
no longer need a Google account.

Answer **"All or some functionality is restricted"** and add the four instruction sets below. The review accounts
already exist in production, are onboarded, and need no business/provider password (checked 2026-10-24).

---

## How a reviewer signs in (no SMS needed)

STRYT signs in with a mobile number and a 6-digit code. Google Firebase Authentication has **"phone numbers for
testing"**: a fixed number and code that never send an SMS and skip reCAPTCHA. The three review accounts use those,
so a reviewer types the number and the fixed code and is in. The welcome screen also offers "Continue with Google"
— **tell reviewers to ignore it**.

| Role | Mobile number | Code | Account |
|---|---|---|---|
| Customer | `9222222222` | `222222` | Priya Nair |
| Shop owner | `9111111111` | `111111` | Rajesh Sharma — owns **Sharma General Store**, which offers home delivery |
| Delivery partner | `9333333333` | `333333` | Suresh Kumar — on the shop's team with the Delivery role |

Enter the 10-digit number (the +91 country code is pre-filled), tap Continue, then type the code.

> These fixed codes work for **anyone who knows them**. That is acceptable during review (the data is demo data) but
> remove the three numbers from Firebase → Authentication → Sign-in method → Phone → "Phone numbers for testing"
> once Google has approved the app, and again before any wider launch.

---

## The form

**Are any parts of your app restricted?** → **All or some functionality is restricted**

### 1. Customer

| Field | Value |
|---|---|
| Instructions name | `Customer — standard account` |
| Username | `9222222222` |
| Password | `222222` |

```
Sign in with the mobile number and the fixed code above (no SMS is sent). Ignore
"Continue with Google". The account is already set up, so it lands on Home.

- Explore: browse nearby shops and providers.
- Open "Sharma General Store" -> add items -> Checkout -> "Home delivery" -> Confirm.
  Pay by cash on delivery; no payment is taken in the app. Afterwards Home shows a
  live "Your order" card, and Appointments shows the order's progress.
- Account -> My People: live location sharing (instruction set 4).
- Account -> Delete account: the in-app deletion flow.

STRYT processes no payments in the app; there is nothing to purchase.
```

### 2. Shop owner

| Field | Value |
|---|---|
| Instructions name | `Shop owner — manage console and orders` |
| Username | `9111111111` |
| Password | `111111` |

```
Sign in as above. The account owns "Sharma General Store" and needs no business
password. Open the account switcher (long-press the Profile tab) and choose
"Sharma General Store" to enter the shop console.

Orders: when the customer account places a home-delivery order it appears here as
a new order.
1. Accept (choose 30 min) -> Mark packed -> Assign delivery -> choose "suresh_k".
2. Orders -> Deliveries tab -> "Live board" shows each delivery in progress,
   including the delivery partner's position while a delivery is under way.
3. Other sections: Catalog, Hours, Queue, Q&A, Inbox, Team & access.
```

### 3. Delivery partner (home delivery)

| Field | Value |
|---|---|
| Instructions name | `Delivery partner — delivery console` |
| Username | `9333333333` |
| Password | `333333` |

```
Sign in as above. This account is on Sharma General Store's team with the Delivery
role, so a "Delivery" entry appears in the account switcher (long-press the
Profile tab).

To have something to deliver, an order must first be placed and prepared: use the
Customer and Shop owner accounts above (instruction sets 1 and 2), assigning the
order to "suresh_k". Then, as this account:
1. Delivery -> turn ON DUTY. (On Android a sheet may suggest changing a battery
   setting; it opens the phone's own settings page and can be skipped.)
2. Assigned tab -> the order -> "Picked up from shop" -> "Start delivery".
3. An in-app disclosure appears BEFORE the system dialog, stating that location is
   collected even when the app is closed or not in use. Tap Continue and choose
   "Allow all the time".
4. A persistent "STRYT Live Tracking" notification is shown while the delivery is
   under way. The shop owner's Live board shows the position.
5. "I've arrived" -> enter the 6-digit code shown on the customer's screen ->
   "Collect cash" -> the delivery is complete and location reporting stops.
"Can't deliver?" is available at any step.

Customers never see the delivery partner's location: they see progress and an
estimated arrival time only.
```

### 4. Background location — live share (REQUIRED for the sensitive-permission review)

| Field | Value |
|---|---|
| Instructions name | `Background location — My People live share` |
| Username | `9222222222` |
| Password | `222222` |

```
This and instruction set 3 are the two features the ACCESS_BACKGROUND_LOCATION
declaration covers.

1. Sign in as the Customer. Its one emergency contact is the Shop owner account.
2. Account -> My People -> Start sharing.
3. An in-app disclosure appears BEFORE any system dialog, stating that location is
   collected even when the app is closed or not in use. Tap Continue.
4. Grant location "Allow all the time", and notifications if prompted.
5. A persistent notification appears: "STRYT live location - Sharing your live
   location with My People until you stop."
6. Lock or background the device. Signed in as the Shop owner (another phone, or
   stryt.in), open the chat with the customer: the live location card keeps
   updating.
7. Stop from the in-app banner, or My People -> Stop sharing.

The share ends when the user stops it, or by itself 8 hours after it started.
Location is never collected in the background at any other time.
```

---

### Admin console — do NOT declare this

`/admin/login` is internal staff tooling and uses its own admin credentials. **Leave it out of App access.** If
review asks, answer that it is internal-only and restricted to STRYT staff.

---

## Pre-submission checklist

- [ ] The three numbers above are listed under Firebase → Authentication → Sign-in method → Phone → **Phone numbers for testing**, with exactly these codes
- [ ] Each account signed into once on a real device with the **release** build
- [ ] Customer's My People contact is still the Shop owner (Account → My People)
- [ ] Sharma General Store is open, delivery is switched on in its settings, and it has items in stock
- [ ] Just before submitting for review: place one fresh order so the flow is easy to repeat (an accepted delivery that nobody starts is closed automatically about 3 hours after its time)
- [ ] After approval: remove the Firebase test phone numbers
