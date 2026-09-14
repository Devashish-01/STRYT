#!/usr/bin/env node
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const screenshotsDir = join(pub, "store-screenshots");
mkdirSync(screenshotsDir, { recursive: true });

function renderSvg(svg, width, height) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: "sans-serif",
    },
  });
  return r.render().asPng();
}

console.log("Generating Google Play Store Assets...");

// ============================================================================
// 1. FEATURE GRAPHIC (1024 x 500 px)
// ============================================================================
const featureGraphicSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1024" y2="500" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#120326" />
      <stop offset="35%" stop-color="#240747" />
      <stop offset="70%" stop-color="#4d1282" />
      <stop offset="100%" stop-color="#190333" />
    </linearGradient>
    <radialGradient id="ambientGlow" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#9d4edd" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#7c2fe8" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="badgeGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04" />
    </radialGradient>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6" />
    </filter>
    <filter id="glowEffect" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="1024" height="500" fill="url(#bgGrad)" />
  <rect width="1024" height="500" fill="url(#ambientGlow)" />

  <!-- Subtle Street Mesh / Radar Grid -->
  <circle cx="512" cy="180" r="160" fill="none" stroke="#a575fb" stroke-opacity="0.12" stroke-width="1.5" stroke-dasharray="4 6" />
  <circle cx="512" cy="180" r="230" fill="none" stroke="#a575fb" stroke-opacity="0.08" stroke-width="1.5" />
  <circle cx="512" cy="180" r="300" fill="none" stroke="#a575fb" stroke-opacity="0.05" stroke-width="1.5" stroke-dasharray="6 8" />

  <!-- Floating Ambient Nodes -->
  <circle cx="210" cy="120" r="6" fill="#ff8400" fill-opacity="0.8" />
  <line x1="210" y1="120" x2="350" y2="160" stroke="#ff8400" stroke-opacity="0.2" stroke-width="1.5" stroke-dasharray="2 4" />
  <circle cx="810" cy="140" r="7" fill="#06d6a0" fill-opacity="0.8" />
  <line x1="810" y1="140" x2="680" y2="170" stroke="#06d6a0" stroke-opacity="0.2" stroke-width="1.5" stroke-dasharray="2 4" />

  <!-- Central Brand Pin Emblem -->
  <g transform="translate(512, 160)" filter="url(#cardShadow)">
    <g transform="translate(-54, -75) scale(3.4)">
      <!-- Location Pin -->
      <path d="M32 13 C23 13 16 20 16 28.8 C16 39.5 32 52 32 52 C32 52 48 39.5 48 28.8 C48 20 41 13 32 13 Z" fill="#ffffff" />
      <!-- Winding Street -->
      <path d="M32 39 C25 34 39 24 32 19" stroke="#7c2fe8" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Street Centre Line / Lamp Lights -->
      <path d="M32 39 C25 34 39 24 32 19" stroke="#ff8400" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-dasharray="0.5 3.6" />
    </g>
  </g>

  <!-- Wordmark -->
  <text x="512" y="295" text-anchor="middle" font-family="'Outfit', 'Inter', 'Segoe UI', sans-serif" font-size="64" font-weight="900" fill="#ffffff" letter-spacing="8">STRYT</text>

  <!-- Tagline -->
  <text x="512" y="340" text-anchor="middle" font-family="'Inter', 'Segoe UI', sans-serif" font-size="20" font-weight="600" fill="#e9d8fd" letter-spacing="2">HYPERLOCAL STREET DISCOVERY &amp; COMMUNITY</text>

  <!-- Feature Highlights / Badges -->
  <g transform="translate(142, 400)">
    <!-- Pill 1 -->
    <g transform="translate(0, 0)">
      <rect width="168" height="42" rx="21" fill="url(#badgeGlow)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1" />
      <text x="84" y="26" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#ffffff">📍 Nearby Shops</text>
    </g>
    <!-- Pill 2 -->
    <g transform="translate(188, 0)">
      <rect width="180" height="42" rx="21" fill="url(#badgeGlow)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1" />
      <text x="90" y="26" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#ffffff">🤝 Live Proposals</text>
    </g>
    <!-- Pill 3 -->
    <g transform="translate(388, 0)">
      <rect width="176" height="42" rx="21" fill="url(#badgeGlow)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1" />
      <text x="88" y="26" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#ffffff">⚡ Zero-Fee UPI</text>
    </g>
    <!-- Pill 4 -->
    <g transform="translate(584, 0)">
      <rect width="156" height="42" rx="21" fill="url(#badgeGlow)" stroke="#ffffff" stroke-opacity="0.2" stroke-width="1" />
      <text x="78" y="26" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#ffffff">🛡️ My People</text>
    </g>
  </g>
