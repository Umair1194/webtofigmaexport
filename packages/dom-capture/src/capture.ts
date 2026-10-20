import {
  BoundingBox,
  CaptureDiagnostics,
  FrameNode,
  ImageNode,
  Paint,
  RectangleNode,
  SceneGraphDocument,
  SceneNode,
  SCHEMA_VERSION,
  TextNode,
  UnsupportedNode,
  VectorNode,
  ViewportMeta,
} from "@frameforge/scene-graph";
import {
  parseBackgroundImageUrl,
  parseBorders,
  parseBoxShadows,
  parseColor,
  parseCornerRadius,
  parseFills,
  parseTypography,
} from "@frameforge/style-normalizer";
import { shouldSkipElement } from "./filter.js";
import { inferAutoLayout } from "./layout.js";
import { redactFormValue } from "./redact.js";

export interface CaptureOptions {
  captureMode?: "FULL_PAGE" | "VIEWPORT" | "SELECTED_ELEMENT";
  maxNodes?: number;
  redactForms?: boolean;
  inferAutoLayout?: boolean;
  includeHidden?: boolean;
}

export function generateLayerName(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const firstClass = element.classList && element.classList.length > 0 ? `.${element.classList[0]}` : "";
  const role = element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : "";

  if (tag === "button" || role === "[role=button]") return `Button ${firstClass || id}`.trim();
  if (tag === "header") return "Header";
  if (tag === "nav") return "Navigation";
  if (tag === "footer") return "Footer";
  if (tag === "main") return "Main Content";
  if (tag === "article") return "Article";
  if (tag === "aside") return "Sidebar";
  if (tag === "section") return `Section ${id || firstClass}`.trim();
  if (tag === "img") return `Image ${firstClass || id}`.trim();
  if (tag === "svg") return `Icon ${firstClass || id}`.trim();
  if (tag === "h1") return "Heading 1";
  if (tag === "h2") return "Heading 2";
  if (tag === "h3") return "Heading 3";
  if (tag === "h4" || tag === "h5" || tag === "h6") return "Heading";
  if (tag === "p") return "Paragraph";
  if (tag === "input" || tag === "textarea") return `Input ${firstClass || id}`.trim();

  return `${tag}${id || firstClass || ""}`;
}

