/**
 * Story Studio composition helpers & canvas exporter.
 *
 * Keeps filter definitions, backdrop themes, Fit/Fill cover geometry, and
 * offscreen 9:16 JPEG compositing in one pure module so StoryViewer renders
 * styled overlays, filters, and stickers identically without DB changes.
 */

export type StoryFitMode = "cover" | "contain";
export type StoryTextStyle = "snap" | "classic" | "pill";

export interface StoryFilterPreset {
  id: string;
  labelKey: string;
  cssFilter: string;
}

export const STORY_FILTERS: readonly StoryFilterPreset[] = [
  { id: "original", labelKey: "storyc_filter_original", cssFilter: "none" },
  { id: "warm", labelKey: "storyc_filter_warm", cssFilter: "sepia(0.24) saturate(1.25) brightness(1.04)" },
  { id: "vivid", labelKey: "storyc_filter_vivid", cssFilter: "saturate(1.42) contrast(1.08)" },
  { id: "cool", labelKey: "storyc_filter_cool", cssFilter: "saturate(0.92) hue-rotate(12deg) brightness(1.03)" },
  { id: "dusk", labelKey: "storyc_filter_dusk", cssFilter: "contrast(1.12) brightness(0.9) saturate(1.16)" },
  { id: "mono", labelKey: "storyc_filter_mono", cssFilter: "grayscale(1) contrast(1.14)" },
] as const;

export interface StoryBackdropPreset {
  id: string;
  fromToken: string;
  toToken: string;
}

export const STORY_BACKDROPS: readonly StoryBackdropPreset[] = [
  { id: "violet", fromToken: "--brand-600", toToken: "--brand-900" },
  { id: "sunset", fromToken: "--orange-500", toToken: "--pink-600" },
  { id: "ocean", fromToken: "--blue-600", toToken: "--brand-700" },
  { id: "emerald", fromToken: "--green-600", toToken: "--ink-900" },
  { id: "midnight", fromToken: "--ink-800", toToken: "--ink-900" },
] as const;

export interface StoryTextColorOption {
  id: string;
  token: string;
  inkOnFill: "light" | "dark";
}

export const STORY_TEXT_COLORS: readonly StoryTextColorOption[] = [
  { id: "white", token: "--white", inkOnFill: "dark" },
  { id: "brand", token: "--brand-500", inkOnFill: "light" },
  { id: "amber", token: "--amber-400", inkOnFill: "dark" },
  { id: "red", token: "--red-500", inkOnFill: "light" },
  { id: "green", token: "--green-500", inkOnFill: "light" },
  { id: "blue", token: "--blue-500", inkOnFill: "light" },
  { id: "black", token: "--ink-900", inkOnFill: "light" },
] as const;

export const STORY_STICKER_EMOJIS = ["🔥", "✨", "❤️", "🎉", "🙌", "☕", "🌙", "🛍️", "⚡", "😍"] as const;

export interface StoryTextLayer {
  text: string;
  style: StoryTextStyle;
  colorId: string;
  /** Vertical center ratio within the canvas (0.14 .. 0.86). */
  yPct: number;
}

export interface StorySticker {
  id: string;
  kind: "emoji" | "location";
  label: string;
  /** Horizontal center ratio (0.12 .. 0.88). */
  xPct: number;
  /** Vertical center ratio (0.14 .. 0.84). */
  yPct: number;
}

export interface DrawRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clamp overlay percentages safely away from top/bottom floating chrome. */
export function clampOverlayPct(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return (min + max) / 2;
  return Math.min(max, Math.max(min, v));
}

/** Pure geometry for drawing a photo inside the 9:16 story canvas in Fill (cover) or Fit (contain) mode. */
export function computeDrawRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mode: StoryFitMode,
): DrawRect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { x: 0, y: 0, w: dstW, h: dstH };
  }
  const scale = mode === "cover"
    ? Math.max(dstW / srcW, dstH / srcH)
    : Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (dstW - w) / 2,
    y: (dstH - h) / 2,
    w,
    h,
  };
}

function readCssToken(token: string, fallback: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return val || fallback;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const rawLines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const para of rawLines) {
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) out.push(current);
        current = word;
      }
    }
    out.push(current);
  }
  return out;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export interface RenderStoryParams {
  imageSrc?: string;
  backdropId: string;
  filterId: string;
  fitMode: StoryFitMode;
  textLayer: StoryTextLayer | null;
  stickers: readonly StorySticker[];
}