</svg>`;

const featureBuffer = renderSvg(featureGraphicSvg, 1024, 500);
writeFileSync(join(pub, "play-feature-graphic.png"), featureBuffer);
console.log("✓ Created public/play-feature-graphic.png (1024x500)");

// ============================================================================
// HELPER FOR 1080 x 1920 PHONE SCREENSHOT SHOWCASES
// ============================================================================
function createScreenshotSvg({ badgeText, titleLine1, titleLine2, phoneCardContent }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="screenBg" x1="0" y1="0" x2="1080" y2="1920" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f021e" />
      <stop offset="40%" stop-color="#1a052e" />
      <stop offset="100%" stop-color="#2d0a4e" />
    </linearGradient>
    <radialGradient id="topGlow" cx="50%" cy="15%" r="60%">
      <stop offset="0%" stop-color="#7c2fe8" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <filter id="phoneShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="28" stdDeviation="40" flood-color="#000000" flood-opacity="0.75" />
    </filter>
    <clipPath id="phoneInnerClip">
      <rect x="150" y="440" width="780" height="1480" rx="44" />
    </clipPath>
  </defs>

  <!-- Background Canvas -->
  <rect width="1080" height="1920" fill="url(#screenBg)" />
  <rect width="1080" height="1920" fill="url(#topGlow)" />

  <!-- Header Category Pill -->
  <g transform="translate(540, 110)">
    <rect x="-140" y="0" width="280" height="48" rx="24" fill="#ffffff" fill-opacity="0.12" stroke="#a575fb" stroke-width="1.5" />
    <text x="0" y="31" text-anchor="middle" font-family="'Inter', sans-serif" font-size="20" font-weight="700" fill="#e9d8fd" letter-spacing="3">${badgeText}</text>
  </g>

  <!-- Big Catchy Headline -->
  <text x="540" y="235" text-anchor="middle" font-family="'Outfit', 'Inter', sans-serif" font-size="56" font-weight="900" fill="#ffffff" letter-spacing="1">${titleLine1}</text>
  <text x="540" y="305" text-anchor="middle" font-family="'Outfit', 'Inter', sans-serif" font-size="44" font-weight="700" fill="#c084fc" letter-spacing="1">${titleLine2}</text>

  <!-- Phone Mockup Outer Frame -->
  <g filter="url(#phoneShadow)">
    <rect x="142" y="432" width="796" height="1488" rx="52" fill="#1e1035" stroke="#4a1d7d" stroke-width="8" />
    <!-- Dynamic Island / Speaker Notch -->
    <rect x="440" y="456" width="200" height="28" rx="14" fill="#0a0314" />
    <circle cx="610" cy="470" r="5" fill="#1b1226" />
  </g>

  <!-- Phone Screen Content (Clipped) -->
  <g clip-path="url(#phoneInnerClip)">
    <rect x="150" y="440" width="780" height="1480" fill="#0d0417" />
    ${phoneCardContent}
  </g>
</svg>`;
}

