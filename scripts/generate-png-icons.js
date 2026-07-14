import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function generate() {
  const svgPath = path.join(rootDir, 'public', 'favicon.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  
  // Encode SVG to base64 data URL
  const base64Svg = Buffer.from(svgContent).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;
  
  const browser = await chromium.launch();
  
  try {
    const sizes = [192, 512];
    for (const size of sizes) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: size, height: size });
      
      // Load the SVG directly
      await page.goto(dataUrl);
      
      // Make background transparent/hidden in browser viewport if needed, 
      // but favicon.svg already has <rect> for background, so we want the rect.
      const outputPath = path.join(rootDir, 'public', `icon-${size}.png`);
      await page.screenshot({
        path: outputPath,
        omitBackground: true,
        type: 'png'
      });
      console.log(`Generated: public/icon-${size}.png`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
