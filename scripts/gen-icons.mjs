#!/usr/bin/env node
// Regenerates the PWA / favicon raster icons + a social OG image from the
// single source-of-truth brand mark (public/favicon.svg). The old PNGs had a
// tiny ~64px logo floating in a mostly-empty 512 canvas, which looked broken on
// PWA install and link shares. Run: node scripts/gen-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");

function renderSvgToPng(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return r.render().asPng();
}

// 1) App icons + apple-touch-icon from the full-bleed favicon mark.
const favicon = readFileSync(join(pub, "favicon.svg"), "utf8");
const iconTargets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of iconTargets) {
  writeFileSync(join(pub, name), renderSvgToPng(favicon, size));
  console.log(`wrote public/${name} (${size}px)`);
}

// 2) Social share image (1200x630) — brand gradient + centered mark + wordmark.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#a575fb"/>
      <stop offset="0.55" stop-color="#7c2fe8"/>
      <stop offset="1" stop-color="#4a1068"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <g transform="translate(430,150) scale(5.3)">
    <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="#ffffff"/>
    <path d="M32 39 C25 34 39 24 32 19" stroke="#7c2fe8" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 39 C25 34 39 24 32 19" stroke="#ff8400" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-dasharray="0.5 3.6"/>
  </g>
  <text x="600" y="500" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="96" font-weight="800" fill="#ffffff" letter-spacing="4">STRYT</text>
  <text x="600" y="560" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="34" font-weight="500" fill="#ffffff" fill-opacity="0.85">Your street. Your people.</text>
</svg>`;
writeFileSync(join(pub, "og-image.png"), renderSvgToPng(og, 1200));
console.log("wrote public/og-image.png (1200x630)");