// ============================================================================
// SCREENSHOT 1: HYPERLOCAL DISCOVERY & REAL-TIME MAP
// ============================================================================
const s1Content = `
  <!-- Top App Bar in Phone -->
  <rect x="150" y="500" width="780" height="90" fill="#150624" />
  <text x="180" y="555" font-family="'Outfit', sans-serif" font-size="32" font-weight="900" fill="#ffffff" letter-spacing="2">STRYT</text>
  <rect x="740" y="525" width="150" height="40" rx="20" fill="#7c2fe8" fill-opacity="0.25" stroke="#a575fb" stroke-width="1.5" />
  <circle cx="760" cy="545" r="5" fill="#22c55e" />
  <text x="825" y="551" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#e9d8fd">Indiranagar</text>

  <!-- Search & Filter Bar -->
  <rect x="180" y="615" width="720" height="60" rx="16" fill="#200a36" stroke="#4c1d7a" stroke-width="1.5" />
  <text x="215" y="652" font-family="'Inter', sans-serif" font-size="18" fill="#9ca3af">🔍 Search shops, services, street food...</text>

  <!-- Category Chips -->
  <rect x="180" y="695" width="130" height="42" rx="21" fill="#7c2fe8" />
  <text x="245" y="722" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#ffffff">All (28)</text>

  <rect x="325" y="695" width="160" height="42" rx="21" fill="#240c3c" stroke="#4c1d7a" stroke-width="1" />
  <text x="405" y="722" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">🍔 Street Food</text>

  <rect x="500" y="695" width="150" height="42" rx="21" fill="#240c3c" stroke="#4c1d7a" stroke-width="1" />
  <text x="575" y="722" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">✂️ Salons</text>

  <rect x="665" y="695" width="160" height="42" rx="21" fill="#240c3c" stroke="#4c1d7a" stroke-width="1" />
  <text x="745" y="722" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">🔧 Repair</text>

  <!-- Interactive Map Canvas Card -->
  <rect x="180" y="760" width="720" height="520" rx="24" fill="#1b0830" stroke="#4a187a" stroke-width="2" />
  <!-- Simulated Map Streets -->
  <path d="M 220 840 Q 400 890 560 810 T 860 890" stroke="#37155e" stroke-width="18" fill="none" stroke-linecap="round" />
  <path d="M 380 770 L 410 1260" stroke="#37155e" stroke-width="14" fill="none" />
  <path d="M 680 770 L 660 1260" stroke="#37155e" stroke-width="14" fill="none" />
  <circle cx="512" cy="980" r="14" fill="#7c2fe8" stroke="#ffffff" stroke-width="4" />
  <circle cx="512" cy="980" r="44" fill="#7c2fe8" fill-opacity="0.2" />

  <!-- Map Vendor Pin 1 -->
  <g transform="translate(320, 840)">
    <rect x="-80" y="-36" width="160" height="38" rx="12" fill="#7c2fe8" />
    <text x="0" y="-12" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="700" fill="#ffffff">Chai Point (120m)</text>
    <circle cx="0" cy="12" r="8" fill="#ff8400" stroke="#ffffff" stroke-width="2" />
  </g>

  <!-- Map Vendor Pin 2 -->
  <g transform="translate(700, 930)">
    <rect x="-90" y="-36" width="180" height="38" rx="12" fill="#12b886" />
    <text x="0" y="-12" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="700" fill="#ffffff">Fresh Greens • Open</text>
    <circle cx="0" cy="12" r="8" fill="#12b886" stroke="#ffffff" stroke-width="2" />
  </g>

  <!-- Featured Vendor Card 1 -->
  <rect x="180" y="1305" width="720" height="155" rx="20" fill="#1e0936" stroke="#481878" stroke-width="1.5" />
  <rect x="205" y="1328" width="110" height="110" rx="16" fill="#7c2fe8" fill-opacity="0.3" />
  <text x="260" y="1395" text-anchor="middle" font-size="44">☕</text>
  <text x="340" y="1360" font-family="'Outfit', sans-serif" font-size="24" font-weight="800" fill="#ffffff">Sharma Special Chai &amp; Snacks</text>
  <text x="340" y="1392" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">12th Main Road • 180m away • ★ 4.9 (142)</text>
  <rect x="340" y="1408" width="90" height="24" rx="6" fill="#22c55e" fill-opacity="0.2" />
  <text x="385" y="1425" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#4ade80">● Open Now</text>
  <text x="860" y="1395" text-anchor="end" font-family="'Inter', sans-serif" font-size="20" font-weight="800" fill="#ff8400">View →</text>

  <!-- Featured Vendor Card 2 -->
  <rect x="180" y="1485" width="720" height="155" rx="20" fill="#1e0936" stroke="#481878" stroke-width="1.5" />
  <rect x="205" y="1508" width="110" height="110" rx="16" fill="#7c2fe8" fill-opacity="0.3" />
  <text x="260" y="1575" text-anchor="middle" font-size="44">✂️</text>
  <text x="340" y="1540" font-family="'Outfit', sans-serif" font-size="24" font-weight="800" fill="#ffffff">Apex Precision Hair Studio</text>
  <text x="340" y="1572" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">Next to Metro Gate 2 • 340m away • ★ 4.8</text>
  <rect x="340" y="1588" width="120" height="24" rx="6" fill="#7c2fe8" fill-opacity="0.3" />
  <text x="400" y="1605" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#c084fc">Slots Available</text>
`;

