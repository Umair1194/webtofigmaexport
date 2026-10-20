import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "../src/types.js";
import { clamp, validateBounds, validateColor, validateSceneGraph } from "../src/validator.js";

describe("Scene Graph Validator", () => {
  it("clamps numeric values accurately", () => {
    expect(clamp(1.5, 0, 1)).toBe(1);
    expect(clamp(-0.2, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(NaN, 0, 1)).toBe(0);
  });

  it("validates and clamps color RGBA channels safely", () => {
    const valid = validateColor({ r: 1.5, g: -0.1, b: 0.8, a: 2 });
    expect(valid).toEqual({ r: 1, g: 0, b: 0.8, a: 1 });

    const fallback = validateColor(null);
    expect(fallback).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("validates and sanitizes bounding boxes", () => {
    const bounds = validateBounds({ x: 10, y: -5, width: 200, height: -50 });
    expect(bounds).toEqual({ x: 10, y: -5, width: 200, height: 0 });
  });

  it("rejects null or non-object payloads", () => {
    const res = validateSceneGraph(null);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain("non-null JSON object");
  });

  it("validates a well-formed SceneGraphDocument", () => {
    const sampleDoc = {
      schemaVersion: SCHEMA_VERSION,
      id: "doc-test",
      title: "Test Page",
      url: "https://example.com",
      capturedAt: new Date().toISOString(),
      captureMode: "VIEWPORT",
      viewport: { width: 1440, height: 900, devicePixelRatio: 2, scrollX: 0, scrollY: 0 },
      root: {
        id: "root-1",
        name: "Root Frame",
        type: "FRAME",
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
        visible: true,
        opacity: 1,
        fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
        children: [
          {
            id: "text-1",
            name: "Headline",
            type: "TEXT",
            bounds: { x: 40, y: 40, width: 300, height: 32 },
            visible: true,
            opacity: 1,
            characters: "Hello FrameForge",
            style: { fontFamily: "Inter", fontWeight: 700, fontSize: 24 },
            fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
          },
        ],
      },
    };

    const res = validateSceneGraph(sampleDoc);
    expect(res.valid).toBe(true);
    expect(res.document).toBeDefined();
    expect(res.document?.root.children.length).toBe(1);
    expect(res.document?.root.children[0].type).toBe("TEXT");
  });
});
