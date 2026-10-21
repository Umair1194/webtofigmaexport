import { preflightDocument } from "./preflight.js";
import {
  BoundingBox,
  CaptureDiagnostics,
  FrameNode,
  RGBAColor,
  SceneGraphDocument,
  SceneNode,
  SCHEMA_VERSION,
} from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  document?: SceneGraphDocument;
}

export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val) || !Number.isFinite(val)) return min;
  return Math.min(Math.max(val, min), max);
}

export function validateColor(color: unknown): RGBAColor {
  if (!color || typeof color !== "object") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const c = color as Record<string, unknown>;
  return {
    r: clamp(typeof c.r === "number" ? c.r : 0, 0, 1),
    g: clamp(typeof c.g === "number" ? c.g : 0, 0, 1),
    b: clamp(typeof c.b === "number" ? c.b : 0, 0, 1),
    a: clamp(typeof c.a === "number" ? c.a : 1, 0, 1),
  };
}

export function validateBounds(bounds: unknown): BoundingBox {
  if (!bounds || typeof bounds !== "object") {
    return { x: 0, y: 0, width: 100, height: 100 };
  }
  const b = bounds as Record<string, unknown>;
  return {
    x: typeof b.x === "number" && Number.isFinite(b.x) ? b.x : 0,
    y: typeof b.y === "number" && Number.isFinite(b.y) ? b.y : 0,
    width: Math.max(0, typeof b.width === "number" && Number.isFinite(b.width) ? b.width : 0),
    height: Math.max(0, typeof b.height === "number" && Number.isFinite(b.height) ? b.height : 0),
  };
}

