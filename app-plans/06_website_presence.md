# Task 6 — Website Presence / Logo / Branding

## Goal
Fix a "poor / old logo" web presence: consistent brand mark, favicon, PWA icons,
social share (OG/Twitter) image, and manifest so stryt.in looks production-grade
when shared or installed.

## Current state (verified)
- `index.html`: decent meta + OG/Twitter + JSON-LD, but OG image points at
  `/icon-512.png` and favicon at `/favicon.svg` — need to confirm these are the
  CURRENT brand mark, not an old one.
- PWA icons: `public/icon-192.png`, `public/icon-512.png`, `favicon.svg`.
- `AppMark` / `BrandLockup` React components render the in-app logo (a heart-pin
  mark) — the source of truth for the brand.
- No `public/manifest.webmanifest` at that exact path (build/PWA plugin may
  generate it) — verify PWA manifest name/icons/theme.

## Steps
- [ ] Confirm the brand mark used in-app (`AppMark`) matches favicon + PWA icons;
      if the raster icons are stale, regenerate them from the current SVG mark.
- [ ] Ensure `favicon.svg` is the current mark; add `apple-touch-icon`.
- [ ] Verify the generated web manifest: name "STRYT", short_name, theme_color
      `#8b47f5`, background, maskable icon.
- [ ] Add a proper 1200×630 OG share image (branded) instead of reusing the
      512 app icon, so link unfurls look intentional.
- [ ] Sanity-check title/description copy and canonical.

## Constraint
Replacing raster artwork ideally needs the official logo asset. Where a new
raster isn't available, derive from the in-app SVG mark to stay consistent and
mark any asset that should be replaced with a designer-provided file.

## Risk
Low — static assets + meta. No app logic.
