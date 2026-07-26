# STRYT — Performance & Core Web Vitals (CWV) Technical Blueprint

> Technical guide to achieving 95+ Mobile Performance score on Lighthouse, zero Cumulative Layout Shift (CLS), and sub-1.2s Largest Contentful Paint (LCP).

---

## 1. Core Web Vitals Benchmark Targets

| Metric | Target | Current SPA Baseline | Optimization Strategy |
|---|---|---|---|
| **Largest Contentful Paint (LCP)** | < 1.2s | ~1.8s | Preload hero fonts & eager-load cover image with `fetchpriority="high"` |
| **Interaction to Next Paint (INP)** | < 100ms | ~40ms | Optimize React state re-renders in `useApp()` context |
| **Cumulative Layout Shift (CLS)** | 0.00 | 0.02 | Explicit width/height containers on `<SafeImg />` and card skeletons |
| **First Contentful Paint (FCP)** | < 0.9s | ~1.2s | Critical CSS inline + preconnect to Supabase & Google Fonts |

---

## 2. Dynamic Image Pipeline (`<SafeImg />` Optimization)

Update `src/components/common.tsx` (`SafeImg` component) to enforce layout stability and next-gen format serving:

```tsx
interface SafeImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string | null;
  alt: string;
  width?: number | string;
  height?: number | string;
  priority?: boolean;
}

export function SafeImg({ src, alt, width, height, priority = false, className, style, ...props }: SafeImgProps) {
  const [err, setErr] = useState(false);
  const fallback = "https://stryt.in/assets/fallback.png";

  return (
    <img
      src={err || !src ? fallback : src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setErr(true)}
      className={className}
      style={{ aspectRatio: width && height ? `${width}/${height}` : undefined, ...style }}
      {...props}
    />
  );
}
```

---

## 3. Asset Bundling & Dynamic Imports

Modify `vite.config.ts` to optimize vendor code splitting:

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-leaflet': ['leaflet', 'react-leaflet'],
          'vendor-icons': ['lucide-react', '@phosphor-icons/react']
        }
      }
    },
    chunkSizeWarningLimit: 600
  }
});
```

---

## 4. Edge Caching & Headers in `vercel.json`

Ensure static assets and pre-rendered HTML carry high-performance caching headers:

```json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/(.*)\\.(png|jpg|jpeg|svg|webp|avif|woff2)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }
      ]
    }
  ]
}
```
