import { converter } from 'culori';
const toRgb=converter('rgb');
import { RGBAColor } from "@frameforge/scene-graph";

// Common CSS named colors
const NAMED_COLORS: Record<string, string> = {
  transparent: "rgba(0,0,0,0)",
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  purple: "#800080",
  teal: "#008080",
  navy: "#000080",
  orange: "#ffa500",
};

export function parseColor(cssColor: string): RGBAColor {
  if (!cssColor || typeof cssColor !== "string") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const clean = cssColor.trim().toLowerCase();

  if (NAMED_COLORS[clean]) {
    return parseColor(NAMED_COLORS[clean]);
  }

  // Hex format (#rgb, #rgba, #rrggbb, #rrggbbaa)
  if (clean.startsWith("#")) {
    const hex = clean.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb(...) / rgba(...)
  const rgbMatch = clean.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*[,/]\s*([0-9.%]+))?\s*\)/);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, parseFloat(rgbMatch[1]))) / 255;
    const g = Math.min(255, Math.max(0, parseFloat(rgbMatch[2]))) / 255;
    const b = Math.min(255, Math.max(0, parseFloat(rgbMatch[3]))) / 255;
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      if (rgbMatch[4].endsWith("%")) {
        a = parseFloat(rgbMatch[4]) / 100;
      } else {
        a = parseFloat(rgbMatch[4]);
      }
    }
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  }

  // Space-separated rgb (modern CSS Color 4: rgb(255 255 255 / 0.5))
  const rgbSpaceMatch = clean.match(/rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.%]+))?\s*\)/);
  if (rgbSpaceMatch) {
    const r = Math.min(255, Math.max(0, parseFloat(rgbSpaceMatch[1]))) / 255;
    const g = Math.min(255, Math.max(0, parseFloat(rgbSpaceMatch[2]))) / 255;
    const b = Math.min(255, Math.max(0, parseFloat(rgbSpaceMatch[3]))) / 255;
    let a = 1;
    if (rgbSpaceMatch[4] !== undefined) {
      if (rgbSpaceMatch[4].endsWith("%")) {
        a = parseFloat(rgbSpaceMatch[4]) / 100;
      } else {
        a = parseFloat(rgbSpaceMatch[4]);
      }
    }
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  }

  // CSS Color 4 functions and the full named-colour set, clipped to Figma's sRGB gamut.
  const converted=toRgb(clean);
  if(converted){const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));return {r:clamp(converted.r),g:clamp(converted.g),b:clamp(converted.b),a:clamp(converted.alpha??1)};}
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgbaToHex(color: RGBAColor, includeAlpha = false): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(color.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(color.b * 255).toString(16).padStart(2, "0");
  if (includeAlpha || color.a < 1) {
    const a = Math.round(color.a * 255).toString(16).padStart(2, "0");
    return `#${r}${g}${b}${a}`;
  }
  return `#${r}${g}${b}`;
}

export function rgbaToRgbString(color: RGBAColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Number(color.a.toFixed(2))})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgbaToHsl(color: RGBAColor): { h: number; s: number; l: number; a: number } {
  const r = color.r;
  const g = color.g;
  const b = color.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: color.a,
  };
}