const s1Svg = createScreenshotSvg({
  badgeText: "EXPLORE &amp; DISCOVER",
  titleLine1: "Hyperlocal Street Map",
  titleLine2: "Find Shops &amp; Vendors Nearby",
  phoneCardContent: s1Content,
});
writeFileSync(join(screenshotsDir, "01_hyperlocal_discovery.png"), renderSvg(s1Svg, 1080, 1920));
console.log("✓ Created public/store-screenshots/01_hyperlocal_discovery.png");

// ============================================================================
// SCREENSHOT 2: PROPOSALS & LIVE STREET BARGAINING
// ============================================================================
const s2Content = `
  <!-- Top App Bar -->
  <rect x="150" y="500" width="780" height="90" fill="#150624" />
  <text x="180" y="555" font-family="'Outfit', sans-serif" font-size="28" font-weight="800" fill="#ffffff">Street Requests &amp; Bargaining</text>

  <!-- Live Request Banner -->
  <rect x="180" y="615" width="720" height="175" rx="20" fill="#240c3c" stroke="#a575fb" stroke-width="2" />
  <rect x="205" y="635" width="120" height="30" rx="15" fill="#ff8400" fill-opacity="0.2" />
  <text x="265" y="656" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="700" fill="#fb923c">BROADCAST ACTIVE</text>
  <text x="205" y="695" font-family="'Outfit', sans-serif" font-size="22" font-weight="800" fill="#ffffff">Looking for 5kg Alphonso Mangoes</text>
  <text x="205" y="725" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">Budget: ₹1,200 • Within 2 km • 3 Proposals Received</text>
  <text x="205" y="760" font-family="'Inter', sans-serif" font-size="14" fill="#a575fb">⏱ Expires in 42 mins</text>

  <!-- Proposal Card 1 (Selected/Bargaining) -->
  <rect x="180" y="815" width="720" height="260" rx="20" fill="#1e0936" stroke="#22c55e" stroke-width="2" />
  <rect x="205" y="835" width="90" height="28" rx="14" fill="#22c55e" fill-opacity="0.2" />
  <text x="250" y="854" text-anchor="middle" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#4ade80">TOP OFFER</text>
  <text x="310" y="855" font-family="'Outfit', sans-serif" font-size="22" font-weight="800" fill="#ffffff">Ratnagiri Fruit Depot (400m)</text>
  <text x="205" y="895" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">"Fresh morning crate directly from Devgad. Guaranteed sweet!"</text>
  <rect x="205" y="915" width="670" height="60" rx="14" fill="#140624" />
  <text x="225" y="952" font-family="'Inter', sans-serif" font-size="18" fill="#9ca3af">Offer Price: <tspan fill="#ffffff" font-weight="800">₹1,100</tspan> (Saved ₹100!)</text>
  <!-- Action Buttons -->
  <rect x="205" y="995" width="320" height="52" rx="14" fill="#22c55e" />
  <text x="365" y="1028" text-anchor="middle" font-family="'Inter', sans-serif" font-size="17" font-weight="800" fill="#000000">Accept &amp; Pay UPI (₹1,100)</text>
  <rect x="545" y="995" width="330" height="52" rx="14" fill="#3b1563" stroke="#a575fb" stroke-width="1.5" />
  <text x="710" y="1028" text-anchor="middle" font-family="'Inter', sans-serif" font-size="17" font-weight="700" fill="#ffffff">Counter / Chat</text>

  <!-- Proposal Card 2 -->
  <rect x="180" y="1095" width="720" height="200" rx="20" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
  <text x="205" y="1135" font-family="'Outfit', sans-serif" font-size="22" font-weight="800" fill="#ffffff">Green Valley Organics (1.1 km)</text>
  <text x="205" y="1168" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">"Naturally ripened grade-A mangoes with box packaging."</text>
  <rect x="205" y="1190" width="670" height="48" rx="12" fill="#140624" />
  <text x="225" y="1222" font-family="'Inter', sans-serif" font-size="17" fill="#9ca3af">Offer Price: <tspan fill="#ffffff" font-weight="800">₹1,250</tspan> • Free Doorstep Delivery</text>

  <!-- Instant UPI Scan & Pay Highlight -->
  <rect x="180" y="1320" width="720" height="310" rx="24" fill="#240c3c" stroke="#ff8400" stroke-width="2" />
  <text x="205" y="1365" font-family="'Outfit', sans-serif" font-size="24" font-weight="800" fill="#ffffff">⚡ Zero Commission Direct UPI</text>
  <text x="205" y="1400" font-family="'Inter', sans-serif" font-size="16" fill="#e2e8f0">No middleman cuts. 100% of your payment goes straight to</text>
  <text x="205" y="1425" font-family="'Inter', sans-serif" font-size="16" fill="#e2e8f0">the local vendor via GPay, PhonePe, Paytm, or BHIM.</text>
  <rect x="205" y="1455" width="670" height="145" rx="16" fill="#140624" />
  <circle cx="280" cy="1527" r="42" fill="#ff8400" fill-opacity="0.2" />
  <text x="280" y="1542" text-anchor="middle" font-size="34">₹</text>
  <text x="350" y="1515" font-family="'Inter', sans-serif" font-size="18" font-weight="700" fill="#ffffff">Instant Verification &amp; Offline Receipt</text>
  <text x="350" y="1545" font-family="'Inter', sans-serif" font-size="15" fill="#9ca3af">On-device QR code generation • Secure peer-to-peer</text>
`;

