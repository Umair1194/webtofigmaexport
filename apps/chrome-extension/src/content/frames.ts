import { notifyRuntime } from "./runtime.js";
import { DEFAULT_CAPTURE_NODES, MAX_CAPTURED_FONTS, MAX_TOTAL_FONT_BYTES, FrameNode, SceneGraphDocument, SceneNode, validateSceneGraph } from "@frameforge/scene-graph";

export function collectFrames(target: Element) {
  const keys = new WeakMap<Element, string>();
  const frames = new Map<string, HTMLIFrameElement>();
  function visit(root: Element | ShadowRoot) {
    const found = "tagName" in root && root.tagName === "IFRAME" ? [root] : Array.from(root.querySelectorAll("iframe"));
    for (const element of found) {
      if (frames.size >= 32) break;
      const key = "fframe-" + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,"0")).join(""); keys.set(element, key); frames.set(key, element as HTMLIFrameElement);
    }
    if ("shadowRoot" in root && root.shadowRoot) visit(root.shadowRoot);
    for (const el of Array.from(root.querySelectorAll("*"))) if (el.shadowRoot) visit(el.shadowRoot);
  }
  visit(target); return { keys, frames };
}

// Only frame identification tokens cross the page's postMessage channel.
// Captured content is returned through Chrome's private extension messaging.
export function registerFrameIdentityListener() {
  const identify = async (event: MessageEvent) => {
    if (window === window.top || event.source !== window.parent || event.data?.type !== "FRAMEFORGE_IDENTIFY_FRAME") return;
    const token = event.data.token;
    if (typeof token !== "string" || !/^fframe-[\w-]{20,80}$/.test(token)) return;
    try {
      // Invalidated extension contexts can throw before a Promise is returned.
      await chrome.runtime.sendMessage({ type: "REGISTER_CAPTURE_FRAME", token });
    } catch (error) {
      if (/extension context invalidated/i.test(error instanceof Error ? error.message : String(error))) {
        window.removeEventListener("message", identify);
      }
    }
  };
  window.addEventListener("message", identify);
  return () => window.removeEventListener("message", identify);
}

