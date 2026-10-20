import {
  FrameNode,
  LinearGradientPaint,
  Paint,
  SceneGraphDocument,
  SceneNode,
  TextNode,
} from "@frameforge/scene-graph";
import { rgbaToHex } from "@frameforge/style-normalizer";

function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let gradientCounter = 0;

function renderGradientDef(paint: LinearGradientPaint, id: string): string {
  const angle = paint.angleDegrees ?? 180;
  // Convert angle to x1, y1, x2, y2 percentages
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = Math.round(50 - 50 * Math.cos(rad));
  const y1 = Math.round(50 - 50 * Math.sin(rad));
  const x2 = Math.round(50 + 50 * Math.cos(rad));
  const y2 = Math.round(50 + 50 * Math.sin(rad));

  const stops = paint.stops
    .map(
      (s) =>
        `<stop offset="${Math.round(s.position * 100)}%" stop-color="${rgbaToHex(s.color)}" stop-opacity="${s.color.a}" />`
    )
    .join("");

  return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`;
}

function renderPaints(
  fills: Paint[] | undefined,
  defs: string[]
): { fillAttr: string; hasFill: boolean } {
  if (!fills || fills.length === 0) {
    return { fillAttr: 'fill="none"', hasFill: false };
  }

  const primary = fills[0];
  if (primary.type === "SOLID") {
    if (primary.color.a <= 0) return { fillAttr: 'fill="none"', hasFill: false };
    const opacity = primary.opacity ?? primary.color.a ?? 1;
    const opacityAttr = opacity < 1 ? ` fill-opacity="${opacity}"` : "";
    return { fillAttr: `fill="${rgbaToHex(primary.color)}"${opacityAttr}`, hasFill: true };
  }

  if (primary.type === "GRADIENT_LINEAR") {
    const gradId = `ff-grad-${++gradientCounter}`;
    defs.push(renderGradientDef(primary, gradId));
    return { fillAttr: `fill="url(#${gradId})"`, hasFill: true };
  }

  return { fillAttr: 'fill="none"', hasFill: false };
}

function nodeToSvg(node: SceneNode, defs: string[]): string {
  const { x, y, width, height } = node.bounds;
  if (!node.visible || width <= 0 || height <= 0) return "";

  const opacityAttr = node.opacity < 1 ? ` opacity="${node.opacity}"` : "";

  switch (node.type) {
    case "RECTANGLE":
    case "FRAME": {
      const frame = node as FrameNode;
      const { fillAttr } = renderPaints(frame.fills, defs);

      let strokeAttr = "";
      if (frame.strokes && frame.strokes.length > 0) {
        const s = frame.strokes[0];
        strokeAttr = ` stroke="${rgbaToHex(s.color)}" stroke-width="${s.width}"`;
      }

      let rxAttr = "";
      if (frame.cornerRadius) {
        rxAttr = ` rx="${frame.cornerRadius.topLeft}" ry="${frame.cornerRadius.topLeft}"`;
      }

      let childrenSvg = "";
      if (node.type === "FRAME" && "children" in frame && Array.isArray(frame.children)) {
        childrenSvg = frame.children.map((c) => nodeToSvg(c, defs)).filter(Boolean).join("\n");
      }

      return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>
        <rect x="0" y="0" width="${width}" height="${height}" ${fillAttr}${strokeAttr}${rxAttr} />
        ${childrenSvg}
      </g>`;
    }

    case "TEXT": {
      const textNode = node as TextNode;
      let fill = "#000000";
      let fillOpacity = "";
      if (textNode.fills && textNode.fills.length > 0 && textNode.fills[0].type === "SOLID") {
        fill = rgbaToHex(textNode.fills[0].color);
        const a = textNode.fills[0].color.a;
        if (a < 1) fillOpacity = ` fill-opacity="${a}"`;
      }
      const fontSize = textNode.style.fontSize || 14;
      const fontFamily = textNode.style.fontFamily || "Inter, sans-serif";
      const fontWeight = textNode.style.fontWeight || 400;

      // Vertical baseline offset: SVG text y is baseline, so add ~80% of fontSize
      const baselineY = Math.round(fontSize * 0.85);

      return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>
        <text x="0" y="${baselineY}" fill="${fill}"${fillOpacity} font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}">${escapeXml(textNode.characters)}</text>
      </g>`;
    }

    case "VECTOR": {
      return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>${node.svgContent}</g>`;
    }

    case "IMAGE": {
      const href = node.dataUrl || node.srcUrl;
      if (href) {
        return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>
          <image x="0" y="0" width="${width}" height="${height}" href="${escapeXml(href)}" preserveAspectRatio="xMidYMid slice" />
        </g>`;
      }
      return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>
        <rect x="0" y="0" width="${width}" height="${height}" fill="#334155" />
      </g>`;
    }

    case "UNSUPPORTED": {
      return `<g id="${escapeXml(node.name)}" transform="translate(${x}, ${y})"${opacityAttr}>
        <rect x="0" y="0" width="${width}" height="${height}" fill="#1e293b" stroke="#64748b" stroke-dasharray="4 4" />
        <text x="8" y="20" fill="#94a3b8" font-size="11" font-family="sans-serif">${escapeXml(node.description)}</text>
      </g>`;
    }

    default:
      return "";
  }
}

export function sceneGraphToSvg(doc: SceneGraphDocument): string {
  gradientCounter = 0;
  const defs: string[] = [];

  const width = doc.root.bounds.width || doc.viewport.width || 1440;
  const height = doc.root.bounds.height || doc.viewport.height || 900;

  const content = nodeToSvg(doc.root, defs);

  const defsSection = defs.length > 0 ? `<defs>\n${defs.join("\n")}\n</defs>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- FrameForge SVG Export: Fallback Vector Mode -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defsSection}
  ${content}
</svg>`;
}
