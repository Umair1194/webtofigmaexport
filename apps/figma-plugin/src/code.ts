import {
  FrameNode as FFFrameNode,
  Paint as FFPaint,
  SceneGraphDocument,
  SceneNode as FFSceneNode,
  TextNode as FFTextNode,
  validateSceneGraph,
} from "@frameforge/scene-graph";

figma.showUI(__html__, { width: 440, height: 560, themeColors: true });

const loadedFonts = new Set<string>();

async function ensureFontLoaded(family: string, style: string, warnings: string[]): Promise<FontName> {
  const fontKey = `${family}::${style}`;
  if (loadedFonts.has(fontKey)) {
    return { family, style };
  }

  try {
    const targetFont: FontName = { family, style };
    await figma.loadFontAsync(targetFont);
    loadedFonts.add(fontKey);
    return targetFont;
  } catch {
    // Try fallback font styles
    try {
      const fallbackFont: FontName = { family: "Inter", style };
      await figma.loadFontAsync(fallbackFont);
      warnings.push(`Substituted font "${family} ${style}" with "Inter ${style}".`);
      loadedFonts.add(`${fallbackFont.family}::${fallbackFont.style}`);
      return fallbackFont;
    } catch {
      const defaultFont: FontName = { family: "Inter", style: "Regular" };
      await figma.loadFontAsync(defaultFont);
      warnings.push(`Substituted font "${family} ${style}" with "Inter Regular".`);
      loadedFonts.add("Inter::Regular");
      return defaultFont;
    }
  }
}

