# Service Provider Pipeline & Operational Model

This report details how **Naya** supports independent service providers (such as plumbers, tutors, barbers, makeup artists, and tiffin cooks), covering:
1. How a provider creates and configures their profile.
2. How providers manage their daily operations and availability.
3. How customers discover providers and hire them.
4. The provider-specific monetization and business model.

---

## 1. Provider Onboarding Pipeline

A provider (individual or small team) onboards through a guided setup wizard. Unlike standard directories, providers define not just their address, but a **service radius** (how far they are willing to travel):

```mermaid
sequenceDiagram
    autonumber
    actor Provider as Service Provider
    participant App as Naya App (Frontend)
    participant DB as Supabase DB & PostGIS
    participant Admin as Mod Queue / Admin Panel

    Provider->>App: Login via Phone OTP
    Provider->>App: Toggle Role to "Provider"
    Provider->>App: Start Onboarding Wizard
    Provider->>App: Step 1: Select Main Category & Endorse Skills
    Provider->>App: Step 2: Set Home Location & Service Radius (km)
    Provider->>App: Step 3: Configure Work Packages (Pricing & Tiers)
    Provider->>App: Step 4: Upload Portfolio Photos (Past work)
    App->>DB: Insert provider record (Status: 'PENDING')
    App->>DB: Save PostGIS circle (Home Point + Radius)
    DB-->>Admin: Populate Moderation Queue
    Admin->>Admin: Review profile quality and skills
    alt Approve Profile
        Admin->>DB: Set status to 'ACTIVE'
        DB-->>App: Notify Provider (Profile is searchable)
    else Reject Profile
        Admin->>DB: Set status to 'REJECTED' with feedback
        DB-->>App: Notify Provider to revise details
    end
```

### Onboarding Steps:
* **Hyperlocal Geofence**: The provider sets their base location and travel limit (e.g., 5 km). The database creates a radius boundary using PostGIS. They will only be displayed to customers whose coordinates fall within this service circle.
* **Pricing Packages**: Providers set up standardized packages (e.g., *Basic Haircut - ₹200*, *Hair Spa & Wash - ₹600*) so customers have clear cost expectations before booking.

---

## 2. Operations & Console (The Provider Workspace)

Once activated, providers manage their daily activities through the **Provider Console**:

| Operational Feature | How it Works | Provider Value |
| :--- | :--- | :--- |
| **"Available Now" Beacon** | A live toggle indicating they are free *right now* for the next few hours. | Elevates the provider to a dedicated, high-visibility rail on nearby customers' home feeds for immediate jobs. |
| **Portfolio & Work Gallery** | Upload photos of recently completed work (e.g., bridal makeup, repainted rooms). | Serves as visual proof of skill, which directly increases customer conversion. |
| **Packages Editor** | Add, edit, or remove service packages with descriptions, estimated duration, and pricing. | Standardizes services to reduce negotiation time with clients. |
| **Availability Scheduler** | Set regular weekly working hours and holiday dates. | Prevents booking requests during off-hours or busy personal slots. |
| **Leads & Bidding Inbox** | Lists hyperlocal requests broadcasted by customers in their category and area. | Gives providers a central place to submit custom bids (price + ETA + message) for active requests. |

---

## 3. Customer-Provider Interaction Pipeline

Customers can hire providers through two primary flows: **Direct Hiring (Pull)** and **Request Bidding (Push)**.

### Path A: Direct Discovery & Quote Requests
```mermaid
graph TD
    User([Customer]) -->|Opens App| Explore[Explore Page: Service Categories]
    Explore -->|Filters by Category| List[Provider Directory: Ordered by Distance]
    List -->|Selects Profile| Detail[Provider Profile Page]
    
    Detail -->|Interaction 1| Call[Call Provider Directly]
    Detail -->|Interaction 2| Portfolio[Browse Work Gallery]
    Detail -->|Interaction 3| Quote[Request a Custom Quote]
    Detail -->|Interaction 4| SelectPackage[Book a Predefined Package]

    Quote --> Neg[Negotiate terms & ETA]
    SelectPackage --> Confirm[Confirm Booking / Agreement]
    Neg --> Confirm
    
    Confirm --> Work[Service Executed at Client's Location]
    Work --> Settle[Offline Payment: UPI / Cash]
    Settle --> Rate[Customer Rates Provider & Endorses Skills]
```

### Path B: Bidding on the Request Feed
When a customer broadcasts a general request (e.g., *"Need a wedding photographer for 3 hours this Sunday"*):

```mermaid
flowchart TD
    Customer([Customer]) -->|Broadcasts request| Feed[Hyperlocal Request Feed]
    Feed -->|Triggers PostGIS search| Match{Does Provider cover Customer's coordinate?}
    Match -->|No| Filtered[Request invisible to provider]
    Match -->|Yes| Push[Notify Provider: 'New Lead Nearby']
    
    Push --> Review[Provider reviews budget & details]
    Review -->|Option 1| Ignore[Ignore lead]
    Review -->|Option 2| Bid[Submit Bid: Quote + ETA + Note]
    
    Bid -->|Applies optional| Boost[Lead Boost: Pins proposal to top]
    Boost --> CustView[Customer reviews proposals]
    CustView --> Accept[Customer accepts bid]
    
    Accept --> Agree[Agreement created]
    Agree --> Settle[Offline Payment & Review]
```

> [!TIP]
> **Skill Endorsements & Vouches**: In addition to standard star ratings, customers can vouch for specific skills (e.g., *"Fast Plumbing"*, *"Great with Kids"*). These tags aggregate on the provider's profile to build targeted reputation.

---

## 4. Provider Monetization Model

Naya prioritizes helping providers secure consistent local jobs before extracting fees:

1. **Phase 1: Free Lead Generation (Current)**
   * Providers receive leads and submit bids for free. 
   * This builds trust, gathers user ratings, and proves the platform's value.

2. **Phase 2: Lead Promotion & Category Placement (Paid)**
   * **Lead Boost (₹49 / proposal)**: Pins the provider's proposal at the very top of the customer's request details, ensuring it is viewed first.
   * **Category Spotlight (₹149 / week)**: Boosts the provider's position in the directory search results for their specific category (e.g., Plumbing).
   * **Verified Provider Badge (₹299 / year)**: Adds a verification checkmark to the profile after verifying identity documents (Aadhaar/License), increasing customer booking rates.
   * **Available Now Rail Placement (₹19 / activate)**: Places the provider on the live instant-hire rail for immediate matching.

3. **Phase 3: Transaction Commissions**
   * Once in-app payments are integrated, Naya secures transactions in escrow and charges a **5% to 8% commission** on completed service jobs, handling invoice generation, scheduling, and service insurance.
