# Naya Core System & Auxiliary Engine Report

This report outlines the remaining core subsystems of the **Naya** architecture:
1. **Hyperlocal Geolocation Engine** (PostGIS distance queries & maps).
2. **Media Storage & Upload Pipeline** (Supabase Storage).
3. **The Local Community Board & Engagement Engine** (Discussions, comments, upvotes).
4. **The Wallet, Loyalty, & Transaction Ledger** (Coupons, punch cards, offline settlements).

---

## 1. Hyperlocal Geolocation Engine

The foundation of Naya is **hyperlocal relevance**. Instead of sorting by country, state, or city, everything is sorted by straight-line distance using PostGIS geography structures:

```mermaid
flowchart TD
    loc([User GPS Coordinates]) -->|Vite App Request| API[Supabase Client]
    API -->|RPC Call / query nearby| RPC[db_nearby_businesses / db_nearby_requests]
    RPC -->|Postgres Query| SQL[SQL Query with PostGIS geometry operators]
    
    SQL -->|Filter 1| DistCheck["st_dwithin(business_location, user_location, radius_in_meters)"]
    SQL -->|Filter 2| DistCalc["st_distance(business_location, user_location) AS distance"]
    
    DistCheck -->|Matches| Sort[Sort by distance ASC]
    Sort -->|Return JSON| JSON[App UI: Ordered lists & map cluster pins]
```

### Technical Specs:
* **Storage**: Coordinates are stored in the database as `geography(Point, 4326)`.
* **Queries**: Feed fetches use the RPC function `nearby_businesses(lat, lng, radius_meters)`.
* **Map Rendering**: Built using Leaflet and mapped in [MapView.tsx](file:///d:/zetax/name/name/src/screens/MapView.tsx), clustering close proximity pins to maintain readability.

---

## 2. Media Storage & Upload Pipeline

When business owners upload product pictures or users upload request attachments, the assets pass through the following pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Owner
    participant App as Naya App (Frontend)
    participant Storage as Supabase Storage (Bucket: 'uploads')
    participant DB as Postgres Database

    User->>App: Select Image File (Cover / Product / Attachment)
    App->>App: Compress image client-side (JPEG/PNG)
    App->>Storage: uploadService.upload(filePath, fileBytes)
    Storage->>Storage: Store file in public bucket
    Storage-->>App: Return Public URL (https://.../uploads/file.jpg)
    App->>DB: Insert/Update DB row with image URL string
    DB-->>App: Confirm write
    App-->>User: Render image in UI
```

* **Storage Bucket**: Configured as a public bucket named `uploads`.
* **Owner RLS**: Standard users can only write to folder paths matching their `auth.uid()`, preventing cross-user asset tampering.

---

## 3. The Local Community Board & Engagement Engine

The Community noticeboard serves as the daily social feed for the neighborhood, driving regular app sessions:

```mermaid
sequenceDiagram
    autonumber
    actor UserA as Posting Resident
    participant App as Naya App (Frontend)
    participant DB as Supabase DB (public.posts)
    actor UserB as Neighboring Reader

    UserA->>App: Compose Post (Choose category: Poll, Alert, Discussion)
    App->>DB: Insert post row (Coordinates, Title, Type, Content)
    DB-->>UserB: Trigger real-time alert (if marked as Alert)
    UserB->>App: View Community Feed
    App->>DB: Fetch posts matching radius (PostGIS)
    DB-->>App: Return local posts
    UserB->>App: Upvote post or submit Comment
    App->>DB: Increment votes / insert comment row
```

| Post Category | Purpose | Notification Action |
| :--- | :--- | :--- |
| **Alert** | Safety or local infrastructure issues (e.g. water cuts, local fire). | High-priority instant notification to users within 2 km. |
| **Notice** | Announcements (e.g. local market timings, community events). | Appears in local feed tab. |
| **Poll** | Neighborhood feedback (e.g. *"Should we request a speedbreaker on main road?"*). | Live voting updates synced via Supabase subscription. |
| **Giveaways** | Decluttering and recycling items locally. | Hyperlocal matching to nearby residents. |

---

## 4. Wallet, Loyalty, & Transaction Ledger

Since payments settle offline (Cash/UPI), the **Wallet** acts as the ledger and loyalty aggregator:

```mermaid
graph LR
    User([Customer]) -->|Opens| Wallet[Wallet Dashboard]
    
    Wallet -->|Sub-Module 1| PunchCards[Loyalty Punch Cards]
    Wallet -->|Sub-Module 2| Coupons[Digital Coupon Wallet]
    Wallet -->|Sub-Module 3| Ledger[Offline Settlement Ledger]
    
    PunchCards -->|Action| Stamps[Earn 1 stamp per purchase at local shop]
    Coupons -->|Action| Claim[Unlock discounts via Leaderboard points]
    Ledger -->|Action| Balances[Track mutual debit/credit balances between neighbors]
```

### Wallet Functions in Detail:
1. **Loyalty Punch Cards**: Simulates a physical card (e.g., *"Buy 9 Tiffin meals, get the 10th free"*). The shop owner scans a QR or logs a transaction, adding a punch to the customer's card.
2. **Coupon Wallet**: Aggregates verified business promotions and community-earned discounts in one place for checkout presentation.
3. **Offline Settlement Ledger**: Keeps track of outstanding cash tabs between trusted community members (e.g., *"Plumber completed repair, tab logged as ₹500 pending"*). Once UPI/cash is exchanged, both parties mark the ledger item as settled.
