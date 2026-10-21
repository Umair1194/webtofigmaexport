import { hasDominantIframePlaceholder } from "@frameforge/shared-protocol";
import { Paint as FFPaint, SceneGraphDocument, SceneNode as FFSceneNode, validateSceneGraph } from "@frameforge/scene-graph";

figma.showUI(__html__, { width: 440, height: 640, themeColors: true });

export function mapWeightToStyleName(weight: number, isItalic = false): string {
  const styles = ["Thin", "Extra Light", "Light", "Regular", "Medium", "Semi Bold", "Bold", "Extra Bold", "Black"];
  const style = styles[Math.max(0, Math.min(8, Math.round(weight / 100) - 1))];
  return isItalic ? style === "Regular" ? "Italic" : `${style} Italic` : style;
}
const fonts = new Map<string, Promise<FontName>>();
async function ensureFontLoaded(family: string, style: string, warnings: Set<string>): Promise<FontName> {
  const key = `${family}::${style}`;
  if (!fonts.has(key)) fonts.set(key, (async () => {
    const candidates = [{ family, style }, { family, style: style.includes("Bold") ? "Bold" : "Regular" }, { family: "Inter", style }, { family: "Inter", style: "Regular" }];
    for (const candidate of candidates) {
      try { await figma.loadFontAsync(candidate); return candidate; } catch { /* try next available face */ }
    }
    throw new Error(`No usable font is available for ${family} ${style}.`);
  })());
  try {
    const resolved = await fonts.get(key)!;
    if (resolved.family !== family || resolved.style !== style) warnings.add(`Substituted ${family} ${style} with ${resolved.family} ${resolved.style}.`);
    return resolved;
  } catch (error) { fonts.delete(key); throw error; }
}
function convertPaint(paint: FFPaint): Paint {
  if (paint.type === "SOLID") return { type: "SOLID", color: { r: paint.color.r, g: paint.color.g, b: paint.color.b }, opacity: paint.opacity ?? paint.color.a, visible: paint.visible !== false };
  const rad = ((paint.angleDegrees ?? 180) - 90) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const t=paint.gradientTransform;
  return { type: paint.type, gradientTransform: t?[[t.m00,t.m01,t.m02],[t.m10,t.m11,t.m12]]:[[cos, sin, (1 - cos - sin) / 2], [-sin, cos, (1 + sin - cos) / 2]], gradientStops: paint.stops, visible: paint.visible !== false };
}
interface ImportContext {
  requestId?: string;
  cancelWaiters: Set<() => void>;
  created: SceneNode[];
  cancelled: boolean;
  stats: { totalNodes: number; textNodes: number; frames: number; autoLayoutFrames: number; images: number; vectors: number; unsupported: number };
  warnings: Set<string>;
  images: Map<string, Image>;
}
let active: ImportContext | null = null;
function send(ctx: ImportContext, message: Record<string, unknown>) { figma.ui.postMessage({ ...message, requestId: ctx.requestId }); }
function waitForFont<T>(promise: Promise<T>, ctx: ImportContext): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => { cleanup(); reject(new Error("Import cancelled.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Font loading timed out. Check Figma's font service, then retry.")); }, 15000);
    const cleanup = () => { clearTimeout(timer); ctx.cancelWaiters.delete(cancel); };
    ctx.cancelWaiters.add(cancel);
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (ctx.cancelled) cancel();
  });
}
function track<T extends SceneNode>(ctx: ImportContext, node: T): T { ctx.created.push(node); return node; }
function applyBase(target: SceneNode, node: FFSceneNode) {
  target.name = node.name; target.x = node.bounds.x; target.y = node.bounds.y;
  if ("opacity" in target) target.opacity = node.opacity; target.visible = node.visible;
}
function applyShape(target: FrameNode | RectangleNode, node: FFSceneNode) {
  if ("cornerRadius" in node && node.cornerRadius) {
    target.topLeftRadius = node.cornerRadius.topLeft; target.topRightRadius = node.cornerRadius.topRight;
    target.bottomRightRadius = node.cornerRadius.bottomRight; target.bottomLeftRadius = node.cornerRadius.bottomLeft;
  }
  if ("strokes" in node && node.strokes?.length) {
    const stroke = node.strokes[0];
    target.strokes = [{ type: "SOLID", color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b }, opacity: stroke.color.a }];
    target.strokeWeight = stroke.width; target.strokeAlign = stroke.alignment || "INSIDE";
    if (node.strokes.some(s => s.side)) {
      target.strokeTopWeight = node.strokes.find(s => s.side === "TOP")?.width || 0;
      target.strokeRightWeight = node.strokes.find(s => s.side === "RIGHT")?.width || 0;
      target.strokeBottomWeight = node.strokes.find(s => s.side === "BOTTOM")?.width || 0;
      target.strokeLeftWeight = node.strokes.find(s => s.side === "LEFT")?.width || 0;
    }
    if (stroke.style === "dashed") target.dashPattern = [stroke.width * 3, stroke.width * 2];
    if (stroke.style === "dotted") target.dashPattern = [stroke.width, stroke.width];
  }
  if ("effects" in node && node.effects) target.effects = node.effects.map(effect => {
    if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") return { ...effect, visible: effect.visible !== false, blendMode: "NORMAL" } as Effect;
    return { ...effect, visible: effect.visible !== false } as Effect;
  });
}
function getImage(dataUrl: string, ctx: ImportContext): Image {
  const cached = ctx.images.get(dataUrl); if (cached) return cached;
  const match = dataUrl.match(/^data:(image\/[\w.+-]+)(;base64)?,([\s\S]*)$/i);
  if (!match) throw new Error("Unsupported image data URL");
  if (match[1].toLowerCase() === "image/svg+xml") throw new Error("SVG image must be imported as a vector");
  if (!match[2]) throw new Error("Image data must use base64 encoding");
  const image = figma.createImage(figma.base64Decode(match[3])); ctx.images.set(dataUrl, image); return image;
}
async function buildNode(node: FFSceneNode, ctx: ImportContext): Promise<SceneNode> {
  if (ctx.cancelled) throw new Error("Import cancelled.");
  ctx.stats.totalNodes++;
  if (ctx.stats.totalNodes % 50 === 0) {
    send(ctx, { type: "IMPORT_PROGRESS", message: `Creating layers… ${ctx.stats.totalNodes}` });
    await new Promise(resolve => setTimeout(resolve, 0));
    if (ctx.cancelled) throw new Error("Import cancelled.");
  }
  const width = Math.max(0.01, node.bounds.width), height = Math.max(0.01, node.bounds.height);
  let result: SceneNode;
  switch (node.type) {
    case "FRAME": {
      ctx.stats.frames++;
      const frame = track(ctx, figma.createFrame()); result = frame;
      frame.resize(width, height); frame.clipsContent = !!node.clipsContent; frame.fills = node.fills.map(convertPaint); applyShape(frame, node);
      if (node.strokes?.some(s => JSON.stringify(s.color) !== JSON.stringify(node.strokes![0].color))) {
        frame.strokes = [];
        for (const stroke of node.strokes) {
          const border = track(ctx, figma.createRectangle());
          const vertical = stroke.side === "LEFT" || stroke.side === "RIGHT";
          border.name = "Border " + (stroke.side || "TOP"); border.resize(vertical ? Math.max(.01, stroke.width) : width, vertical ? height : Math.max(.01, stroke.width));
          border.fills = [{ type: "SOLID", color: { r: stroke.color.r, g: stroke.color.g, b: stroke.color.b }, opacity: stroke.color.a }];
          frame.appendChild(border); border.x = stroke.side === "RIGHT" ? width - stroke.width : 0; border.y = stroke.side === "BOTTOM" ? height - stroke.width : 0;
        }
      }
      const children: { source: FFSceneNode; output: SceneNode }[] = [];
      for (const child of node.children) { const output = await buildNode(child, ctx); frame.appendChild(output); children.push({ source: child, output }); }
      if (node.autoLayout && node.autoLayout.layoutMode !== "NONE" && frame.children.length === children.length) {
        const a = node.autoLayout;
        frame.layoutMode = a.layoutMode; frame.itemSpacing = a.itemSpacing;
        frame.paddingTop = a.paddingTop; frame.paddingRight = a.paddingRight; frame.paddingBottom = a.paddingBottom; frame.paddingLeft = a.paddingLeft;
        frame.primaryAxisAlignItems = a.primaryAxisAlignItems || "MIN"; frame.counterAxisAlignItems = a.counterAxisAlignItems || "MIN";
        frame.primaryAxisSizingMode = "FIXED"; frame.counterAxisSizingMode = "FIXED";
        frame.layoutWrap = a.layoutWrap || "NO_WRAP";
        frame.resizeWithoutConstraints(width, height);
        // Keep native Auto Layout only when it reproduces the measured browser geometry.
        const changed = children.some(({ source: c, output: o }) => Math.abs(o.x - c.bounds.x) > 1 || Math.abs(o.y - c.bounds.y) > 1 || Math.abs(o.width - c.bounds.width) > 1 || Math.abs(o.height - c.bounds.height) > 1);
        if (changed) {
          frame.layoutMode = "NONE";
          for (const { source: c, output: o } of children) { if ("resize" in o) o.resize(Math.max(0.01, c.bounds.width), Math.max(0.01, c.bounds.height)); o.x = c.bounds.x; o.y = c.bounds.y; }
          frame.resizeWithoutConstraints(width, height);
          ctx.warnings.add(`Preserved measured positioning for ${node.name}; inferred Auto Layout would change its appearance.`);
        } else ctx.stats.autoLayoutFrames++;
      }
      break;
    }
    case "TEXT": {
      ctx.stats.textNodes++;
      const text = track(ctx, figma.createText()); result = text;
      send(ctx, { type: "IMPORT_PROGRESS", message: `Loading font: ${node.style.fontFamily}…` });
      try { text.fontName = await waitForFont(ensureFontLoaded(node.style.fontFamily, mapWeightToStyleName(node.style.fontWeight, node.style.fontStyle === "italic"), ctx.warnings), ctx); }
      catch (error) { fonts.delete(`${node.style.fontFamily}::${mapWeightToStyleName(node.style.fontWeight, node.style.fontStyle === "italic")}`); throw error; }
      if (ctx.cancelled) throw new Error("Import cancelled.");
      text.fontSize = node.style.fontSize; text.characters = node.characters;
      if (node.style.lineHeight) text.lineHeight = node.style.lineHeight;
      if (node.style.letterSpacing) text.letterSpacing = node.style.letterSpacing;
      text.textAlignHorizontal = node.style.textAlignHorizontal || "LEFT"; text.textAlignVertical = node.style.textAlignVertical || "TOP";
      text.textCase = node.style.textCase || "ORIGINAL"; text.textDecoration = node.style.textDecoration || "NONE";
      text.fills = node.fills.map(convertPaint);
      for(const run of node.runs||[]){
        const font=await waitForFont(ensureFontLoaded(run.style.fontFamily,mapWeightToStyleName(run.style.fontWeight,run.style.fontStyle==='italic'),ctx.warnings),ctx);
        text.setRangeFontName(run.start,run.end,font);text.setRangeFontSize(run.start,run.end,run.style.fontSize);
        text.setRangeFills(run.start,run.end,run.fills.map(convertPaint));
        text.setRangeTextDecoration(run.start,run.end,run.style.textDecoration||'NONE');
        if(run.style.lineHeight)text.setRangeLineHeight(run.start,run.end,run.style.lineHeight);
        if(run.style.letterSpacing)text.setRangeLetterSpacing(run.start,run.end,run.style.letterSpacing);
      }
      text.textAutoResize = "NONE"; text.resize(width, height);
      if(node.textAutoResize==='HEIGHT')text.textAutoResize='HEIGHT';
      break;
    }
    case "RECTANGLE": {
      const rectangle = track(ctx, figma.createRectangle()); result = rectangle;
      rectangle.resize(width, height); rectangle.fills = node.fills.map(convertPaint); applyShape(rectangle, node); break;
    }
    case "LINE": {
      const line = track(ctx, figma.createLine()); result = line; line.resize(width, 0);
      if (height > width) { line.resize(height, 0); line.rotation = -90; }
      line.strokes = node.strokes.map(s => ({ type: "SOLID", color: { r: s.color.r, g: s.color.g, b: s.color.b }, opacity: s.color.a }));
      line.strokeWeight = node.strokes[0]?.width || 1; break;
    }
    case "VECTOR": {
      ctx.stats.vectors++;
      try { result = track(ctx, figma.createNodeFromSvg(node.svgContent)); result.resize(width, height); }
      catch { const fallback = track(ctx, figma.createRectangle()); fallback.resize(width, height); result = fallback; ctx.warnings.add(`SVG could not be imported: ${node.name}.`); }
      break;
    }
    case "IMAGE":
    case "UNSUPPORTED": {
      if (node.type === "IMAGE") ctx.stats.images++; else ctx.stats.unsupported++;
      const dataUrl = node.type === "IMAGE" ? node.dataUrl : node.fallbackImageUrl;
      const frame = track(ctx, figma.createFrame()); result = frame; frame.resize(width, height); frame.clipsContent = true;
      frame.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.82 } }]; applyShape(frame, node);
      try {
        if (!dataUrl) throw new Error("Image data unavailable");
        if (/^data:image\/svg\+xml[;,]/i.test(dataUrl)) {
          const comma = dataUrl.indexOf(",");
          const svg = dataUrl.slice(0, comma).includes(";base64") ? Array.from(figma.base64Decode(dataUrl.slice(comma + 1)), byte => String.fromCharCode(byte)).join("") : decodeURIComponent(dataUrl.slice(comma + 1));
          const vector = track(ctx, figma.createNodeFromSvg(svg)); vector.resize(width, height); frame.appendChild(vector); vector.x = 0; vector.y = 0; frame.fills = [];
        } else {
          const image = getImage(dataUrl, ctx);
          const fit = node.type === "IMAGE" ? node.objectFit : "COVER";
          frame.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: fit === "CONTAIN" ? "FIT" : fit === "FILL" ? "CROP" : "FILL", ...(fit === "FILL" ? { imageTransform: [[1, 0, 0], [0, 1, 0]] as Transform } : {}) }];
          if (fit === "NONE") ctx.warnings.add(`Image object-fit:none approximated with cover: ${node.name}.`);
        }
      } catch {
        ctx.warnings.add(`${node.type === "UNSUPPORTED" ? node.description : "Missing image"}: ${node.name}.`);
      }
      break;
    }
  }
  applyBase(result!, node);
  return result!;
}