/** Renders the composed 1080×1920 story into a JPEG File ready for uploadService.upload(). */
export async function renderStoryToFile(params: RenderStoryParams): Promise<File | null> {
  if (typeof document === "undefined") return null;
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const backdrop = STORY_BACKDROPS.find((b) => b.id === params.backdropId) ?? STORY_BACKDROPS[0];
  const fromColor = readCssToken(backdrop.fromToken, "#000000");
  const toColor = readCssToken(backdrop.toToken, "#000000");

  // 1. Base background (gradient or blurred photo under "contain" fit).
  const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
  grad.addColorStop(0, fromColor);
  grad.addColorStop(1, toColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (params.imageSrc) {
    try {
      const img = await loadHtmlImage(params.imageSrc);
      const filter = STORY_FILTERS.find((f) => f.id === params.filterId)?.cssFilter ?? "none";

      if (params.fitMode === "contain") {
        const bgRect = computeDrawRect(img.naturalWidth, img.naturalHeight, W, H, "cover");
        ctx.save();
        ctx.filter = `blur(42px) brightness(0.55)${filter !== "none" ? ` ${filter}` : ""}`;
        ctx.drawImage(img, bgRect.x - 40, bgRect.y - 40, bgRect.w + 80, bgRect.h + 80);
        ctx.restore();
      }

      const fgRect = computeDrawRect(img.naturalWidth, img.naturalHeight, W, H, params.fitMode);
      ctx.save();
      ctx.filter = filter;
      ctx.drawImage(img, fgRect.x, fgRect.y, fgRect.w, fgRect.h);
      ctx.restore();
    } catch {
      return null;
    }
  }

  // 2. Positioned text layer (Snap bar / IG Bold / Highlight pill).
  const textContent = params.textLayer?.text.trim() ?? "";
  if (params.textLayer && textContent) {
    const colorMeta = STORY_TEXT_COLORS.find((c) => c.id === params.textLayer?.colorId) ?? STORY_TEXT_COLORS[0];
    const resolvedColor = readCssToken(colorMeta.token, "#ffffff");
    const yCenter = clampOverlayPct(params.textLayer.yPct, 0.14, 0.86) * H;
    const fontSize = params.textLayer.style === "snap" ? 48 : 54;
    const lineHeight = Math.round(fontSize * 1.28);

    ctx.save();
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapLines(ctx, textContent, W - 140);
    const blockH = lines.length * lineHeight;

    if (params.textLayer.style === "snap") {
      const bandPad = 26;
      ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
      ctx.fillRect(0, yCenter - blockH / 2 - bandPad, W, blockH + bandPad * 2);
      ctx.fillStyle = resolvedColor;
    } else if (params.textLayer.style === "pill") {
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 80);
      const pillW = Math.min(W - 80, widest + 72);
      const pillH = blockH + 44;
      ctx.fillStyle = resolvedColor;
      drawRoundedRect(ctx, (W - pillW) / 2, yCenter - pillH / 2, pillW, pillH, 28);
      ctx.fill();
      ctx.fillStyle = colorMeta.inkOnFill === "dark" ? "#000000" : "#ffffff";
    } else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = resolvedColor;
    }

    const startY = yCenter - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, startY + idx * lineHeight);
    });
    ctx.restore();
  }

  // 3. Stickers (location pills + emoji stamps).
  for (const st of params.stickers) {
    const cx = clampOverlayPct(st.xPct, 0.12, 0.88) * W;
    const cy = clampOverlayPct(st.yPct, 0.14, 0.84) * H;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (st.kind === "location") {
      ctx.font = `700 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const text = `📍 ${st.label}`;
      const tw = Math.min(W - 120, ctx.measureText(text).width + 64);
      const th = 74;
      ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
      ctx.shadowBlur = 18;
      drawRoundedRect(ctx, cx - tw / 2, cy - th / 2, tw, th, 999);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = "#000000";
      ctx.fillText(text, cx, cy, W - 160);
    } else {
      ctx.font = `92px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 14;
      ctx.fillText(st.label, cx, cy);
    }
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.88),
  );
  if (!blob) return null;
  return new File([blob], `story-${Date.now()}.jpg`, { type: "image/jpeg" });
}
