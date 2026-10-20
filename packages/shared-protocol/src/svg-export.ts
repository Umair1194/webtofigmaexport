import { FrameNode, SceneGraphDocument, SceneNode } from "@frameforge/scene-graph";
import { rgbaToHex } from "@frameforge/style-normalizer";

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nodeToSvg(node: SceneNode): string {
  const { x, y, width, height } = node.bounds;
  if (!node.visible || width <= 0 || height <= 0) return "";

  const opacityAttr = node.opacity < 1 ? ` opacity="${node.opacity}"` : "";

  switch (node.type) {
    case "RECTANGLE":
    case "FRAME": {
      const frame = node as FrameNode;
      let fill = "none";
      if (frame.fills && frame.fills.length > 0 && frame.fills[0].type === "SOLID") {
        fill = rgbaToHex(frame.fills[0].color);
      }

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
        childrenSvg = frame.children.map(nodeToSvg).join("\n");
      }

      return `<g id="${escapeXml(node.name)}"${opacityAttr}>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${strokeAttr}${rxAttr} />
        ${childrenSvg}
      </g>`;
    }
    case "TEXT": {
      const textNode = node;
      let fill = "#000000";
      if (textNode.fills && textNode.fills.length > 0 && textNode.fills[0].type === "SOLID") {
        fill = rgbaToHex(textNode.fills[0].color);
      }
      const fontSize = textNode.style.fontSize || 14;
      const fontFamily = textNode.style.fontFamily || "sans-serif";
      const fontWeight = textNode.style.fontWeight || 400;

      return `<text x="${x}" y="${y + fontSize}" fill="${fill}" font-size="${fontSize}" font-family="${escapeXml(fontFamily)}" font-weight="${fontWeight}"${opacityAttr}>${escapeXml(textNode.characters)}</text>`;
    }
    case "VECTOR": {
      return `<g transform="translate(${x}, ${y})"${opacityAttr}>${node.svgContent}</g>`;
    }
    case "IMAGE": {
      if (node.srcUrl || node.dataUrl) {
        const href = node.dataUrl || node.srcUrl;
        return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${escapeXml(href!)}"${opacityAttr} />`;
      }
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#e2e8f0"${opacityAttr} />`;
    }
    default:
      return "";
  }
}

export function sceneGraphToSvg(doc: SceneGraphDocument): string {
  const width = doc.root.bounds.width;
  const height = doc.root.bounds.height;
  const content = nodeToSvg(doc.root);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- FrameForge SVG Export: Fallback Vector Mode (Limited text editability & no Auto Layout) -->
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${content}
</svg>`;
}