const s2Svg = createScreenshotSvg({
  badgeText: "REAL-TIME BARGAINING",
  titleLine1: "Post Needs, Get Offers",
  titleLine2: "Zero-Commission Direct UPI",
  phoneCardContent: s2Content,
});
writeFileSync(join(screenshotsDir, "02_live_proposals_bargain.png"), renderSvg(s2Svg, 1080, 1920));
console.log("✓ Created public/store-screenshots/02_live_proposals_bargain.png");

// ============================================================================
// SCREENSHOT 3: APPOINTMENTS & SLOT BOOKINGS
// ============================================================================
const s3Content = `
  <!-- Top App Bar -->
  <rect x="150" y="500" width="780" height="90" fill="#150624" />
  <text x="180" y="555" font-family="'Outfit', sans-serif" font-size="28" font-weight="800" fill="#ffffff">Book Local Services</text>

  <!-- Service Provider Profile Card -->
  <rect x="180" y="615" width="720" height="230" rx="20" fill="#1e0936" stroke="#481878" stroke-width="1.5" />
  <rect x="205" y="640" width="80" height="80" rx="20" fill="#7c2fe8" fill-opacity="0.3" />
  <text x="245" y="695" text-anchor="middle" font-size="38">✂️</text>
  <text x="310" y="665" font-family="'Outfit', sans-serif" font-size="24" font-weight="800" fill="#ffffff">Enzo Hair &amp; Beard Lounge</text>
  <text x="310" y="695" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">Master Stylist: Rajesh Verma • ★ 4.9 (312 reviews)</text>
  <text x="310" y="725" font-family="'Inter', sans-serif" font-size="15" fill="#a575fb">📍 100ft Road, Indiranagar (450m away)</text>
  <!-- Service Tag Badges -->
  <rect x="205" y="760" width="140" height="34" rx="17" fill="#2d0d52" />
  <text x="275" y="783" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#e9d8fd">Haircut &amp; Fade</text>
  <rect x="360" y="760" width="140" height="34" rx="17" fill="#2d0d52" />
  <text x="430" y="783" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#e9d8fd">Beard Sculpt</text>
  <rect x="515" y="760" width="150" height="34" rx="17" fill="#2d0d52" />
  <text x="590" y="783" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#e9d8fd">Detan Therapy</text>

  <!-- Interactive Date / Day Selector -->
  <text x="185" y="885" font-family="'Outfit', sans-serif" font-size="22" font-weight="800" fill="#ffffff">Select Date</text>
  <g transform="translate(180, 905)">
    <!-- Day 1 (Active) -->
    <rect x="0" y="0" width="130" height="90" rx="18" fill="#7c2fe8" />
    <text x="65" y="38" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#e9d8fd">TODAY</text>
    <text x="65" y="70" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="26" font-weight="900" fill="#ffffff">11 Sep</text>

    <!-- Day 2 -->
    <rect x="145" y="0" width="130" height="90" rx="18" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="210" y="38" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#9ca3af">SAT</text>
    <text x="210" y="70" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="26" font-weight="700" fill="#ffffff">12 Sep</text>

    <!-- Day 3 -->
    <rect x="290" y="0" width="130" height="90" rx="18" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="355" y="38" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#9ca3af">SUN</text>
    <text x="355" y="70" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="26" font-weight="700" fill="#ffffff">13 Sep</text>

    <!-- Day 4 -->
    <rect x="435" y="0" width="130" height="90" rx="18" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="500" y="38" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="600" fill="#9ca3af">MON</text>
    <text x="500" y="70" text-anchor="middle" font-family="'Outfit', sans-serif" font-size="26" font-weight="700" fill="#ffffff">14 Sep</text>
  </g>

  <!-- Available Time Slots -->
  <text x="185" y="1035" font-family="'Outfit', sans-serif" font-size="22" font-weight="800" fill="#ffffff">Available Time Slots</text>
  <g transform="translate(180, 1055)">
    <rect x="0" y="0" width="225" height="52" rx="14" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="112" y="33" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">11:00 AM</text>

    <rect x="245" y="0" width="225" height="52" rx="14" fill="#7c2fe8" />
    <text x="357" y="33" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#ffffff">02:30 PM (Selected)</text>

    <rect x="490" y="0" width="225" height="52" rx="14" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="602" y="33" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">04:00 PM</text>

    <rect x="0" y="68" width="225" height="52" rx="14" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="112" y="101" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">05:30 PM</text>

    <rect x="245" y="68" width="225" height="52" rx="14" fill="#1b0830" stroke="#481878" stroke-width="1.5" />
    <text x="357" y="101" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" font-weight="600" fill="#cbd5e1">07:00 PM</text>
  </g>

  <!-- Booking Summary Bottom Sheet -->
  <rect x="180" y="1225" width="720" height="400" rx="24" fill="#240c3c" stroke="#a575fb" stroke-width="2" />
  <text x="210" y="1275" font-family="'Outfit', sans-serif" font-size="24" font-weight="800" fill="#ffffff">Booking Summary</text>
  <text x="210" y="1315" font-family="'Inter', sans-serif" font-size="17" fill="#cbd5e1">Service: Premium Haircut &amp; Beard Shape</text>
  <text x="210" y="1350" font-family="'Inter', sans-serif" font-size="17" fill="#cbd5e1">Time: Today, 11 Sep at 02:30 PM</text>
  <text x="210" y="1385" font-family="'Inter', sans-serif" font-size="17" fill="#cbd5e1">Estimated Duration: 45 Minutes</text>
  <line x1="210" y1="1415" x2="870" y2="1415" stroke="#4a187a" stroke-width="1.5" />
  <text x="210" y="1455" font-family="'Outfit', sans-serif" font-size="22" font-weight="700" fill="#ffffff">Total Amount</text>
  <text x="870" y="1455" text-anchor="end" font-family="'Outfit', sans-serif" font-size="28" font-weight="900" fill="#22c55e">₹450</text>
  <!-- Confirm Button -->
  <rect x="210" y="1490" width="660" height="60" rx="18" fill="#7c2fe8" />
  <text x="540" y="1528" text-anchor="middle" font-family="'Inter', sans-serif" font-size="19" font-weight="800" fill="#ffffff">Confirm Slot &amp; Reserve</text>
  <text x="540" y="1580" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" fill="#a575fb">No cancellation fee • Pay at venue or UPI</text>
`;

