import { fetchImageAsDataUrl } from "@frameforge/asset-pipeline";
import { capturePage, CaptureOptions } from "@frameforge/dom-capture";
import { FrameNode, ImageNode, SceneGraphDocument, SceneNode } from "@frameforge/scene-graph";
import {
  checkWCAGCompliance,
  parseColor,
  rgbaToHex,
  rgbaToRgbString,
} from "@frameforge/style-normalizer";

if ((window as any).__FRAMEFORGE_INITIALIZED__) {
  console.log("FrameForge content script already active.");
} else {
  (window as any).__FRAMEFORGE_INITIALIZED__ = true;

let isPickerActive = false;
let isInspectActive = false;
let highlightedElement: Element | null = null;
let pickerOverlay: HTMLDivElement | null = null;
let inspectTooltip: HTMLDivElement | null = null;

// Clean up any existing overlays
function removeOverlays() {
  if (pickerOverlay) {
    pickerOverlay.remove();
    pickerOverlay = null;
  }
  if (inspectTooltip) {
    inspectTooltip.remove();
    inspectTooltip = null;
  }
  if (highlightedElement) {
    (highlightedElement as HTMLElement).style.outline = "";
    highlightedElement = null;
  }
}

// In-line image assets for scene graph nodes
async function inlineImageAssets(rootNode: SceneNode) {
  const promises: Promise<void>[] = [];

  function walk(node: SceneNode) {
    if (node.type === "IMAGE") {
      const imgNode = node as ImageNode;
      if (imgNode.srcUrl && !imgNode.dataUrl) {
        promises.push(
          fetchImageAsDataUrl(imgNode.srcUrl).then((res) => {
            if (res.dataUrl) {
              imgNode.dataUrl = res.dataUrl;
            }
          })
        );
      }
    }
    if (node.type === "FRAME" && "children" in node && Array.isArray((node as FrameNode).children)) {
      for (const child of (node as FrameNode).children) {
        walk(child);
      }
    }
  }

  walk(rootNode);
  await Promise.allSettled(promises);
}

// Perform capture
async function performCapture(
  targetElement: Element = document.body,
  options: CaptureOptions = {}
): Promise<SceneGraphDocument> {
  removeOverlays();
  const doc = capturePage(targetElement, {
    ...options,
    inferAutoLayout: true,
    redactForms: true,
  });

  // Inline images so Figma plugin receives ready-to-render data URLs
  await inlineImageAssets(doc.root);

  return doc;
}

// Element Picker UI
function startElementPicker() {
  if (isPickerActive) return;
  isPickerActive = true;
  removeOverlays();

  pickerOverlay = document.createElement("div");
  pickerOverlay.id = "frameforge-overlay";
  pickerOverlay.setAttribute("data-frameforge-ignore", "true");
  pickerOverlay.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1b4b;
    color: #ffffff;
    padding: 10px 20px;
    border-radius: 9999px;
    border: 1px solid #6366f1;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  pickerOverlay.innerHTML = `
    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#818cf8;animation:pulse 1.5s infinite;"></span>
    <span>Click any element to capture. Press <strong>Esc</strong> to cancel.</span>
  `;
  document.body.appendChild(pickerOverlay);

  const onMouseMove = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target || target.id === "frameforge-overlay" || target.closest("#frameforge-overlay")) {
      return;
    }
    if (highlightedElement && highlightedElement !== target) {
      (highlightedElement as HTMLElement).style.outline = "";
    }
    highlightedElement = target;
    (highlightedElement as HTMLElement).style.outline = "2px solid #6366f1";
    (highlightedElement as HTMLElement).style.outlineOffset = "-2px";
  };

  const onClick = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stopElementPicker();

    if (highlightedElement) {
      const capturedDoc = await performCapture(highlightedElement, {
        captureMode: "SELECTED_ELEMENT",
      });

      chrome.storage.local.set({ frameforge_last_capture: capturedDoc }, () => {
        chrome.runtime.sendMessage({
          type: "CAPTURE_SUCCESS",
          payload: capturedDoc,
        });
      });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      stopElementPicker();
    }
  };

  function stopElementPicker() {
    isPickerActive = false;
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    removeOverlays();
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

// In-Page Design Inspector Mode
function toggleInspectMode() {
  isInspectActive = !isInspectActive;
  removeOverlays();

  if (!isInspectActive) return;

  inspectTooltip = document.createElement("div");
  inspectTooltip.id = "frameforge-inspect-tooltip";
  inspectTooltip.setAttribute("data-frameforge-ignore", "true");
  inspectTooltip.style.cssText = `
    position: fixed;
    display: none;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    font-size: 11px;
    line-height: 1.4;
    z-index: 2147483647;
    pointer-events: none;
    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
    max-width: 280px;
  `;
  document.body.appendChild(inspectTooltip);

  const onInspectMove = (e: MouseEvent) => {
    if (!isInspectActive || !inspectTooltip) return;
    const target = e.target as HTMLElement;
    if (!target || target.id?.startsWith("frameforge-")) return;

    if (highlightedElement && highlightedElement !== target) {
      (highlightedElement as HTMLElement).style.outline = "";
    }
    highlightedElement = target;
    target.style.outline = "2px solid #818cf8";
    target.style.outlineOffset = "-1px";

    const computed = window.getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const fg = parseColor(computed.color);
    const bg = parseColor(computed.backgroundColor);
    const wcag = checkWCAGCompliance(fg, bg, parseFloat(computed.fontSize));

    inspectTooltip.style.display = "block";
    inspectTooltip.style.top = `${Math.min(window.innerHeight - 150, Math.max(10, rect.bottom + 8))}px`;
    inspectTooltip.style.left = `${Math.min(window.innerWidth - 290, Math.max(10, rect.left))}px`;

    inspectTooltip.innerHTML = `
      <div style="font-weight:600;color:#c7d2fe;margin-bottom:4px;">
        &lt;${target.tagName.toLowerCase()}${target.className ? `.${target.className.split(' ')[0]}` : ''}&gt;
      </div>
      <div>📐 Dimensions: <strong>${Math.round(rect.width)} × ${Math.round(rect.height)}px</strong></div>
      <div>🔤 Font: <strong>${computed.fontFamily.split(',')[0]} ${computed.fontSize}</strong> (${computed.fontWeight})</div>
      <div>🎨 Color: <span style="display:inline-block;width:10px;height:10px;background:${computed.color};border-radius:2px;vertical-align:middle;"></span> ${rgbaToHex(fg)}</div>
      <div>🛡️ Contrast: <strong style="color:${wcag.aaPass ? '#34d399' : '#f87171'}">${wcag.contrastRatioFormatted}</strong> (AA ${wcag.aaPass ? 'Pass' : 'Fail'})</div>
    `;
  };

  const onInspectKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      isInspectActive = false;
      document.removeEventListener("mousemove", onInspectMove, true);
      document.removeEventListener("keydown", onInspectKey, true);
      removeOverlays();
    }
  };

  document.addEventListener("mousemove", onInspectMove, true);
  document.addEventListener("keydown", onInspectKey, true);
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ status: "PONG" });
    return;
  } else if (msg.type === "START_ELEMENT_PICKER") {
    startElementPicker();
    sendResponse({ status: "picker_started" });
  } else if (msg.type === "TOGGLE_INSPECT_MODE") {
    toggleInspectMode();
    sendResponse({ status: "inspect_toggled", active: isInspectActive });
  } else if (msg.type === "EXECUTE_CAPTURE") {
    const options: CaptureOptions = msg.payload || { captureMode: "VIEWPORT" };
    performCapture(document.body, options)
      .then((doc) => {
        chrome.storage.local.set({ frameforge_last_capture: doc });
        sendResponse({ status: "ok", document: doc });
      })
      .catch((err) => {
        sendResponse({ status: "error", error: err?.message || String(err) });
      });
    return true; // Keep message channel open for async response
  }
});
} // end initialization block
