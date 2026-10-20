import { FrameNode, SceneGraphDocument, SceneNode, TextNode } from "@frameforge/scene-graph";
import {
  checkWCAGCompliance,
  findNearestTailwindColor,
  parseColor,
  rgbaToHex,
  rgbaToHslString,
  rgbaToOklchString,
  rgbaToRgbString,
  WCAGResult,
} from "@frameforge/style-normalizer";

export interface ColorIntelligence {
  hex: string;
  rgb: string;
  hsl: string;
  oklch: string;
  count: number;
  nearestTailwind: { name: string; hex: string };
}

export interface TypographyIntelligence {
  fontFamily: string;
  weight: number;
  fontSize: number;
  lineHeight?: string;
  sampleText: string;
  count: number;
}

export interface AssetIntelligence {
  type: "IMAGE" | "VECTOR";
  name: string;
  srcUrl?: string;
  dimensions: { width: number; height: number };
}

export interface AccessibilityIssue {
  nodeId: string;
  textSnippet: string;
  fontSize: number;
  contrastResult: WCAGResult;
}

export interface DesignIntelligenceReport {
  colors: ColorIntelligence[];
  typography: TypographyIntelligence[];
  assets: AssetIntelligence[];
  accessibility: {
    totalChecked: number;
    issues: AccessibilityIssue[];
  };
}

export function analyzeSceneGraph(doc: SceneGraphDocument): DesignIntelligenceReport {
  const colorMap = new Map<string, { count: number; rgba: any }>();
  const typeMap = new Map<string, TypographyIntelligence>();
  const assets: AssetIntelligence[] = [];
  const accessibilityIssues: AccessibilityIssue[] = [];
  let totalCheckedText = 0;

  function walk(node: SceneNode, parentBg?: any) {
    let currentBg = parentBg;

    // Fills
    if ("fills" in node && Array.isArray(node.fills)) {
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.color && fill.color.a > 0) {
          currentBg = fill.color;
          const hex = rgbaToHex(fill.color);
          const existing = colorMap.get(hex);
          if (existing) {
            existing.count++;
          } else {
            colorMap.set(hex, { count: 1, rgba: fill.color });
          }
        }
      }
    }

    // Text Nodes
    if (node.type === "TEXT") {
      const textNode = node as TextNode;
      const fg = textNode.fills[0]?.type === "SOLID" ? textNode.fills[0].color : { r: 0, g: 0, b: 0, a: 1 };
      const hex = rgbaToHex(fg);
      const existing = colorMap.get(hex);
      if (existing) existing.count++;
      else colorMap.set(hex, { count: 1, rgba: fg });

      // Typography inventory
      const key = `${textNode.style.fontFamily}-${textNode.style.fontWeight}-${textNode.style.fontSize}`;
      const existingType = typeMap.get(key);
      if (existingType) {
        existingType.count++;
      } else {
        typeMap.set(key, {
          fontFamily: textNode.style.fontFamily,
          weight: textNode.style.fontWeight,
          fontSize: textNode.style.fontSize,
          lineHeight: textNode.style.lineHeight ? `${textNode.style.lineHeight.value}${textNode.style.lineHeight.unit === "PERCENT" ? "%" : "px"}` : undefined,
          sampleText: textNode.characters.slice(0, 30),
          count: 1,
        });
      }

      // Accessibility contrast check
      if (currentBg) {
        totalCheckedText++;
        const contrast = checkWCAGCompliance(fg, currentBg, textNode.style.fontSize, textNode.style.fontWeight);
        if (!contrast.aaPass) {
          accessibilityIssues.push({
            nodeId: textNode.id,
            textSnippet: textNode.characters.slice(0, 40),
            fontSize: textNode.style.fontSize,
            contrastResult: contrast,
          });
        }
      }
    }

    // Images
    if (node.type === "IMAGE") {
      assets.push({
        type: "IMAGE",
        name: node.name,
        srcUrl: node.srcUrl,
        dimensions: { width: node.bounds.width, height: node.bounds.height },
      });
    }

    // Vectors
    if (node.type === "VECTOR") {
      assets.push({
        type: "VECTOR",
        name: node.name,
        dimensions: { width: node.bounds.width, height: node.bounds.height },
      });
    }

    // Recurse children
    if (node.type === "FRAME" && "children" in node) {
      for (const child of node.children) {
        walk(child, currentBg);
      }
    }
  }

  walk(doc.root, { r: 1, g: 1, b: 1, a: 1 });

  // Format colors sorted by occurrence
  const colors: ColorIntelligence[] = Array.from(colorMap.entries())
    .map(([hex, data]) => {
      const tailwind = findNearestTailwindColor(data.rgba);
      return {
        hex,
        rgb: rgbaToRgbString(data.rgba),
        hsl: rgbaToHslString(data.rgba),
        oklch: rgbaToOklchString(data.rgba),
        count: data.count,
        nearestTailwind: { name: tailwind.name, hex: tailwind.hex },
      };
    })
    .sort((a, b) => b.count - a.count);

  const typography = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);

  return {
    colors,
    typography,
    assets,
    accessibility: {
      totalChecked: totalCheckedText,
      issues: accessibilityIssues,
    },
  };
}
