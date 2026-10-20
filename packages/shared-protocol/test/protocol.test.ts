import { describe, expect, it } from "vitest";
import { SceneGraphDocument, SCHEMA_VERSION } from "@frameforge/scene-graph";
import {
  analyzeSceneGraph,
  generateDesignDoc,
  generateSkillDoc,
  sceneGraphToSvg,
} from "../src/index.js";

const mockDoc: SceneGraphDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: "doc-sample",
  title: "Antigravity Showcase",
  url: "https://example.com/showcase",
  capturedAt: "2026-10-20T10:00:00.000Z",
  captureMode: "VIEWPORT",
  viewport: { width: 1440, height: 900, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
  root: {
    id: "root-1",
    name: "Showcase Page",
    type: "FRAME",
    bounds: { x: 0, y: 0, width: 1440, height: 900 },
    visible: true,
    opacity: 1,
    fills: [{ type: "SOLID", color: { r: 15 / 255, g: 23 / 255, b: 42 / 255, a: 1 } }], // #0f172a
    children: [
      {
        id: "hero-title",
        name: "Heading 1",
        type: "TEXT",
        bounds: { x: 40, y: 60, width: 400, height: 48 },
        visible: true,
        opacity: 1,
        characters: "Build Future Interfaces",
        style: {
          fontFamily: "Inter",
          fontWeight: 700,
          fontSize: 32,
          lineHeight: { unit: "PIXELS", value: 40 },
        },
        fills: [{ type: "SOLID", color: { r: 248 / 255, g: 250 / 255, b: 252 / 255, a: 1 } }], // #f8fafc
      },
      {
        id: "hero-button",
        name: "Button .btn-primary",
        type: "FRAME",
        bounds: { x: 40, y: 130, width: 160, height: 44 },
        visible: true,
        opacity: 1,
        fills: [{ type: "SOLID", color: { r: 99 / 255, g: 102 / 255, b: 241 / 255, a: 1 } }], // #6366f1
        cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8, isUniform: true },
        autoLayout: {
          layoutMode: "HORIZONTAL",
          itemSpacing: 8,
          paddingTop: 10,
          paddingRight: 16,
          paddingBottom: 10,
          paddingLeft: 16,
          inferredConfidence: 0.95,
        },
        children: [
          {
            id: "btn-text",
            name: "Button Label",
            type: "TEXT",
            bounds: { x: 16, y: 12, width: 100, height: 20 },
            visible: true,
            opacity: 1,
            characters: "Get Started",
            style: { fontFamily: "Inter", fontWeight: 600, fontSize: 14 },
            fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          },
        ],
      },
    ],
  },
  diagnostics: {
    totalNodesCaptured: 3,
    totalTextNodes: 2,
    totalImages: 0,
    totalVectors: 0,
    totalUnsupported: 0,
    warnings: [],
    durationMs: 45,
  },
};

describe("Shared Protocol — Inspector & Docs", () => {
  it("analyzes scene graph colors and typography", () => {
    const analysis = analyzeSceneGraph(mockDoc);
    expect(analysis.colors.length).toBeGreaterThan(0);
    expect(analysis.typography.length).toBeGreaterThan(0);
    expect(analysis.typography[0].fontFamily).toBe("Inter");
  });

  it("generates structured DESIGN.md with token tables and accessibility", () => {
    const markdown = generateDesignDoc(mockDoc);
    expect(markdown).toContain("# DESIGN.md — Extracted Design System Specification");
    expect(markdown).toContain("Color Palette Tokens");
    expect(markdown).toContain("Typography Scale");
    expect(markdown).toContain("WCAG 2.1");
    expect(markdown).toContain("Inter");
  });

  it("generates actionable SKILL.md for AI coding agents", () => {
    const skill = generateSkillDoc(mockDoc);
    expect(skill).toContain("name:");
    expect(skill).toContain("description:");
    expect(skill).toContain(":root {");
    expect(skill).toContain("Auto Layout Conventions");
    expect(skill).toContain("Verification Checklist");
  });

  it("exports direct SVG fallback format", () => {
    const svg = sceneGraphToSvg(mockDoc);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Build Future Interfaces");
    expect(svg).toContain("Get Started");
    expect(svg).toContain("</svg>");
  });
});
