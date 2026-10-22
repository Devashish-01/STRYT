# STRYT — High-Converting Landing Page Strategy & Architecture

> Complete blueprints, routes, content hierarchy, schema, and meta strategies for STRYT acquisition landing pages.

---

## 1. Homepage (`/`) Optimization Blueprint

### Meta & Header Specification:
- **URL**: `https://stryt.in/`
- **Title**: `STRYT — Your Street. Your People. Hyper-Local Commerce & Queue App`
- **Meta Description**: `Discover nearby shops, book appointments, check live clinic & salon queues, hire local service pros, and connect with your neighborhood on STRYT.`
- **Target Keywords**: `hyper local app`, `queue management app`, `local service marketplace`, `neighborhood business discovery`
- **Schema**: `WebSite`, `SoftwareApplication`, `Organization`

### Content Structure:
1. **Hero Section**:
   - Headline: "Your Street. Your People. Right at Your Fingertips."
   - Subheadline: "Check live clinic & salon queues, book local appointments, hire trusted service pros, and buy from neighborhood shops."
   - Primary CTA: "Download App (Android/APK)" / "Explore Nearby Shops"
2. **Interactive Live Queue & Appointment Demo**:
   - Live visual simulation of `QueueManager` and `AppointmentSheet` components.
3. **Core Solutions Grid**:
   - **For Customers**: Zero-wait queues, local request post (Ask/Propose), direct UPI payments.
   - **For Businesses & Doctors**: Live token counter, digital catalog, customer CRM, review manager.
   - **For Service Providers**: Portfolio display, agreement terms, lead inbox.
4. **ONDC Integration Banner**:
   - "Built on ONDC principles for fair, decentralized local commerce."
5. **Customer & Merchant Testimonials**:
   - Social proof cards with star ratings and verified badges.
6. **FAQ Accordion** (Injects `FAQPage` schema).

---

## 2. Industry-Specific Acquisition Landing Pages

### 2.1 Healthcare & Medical Clinics (`/healthcare`)
- **Route**: `/healthcare` (or static SSG route `https://stryt.in/healthcare`)
- **Title**: `Clinic Queue Management & Doctor Appointment App | STRYT Healthcare`
- **Meta Description**: `Eliminate OPD waiting room crowds. STRYT gives clinics live digital token queues, online appointment scheduling, and instant patient updates.`
- **Target Keywords**: `clinic queue management software`, `doctor appointment scheduling app`, `digital OPD token system`, `patient wait time tracker`
- **Schema**: `SoftwareApplication`, `Service`, `FAQPage`
- **Content Blueprint**:
  - Hero: "Zero-Wait Doctor Clinics. Better Patient Experience."
  - Feature Breakdown: Live Queue Token Counter (`QueueManager`), Patient SMS/Push Alerts, Instant Slot Booking (`AppointmentSheet`), Verified NMC Registration Badge (`VerificationCenter`).
  - Case Study Highlight: "Dr. Patel's Clinic reduced waiting room crowding by 75% in 30 days."

---

### 2.2 Salons, Spas & Barbers (`/salons`)
- **Route**: `/salons`
- **Title**: `Salon Appointment Booking & Virtual Queue App | STRYT for Salons`
- **Meta Description**: `Fill your chairs and eliminate weekend waiting chaos. Give your salon digital appointment booking, walk-in queue tokens, and direct UPI payments.`
- **Target Keywords**: `salon appointment scheduling software`, `barbershop queue app`, `virtual waitlist for salons`, `digital salon catalog`
- **Schema**: `SoftwareApplication`, `Service`, `FAQPage`
- **Content Blueprint**:
  - Hero: "Never Lose a Walk-in Customer Again."
  - Feature Breakdown: Virtual Walk-in Token (`WalkInPaySheet`), Stylist Portfolio Gallery (`BusinessPortfolio`), Service Pricing Catalog (`CatalogManager`), Automated Reminders.

---

### 2.3 Restaurants, Cafes & Food Outlets (`/restaurants`)
- **Route**: `/restaurants`
- **Title**: `Digital Table Queue & QR Ordering App | STRYT Food & Dining`
- **Meta Description**: `Streamline restaurant table waitlists and takeaway queues. Give diners live queue tracking, QR digital menus, and instant payments.`
- **Target Keywords**: `restaurant queue management app`, `table waitlist app`, `cafe digital token system`, `qr code order and pay`
- **Schema**: `SoftwareApplication`, `Service`, `FAQPage`

---

## 3. Core Feature Acquisition Landing Pages

### 3.1 Live Queue Management (`/features/queue-management`)
- **Target Keyword**: `live queue token system`, `queue management software`
- **H1**: "The Simplest Virtual Queue & Token System for Local Businesses"
- **Key Sections**: How Virtual Queues Work (Customer scans QR / joins remotely), Real-time Notification Engine, Wait-time Math Calculation Engine, Customer & Business Interfaces.

### 3.2 Local Service Requests — Pillar C (`/features/local-requests`)
- **Target Keyword**: `post local request app`, `hire local service provider`
- **H1**: "Ask Your Street for What You Need. Get Quotes from Local Pros in Minutes."
- **Key Sections**: How Pillar C Works (Customer posts Request -> Providers submit Proposals -> Secure Agreement -> Live Tracking -> Payment).

### 3.3 ONDC Merchant Network (`/ondc`)
- **Target Keyword**: `ondc seller app`, `register business on ondc`
- **H1**: "Connect Your Local Shop to the ONDC Network with STRYT"
- **Key Sections**: What is ONDC, How STRYT Integrates Local Merchants, Zero Commission Benefits, Step-by-Step Onboarding.

---

## 4. Universal Page Elements Standard

Every acquisition landing page MUST follow this code/content layout:

```html
<!-- Canonical URL -->
<link rel="canonical" href="https://stryt.in/{slug}" />

<!-- Dynamic OpenGraph & Twitter Cards -->
<meta property="og:title" content="{Title}" />
<meta property="og:description" content="{Description}" />
<meta property="og:image" content="https://stryt.in/assets/og/{slug}.jpg" />

<!-- Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "STRYT {FeatureName}",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Android, iOS, Web",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" }
}
</script>
```
