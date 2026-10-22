# STRYT — Programmatic SEO Architecture & URL Matrix

> Scalable strategy for automatically generating 50,000+ targeted local landing pages for cities, categories, services, and dynamic comparison directories.

---

## 1. URL Taxonomy & Routing Matrix

| Entity Tier | Pattern Route | Example Live URL | Generated Count |
|---|---|---|---|
| **City Hubs** | `/city/:city` | `stryt.in/city/mumbai` | 50+ Metros & Tier-1/2 |
| **Category Hubs** | `/category/:category` | `stryt.in/category/dentists` | 120+ Subcategories |
| **Programmatic Local** | `/city/:city/:category` | `stryt.in/city/bangalore/salons` | 6,000+ Combinations |
| **Area Local** | `/city/:city/:locality/:category` | `stryt.in/city/bangalore/indiranagar/dentists` | 35,000+ Combinations |
| **Entity Profiles** | `/business/:id` | `stryt.in/business/biz_987` | Dynamic (Millions) |
| **Provider Profiles** | `/provider/:id` | `stryt.in/provider/prov_456` | Dynamic (Millions) |

---

## 2. Programmatic Local Page Template Design (`/city/:city/:category`)

### Page Content Layout:
1. **Dynamic Heading**: `Best {CategoryName} in {Locality}, {City} — Live Queues & Bookings`
2. **Real-time Status Bar**: `"14 Verified {CategoryName} Open Now in {Locality} • Average Wait Time: 12 mins"`
3. **Interactive Grid**: List of matching `business_profiles` / `provider_profiles` sorted by distance, rating, and live availability.
4. **Dynamic Price & Service Matrix**: Average pricing table generated from `business_catalog` items.
5. **Local FAQ Accordion**: Automatically generated from `business_qna` for shops in that city/locality.

---

## 3. Data Integration Strategy with Supabase

```sql
-- View for Programmatic SEO Aggregations
CREATE OR REPLACE VIEW v_seo_city_category AS
SELECT 
  bp.city,
  bp.sub_category,
  COUNT(bp.id) AS active_business_count,
  ROUND(AVG(bp.rating_avg), 1) AS avg_rating,
  MIN(bc.price) AS min_price
FROM business_profiles bp
LEFT JOIN business_catalog bc ON bc.business_id = bp.id
WHERE bp.status = 'ACTIVE'
GROUP BY bp.city, bp.sub_category;
```

---

## 4. Internal Linking & Crawl Hierarchy

```
[ Homepage ]
     |
     +---> [ /city/bangalore ]
                 |
                 +---> [ /city/bangalore/indiranagar ]
                             |
                             +---> [ /city/bangalore/indiranagar/salons ]
                                         |
                                         +---> [ /business/biz_987 ]
```

### Automatic Breadcrumb Schema:
Every programmatic page MUST render a valid `BreadcrumbList` schema:
`Home > City > Locality > Category > Business Name`
