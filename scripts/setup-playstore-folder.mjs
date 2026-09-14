import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const destRoot = path.join(root, "playstore-assets");

const dirs = [
  destRoot,
  path.join(destRoot, "graphics"),
  path.join(destRoot, "graphics", "screenshots"),
  path.join(destRoot, "metadata"),
  path.join(destRoot, "policy-and-declarations"),
];

for (const d of dirs) {
  fs.mkdirSync(d, { recursive: true });
}

// 1. Copy Graphics
fs.copyFileSync(
  path.join(root, "public", "icon-512.png"),
  path.join(destRoot, "graphics", "icon-512.png")
);
fs.copyFileSync(
  path.join(root, "public", "play-feature-graphic.png"),
  path.join(destRoot, "graphics", "feature-graphic-1024x500.png")
);

const screenshots = [
  "01_hyperlocal_discovery.png",
  "02_live_proposals_bargain.png",
  "03_instant_appointments.png",
  "04_notifications_my_people.png",
];

for (const s of screenshots) {
  fs.copyFileSync(
    path.join(root, "public", "store-screenshots", s),
    path.join(destRoot, "graphics", "screenshots", s)
  );
}

// 2. Copy Documentation Dossiers
fs.copyFileSync(
  path.join(root, "docs", "launch", "play-console", "STORE_LISTING.md"),
  path.join(destRoot, "metadata", "STORE_LISTING_FULL.md")
);
fs.copyFileSync(
  path.join(root, "docs", "launch", "play-console", "PLAY_CONSOLE_MASTER_DOSSIER.md"),
  path.join(destRoot, "policy-and-declarations", "PLAY_CONSOLE_MASTER_DOSSIER.md")
);
fs.copyFileSync(
  path.join(root, "docs", "launch", "play-console", "DATA_SAFETY.md"),
  path.join(destRoot, "policy-and-declarations", "DATA_SAFETY.md")
);
fs.copyFileSync(
  path.join(root, "docs", "launch", "play-console", "BACKGROUND_LOCATION_DECLARATION.md"),
  path.join(destRoot, "policy-and-declarations", "BACKGROUND_LOCATION_DECLARATION.md")
);
fs.copyFileSync(
  path.join(root, "docs", "launch", "play-console", "APP_ACCESS.md"),
  path.join(destRoot, "policy-and-declarations", "APP_ACCESS.md")
);

console.log("Play Store assets folder setup complete at:", destRoot);