function convertPaint(paint: FFPaint): Paint | null {
  if (paint.type === "SOLID") {
    return {
      type: "SOLID",
      color: { r: paint.color.r, g: paint.color.g, b: paint.color.b },
      opacity: paint.opacity ?? paint.color.a ?? 1,
      visible: paint.visible !== false,
    };
  }
  if (paint.type === "GRADIENT_LINEAR") {
    const rad = ((paint.angleDegrees || 180) - 90) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // 2x3 affine transformation matrix mapping unit square to gradient line
    const transform: Transform = [
      [cos, sin, (1 - cos - sin) / 2],
      [-sin, cos, (1 + sin - cos) / 2],
    ];

    const gradientStops: ColorStop[] = paint.stops.map((s) => ({
      position: s.position,
      color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
    }));

    return {
      type: "GRADIENT_LINEAR",
      transform,
      gradientStops,
      visible: paint.visible !== false,
    };
  }
  return null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
  const binaryString = atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface ImportStats {
  totalNodes: number;
  textNodes: number;
  frames: number;
  images: number;
  vectors: number;
  unsupported: number;
  warnings: string[];
}

async function buildFigmaNode(
  node: FFSceneNode,
  stats: ImportStats
): Promise<SceneNode | null> {
  stats.totalNodes++;

  const width = Math.max(1, node.bounds.width);
  const height = Math.max(1, node.bounds.height);

  switch (node.type) {
    case "FRAME": {
      stats.frames++;
      const frame = figma.createFrame();
      frame.name = node.name || "Frame";
      frame.x = node.bounds.x;
      frame.y = node.bounds.y;
      frame.resize(width, height);
      frame.opacity = node.opacity;
      frame.visible = node.visible;
      frame.clipsContent = Boolean(node.clipsContent);

      // Fills
      if (node.fills && node.fills.length > 0) {
        const paints: Paint[] = [];
        for (const f of node.fills) {
          const converted = convertPaint(f);
          if (converted) paints.push(converted);
        }
        frame.fills = paints;
      } else {
        frame.fills = [];
      }

      // Corner radius
      if (node.cornerRadius) {
        if (node.cornerRadius.isUniform) {
          frame.cornerRadius = node.cornerRadius.topLeft;
        } else {
          frame.topLeftRadius = node.cornerRadius.topLeft;
          frame.topRightRadius = node.cornerRadius.topRight;
          frame.bottomRightRadius = node.cornerRadius.bottomRight;
          frame.bottomLeftRadius = node.cornerRadius.bottomLeft;
        }
      }

      // Strokes
      if (node.strokes && node.strokes.length > 0) {
        const s = node.strokes[0];
        frame.strokes = [
          {
            type: "SOLID",
            color: { r: s.color.r, g: s.color.g, b: s.color.b },
            opacity: s.color.a,
          },
        ];
        frame.strokeWeight = s.width;
        frame.strokeAlign = s.alignment;
      }

      // Effects (Drop Shadow)
      if (node.effects && node.effects.length > 0) {
        const effects: Effect[] = [];
        for (const eff of node.effects) {
          if (eff.type === "DROP_SHADOW" || eff.type === "INNER_SHADOW") {
            effects.push({
              type: eff.type,
              color: { r: eff.color.r, g: eff.color.g, b: eff.color.b, a: eff.color.a },
              offset: eff.offset,
              radius: eff.radius,
              spread: eff.spread,
              visible: eff.visible !== false,
              blendMode: "NORMAL",
            });
          }
        }
        frame.effects = effects;
      }

      // Recursively build children
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childFigmaNode = await buildFigmaNode(child, stats);
          if (childFigmaNode) {
            frame.appendChild(childFigmaNode);
          }
        }
      }

      // Auto Layout inference application
      if (node.autoLayout && node.autoLayout.layoutMode !== "NONE") {
        frame.layoutMode = node.autoLayout.layoutMode;
        frame.itemSpacing = node.autoLayout.itemSpacing;
        frame.paddingTop = node.autoLayout.paddingTop;
        frame.paddingRight = node.autoLayout.paddingRight;
        frame.paddingBottom = node.autoLayout.paddingBottom;
        frame.paddingLeft = node.autoLayout.paddingLeft;
        if (node.autoLayout.primaryAxisAlignItems) {
          frame.primaryAxisAlignItems = node.autoLayout.primaryAxisAlignItems;
        }
        if (node.autoLayout.counterAxisAlignItems) {
          frame.counterAxisAlignItems = node.autoLayout.counterAxisAlignItems as any;
        }
      }

      return frame;
    }

    case "TEXT": {
      stats.textNodes++;
      const text = figma.createText();
      text.name = node.name || "Text";
      text.x = node.bounds.x;
      text.y = node.bounds.y;
      text.opacity = node.opacity;
      text.visible = node.visible;

      // Font weight to Figma style name
      let styleName = "Regular";
      if (node.style.fontWeight >= 700) styleName = "Bold";
      else if (node.style.fontWeight >= 600) styleName = "Semi Bold";
      else if (node.style.fontWeight >= 500) styleName = "Medium";

      if (node.style.fontStyle === "italic") {
        styleName = styleName === "Regular" ? "Italic" : `${styleName} Italic`;
      }

      const fontName = await ensureFontLoaded(node.style.fontFamily, styleName, stats.warnings);
      text.fontName = fontName;
      text.characters = node.characters || "";
      text.fontSize = Math.max(1, node.style.fontSize);

      if (node.style.lineHeight) {
        if (node.style.lineHeight.unit === "PIXELS") {
          text.lineHeight = { value: node.style.lineHeight.value, unit: "PIXELS" };
        } else {
          text.lineHeight = { value: node.style.lineHeight.value, unit: "PERCENT" };
        }
      }

      if (node.style.letterSpacing) {
        text.letterSpacing = {
          value: node.style.letterSpacing.value,
          unit: node.style.letterSpacing.unit,
        };
      }

      // Fills
      if (node.fills && node.fills.length > 0) {
        const paints: Paint[] = [];
        for (const f of node.fills) {
          const converted = convertPaint(f);
          if (converted) paints.push(converted);
        }
        text.fills = paints;
      }

      return text;
    }

    case "RECTANGLE": {
      const rect = figma.createRectangle();
      rect.name = node.name || "Rectangle";
      rect.x = node.bounds.x;
      rect.y = node.bounds.y;
      rect.resize(width, height);
      rect.opacity = node.opacity;
      rect.visible = node.visible;

      if (node.fills && node.fills.length > 0) {
        const paints: Paint[] = [];
        for (const f of node.fills) {
          const converted = convertPaint(f);
          if (converted) paints.push(converted);
        }
        rect.fills = paints;
      }

      if (node.cornerRadius) {
        if (node.cornerRadius.isUniform) {
          rect.cornerRadius = node.cornerRadius.topLeft;
        } else {
          rect.topLeftRadius = node.cornerRadius.topLeft;
          rect.topRightRadius = node.cornerRadius.topRight;
          rect.bottomRightRadius = node.cornerRadius.bottomRight;
          rect.bottomLeftRadius = node.cornerRadius.bottomLeft;
        }
      }

      if (node.strokes && node.strokes.length > 0) {
        const s = node.strokes[0];
        rect.strokes = [
          {
            type: "SOLID",
            color: { r: s.color.r, g: s.color.g, b: s.color.b },
            opacity: s.color.a,
          },
        ];
        rect.strokeWeight = s.width;
      }

      return rect;
    }

    case "VECTOR": {
      stats.vectors++;
      try {
        const vectorNode = figma.createNodeFromSvg(node.svgContent);
        vectorNode.name = node.name || "Vector Icon";
        vectorNode.x = node.bounds.x;
        vectorNode.y = node.bounds.y;
        vectorNode.opacity = node.opacity;
        return vectorNode;
      } catch (err) {
        stats.warnings.push(`Could not parse vector SVG for "${node.name}".`);
        const fallback = figma.createRectangle();
        fallback.resize(width, height);
        fallback.x = node.bounds.x;
        fallback.y = node.bounds.y;
        fallback.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
        return fallback;
      }
    }

    case "IMAGE": {
      stats.images++;
      const frame = figma.createFrame();
      frame.name = node.name || "Image";
      frame.x = node.bounds.x;
      frame.y = node.bounds.y;
      frame.resize(width, height);
      frame.clipsContent = true;

      if (node.dataUrl && node.dataUrl.startsWith("data:image")) {
        try {
          const bytes = base64ToUint8Array(node.dataUrl);
          const figmaImage = figma.createImage(bytes);
          frame.fills = [
            {
              type: "IMAGE",
              scaleMode: node.objectFit === "CONTAIN" ? "FIT" : "FILL",
              imageHash: figmaImage.hash,
            },
          ];
        } catch {
          stats.warnings.push(`Failed to decode base64 image for "${node.name}".`);
          frame.fills = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
        }
      } else {
        // Placeholder fill
        frame.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.25 } }];
      }

      if (node.cornerRadius && node.cornerRadius.isUniform) {
        frame.cornerRadius = node.cornerRadius.topLeft;
      }

      return frame;
    }

    case "UNSUPPORTED": {
      stats.unsupported++;
      const frame = figma.createFrame();
      frame.name = `[${node.reason}] ${node.name}`;
      frame.x = node.bounds.x;
      frame.y = node.bounds.y;
      frame.resize(width, height);
      frame.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.15, b: 0.2 } }];
      frame.strokes = [{ type: "SOLID", color: { r: 0.38, g: 0.45, b: 0.55 } }];
      frame.strokeWeight = 1;

      // Add descriptive label inside placeholder frame
      try {
        const labelFont = await ensureFontLoaded("Inter", "Regular", stats.warnings);
        const label = figma.createText();
        label.fontName = labelFont;
        label.characters = `${node.description} (${node.reason})`;
        label.fontSize = 11;
        label.fills = [{ type: "SOLID", color: { r: 0.7, g: 0.75, b: 0.85 } }];
        label.x = 8;
        label.y = 8;
        frame.appendChild(label);
      } catch {
        // ignore text label failure
      }

      return frame;
    }

    default:
      return null;
  }
}

