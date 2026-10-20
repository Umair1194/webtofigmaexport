import { TypographyStyle } from "@frameforge/scene-graph";
import { parsePx } from "./box.js";

export function normalizeFontFamily(rawFamily: string): string {
  if (!rawFamily) return "Inter";
  // e.g. "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  const families = rawFamily.split(",").map((f) => f.trim().replace(/^["']|["']$/g, ""));
  // Return the first font family that isn't a generic fallback (serif, sans-serif, monospace)
  for (const family of families) {
    const lower = family.toLowerCase();
    if (!["sans-serif", "serif", "monospace", "system-ui", "inherit"].includes(lower)) {
      return family;
    }
  }
  return families[0] || "Inter";
}

export function normalizeFontWeight(rawWeight: string): number {
  if (!rawWeight) return 400;
  const lower = rawWeight.toLowerCase().trim();
  if (lower === "normal") return 400;
  if (lower === "bold") return 700;
  if (lower === "bolder") return 800;
  if (lower === "lighter") return 300;

  const num = parseInt(lower, 10);
  if (!Number.isNaN(num) && num >= 100 && num <= 900) {
    return Math.round(num / 100) * 100;
  }
  return 400;
}

export function parseTypography(
  computedStyle: CSSStyleDeclaration | Record<string, string>
): TypographyStyle {
  const fontFamily = normalizeFontFamily(computedStyle.fontFamily || "");
  const fontWeight = normalizeFontWeight(computedStyle.fontWeight || "400");
  const fontStyle = computedStyle.fontStyle === "italic" ? "italic" : "normal";
  const fontSize = Math.max(1, parsePx(computedStyle.fontSize || "16px"));

  // Line Height
  let lineHeight: TypographyStyle["lineHeight"] = undefined;
  const rawLineHeight = computedStyle.lineHeight;
  if (rawLineHeight && rawLineHeight !== "normal") {
    if (rawLineHeight.endsWith("px")) {
      lineHeight = { unit: "PIXELS", value: parsePx(rawLineHeight) };
    } else if (rawLineHeight.endsWith("%")) {
      lineHeight = { unit: "PERCENT", value: parseFloat(rawLineHeight) };
    } else {
      // Unitless multiplier (e.g. "1.5")
      const mult = parseFloat(rawLineHeight);
      if (Number.isFinite(mult) && mult > 0) {
        lineHeight = { unit: "PERCENT", value: mult * 100 };
      }
    }
  }

  // Letter Spacing
  let letterSpacing: TypographyStyle["letterSpacing"] = undefined;
  const rawLetterSpacing = computedStyle.letterSpacing;
  if (rawLetterSpacing && rawLetterSpacing !== "normal") {
    if (rawLetterSpacing.endsWith("px")) {
      letterSpacing = { unit: "PIXELS", value: parsePx(rawLetterSpacing) };
    } else if (rawLetterSpacing.endsWith("em")) {
      const em = parseFloat(rawLetterSpacing);
      if (Number.isFinite(em)) {
        letterSpacing = { unit: "PIXELS", value: em * fontSize };
      }
    }
  }

  // Text Alignment
  let textAlignHorizontal: TypographyStyle["textAlignHorizontal"] = "LEFT";
  const rawAlign = (computedStyle.textAlign || "").toLowerCase();
  if (rawAlign === "center") textAlignHorizontal = "CENTER";
  else if (rawAlign === "right" || rawAlign === "end") textAlignHorizontal = "RIGHT";
  else if (rawAlign === "justify") textAlignHorizontal = "JUSTIFIED";

  // Text Decoration
  let textDecoration: TypographyStyle["textDecoration"] = "NONE";
  const rawDeco = (computedStyle.textDecorationLine || computedStyle.textDecoration || "").toLowerCase();
  if (rawDeco.includes("underline")) textDecoration = "UNDERLINE";
  else if (rawDeco.includes("line-through")) textDecoration = "STRIKETHROUGH";

  // Text Case
  let textCase: TypographyStyle["textCase"] = "ORIGINAL";
  const rawTransform = (computedStyle.textTransform || "").toLowerCase();
  if (rawTransform === "uppercase") textCase = "UPPER";
  else if (rawTransform === "lowercase") textCase = "LOWER";
  else if (rawTransform === "capitalize") textCase = "TITLE";

  return {
    fontFamily,
    fontWeight,
    fontStyle,
    fontSize,
    lineHeight,
    letterSpacing,
    textAlignHorizontal,
    textAlignVertical: "TOP",
    textDecoration,
    textCase,
  };
}
