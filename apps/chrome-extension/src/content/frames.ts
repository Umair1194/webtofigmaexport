import { FrameNode, SceneGraphDocument, SceneNode, validateSceneGraph } from "@frameforge/scene-graph";

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
  window.addEventListener("message", event => {
    if (window === window.top || event.source !== window.parent || event.data?.type !== "FRAMEFORGE_IDENTIFY_FRAME") return;
    const token = event.data.token;
    if (typeof token !== "string" || !/^fframe-[\w-]{20,80}$/.test(token)) return;
    void chrome.runtime.sendMessage({ type: "REGISTER_CAPTURE_FRAME", token }).catch(() => {});
  });
}

export async function captureEmbeddedFrames(doc: SceneGraphDocument, frames: Map<string, HTMLIFrameElement>, signal: AbortSignal, depth: number, maxNodes = 2500) {
  const slots: { parent: FrameNode; index: number; node: SceneNode }[] = [];
  const stack: SceneNode[] = [doc.root];
  while (stack.length) {
    const parent = stack.pop()!;
    if (parent.type !== "FRAME") continue;
    parent.children.forEach((node, index) => { if (node.type === "UNSUPPORTED" && node.reason === "CROSS_ORIGIN_IFRAME") slots.push({ parent, index, node }); else stack.push(node); });
  }
  if (slots.length) {
    const prepared = await chrome.runtime.sendMessage({ type: "PREPARE_CAPTURE_FRAMES" });
    if (prepared?.status === "error") doc.diagnostics.warnings.push("Embedded frame access: " + prepared.error);
  }
  const meaningful = slots.filter(slot => slot.node.bounds.width >= 2 && slot.node.bounds.height >= 2).length;
  let captured = 0;
  for (const slot of slots) {
    if (signal.aborted) throw new Error("Capture cancelled.");
    const token = slot.node.attributes?.frameKey;
    const frame = token ? frames.get(token) : null;
    const remaining = maxNodes - doc.diagnostics.totalNodesCaptured;
    if (!frame?.contentWindow || !token || remaining < 2 || depth >= 4) continue;
    if (slot.node.bounds.width < 2 || slot.node.bounds.height < 2) continue;
    let unregisterAbort = () => {};
    let identifyTimer: ReturnType<typeof setInterval> | undefined;
    try {
      const request = chrome.runtime.sendMessage({ type: "CAPTURE_CHILD_FRAME", token, maxNodes: remaining, depth: depth + 1 });
      const identify = () => frame.contentWindow?.postMessage({ type: "FRAMEFORGE_IDENTIFY_FRAME", token }, "*");
      identify(); identifyTimer = setInterval(identify, 150);
      const aborted = new Promise<never>((_, reject) => {
        const abort = () => { void chrome.runtime.sendMessage({ type: "CANCEL_CHILD_FRAME", token }).catch(() => {}); reject(new Error("Capture cancelled.")); };
        signal.addEventListener("abort", abort, { once: true }); unregisterAbort = () => signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
      });
      const response = await Promise.race([request, aborted]);
      if (response?.status !== "ok") throw new Error(response?.error || "Frame unavailable");
      const validated = validateSceneGraph(response.document);
      if (!validated.valid || !validated.document) throw new Error("Frame returned invalid content");
      const embedded = validated.document;
      const rename: SceneNode[] = [embedded.root];
      while (rename.length) { const node = rename.pop()!; node.id = token + ":" + node.id; if (node.type === "FRAME") rename.push(...node.children); }
      embedded.root.bounds.x = 0; embedded.root.bounds.y = 0;
      slot.parent.children[slot.index] = { ...slot.node, type: "FRAME", name: "Embedded preview", clipsContent: true, fills: [], children: [embedded.root] } as FrameNode;
      doc.diagnostics.totalNodesCaptured += embedded.diagnostics.totalNodesCaptured;
      doc.diagnostics.totalTextNodes += embedded.diagnostics.totalTextNodes;
      doc.diagnostics.totalImages += embedded.diagnostics.totalImages;
      doc.diagnostics.totalVectors += embedded.diagnostics.totalVectors;
      doc.diagnostics.totalUnsupported += embedded.diagnostics.totalUnsupported - 1;
      for (const warning of embedded.diagnostics.warnings) if (!doc.diagnostics.warnings.includes(warning)) doc.diagnostics.warnings.push(warning);
      captured++;
    } catch (error) {
      if (signal.aborted) throw error;
      const warning = "Embedded preview unavailable: " + (error instanceof Error ? error.message : "unknown frame error") + ". Allow FrameForge access to all sites in extension settings, reload this page, and retry.";
      if (!doc.diagnostics.warnings.includes(warning)) doc.diagnostics.warnings.push(warning);
    } finally { clearInterval(identifyTimer); unregisterAbort(); }
  }
  if (captured && captured === meaningful) doc.diagnostics.warnings = doc.diagnostics.warnings.filter(w => w !== "Embedded iframe content is represented by a placeholder.");
}