const s3Svg = createScreenshotSvg({
  badgeText: "INSTANT BOOKINGS",
  titleLine1: "Book Appointments",
  titleLine2: "Zero Wait Times with Local Pros",
  phoneCardContent: s3Content,
});
writeFileSync(join(screenshotsDir, "03_instant_appointments.png"), renderSvg(s3Svg, 1080, 1920));
console.log("✓ Created public/store-screenshots/03_instant_appointments.png");

// ============================================================================
// SCREENSHOT 4: REAL-TIME NOTIFICATIONS & MY PEOPLE SAFETY
// ============================================================================
const s4Content = `
  <!-- Top App Bar -->
  <rect x="150" y="500" width="780" height="90" fill="#150624" />
  <text x="180" y="555" font-family="'Outfit', sans-serif" font-size="28" font-weight="800" fill="#ffffff">Notifications &amp; Activity</text>
  <rect x="740" y="525" width="150" height="40" rx="20" fill="#22c55e" fill-opacity="0.2" />
  <text x="815" y="551" text-anchor="middle" font-family="'Inter', sans-serif" font-size="15" font-weight="700" fill="#4ade80">● 4 New Alerts</text>

  <!-- Notification 1: Appointment Reminder -->
  <rect x="180" y="615" width="720" height="150" rx="20" fill="#1e0936" stroke="#7c2fe8" stroke-width="1.5" />
  <rect x="205" y="635" width="64" height="64" rx="16" fill="#7c2fe8" fill-opacity="0.3" />
  <text x="237" y="678" text-anchor="middle" font-size="32">⏰</text>
  <text x="290" y="658" font-family="'Outfit', sans-serif" font-size="20" font-weight="800" fill="#ffffff">Appointment in 30 Mins!</text>
  <text x="290" y="688" font-family="'Inter', sans-serif" font-size="15" fill="#cbd5e1">Rajesh Verma is ready for your haircut at 02:30 PM.</text>
  <text x="290" y="718" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#a575fb">Tap to view directions &amp; slot token</text>
  <text x="870" y="658" text-anchor="end" font-family="'Inter', sans-serif" font-size="13" fill="#9ca3af">2m ago</text>

  <!-- Notification 2: Counter-Offer Received -->
  <rect x="180" y="785" width="720" height="150" rx="20" fill="#1e0936" stroke="#22c55e" stroke-width="1.5" />
  <rect x="205" y="805" width="64" height="64" rx="16" fill="#22c55e" fill-opacity="0.2" />
  <text x="237" y="848" text-anchor="middle" font-size="32">🤝</text>
  <text x="290" y="828" font-family="'Outfit', sans-serif" font-size="20" font-weight="800" fill="#ffffff">New Counter-Offer: ₹1,100</text>
  <text x="290" y="858" font-family="'Inter', sans-serif" font-size="15" fill="#cbd5e1">Ratnagiri Fruit Depot countered your Alphonso mango request.</text>
  <text x="290" y="888" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#4ade80">Tap to accept offer &amp; lock deal</text>
  <text x="870" y="828" text-anchor="end" font-family="'Inter', sans-serif" font-size="13" fill="#9ca3af">8m ago</text>

  <!-- Notification 3: Street Alert -->
  <rect x="180" y="955" width="720" height="150" rx="20" fill="#1e0936" stroke="#ff8400" stroke-width="1.5" />
  <rect x="205" y="975" width="64" height="64" rx="16" fill="#ff8400" fill-opacity="0.2" />
  <text x="237" y="1018" text-anchor="middle" font-size="32">📢</text>
  <text x="290" y="998" font-family="'Outfit', sans-serif" font-size="20" font-weight="800" fill="#ffffff">Street Flash Deal: 40% Off Flowers</text>
  <text x="290" y="1028" font-family="'Inter', sans-serif" font-size="15" fill="#cbd5e1">Orchid Blossom on 4th Cross has fresh bouquets arriving.</text>
  <text x="290" y="1058" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#fb923c">Valid for the next 2 hours</text>
  <text x="870" y="998" text-anchor="end" font-family="'Inter', sans-serif" font-size="13" fill="#9ca3af">15m ago</text>

  <!-- My People Live Share Card -->
  <rect x="180" y="1135" width="720" height="340" rx="24" fill="#240c3c" stroke="#a575fb" stroke-width="2" />
  <rect x="205" y="1160" width="130" height="32" rx="16" fill="#22c55e" fill-opacity="0.25" />
  <circle cx="225" cy="1176" r="6" fill="#22c55e" />
  <text x="275" y="1182" text-anchor="middle" font-family="'Inter', sans-serif" font-size="14" font-weight="700" fill="#4ade80">LIVE ACTIVE</text>
  <text x="205" y="1230" font-family="'Outfit', sans-serif" font-size="26" font-weight="800" fill="#ffffff">🛡️ My People Live Location Share</text>
  <text x="205" y="1265" font-family="'Inter', sans-serif" font-size="16" fill="#cbd5e1">Sharing real-time position with: <tspan fill="#ffffff" font-weight="700">Mom &amp; Ritu (2 contacts)</tspan></text>
  
  <rect x="205" y="1295" width="670" height="85" rx="16" fill="#140624" />
  <circle cx="255" cy="1337" r="22" fill="#7c2fe8" />
  <text x="255" y="1345" text-anchor="middle" font-size="22">📍</text>
  <text x="295" y="1330" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#ffffff">Background tracking active (FGS)</text>
  <text x="295" y="1355" font-family="'Inter', sans-serif" font-size="14" fill="#9ca3af">Updates continue even when phone screen is locked.</text>

  <rect x="205" y="1400" width="670" height="52" rx="16" fill="#dc2626" />
  <text x="540" y="1433" text-anchor="middle" font-family="'Inter', sans-serif" font-size="17" font-weight="800" fill="#ffffff">Stop Sharing Live Location</text>
`;

const s4Svg = createScreenshotSvg({
  badgeText: "SAFETY &amp; UPDATES",
  titleLine1: "Smart Alerts &amp; Safety",
  titleLine2: "Live Emergency Network with My People",
  phoneCardContent: s4Content,
});
writeFileSync(join(screenshotsDir, "04_notifications_my_people.png"), renderSvg(s4Svg, 1080, 1920));
console.log("✓ Created public/store-screenshots/04_notifications_my_people.png");

console.log("All Google Play Store Graphics Generated Successfully!");
