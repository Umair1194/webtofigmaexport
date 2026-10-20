import {
  CornerRadius,
  Effect,
  LinearGradientPaint,
  Paint,
  RGBAColor,
  ShadowEffect,
  SolidPaint,
  StrokeStyle,
} from "@frameforge/scene-graph";
import { parseColor } from "./color.js";

export function parsePx(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : 0;
}

export function parseCornerRadius(
  radiusStr: string,
  individual?: { tl?: string; tr?: string; br?: string; bl?: string },
  referenceSize?: { width: number; height: number }
): CornerRadius | undefined {
  if (individual && (individual.tl || individual.tr || individual.br || individual.bl)) {
    const tl = parsePx(individual.tl || "0");
    const tr = parsePx(individual.tr || "0");
    const br = parsePx(individual.br || "0");
    const bl = parsePx(individual.bl || "0");
    const isUniform = tl === tr && tr === br && br === bl;
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) return undefined;
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl, isUniform };
  }

  if (!radiusStr || radiusStr === "0px" || radiusStr === "0") {
    return undefined;
  }

  // Handle circular percentage border-radius (e.g. 50% for avatars)
  if (radiusStr.includes("%")) {
    const minDim = referenceSize ? Math.min(referenceSize.width, referenceSize.height) : 100;
    const r = Math.round((minDim / 2));
    return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r, isUniform: true };
  }

  const parts = radiusStr.trim().split(/\s+/).map(parsePx);
  if (parts.length === 1) {
    const r = parts[0];
    if (r === 0) return undefined;
    return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r, isUniform: true };
  }
  if (parts.length === 2) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[0], bottomLeft: parts[1], isUniform: false };
  }
  if (parts.length === 3) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[1], isUniform: false };
  }
  if (parts.length >= 4) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[3], isUniform: false };
  }

  return undefined;
}

export function parseBorders(
  computedStyle: CSSStyleDeclaration | Record<string, string>
): StrokeStyle[] | undefined {
  const borderWidth = parsePx(computedStyle.borderTopWidth || computedStyle.borderWidth || "0");
  const borderStyle = computedStyle.borderTopStyle || computedStyle.borderStyle || "none";
  const borderColorStr = computedStyle.borderTopColor || computedStyle.borderColor || "transparent";

  if (borderWidth <= 0 || borderStyle === "none" || borderStyle === "hidden") {
    return undefined;
  }

  const color = parseColor(borderColorStr);
  if (color.a <= 0) return undefined;

  return [
    {
      color,
      width: borderWidth,
      alignment: "INSIDE",
      style: borderStyle === "dashed" ? "dashed" : borderStyle === "dotted" ? "dotted" : "solid",
    },
  ];
}

export function parseBackgroundImageUrl(bgImageStr: string): string | undefined {
  if (!bgImageStr || bgImageStr === "none" || !bgImageStr.includes("url(")) {
    return undefined;
  }
  const match = bgImageStr.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
  return match ? match[1] : undefined;
}

export function parseLinearGradient(bgImageStr: string): LinearGradientPaint | undefined {
  if (!bgImageStr || !bgImageStr.includes("linear-gradient")) {
    return undefined;
  }

  const match = bgImageStr.match(/linear-gradient\((.+)\)/);
  if (!match) return undefined;

  const content = match[1];
  // Basic split by commas that aren't inside parentheses (e.g. rgba(0,0,0,1))
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  if (parts.length < 2) return undefined;

  let angleDegrees = 180; // default to bottom
  let stopStartIndex = 0;

  const firstPart = parts[0].toLowerCase();
  if (firstPart.includes("deg")) {
    angleDegrees = parseFloat(firstPart);
    stopStartIndex = 1;
  } else if (firstPart.includes("to right")) {
    angleDegrees = 90;
    stopStartIndex = 1;
  } else if (firstPart.includes("to bottom")) {
    angleDegrees = 180;
    stopStartIndex = 1;
  } else if (firstPart.includes("to top")) {
    angleDegrees = 0;
    stopStartIndex = 1;
  } else if (firstPart.includes("to left")) {
    angleDegrees = 270;
    stopStartIndex = 1;
  }

  const stops: { position: number; color: RGBAColor }[] = [];
  const rawStops = parts.slice(stopStartIndex);

  rawStops.forEach((rawStop, index) => {
    const tokens = rawStop.trim().split(/\s+/);
    let colorToken = tokens[0];
    let posToken = tokens[1];
    if (rawStop.includes("rgba(") || rawStop.includes("rgb(")) {
      const closingParen = rawStop.indexOf(")");
      colorToken = rawStop.substring(0, closingParen + 1);
      posToken = rawStop.substring(closingParen + 1).trim();
    }

    const color = parseColor(colorToken);
    let position = index / (rawStops.length - 1 || 1);
    if (posToken && posToken.endsWith("%")) {
      position = parseFloat(posToken) / 100;
    }

    stops.push({ position: Math.min(1, Math.max(0, position)), color });
  });

  return {
    type: "GRADIENT_LINEAR",
    angleDegrees: Number.isFinite(angleDegrees) ? angleDegrees : 180,
    stops,
    visible: true,
  };
}

export function parseFills(
  computedStyle: CSSStyleDeclaration | Record<string, string>
): Paint[] {
  const fills: Paint[] = [];

  // Check background-image for linear gradient
  const bgImage = computedStyle.backgroundImage || "";
  const gradient = parseLinearGradient(bgImage);
  if (gradient) {
    fills.push(gradient);
  }

  // Check background-color
  const bgColorStr = computedStyle.backgroundColor || "";
  if (bgColorStr && bgColorStr !== "transparent" && bgColorStr !== "rgba(0, 0, 0, 0)") {
    const color = parseColor(bgColorStr);
    if (color.a > 0) {
      fills.push({
        type: "SOLID",
        color,
        opacity: color.a,
        visible: true,
      });
    }
  }

  return fills;
}

export function parseBoxShadows(shadowStr: string): ShadowEffect[] {
  if (!shadowStr || shadowStr === "none") return [];

  const effects: ShadowEffect[] = [];
  // Split multiple shadows by comma outside of parentheses
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < shadowStr.length; i++) {
    const char = shadowStr[i];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    const isInset = part.includes("inset");
    const clean = part.replace("inset", "").trim();

    // Extract color
    let color: RGBAColor = { r: 0, g: 0, b: 0, a: 0.2 };
    let numsPart = clean;

    if (clean.includes("rgba(") || clean.includes("rgb(")) {
      const match = clean.match(/(rgba?\([^)]+\))/);
      if (match) {
        color = parseColor(match[1]);
        numsPart = clean.replace(match[1], "").trim();
      }
    } else if (clean.startsWith("#") || clean.endsWith("#")) {
      const match = clean.match(/(#[0-9a-fA-F]+)/);
      if (match) {
        color = parseColor(match[1]);
        numsPart = clean.replace(match[1], "").trim();
      }
    }

    const numbers = numsPart.split(/\s+/).filter(Boolean).map(parsePx);
    if (numbers.length >= 2) {
      const x = numbers[0] || 0;
      const y = numbers[1] || 0;
      const blur = numbers[2] || 0;
      const spread = numbers[3] || 0;

      effects.push({
        type: isInset ? "INNER_SHADOW" : "DROP_SHADOW",
        color,
        offset: { x, y },
        radius: blur,
        spread,
        visible: true,
      });
    }
  }

  return effects;
}
