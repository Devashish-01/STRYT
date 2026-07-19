# STRYT — 12-Month SEO Execution Roadmap

> Prioritized, phased implementation schedule mapping engineering tasks, content drops, link building campaigns, and analytics milestones.

---

## 1. Roadmap Phasing Summary

```
[Phase 1: Foundation (Weeks 1-4)]  -->  [Phase 2: Programmatic & B2B (Months 2-3)]
                                                  |
[Phase 4: Domination & Scale (Months 7-12)] <-- [Phase 3: Content & AEO (Months 4-6)]
```

---

## 2. Phase 1: Immediate Technical Fixes & Foundation (Weeks 1 - 4)

| Task | Category | Priority | Est. Effort | Target File / Area |
|---|---|---|---|---|
| **Fix `robots.txt`** | Technical SEO | P0 (Blocker) | 1 hour | `public/robots.txt` |
| **Deploy Bot Prerender Middleware** | Architecture | P0 (Blocker) | 2 days | `middleware.ts` / Vercel Edge |
| **Implement `<SEOHead />` Component** | SPA Metadata | P0 | 1 day | `src/components/SEOHead.tsx` |
| **Dynamic Meta on Business & Provider** | SPA Metadata | P0 | 2 days | `BusinessDetail.tsx`, `ProviderDetail.tsx` |
| **Dynamic Sitemap Generator API** | Indexing | P1 | 1.5 days | `api/sitemap.ts` |
| **GSC & Bing Webmaster Verification** | Search Console | P1 | 2 hours | Search Console Dashboard |

---

## 3. Phase 2: Programmatic Local Expansion & B2B Pages (Months 2 - 3)

- [ ] **Launch Static Acquisition Pages**: Deploy `/healthcare`, `/salons`, `/restaurants`, `/features/queue-management`, `/features/payments`, `/ondc`.
- [ ] **Build Programmatic City & Category Engines**: Deploy `/city/:city`, `/category/:category`, and `/city/:city/:category`.
- [ ] **Inject Rich Schemas**: Deploy `LocalBusiness`, `MedicalClinic`, `BeautySalon`, `Person`, and `OfferCatalog` schemas across all entities.
- [ ] **Implement Google Indexing API Webhook**: Automatically notify search engines when new merchants complete verification.

---

## 4. Phase 3: Content Marketing & AEO Engine (Months 4 - 6)

- [ ] **Launch Blog Subdirectory (`/blog`)**: Publish 3 long-form authority articles per week (following `/CONTENT_CALENDAR.md`).
- [ ] **Implement Fact API for AI Crawlers (`/api/v1/ai-facts`)**: Expose structured JSON facts for ChatGPT, Claude, and Perplexity.
- [ ] **Deploy Merchant Badges & Widgets**: Allow merchants to embed STRYT live queue badges on their personal websites (generating high-authority backlinks).

---

## 5. Phase 4: Category Leadership & National Scale (Months 7 - 12)

- [ ] **Expand Programmatic Footprint**: Cover 500+ Indian towns and 50,000+ localized neighborhood terms.
- [ ] **PR & ONDC Brand Campaigns**: Secure backlinks from major tech & retail publications (*YourStory, Economic Times, Entrackr*).
- [ ] **Reach 500,000+ Organic Monthly Visitors**: Monitor GSC & GA4 funnels to optimize conversion from landing page to app download / merchant signup.