figma.ui.onmessage = async (msg: { type: string; payload?: unknown; requestId?: string }) => {
  if (msg.type === "CANCEL_IMPORT") { if (active && (!msg.requestId || msg.requestId === active.requestId)) { active.cancelled = true; for (const cancel of [...active.cancelWaiters]) cancel(); } return; }
  if (msg.type !== "IMPORT_SCENE_GRAPH") return;
  if (active) { figma.ui.postMessage({ type: "IMPORT_PROGRESS", message: "An import is already running." }); return; }
  const ctx: ImportContext = { requestId: msg.requestId, cancelWaiters: new Set(), created: [], cancelled: false, warnings: new Set(), images: new Map(), stats: { totalNodes: 0, textNodes: 0, frames: 0, autoLayoutFrames: 0, images: 0, vectors: 0, unsupported: 0 } };
  active = ctx;
  const started = Date.now();
  try {
    const validation = validateSceneGraph(msg.payload);
    if (!validation.valid || !validation.document) throw new Error(`Invalid capture: ${validation.errors.join("; ")}`);
    const doc: SceneGraphDocument = validation.document;
    if (hasDominantIframePlaceholder(doc.root)) throw new Error("This capture contains an uncaptured embedded preview covering the page. Reload the updated extension and the website, then capture again. The old JSON does not contain that preview’s layers.");
    for (const warning of [...validation.warnings, ...doc.diagnostics.warnings]) ctx.warnings.add(warning);
    send(ctx, { type: "IMPORT_PROGRESS", message: "Loading fonts and creating editable layers…" });
    const root = await buildNode(doc.root, ctx);
    if (ctx.cancelled) throw new Error("Import cancelled.");
    figma.currentPage.appendChild(root);
    root.x = Math.round(figma.viewport.center.x - root.width / 2); root.y = Math.round(figma.viewport.center.y - root.height / 2);
    figma.currentPage.selection = [root]; figma.viewport.scrollAndZoomIntoView([root]);
    send(ctx, { type: "IMPORT_SUCCESS", stats: { ...ctx.stats, warnings: [...ctx.warnings], title: doc.title, durationMs: Date.now() - started } });
  } catch (error) {
    for (const node of ctx.created.reverse()) { if (!node.removed) node.remove(); }
    send(ctx, { type: "IMPORT_ERROR", error: error instanceof Error ? error.message : "Import failed." });
  } finally { active = null; }
};
