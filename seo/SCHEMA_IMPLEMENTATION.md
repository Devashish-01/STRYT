# STRYT — Complete Schema.org Implementation Blueprint

> Technical reference and JSON-LD schema snippets for mapping STRYT business categories, services, queues, appointments, and reviews to Google-recognized structured data.

---

## 1. LocalBusiness / MedicalClinic / BeautySalon Schema Snippet

To be dynamically injected on `src/screens/business/BusinessDetail.tsx`:

```json
{
  "@context": "https://schema.org",
  "@type": "MedicalClinic",
  "@id": "https://stryt.in/business/biz_987#clinic",
  "name": "Dr. Ramesh Patel Dental Clinic",
  "url": "https://stryt.in/business/biz_987",
  "image": [
    "https://stryt.in/storage/v1/object/public/uploads/cover_biz_987.jpg"
  ],
  "telephone": "+919876543210",
  "priceRange": "₹₹",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "12th Main Rd, 4th Block, Indiranagar",
    "addressLocality": "Bengaluru",
    "addressRegion": "Karnataka",
    "postalCode": "560038",
    "addressCountry": "IN"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "124",
    "bestRating": "5",
    "worstRating": "1"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      "opens": "09:00",
      "closes": "20:00"
    }
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Clinic Services",
    "itemListElement": [
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Teeth Cleaning & Scaling",
          "description": "30-min professional ultrasonic dental cleaning"
        },
        "price": "800",
        "priceCurrency": "INR"
      }
    ]
  }
}
```

---

## 2. Independent Provider / Service Schema Snippet

To be dynamically injected on `src/screens/provider/ProviderDetail.tsx`:

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://stryt.in/provider/prov_456#person",
  "name": "Suresh Kumar",
  "jobTitle": "Master Electrician",
  "url": "https://stryt.in/provider/prov_456",
  "image": "https://stryt.in/storage/v1/object/public/uploads/avatar_prov_456.jpg",
  "knowsAbout": ["Electrical Wiring", "MCB Installation", "Inverter Fitting"],
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Mumbai",
    "addressCountry": "IN"
  },
  "makesOffer": [
    {
      "@type": "Offer",
      "itemOffered": {
        "@type": "Service",
        "name": "Full House Inspection & Wiring Check"
      },
      "price": "499",
      "priceCurrency": "INR"
    }
  ]
}
```

---

## 3. WebSite & Sitelinks Searchbox Schema Snippet

Injected on `index.html` or static Homepage:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://stryt.in/#website",
  "url": "https://stryt.in/",
  "name": "STRYT",
  "description": "Hyper-Local Neighborhood Commerce, Live Queues & Service Requests App",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://stryt.in/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

---

## 4. Category-to-Schema Mapping Engine

Implementation logic inside `src/lib/seoSchema.ts`:

```typescript
export function mapCategoryToSchemaType(subCategory: string): string {
  const cat = subCategory.toLowerCase();
  if (cat.includes('doctor') || cat.includes('clinic') || cat.includes('hospital')) return 'MedicalClinic';
  if (cat.includes('dentist')) return 'Dentist';
  if (cat.includes('salon') || cat.includes('parlor') || cat.includes('beauty')) return 'BeautySalon';
  if (cat.includes('barber')) return 'BarberShop';
  if (cat.includes('restaurant') || cat.includes('cafe') || cat.includes('food')) return 'FoodEstablishment';
  if (cat.includes('auto') || cat.includes('garage') || cat.includes('mechanic')) return 'AutoRepair';
  return 'LocalBusiness';
}
```