export async function captureEmbeddedFrames(doc: SceneGraphDocument, frames: Map<string, HTMLIFrameElement>, signal: AbortSignal, depth: number, maxNodes = DEFAULT_CAPTURE_NODES, mode: 'FULL_PAGE' | 'VIEWPORT' | 'SELECTED_ELEMENT' = 'VIEWPORT') {
  const slots: { parent: FrameNode; index: number; node: SceneNode }[] = [];
  const stack: SceneNode[] = [doc.root];
  while (stack.length) {
    const parent = stack.pop()!;
    if (parent.type !== "FRAME") continue;
    parent.children.forEach((node, index) => { if (node.type === "UNSUPPORTED" && node.reason === "CROSS_ORIGIN_IFRAME") slots.push({ parent, index, node }); else stack.push(node); });
  }
  const warn = (message: string) => { if (!doc.diagnostics.warnings.includes(message)) doc.diagnostics.warnings.push(message); };
  if (slots.length) {
    try {
      const prepared = await chrome.runtime.sendMessage({ type: "PREPARE_CAPTURE_FRAMES" });
      if (prepared?.status === "error") warn("Embedded frame access: " + prepared.error);
    } catch (error) { warn("Embedded frame preparation failed: " + (error instanceof Error ? error.message : "extension unavailable")); }
  }
  const meaningful = slots.filter(slot => slot.node.bounds.width >= 2 && slot.node.bounds.height >= 2).length;
  // A viewport-sized preview shell owns no long-page content itself. For Full page,
  // export its dominant embedded document, rather than a viewport-height mask.
  const previewShell = mode === 'FULL_PAGE' && meaningful === 1 &&
    doc.root.bounds.height <= (doc.viewport?.height || doc.root.bounds.height) * 1.2;
  let captured = 0;
  for (const slot of slots) {
    if (signal.aborted) throw new Error("Capture cancelled.");
    const token = slot.node.attributes?.frameKey;
    const frame = token ? frames.get(token) : null;
    const remaining = maxNodes - doc.diagnostics.totalNodesCaptured;
    if (slot.node.bounds.width < 2 || slot.node.bounds.height < 2 || slot.node.visible === false || slot.node.opacity === 0) continue;
    if (remaining < 2) { warn("Embedded preview skipped: the capture reached its node limit. Select a smaller area."); continue; }
    if (depth >= 4) { warn("Embedded preview skipped: the nested frame depth limit was reached."); continue; }
    if (!frame?.contentWindow || !token) { warn("Embedded preview skipped: its frame could not be matched to the page. Reload the webpage and capture again."); continue; }
    let unregisterAbort = () => {};
    let identifyTimer: ReturnType<typeof setInterval> | undefined;
    try {
      const fullPreview = previewShell && slot.node.bounds.width * slot.node.bounds.height >= doc.root.bounds.width * doc.root.bounds.height * .8;
      const request = chrome.runtime.sendMessage({ type: "CAPTURE_CHILD_FRAME", token, maxNodes: remaining, depth: depth + 1, captureMode: fullPreview ? 'FULL_PAGE' : 'VIEWPORT' });
      const identify = () => frame.contentWindow?.postMessage({ type: "FRAMEFORGE_IDENTIFY_FRAME", token }, "*");
      identify(); identifyTimer = setInterval(identify, 150);
      const aborted = new Promise<never>((_, reject) => {
        const abort = () => { void notifyRuntime({ type: "CANCEL_CHILD_FRAME", token }); reject(new Error("Capture cancelled.")); };
        signal.addEventListener("abort", abort, { once: true }); unregisterAbort = () => signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
      });
      const response = await Promise.race([request, aborted]);
      if (response?.status !== "ok") throw new Error(response?.error || "Frame unavailable");
      const validated = validateSceneGraph(response.document);
      if (!validated.valid || !validated.document) {
        // Schema errors contain field paths and constraints, not captured text or assets.
        const details = validated.errors.slice(0, 3).map(error => error.slice(0, 350)).join("; ");
        throw new Error("Frame returned invalid content" + (details ? ": " + details : " (no validation details)"));
      }
      const embedded = validated.document;
      const rename: SceneNode[] = [embedded.root];
      while (rename.length) { const node = rename.pop()!; node.id = token + ":" + node.id; if (node.type === "FRAME") rename.push(...node.children); }
      embedded.root.bounds.x = 0; embedded.root.bounds.y = 0;
      slot.parent.children[slot.index] = { ...slot.node, type: "FRAME", name: "Embedded preview", clipsContent: true, fills: [], children: [embedded.root] } as FrameNode;
      if (fullPreview) {
        doc.root = embedded.root;
        doc.viewport = embedded.viewport;
        // The outer preview chrome is intentionally replaced by the full design.
        doc.diagnostics = {...embedded.diagnostics, warnings: [...embedded.diagnostics.warnings]};
      }
      if(embedded.fonts?.length){
        doc.fonts??=[];
        for(const font of embedded.fonts)if(!doc.fonts.some(existing=>existing.family===font.family&&existing.weightMin===font.weightMin&&existing.weightMax===font.weightMax&&existing.style===font.style&&existing.dataUrl===font.dataUrl)){
          if(doc.fonts.length>=MAX_CAPTURED_FONTS||doc.fonts.reduce((size,item)=>size+Math.ceil(item.dataUrl.length*3/4),0)+Math.ceil(font.dataUrl.length*3/4)>MAX_TOTAL_FONT_BYTES){warn('Embedded web-font budget reached; some fonts may use an explicit fallback.');continue;}
          doc.fonts.push(font);
        }
      }
      if (!fullPreview) {
      doc.diagnostics.totalNodesCaptured += embedded.diagnostics.totalNodesCaptured;
      doc.diagnostics.totalTextNodes += embedded.diagnostics.totalTextNodes;
      doc.diagnostics.totalImages += embedded.diagnostics.totalImages;
      doc.diagnostics.totalVectors += embedded.diagnostics.totalVectors;
      doc.diagnostics.totalUnsupported += embedded.diagnostics.totalUnsupported - 1;
      }
      for (const warning of embedded.diagnostics.warnings) if (!doc.diagnostics.warnings.includes(warning)) doc.diagnostics.warnings.push(warning);
      captured++;
    } catch (error) {
      if (signal.aborted) throw error;
      const warning = "Embedded preview unavailable: " + (error instanceof Error ? error.message : "unknown frame error");
      if (!doc.diagnostics.warnings.includes(warning)) doc.diagnostics.warnings.push(warning);
    } finally { clearInterval(identifyTimer); unregisterAbort(); }
  }
  if (captured && captured === meaningful) doc.diagnostics.warnings = doc.diagnostics.warnings.filter(w => w !== "Embedded iframe content is represented by a placeholder.");
}
