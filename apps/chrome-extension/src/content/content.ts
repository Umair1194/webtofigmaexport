import {captureFonts,waitForFonts} from './fonts.js';
import { notifyRuntime } from "./runtime.js";
import { saveCapture, clearSavedCapture } from "../capture-store.js";
import { copyCaptureInPage } from "../clipboard/client.js";
import { collectFrames, captureEmbeddedFrames, registerFrameIdentityListener } from "./frames.js";
import { loadCaptureImage } from "./images.js";
import { capturePageAsync, captureNodeLimit, CaptureOptions } from "@frameforge/dom-capture";
import { SceneGraphDocument, SceneNode } from "@frameforge/scene-graph";
import { checkWCAGCompliance, parseColor, rgbaToHex } from "@frameforge/style-normalizer";

if (!(window as any).__FRAMEFORGE_INITIALIZED__) {
  (window as any).__FRAMEFORGE_INITIALIZED__ = true;
  let cleanupMode: (() => void) | null = null;
  let inspectActive = false;
  let activeCapture: AbortController | null = null;
  let panel: HTMLDivElement | null = null;
  let lastCaptureId: string | null = null;
  registerFrameIdentityListener();

  function stopMode() { cleanupMode?.(); cleanupMode = null; inspectActive = false; }
  function showPanel(message: string, actions: { label: string; run: () => void }[] = []) {
    panel?.remove();
    panel = document.createElement("div");
    panel.id = "frameforge-panel";
    panel.setAttribute("data-frameforge-ignore", "true");
    panel.setAttribute("role", "status");
    panel.style.cssText = "position:fixed;top:16px;right:16px;max-width:360px;padding:16px;background:#fff;color:#202621;border:1px solid #dce2dc;border-radius:10px;box-shadow:0 4px 18px #0002;z-index:2147483647;font:13px/1.5 system-ui;";
    const text = document.createElement("div"); text.textContent = message; panel.appendChild(text);
    for (const action of [...actions, { label: "Dismiss", run: () => { stopMode(); panel?.remove(); } }]) {
      const button = document.createElement("button"); button.textContent = action.label;
      button.style.cssText = "margin:10px 8px 0 0;padding:7px 10px;border-radius:6px;border:1px solid #cbd3cc;background:#f1f5f1;color:#202621;cursor:pointer;font:inherit;";
      button.addEventListener("click", action.run); panel.appendChild(button);
    }
    document.documentElement.appendChild(panel);
  }

  async function inlineAssets(doc: SceneGraphDocument, signal: AbortSignal) {
    const jobs: { node: SceneNode; url: string }[] = [];
    const stack: SceneNode[] = [doc.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.type === "FRAME") stack.push(...node.children);
      if (node.type === "IMAGE" && node.srcUrl && !node.dataUrl) jobs.push({ node, url: node.srcUrl });
      if (node.type === "UNSUPPORTED" && node.fallbackImageUrl) jobs.push({ node, url: node.fallbackImageUrl });
    }
    const cache = new Map<string, ReturnType<typeof loadCaptureImage>>();
    let index = 0, embeddedChars = 0;
    const warnings = new Set(doc.diagnostics.warnings);
    await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
      while (index < jobs.length && !signal.aborted) {
        const { node, url } = jobs[index++];
        if (!cache.has(url)) cache.set(url, loadCaptureImage(url, signal));
        const result = await cache.get(url)!;
        // Count every occurrence: the JSON transport contains each embedded string.
        if (result.dataUrl && embeddedChars + result.dataUrl.length < 6 * 1024 * 1024) {
          embeddedChars += result.dataUrl.length;
          if (node.type === "IMAGE") node.dataUrl = result.dataUrl;
          if (node.type === "UNSUPPORTED") node.fallbackImageUrl = result.dataUrl;
        } else {
          warnings.add(`Missing asset: ${node.name} (${result.error || "capture asset budget exceeded"}).`);
          if (node.type === "UNSUPPORTED") node.fallbackImageUrl = undefined;
        }
      }
    }));
    doc.diagnostics.warnings = [...warnings];
  }

  async function performCapture(target: Element, options: CaptureOptions & { autoCopy?: boolean; frameDepth?: number; requestId?: string } = {}, embedded = false) {
    if (activeCapture) throw new Error("A capture is already running. Cancel it before starting another.");
    stopMode(); panel?.remove();
    const controller = new AbortController(); activeCapture = controller;
    const started = performance.now();
    const reportStage = (stage: string) => { if (!embedded && options.requestId) void notifyRuntime({type:'CAPTURE_PROGRESS',requestId:options.requestId,stage}); };
    let timedOut = false, copied = false;
    const captureTimeout = options.captureMode === 'FULL_PAGE' ? 60000 : 30000;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, captureTimeout);
    if (!embedded) showPanel("Capturing editable layers…", [{ label: "Cancel", run: () => controller.abort() }]);
    try {
      reportStage('Waiting for web fonts…');
      const fontsReady=await waitForFonts(controller.signal);
      reportStage('Reading page…');
      const frameInfo = collectFrames(target);
      const doc = await capturePageAsync(target, { ...options, frameKeys: frameInfo.keys, signal: controller.signal, inferAutoLayout: true, redactForms: true });
      if(!fontsReady)doc.diagnostics.warnings.push('Web fonts were still loading when captured. Recapture after the page settles for reliable wrapping.');
      await captureEmbeddedFrames(doc, frameInfo.frames, controller.signal, options.frameDepth || 0, captureNodeLimit(options), options.captureMode);
      if (doc.diagnostics.warnings.some(w => w.includes('Reached maximum node capture limit'))) throw new Error('This page exceeds the capture layer limit. Capture smaller sections; the incomplete page has not been saved.');
      if (!embedded) showPanel("Embedding images…", [{ label: "Cancel", run: () => controller.abort() }]);
      reportStage('Adding images…');
      await inlineAssets(doc, controller.signal);
      reportStage('Matching web fonts…');await captureFonts(doc,controller.signal);
      if (controller.signal.aborted) throw new Error(timedOut ? `Capture timed out after ${captureTimeout / 1000} seconds. Select a smaller section.` : "Capture cancelled.");
      doc.diagnostics.durationMs = Math.round(performance.now() - started);
      // Chrome storage quota is measured in bytes, not JS UTF-16 characters.
      if (new TextEncoder().encode(JSON.stringify(doc)).byteLength > 8 * 1024 * 1024) throw new Error("Capture exceeds 8 MB. Select a smaller section.");
      if (!embedded) {
        await saveCapture(doc);
        lastCaptureId = doc.id;
        const copy = async () => {
          try {
            showPanel("Preparing editable layers…", [{ label: "Cancel", run: () => controller.abort() }]);
            await copyCaptureInPage(doc,controller.signal); copied = true;
            try { await clearSavedCapture(doc.id); }
            catch { showPanel('Copied to Figma. The saved capture could not be cleared; open the extension to discard it.'); return; }
            panel?.remove(); panel = null;
          }
          catch (error) { showPanel(error instanceof Error ? error.message + " Open the extension to retry copying." : "Capture saved. Open the extension to copy to Figma."); }
        };
        if (options.autoCopy !== false) await copy();
        else { panel?.remove(); panel = null; }
      }
      return { document: doc, copied };
    } catch (error) {
      if (!embedded) showPanel(error instanceof Error ? error.message : "Capture failed. Try a smaller section.");
      throw error;
    } finally { clearTimeout(timeout); activeCapture = null; }
  }

  function startPicker() {
    stopMode();
    let target: Element | null = null;
    // A separate overlay avoids modifying the website's outline styles.
    const outline = document.createElement("div");
    outline.setAttribute("data-frameforge-ignore", "true");
    outline.style.cssText = "position:fixed;pointer-events:none;border:2px solid #355d42;background:#355d4210;z-index:2147483646;display:none;";
    document.documentElement.appendChild(outline);
    showPanel("Click an element to capture. ↑ selects its parent, ↓ its first child, Enter captures, Esc cancels.");
    function highlight(el: Element | null) {
      if (!el || el.closest("[data-frameforge-ignore]")) return;
      target = el; const r = el.getBoundingClientRect();
      Object.assign(outline.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    const move = (event: MouseEvent) => highlight(event.target as Element);
    const capture = (event: Event) => {
      if ((event.target as Element)?.closest?.("[data-frameforge-ignore]")) return;
      const selected = event instanceof MouseEvent ? event.target as Element : target;
      event.preventDefault(); event.stopImmediatePropagation();
      stopMode();
      if (selected) void performCapture(selected, { captureMode: "SELECTED_ELEMENT" }).catch(() => {});
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { stopMode(); panel?.remove(); }
      if (event.key === "ArrowUp") { event.preventDefault(); highlight(target?.parentElement || null); }
      if (event.key === "ArrowDown") { event.preventDefault(); highlight(target?.firstElementChild || null); }
      if (event.key === "Enter") capture(event);
    };
    highlight(document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body);
    if (!target) highlight(document.body);
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", capture, true);
    document.addEventListener("keydown", key, true);
    cleanupMode = () => { outline.remove(); document.removeEventListener("mousemove", move, true); document.removeEventListener("click", capture, true); document.removeEventListener("keydown", key, true); };
  }

  function toggleInspector() {
    const wasActive = inspectActive; stopMode(); panel?.remove(); if (wasActive) return;
    inspectActive = true;
    const tooltip = document.createElement("div"); tooltip.setAttribute("data-frameforge-ignore", "true");
    tooltip.style.cssText = "position:fixed;pointer-events:none;white-space:pre-line;padding:12px;background:#202820;color:white;border:1px solid #657066;border-radius:8px;z-index:2147483647;font:12px/1.5 system-ui;max-width:300px;";
    document.documentElement.appendChild(tooltip);
    let pending = 0; let target: Element | null = null;
    const move = (event: MouseEvent) => {
      target = event.target as Element;
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (!target || target.closest("[data-frameforge-ignore]")) return;
        const cs = window.getComputedStyle(target), r = target.getBoundingClientRect();
        const fg = parseColor(cs.color), bg = parseColor(cs.backgroundColor);
        const contrast = checkWCAGCompliance(fg, bg, parseFloat(cs.fontSize), parseFloat(cs.fontWeight), cs.backgroundImage !== "none");
        tooltip.textContent = `${target.tagName.toLowerCase()} · ${Math.round(r.width)} × ${Math.round(r.height)}\n${cs.fontFamily.split(",")[0]} · ${cs.fontSize} / ${cs.fontWeight}\n${rgbaToHex(fg)} · Contrast ${contrast.contrastRatioFormatted}${contrast.uncertain ? "" : contrast.aaPass ? " · AA pass" : " · AA fail"}\nEsc to close`;
        tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 310, r.left))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - 150, r.bottom + 8))}px`;
      });
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") stopMode(); };
    document.addEventListener("mousemove", move, true); document.addEventListener("keydown", key, true);
    cleanupMode = () => { cancelAnimationFrame(pending); tooltip.remove(); document.removeEventListener("mousemove", move, true); document.removeEventListener("keydown", key, true); };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.type === "PING") respond({ status: "PONG" });
    if (msg.type === "CAPTURE_COPIED") { if (!activeCapture && msg.id === lastCaptureId) { panel?.remove(); panel = null; } respond({ status: "ok" }); }
    if (msg.type === "START_ELEMENT_PICKER") { if (activeCapture) { respond({ status: "error", error: "A capture is running." }); } else { startPicker(); respond({ status: "picker_started" }); } }
    if (msg.type === "TOGGLE_INSPECT_MODE") { if (!activeCapture) toggleInspector(); respond({ status: "inspect_toggled", active: inspectActive }); }
    if (msg.type === "CANCEL_CAPTURE") { activeCapture?.abort(); respond({ status: "ok" }); }
    if (msg.type === "EXECUTE_CAPTURE" || msg.type === "CAPTURE_EMBEDDED_FRAME") {
      performCapture(document.body, msg.payload || {}, msg.type === "CAPTURE_EMBEDDED_FRAME").then(result => respond({ status: "ok", ...result }), err => respond({ status: "error", error: err.message }));
      return true;
    }
  });
}