export function validateNode(node: unknown, depth = 0, maxDepth = 100): SceneNode | null {
  if (!node || typeof node !== "object" || depth > maxDepth) {
    return null;
  }
  const n = node as Record<string, unknown>;
  const type = typeof n.type === "string" ? n.type : "RECTANGLE";
  const bounds = validateBounds(n.bounds);
  const id = typeof n.id === "string" ? n.id : `node-${Math.random().toString(36).substring(2, 9)}`;
  const name = typeof n.name === "string" ? n.name : `${type}`;
  const visible = typeof n.visible === "boolean" ? n.visible : true;
  const opacity = clamp(typeof n.opacity === "number" ? n.opacity : 1, 0, 1);

  const base = {
    id,
    name,
    bounds,
    visible,
    opacity,
    layoutPositioning: n.layoutPositioning === "ABSOLUTE" ? "ABSOLUTE" as const : "AUTO" as const,
    sizing: n.sizing && typeof n.sizing === 'object' ? {...n.sizing} : undefined,
    sourceTag: typeof n.sourceTag === "string" ? n.sourceTag : undefined,
    sourceRole: typeof n.sourceRole === "string" ? n.sourceRole : undefined,
    sourceClasses: Array.isArray(n.sourceClasses) ? (n.sourceClasses as string[]) : undefined,
  };

  switch (type) {
    case "FRAME": {
      const children: SceneNode[] = [];
      if (Array.isArray(n.children)) {
        for (const child of n.children) {
          const validated = validateNode(child, depth + 1, maxDepth);
          if (validated) {
            children.push(validated);
          }
        }
      }
      return {
        ...base,
        type: "FRAME",
        children,
        fills: Array.isArray(n.fills) ? n.fills : [],
        strokes: Array.isArray(n.strokes) ? n.strokes : undefined,
        cornerRadius: n.cornerRadius as any,
        effects: Array.isArray(n.effects) ? n.effects : undefined,
        clipsContent: Boolean(n.clipsContent),
        autoLayout: n.autoLayout as any,
      } as FrameNode;
    }
    case "TEXT": {
      const characters = typeof n.characters === "string" ? n.characters : "";
      const style = n.style && typeof n.style === "object" ? n.style : {};
      return {
        ...base,
        type: "TEXT",
        textAutoResize: n.textAutoResize === 'HEIGHT' ? 'HEIGHT' : undefined,
        characters,
        runs: Array.isArray(n.runs) ? n.runs.map((r:any)=>({start:r.start,end:r.end,style:r.style,fills:r.fills})) : undefined,
        fragments: Array.isArray(n.fragments) ? n.fragments.map((f: any) => ({ start: f.start, end: f.end, bounds: validateBounds(f.bounds) })) : undefined,
        style: {
          fontFamily: (style as any).fontFamily || "Inter",
          fontWeight: (style as any).fontWeight || 400,
          fontStyle: (style as any).fontStyle || "normal",
          fontSize: (style as any).fontSize || 14,
          lineHeight: (style as any).lineHeight,
          letterSpacing: (style as any).letterSpacing,
          textAlignHorizontal: (style as any).textAlignHorizontal || "LEFT",
          textAlignVertical: (style as any).textAlignVertical || "TOP",
          textDecoration: (style as any).textDecoration || "NONE",
          textCase: (style as any).textCase || "ORIGINAL",
        },
        fills: Array.isArray(n.fills) ? n.fills : [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
      };
    }
    case "IMAGE": {
      return {
        ...base,
        type: "IMAGE",
        srcUrl: typeof n.srcUrl === "string" ? n.srcUrl : undefined,
        dataUrl: typeof n.dataUrl === "string" ? n.dataUrl : undefined,
        assetId: typeof n.assetId === "string" ? n.assetId : undefined,
        objectFit: ["COVER", "CONTAIN", "FILL", "NONE"].includes(n.objectFit as string)
          ? (n.objectFit as any)
          : "COVER",
        cornerRadius: n.cornerRadius as any,
        strokes: Array.isArray(n.strokes) ? n.strokes : undefined,
        effects: Array.isArray(n.effects) ? n.effects : undefined,
      };
    }
    case "VECTOR": {
      return {
        ...base,
        type: "VECTOR",
        svgContent: typeof n.svgContent === "string" ? n.svgContent : "<svg></svg>",
        fills: Array.isArray(n.fills) ? n.fills : undefined,
        strokes: Array.isArray(n.strokes) ? n.strokes : undefined,
      };
    }
    case "LINE": {
      return {
        ...base,
        type: "LINE",
        strokes: Array.isArray(n.strokes) ? n.strokes : [],
      };
    }
    case "UNSUPPORTED": {
      return {
        ...base,
        type: "UNSUPPORTED",
        reason: (n.reason as any) || "CANVAS_ELEMENT",
        description: typeof n.description === "string" ? n.description : "Unsupported element",
        fallbackImageUrl: typeof n.fallbackImageUrl === "string" ? n.fallbackImageUrl : undefined,
      };
    }
    case "RECTANGLE":
    default: {
      return {
        ...base,
        type: "RECTANGLE",
        fills: Array.isArray(n.fills) ? n.fills : [],
        strokes: Array.isArray(n.strokes) ? n.strokes : undefined,
        cornerRadius: n.cornerRadius as any,
        effects: Array.isArray(n.effects) ? n.effects : undefined,
      };
    }
  }
}

export function validateSceneGraph(jsonInput: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!jsonInput || typeof jsonInput !== "object") {
    return {
      valid: false,
      errors: ["Payload must be a non-null JSON object."],
      warnings,
    };
  }

  const raw = jsonInput as Record<string, unknown>;

  if (raw.schemaVersion !== SCHEMA_VERSION) {
    warnings.push(
      `Schema version mismatch: received '${raw.schemaVersion}', expected '${SCHEMA_VERSION}'. Attempting safe migration.`
    );
  }

  if (!raw.root || typeof raw.root !== "object") {
    errors.push("Missing document root node.");
    return { valid: false, errors, warnings };
  }

  errors.push(...preflightDocument(raw));
  if (errors.length) return { valid: false, errors, warnings };
  const validatedRoot = validateNode(raw.root) as FrameNode | null;
  if (!validatedRoot || validatedRoot.type !== "FRAME") {
    errors.push("Invalid root node: root must be a valid FRAME node.");
    return { valid: false, errors, warnings };
  }

  const viewport = (raw.viewport as any) || {};
  const d = raw.diagnostics && typeof raw.diagnostics === "object" ? raw.diagnostics as Record<string, unknown> : {};
  const metric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  const diagnostics: CaptureDiagnostics = {
    totalNodesCaptured: metric(d.totalNodesCaptured), totalTextNodes: metric(d.totalTextNodes), totalImages: metric(d.totalImages),
    totalVectors: metric(d.totalVectors), totalUnsupported: metric(d.totalUnsupported), durationMs: metric(d.durationMs),
    warnings: Array.isArray(d.warnings) ? d.warnings.filter((w): w is string => typeof w === "string").slice(0, 100) : [],
  };

  const document: SceneGraphDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: typeof raw.id === "string" ? raw.id : `doc-${Date.now()}`,
    title: typeof raw.title === "string" ? raw.title : "Captured Page",
    url: typeof raw.url === "string" ? raw.url : "",
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : new Date().toISOString(),
    captureMode: ["FULL_PAGE", "VIEWPORT", "SELECTED_ELEMENT"].includes(raw.captureMode as string)
      ? (raw.captureMode as any)
      : "VIEWPORT",
    viewport: {
      width: typeof viewport.width === "number" ? viewport.width : 1440,
      height: typeof viewport.height === "number" ? viewport.height : 900,
      devicePixelRatio: typeof viewport.devicePixelRatio === "number" ? viewport.devicePixelRatio : 1,
      scrollX: typeof viewport.scrollX === "number" ? viewport.scrollX : 0,
      scrollY: typeof viewport.scrollY === "number" ? viewport.scrollY : 0,
    },
    root: validatedRoot,
    diagnostics,
  };

  return {
    valid: true,
    errors,
    warnings,
    document,
  };
}
