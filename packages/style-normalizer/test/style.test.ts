import { describe, expect, it } from "vitest";
import {
  checkWCAGCompliance,
  findNearestTailwindColor,
  normalizeFontFamily,
  normalizeFontWeight,
  parseBorders,
  parseBoxShadows,
  parseColor,
  parseCornerRadius,
  parseLinearGradient,
  parsePx,
  parseTypography,
  relativeLuminance,
  rgbaToHex,
  rgbaToHslString,
  rgbaToRgbString,
  wcagContrastRatio,
} from "../src/index.js";

describe("Style Normalizer — Color Module", () => {
  it("parses 6-digit and 3-digit hex colors", () => {
    expect(parseColor("#ffffff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("parses rgb and rgba string colors", () => {
    const c1 = parseColor("rgb(255, 0, 128)");
    expect(c1.r).toBe(1);
    expect(c1.g).toBe(0);
    expect(Math.round(c1.b * 255)).toBe(128);
    expect(c1.a).toBe(1);

    const c2 = parseColor("rgba(0, 128, 255, 0.5)");
    expect(c2.a).toBe(0.5);
  });

  it("converts RGBA to HEX, RGB, and HSL strings", () => {
    const white = { r: 1, g: 1, b: 1, a: 1 };
    expect(rgbaToHex(white)).toBe("#ffffff");
    expect(rgbaToRgbString(white)).toBe("rgb(255, 255, 255)");
    expect(rgbaToHslString(white)).toBe("hsl(0, 0%, 100%)");

    const semiBlack = { r: 0, g: 0, b: 0, a: 0.5 };
    expect(rgbaToRgbString(semiBlack)).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("calculates WCAG 2.1 contrast ratio and AA compliance correctly", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 1, g: 1, b: 1, a: 1 };

    expect(relativeLuminance(white)).toBeCloseTo(1.0, 2);
    expect(relativeLuminance(black)).toBeCloseTo(0.0, 2);

    const ratio = wcagContrastRatio(black, white);
    expect(ratio).toBeCloseTo(21.0, 1);

    const check = checkWCAGCompliance(black, white, 16, 400);
    expect(check.aaPass).toBe(true);
    expect(check.aaaPass).toBe(true);
    expect(check.uncertain).toBe(false);

    // Gray on white low contrast
    const lightGray = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
    const lowCheck = checkWCAGCompliance(lightGray, white, 14, 400);
    expect(lowCheck.aaPass).toBe(false);

    // Complex / transparent background flags uncertainty
    const transparentBg = { r: 1, g: 1, b: 1, a: 0.5 };
    const uncertainCheck = checkWCAGCompliance(black, transparentBg);
    expect(uncertainCheck.uncertain).toBe(true);
  });

  it("maps colors to nearest Tailwind CSS tokens", () => {
    const nearIndigo = { r: 99 / 255, g: 102 / 255, b: 241 / 255, a: 1 }; // #6366f1
    const match = findNearestTailwindColor(nearIndigo);
    expect(match.name).toBe("indigo-500");
  });
});

describe("Style Normalizer — Box Module", () => {
  it("parses px values reliably", () => {
    expect(parsePx("16px")).toBe(16);
    expect(parsePx("0")).toBe(0);
    expect(parsePx("-8.5px")).toBe(-8.5);
    expect(parsePx("invalid")).toBe(0);
  });

  it("parses corner radius variations", () => {
    const uniform = parseCornerRadius("12px");
    expect(uniform).toEqual({
      topLeft: 12,
      topRight: 12,
      bottomRight: 12,
      bottomLeft: 12,
      isUniform: true,
    });

    const asymmetric = parseCornerRadius("8px 16px");
    expect(asymmetric?.isUniform).toBe(false);
    expect(asymmetric?.topLeft).toBe(8);
    expect(asymmetric?.topRight).toBe(16);
  });

  it("parses borders", () => {
    const borders = parseBorders({
      borderTopWidth: "2px",
      borderTopStyle: "solid",
      borderTopColor: "#6366f1",
    });
    expect(borders).toBeDefined();
    expect(borders![0].width).toBe(2);
    expect(borders![0].style).toBe("solid");
  });

  it("parses linear gradients", () => {
    const gradient = parseLinearGradient("linear-gradient(90deg, #1e1b4b 0%, #4338ca 100%)");
    expect(gradient).toBeDefined();
    expect(gradient?.angleDegrees).toBe(90);
    expect(gradient?.stops.length).toBe(2);
    expect(gradient?.stops[0].position).toBe(0);
    expect(gradient?.stops[1].position).toBe(1);
  });

  it("parses box shadows", () => {
    const shadows = parseBoxShadows("0 10px 15px -3px rgba(0, 0, 0, 0.3)");
    expect(shadows.length).toBe(1);
    expect(shadows[0].type).toBe("DROP_SHADOW");
    expect(shadows[0].offset).toEqual({ x: 0, y: 10 });
    expect(shadows[0].radius).toBe(15);
    expect(shadows[0].spread).toBe(-3);
  });
});

describe("Style Normalizer — Typography Module", () => {
  it("normalizes font family names and strips system fallbacks", () => {
    expect(normalizeFontFamily("Inter, -apple-system, sans-serif")).toBe("Inter");
    expect(normalizeFontFamily("'Roboto Mono', monospace")).toBe("Roboto Mono");
  });

  it("normalizes numeric and keyword font weights", () => {
    expect(normalizeFontWeight("normal")).toBe(400);
    expect(normalizeFontWeight("bold")).toBe(700);
    expect(normalizeFontWeight("600")).toBe(600);
  });

  it("parses complete typography styles", () => {
    const typo = parseTypography({
      fontFamily: "Inter, sans-serif",
      fontWeight: "600",
      fontSize: "18px",
      lineHeight: "28px",
      letterSpacing: "0.5px",
      textAlign: "center",
      textDecoration: "underline",
      textTransform: "uppercase",
    });

    expect(typo.fontFamily).toBe("Inter");
    expect(typo.fontWeight).toBe(600);
    expect(typo.fontSize).toBe(18);
    expect(typo.lineHeight).toEqual({ unit: "PIXELS", value: 28 });
    expect(typo.letterSpacing).toEqual({ unit: "PIXELS", value: 0.5 });
    expect(typo.textAlignHorizontal).toBe("CENTER");
    expect(typo.textDecoration).toBe("UNDERLINE");
    expect(typo.textCase).toBe("UPPER");
  });
});
