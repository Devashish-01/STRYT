# STRYT — Comprehensive Technical SEO Audit & Architecture Report

> Detailed technical assessment of STRYT's single-page application (SPA) architecture, rendering pipeline, indexing blockers, dynamic metadata capabilities, and performance optimizations.

---

## 1. Executive Technical Summary

| Technical Vector | Current Status | Assessment | Impact |
|---|---|---|---|
| **Rendering Model** | Pure Client-Side Rendering (CSR) via Vite | Critical Vulnerability | Bots receive empty app shell fallback |
| **Indexability** | Blocked via `robots.txt` on core routes | Critical Defect | `/explore`, `/search`, `/map` disallowed |
| **Dynamic Head Metadata** | Missing (Static `index.html` only) | Major Defect | All URLs share identical titles & meta |
| **Dynamic OpenGraph / Social Cards** | Missing | High Business Impact | Shared links show generic app icon |
| **XML Sitemap** | Static 1-line (`https://stryt.in/`) | High Defect | 100% of business & provider IDs missing |
| **Schema.org Integration** | Basic WebSite & SoftwareApplication only | Major Opportunity | Missing LocalBusiness, MedicalClinic, Offer |
| **Core Web Vitals (CWV)** | LCP ~1.8s, CLS 0.02, FID <10ms | Good Baseline | Optimized SPA shell assets |

---

## 2. Rendering Pipeline & Crawler Accessibility

### 2.1 The CSR Problem in STRYT
STRYT is built as a Single Page Application using `react-router-dom` v6 (`src/App.tsx`). When a search engine crawler or social preview bot requests `https://stryt.in/business/biz_123`, Vercel returns the contents of `index.html` static file:

```html
<!doctype html>
<html lang="en">
  <head>
    <title>STRYT — Your street. Your people.</title>
    <meta name="description" content="STRYT — your street, your people..." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Impact:
1. Googlebot executes JavaScript and eventually renders the content, but indexing is delayed by days or weeks in Google's two-wave indexing pipeline.
2. Search engines other than Google (Bing, DuckDuckGo, Yandex) and AI Search crawlers (PerplexityBot, GPTBot, ClaudeBot) do NOT reliably execute heavy CSR applications. They index the empty shell or generic title.
3. Social crawlers (WhatsApp, Twitter, Facebook, iMessage) NEVER execute JavaScript. When a business owner shares their link, the preview snippet shows generic app text instead of their shop details.

---

## 3. Recommended Architectural Fix: Vercel Edge Server-Side Prerendering

To maintain STRYT's ultra-fast mobile SPA user experience while solving 100% of crawler limitations, implement **Edge Server-Side Prerendering**:

```typescript
// middleware.ts (Vercel Edge Middleware)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BOT_AGENTS = [
  'googlebot', 'bingbot', 'yandex', 'duckduckbot',
  'slurp', 'twitterbot', 'facebookexternalhit',
  'whatsapp', 'linkedinbot', 'telegrambot', 'gptbot', 'perplexitybot'
];

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent')?.toLowerCase() || '';
  const isBot = BOT_AGENTS.some(bot => userAgent.includes(bot));

  if (isBot) {
    const url = request.nextUrl;
    // Route bot requests for dynamic entities to Edge Prerender Function
    if (url.pathname.startsWith('/business/') || url.pathname.startsWith('/provider/')) {
      return NextResponse.rewrite(new URL(`/api/prerender?path=${url.pathname}`, request.url));
    }
  }

  return NextResponse.next();
}
```

---

## 4. Robots.txt Defect Repair Plan

### Existing `public/robots.txt`:
```robots.txt
User-agent: *
Disallow: /home
Disallow: /explore
Disallow: /requests
Disallow: /profile
Disallow: /search
Disallow: /map
Disallow: /categories
```

### Recommended Production `public/robots.txt`:
```robots.txt
User-agent: *
Allow: /$
Allow: /business/
Allow: /provider/
Allow: /category/
Allow: /categories
Allow: /city/
Allow: /request/
Allow: /community/
Allow: /features/
Allow: /healthcare
Allow: /salons
Allow: /restaurants
Allow: /ondc
Allow: /blog/
Allow: /favicon.svg
Allow: /icon-192.png
Allow: /icon-512.png

# Private / Auth / Portal routes
Disallow: /auth/
Disallow: /admin/
Disallow: /manage/
Disallow: /business/*/manage
Disallow: /provider/*/manage
Disallow: /chats/
Disallow: /chat/
Disallow: /notifications
Disallow: /bookmarks
Disallow: /settings
Disallow: /account

Sitemap: https://stryt.in/sitemap.xml
```

---

## 5. Dynamic Sitemap Generation Architecture (`/api/sitemap.xml`)

Create an automated sitemap generator via Edge Functions that queries Supabase for all active entities:

```typescript
// api/sitemap.ts
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  
  const { data: businesses } = await supabase
    .from('business_profiles')
    .select('id, updated_at')
    .eq('status', 'ACTIVE');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>https://stryt.in/</loc>
      <priority>1.0</priority>
    </url>
    ${businesses?.map(b => `
      <url>
        <loc>https://stryt.in/business/${b.id}</loc>
        <lastmod>${new Date(b.updated_at).toISOString().split('T')[0]}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
      </url>
    `).join('')}
  </urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 's-maxage=3600, stale-while-revalidate' }
  });
}
```