export function captureSubtree(
  rootElement: Element,
  originX: number,
  originY: number,
  options: CaptureOptions,
  state: { nodeCount: number; diagnostics: CaptureDiagnostics }
): SceneNode | null {
  if (state.nodeCount >= (options.maxNodes || 2500)) {
    state.diagnostics.warnings.push("Reached maximum node capture limit; subtree was truncated for safety.");
    return null;
  }

  const computed = window.getComputedStyle(rootElement);
  if (shouldSkipElement(rootElement, computed, options)) {
    return null;
  }

  const rect = rootElement.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  // Skip 0-size elements unless they have children that might be positioned outside
  if (width <= 0 && height <= 0 && rootElement.children.length === 0) {
    return null;
  }

  const bounds: BoundingBox = {
    x: Math.round(rect.left - originX),
    y: Math.round(rect.top - originY),
    width,
    height,
  };

  const id = `node-${++state.nodeCount}`;
  const name = generateLayerName(rootElement);
  const tagName = rootElement.tagName.toUpperCase();
  const opacity = parseFloat(computed.opacity) || 1;
  const visible = computed.visibility !== "hidden" && computed.display !== "none";

  const cornerRadius = parseCornerRadius(computed.borderRadius, undefined, { width, height });
  const strokes = parseBorders(computed);
  const effects = parseBoxShadows(computed.boxShadow);
  const fills = parseFills(computed);

  // 1. Image Element
  if (tagName === "IMG") {
    state.diagnostics.totalImages++;
    const img = rootElement as HTMLImageElement;
    return {
      id,
      name,
      type: "IMAGE",
      bounds,
      visible,
      opacity,
      srcUrl: img.currentSrc || img.src,
      objectFit: (computed.objectFit?.toUpperCase() as any) || "COVER",
      cornerRadius,
      strokes,
      effects,
    } as ImageNode;
  }

  // 2. SVG Element
  if (tagName === "SVG") {
    state.diagnostics.totalVectors++;
    const svgEl = rootElement as SVGSVGElement;
    return {
      id,
      name,
      type: "VECTOR",
      bounds,
      visible,
      opacity,
      svgContent: svgEl.outerHTML,
      strokes,
    } as VectorNode;
  }

  // 3. Canvas Element
  if (tagName === "CANVAS") {
    state.diagnostics.totalUnsupported++;
    let fallbackImageUrl: string | undefined;
    try {
      fallbackImageUrl = (rootElement as HTMLCanvasElement).toDataURL("image/png");
    } catch {
      // Tainted canvas
    }
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "CANVAS_ELEMENT",
      description: "HTML5 Canvas element (raster fallback provided)",
      bounds,
      visible,
      opacity,
      fallbackImageUrl,
    } as UnsupportedNode;
  }

  // 4. Video Element
  if (tagName === "VIDEO") {
    state.diagnostics.totalUnsupported++;
    const video = rootElement as HTMLVideoElement;
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "VIDEO_ELEMENT",
      description: "Video player element",
      bounds,
      visible,
      opacity,
      fallbackImageUrl: video.poster || undefined,
    } as UnsupportedNode;
  }

  // 5. IFrame Element
  if (tagName === "IFRAME") {
    state.diagnostics.totalUnsupported++;
    return {
      id,
      name,
      type: "UNSUPPORTED",
      reason: "CROSS_ORIGIN_IFRAME",
      description: "Embedded iframe subject to browser security restrictions",
      bounds,
      visible,
      opacity,
    } as UnsupportedNode;
  }

  // 6. Form input elements
  if (tagName === "INPUT" || tagName === "TEXTAREA") {
    const input = rootElement as HTMLInputElement;
    const rawVal = input.value || input.placeholder || "";
    const redactedText = options.redactForms ? redactFormValue(input, rawVal) : rawVal;

    const children: SceneNode[] = [];
    if (redactedText) {
      state.diagnostics.totalTextNodes++;
      const textColor = parseColor(computed.color);
      const typography = parseTypography(computed);
      children.push({
        id: `${id}-txt`,
        name: "Input Value",
        type: "TEXT",
        bounds: {
          x: 8,
          y: Math.max(0, Math.round((bounds.height - typography.fontSize) / 2)),
          width: Math.max(0, bounds.width - 16),
          height: typography.fontSize * 1.2,
        },
        visible: true,
        opacity: input.value ? 1 : 0.6,
        characters: redactedText,
        style: typography,
        fills: [{ type: "SOLID", color: textColor, visible: true }],
      } as TextNode);
    }

    return {
      id,
      name,
      type: "FRAME",
      bounds,
      visible,
      opacity,
      fills: fills.length > 0 ? fills : [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
      strokes,
      cornerRadius,
      effects,
      clipsContent: true,
      children,
    } as FrameNode;
  }

  // 7. General container / element with children
  const children: SceneNode[] = [];

  // Check CSS background-image url(...)
  const bgImageUrl = parseBackgroundImageUrl(computed.backgroundImage);
  if (bgImageUrl) {
    state.diagnostics.totalImages++;
    children.push({
      id: `${id}-bg-img`,
      name: "Background Image",
      type: "IMAGE",
      bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      visible: true,
      opacity: 1,
      srcUrl: bgImageUrl,
      objectFit: "COVER",
    } as ImageNode);
  }

  // Check Pseudo-element ::before
  try {
    const beforeComputed = window.getComputedStyle(rootElement, "::before");
    const beforeContent = beforeComputed.content;
    if (beforeContent && beforeContent !== "none" && beforeContent !== "normal") {
      const cleanContent = beforeContent.replace(/^["']|["']$/g, "").trim();
      if (cleanContent) {
        state.diagnostics.totalTextNodes++;
        children.push({
          id: `${id}-pseudo-before`,
          name: "::before",
          type: "TEXT",
          bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
          visible: true,
          opacity: 1,
          characters: cleanContent,
          style: parseTypography(beforeComputed),
          fills: [{ type: "SOLID", color: parseColor(beforeComputed.color), visible: true }],
        } as TextNode);
      }
    }
  } catch {
    // pseudo element read ignored
  }

  // Direct text nodes inside this element
  for (const childNode of Array.from(rootElement.childNodes)) {
    if (childNode.nodeType === Node.TEXT_NODE) {
      const textContent = (childNode.textContent || "").trim();
      if (textContent.length > 0) {
        state.diagnostics.totalTextNodes++;
        const typography = parseTypography(computed);
        const textColor = parseColor(computed.color);

        const range = document.createRange();
        range.selectNode(childNode);
        const textRect = range.getBoundingClientRect();

        const textBounds: BoundingBox = {
          x: Math.round(textRect.left - rect.left),
          y: Math.round(textRect.top - rect.top),
          width: Math.round(textRect.width || bounds.width),
          height: Math.round(textRect.height || bounds.height),
        };

        children.push({
          id: `text-${++state.nodeCount}`,
          name: textContent.length > 20 ? `${textContent.substring(0, 20)}...` : textContent,
          type: "TEXT",
          bounds: textBounds,
          visible: true,
          opacity: 1,
          characters: textContent,
          style: typography,
          fills: [{ type: "SOLID", color: textColor, visible: true }],
        } as TextNode);
      }
    } else if (childNode.nodeType === Node.ELEMENT_NODE) {
      const childSceneNode = captureSubtree(
        childNode as Element,
        rect.left,
        rect.top,
        options,
        state
      );
      if (childSceneNode) {
        children.push(childSceneNode);
      }
    }
  }

  // Auto Layout inference
  const autoLayout = options.inferAutoLayout !== false
    ? inferAutoLayout(computed, children.length)
    : undefined;

  const clipsContent =
    computed.overflow === "hidden" ||
    computed.overflow === "clip" ||
    computed.overflowX === "hidden" ||
    computed.overflowY === "hidden";

  return {
    id,
    name,
    type: "FRAME",
    bounds,
    visible,
    opacity,
    fills,
    strokes,
    cornerRadius,
    effects,
    clipsContent,
    autoLayout,
    children,
  } as FrameNode;
}

export function capturePage(
  targetElement: Element = document.body,
  options: CaptureOptions = {}
): SceneGraphDocument {
  const startTime = performance.now();
  const mode = options.captureMode || "VIEWPORT";

  const diagnostics: CaptureDiagnostics = {
    totalNodesCaptured: 0,
    totalTextNodes: 0,
    totalImages: 0,
    totalVectors: 0,
    totalUnsupported: 0,
    warnings: [],
    durationMs: 0,
  };

  const state = { nodeCount: 0, diagnostics };

  let originX = 0;
  let originY = 0;

  const docWidth = Math.max(
    document.body?.scrollWidth || 0,
    document.documentElement?.scrollWidth || 0,
    window.innerWidth
  );
  const docHeight = Math.max(
    document.body?.scrollHeight || 0,
    document.documentElement?.scrollHeight || 0,
    window.innerHeight
  );

  if (mode === "SELECTED_ELEMENT") {
    const r = targetElement.getBoundingClientRect();
    originX = r.left;
    originY = r.top;
  } else if (mode === "VIEWPORT") {
    originX = 0;
    originY = 0;
  } else {
    // FULL_PAGE
    originX = -window.scrollX;
    originY = -window.scrollY;
  }

  const rootSceneNode = captureSubtree(targetElement, originX, originY, options, state);

  const rootWidth = mode === "FULL_PAGE" ? docWidth : window.innerWidth;
  const rootHeight = mode === "FULL_PAGE" ? docHeight : window.innerHeight;

  const rootFrame: FrameNode =
    rootSceneNode && rootSceneNode.type === "FRAME"
      ? (rootSceneNode as FrameNode)
      : {
          id: "root-frame",
          name: document.title || "Page Capture",
          type: "FRAME",
          bounds: {
            x: 0,
            y: 0,
            width: rootWidth,
            height: rootHeight,
          },
          visible: true,
          opacity: 1,
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
          children: rootSceneNode ? [rootSceneNode] : [],
        };

  diagnostics.totalNodesCaptured = state.nodeCount;
  diagnostics.durationMs = Math.round(performance.now() - startTime);

  const viewport: ViewportMeta = {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `doc-${Date.now()}`,
    title: document.title || "Captured Page",
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    captureMode: mode,
    viewport,
    root: rootFrame,
    diagnostics,
  };
}