figma.ui.onmessage = async (msg: { type: string; payload?: any }) => {
  if (msg.type === "IMPORT_SCENE_GRAPH") {
    const startTime = Date.now();
    try {
      const validation = validateSceneGraph(msg.payload);
      if (!validation.valid || !validation.document) {
        figma.ui.postMessage({
          type: "IMPORT_ERROR",
          error: `Schema validation failed: ${validation.errors.join(", ")}`,
        });
        return;
      }

      const doc = validation.document;
      const stats: ImportStats = {
        totalNodes: 0,
        textNodes: 0,
        frames: 0,
        images: 0,
        vectors: 0,
        unsupported: 0,
        warnings: [...validation.warnings],
      };

      figma.ui.postMessage({ type: "IMPORT_PROGRESS", message: "Creating native Figma layers..." });

      const rootFigmaNode = await buildFigmaNode(doc.root, stats);

      if (rootFigmaNode) {
        figma.currentPage.appendChild(rootFigmaNode);
        figma.viewport.scrollAndZoomIntoView([rootFigmaNode]);
        figma.currentPage.selection = [rootFigmaNode];
      }

      const durationMs = Date.now() - startTime;

      figma.ui.postMessage({
        type: "IMPORT_SUCCESS",
        stats: {
          ...stats,
          durationMs,
          title: doc.title,
          url: doc.url,
        },
      });
    } catch (err: any) {
      figma.ui.postMessage({
        type: "IMPORT_ERROR",
        error: err?.message || "An unexpected error occurred during Figma canvas reconstruction.",
      });
    }
  }
};