export function rgbaToHslString(color: RGBAColor): string {
  const { h, s, l, a } = rgbaToHsl(color);
  if (a < 1) {
    return `hsla(${h}, ${s}%, ${l}%, ${Number(a.toFixed(2))})`;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Convert sRGB to linear sRGB for relative luminance
function sRGBToLinear(val: number): number {
  return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
}

// Relative luminance as defined by WCAG 2.1
export function relativeLuminance(color: RGBAColor): number {
  const rLin = sRGBToLinear(color.r);
  const gLin = sRGBToLinear(color.g);
  const bLin = sRGBToLinear(color.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

// WCAG Contrast ratio: (L1 + 0.05) / (L2 + 0.05) where L1 is lighter
export function wcagContrastRatio(fg: RGBAColor, bg: RGBAColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface WCAGResult {
  contrastRatio: number;
  contrastRatioFormatted: string;
  isLargeText: boolean;
  aaPass: boolean;
  aaaPass: boolean;
  uncertain: boolean;
  uncertaintyReason?: string;
}

export function checkWCAGCompliance(
  fg: RGBAColor,
  bg: RGBAColor,
  fontSizePx = 16,
  fontWeight = 400,
  hasComplexBackground = false
): WCAGResult {
  if (hasComplexBackground || bg.a < 0.95 || fg.a < 0.95) {
    return {
      contrastRatio: 0,
      contrastRatioFormatted: "Approx / Uncertain",
      isLargeText: false,
      aaPass: false,
      aaaPass: false,
      uncertain: true,
      uncertaintyReason: "Background or text contains transparency, gradient, or image layer",
    };
  }

  const ratio = wcagContrastRatio(fg, bg);
  // WCAG defines large text as >= 18pt (24px) or >= 14pt (18.66px) bold (>= 700)
  const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

  const aaMin = isLargeText ? 3.0 : 4.5;
  const aaaMin = isLargeText ? 4.5 : 7.0;

  return {
    contrastRatio: Number(ratio.toFixed(2)),
    contrastRatioFormatted: `${ratio.toFixed(2)}:1`,
    isLargeText,
    aaPass: ratio >= aaMin,
    aaaPass: ratio >= aaaMin,
    uncertain: false,
  };
}

// Curated Tailwind Palette sample tokens for nearest-match recommendation
export const TAILWIND_PALETTE: { name: string; hex: string; rgb: [number, number, number] }[] = [
  { name: "slate-50", hex: "#f8fafc", rgb: [248, 250, 252] },
  { name: "slate-100", hex: "#f1f5f9", rgb: [241, 245, 249] },
  { name: "slate-200", hex: "#e2e8f0", rgb: [226, 232, 240] },
  { name: "slate-300", hex: "#cbd5e1", rgb: [203, 213, 225] },
  { name: "slate-400", hex: "#94a3b8", rgb: [148, 163, 184] },
  { name: "slate-500", hex: "#64748b", rgb: [100, 116, 139] },
  { name: "slate-600", hex: "#475569", rgb: [71, 85, 105] },
  { name: "slate-700", hex: "#334155", rgb: [51, 65, 85] },
  { name: "slate-800", hex: "#1e293b", rgb: [30, 41, 59] },
  { name: "slate-900", hex: "#0f172a", rgb: [15, 23, 42] },
  { name: "slate-950", hex: "#020617", rgb: [2, 6, 23] },

  { name: "indigo-50", hex: "#eef2ff", rgb: [238, 242, 255] },
  { name: "indigo-100", hex: "#e0e7ff", rgb: [224, 231, 255] },
  { name: "indigo-500", hex: "#6366f1", rgb: [99, 102, 241] },
  { name: "indigo-600", hex: "#4f46e5", rgb: [79, 70, 229] },
  { name: "indigo-700", hex: "#4338ca", rgb: [67, 56, 202] },

  { name: "blue-500", hex: "#3b82f6", rgb: [59, 130, 246] },
  { name: "blue-600", hex: "#2563eb", rgb: [37, 99, 235] },
  { name: "cyan-500", hex: "#06b6d4", rgb: [6, 182, 212] },
  { name: "emerald-500", hex: "#10b981", rgb: [16, 185, 129] },
  { name: "amber-500", hex: "#f59e0b", rgb: [245, 158, 11] },
  { name: "red-500", hex: "#ef4444", rgb: [239, 68, 68] },
  { name: "purple-500", hex: "#a855f7", rgb: [168, 85, 247] },
  { name: "pink-500", hex: "#ec4899", rgb: [236, 72, 153] },
  { name: "white", hex: "#ffffff", rgb: [255, 255, 255] },
  { name: "black", hex: "#000000", rgb: [0, 0, 0] },
];

export function findNearestTailwindColor(color: RGBAColor): { name: string; hex: string; distance: number } {
  const r255 = color.r * 255;
  const g255 = color.g * 255;
  const b255 = color.b * 255;

  let best = TAILWIND_PALETTE[0];
  let minDistance = Infinity;

  for (const token of TAILWIND_PALETTE) {
    const dr = r255 - token.rgb[0];
    const dg = g255 - token.rgb[1];
    const db = b255 - token.rgb[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist < minDistance) {
      minDistance = dist;
      best = token;
    }
  }

  return {
    name: best.name,
    hex: best.hex,
    distance: Math.round(minDistance),
  };
}

// Simplified OKLCH representation for design system inspection
export function rgbaToOklchString(color: RGBAColor): string {
  // Approximate conversion for inspection UI
  const l = (color.r * 0.21 + color.g * 0.72 + color.b * 0.07).toFixed(3);
  const { h } = rgbaToHsl(color);
  const chroma = (Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)).toFixed(3);
  return `oklch(${l} ${chroma} ${h})`;
}
