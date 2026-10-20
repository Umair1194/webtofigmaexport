import { SceneGraphDocument } from "@frameforge/scene-graph";
import {
  analyzeSceneGraph,
  generateDesignDoc,
  generateSkillDoc,
  sceneGraphToSvg,
} from "@frameforge/shared-protocol";

let currentDocument: SceneGraphDocument | null = null;

// DOM Elements
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabPanes = document.querySelectorAll<HTMLDivElement>(".tab-pane");
const noticeBanner = document.getElementById("notice-banner") as HTMLDivElement;
const btnRunCapture = document.getElementById("btn-run-capture") as HTMLButtonElement;
const btnCopyFigma = document.getElementById("btn-copy-figma") as HTMLButtonElement;
const btnDownloadJson = document.getElementById("btn-download-json") as HTMLButtonElement;
const btnCopySvg = document.getElementById("btn-copy-svg") as HTMLButtonElement;
const btnDownloadDesign = document.getElementById("btn-download-design") as HTMLButtonElement;
const btnDownloadSkill = document.getElementById("btn-download-skill") as HTMLButtonElement;
const btnToggleInspect = document.getElementById("btn-toggle-inspect") as HTMLButtonElement;

const resultSummary = document.getElementById("result-summary") as HTMLDivElement;
const statTotalNodes = document.getElementById("stat-total-nodes") as HTMLElement;
const statTextNodes = document.getElementById("stat-text-nodes") as HTMLElement;
const statFrames = document.getElementById("stat-frames") as HTMLElement;
const statDuration = document.getElementById("stat-duration") as HTMLElement;

const colorsList = document.getElementById("colors-list") as HTMLDivElement;
const typeList = document.getElementById("type-list") as HTMLDivElement;
const assetsList = document.getElementById("assets-list") as HTMLDivElement;
const a11yList = document.getElementById("a11y-list") as HTMLDivElement;

// Show notice helper
function showNotice(type: "success" | "error", message: string) {
  noticeBanner.className = `notice-banner active notice-${type}`;
  noticeBanner.textContent = message;
  setTimeout(() => {
    noticeBanner.classList.remove("active");
  }, 4000);
}

// Download file helper
function triggerDownload(content: string, filename: string, mimeType = "application/json") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Populate Design Intelligence tabs
function populateIntelligence(doc: SceneGraphDocument) {
  const analysis = analyzeSceneGraph(doc);

  // 1. Colors
  if (analysis.colors.length > 0) {
    colorsList.innerHTML = analysis.colors
      .slice(0, 30)
      .map(
        (c) => `
        <div class="color-item" data-hex="${c.hex}">
          <div class="color-info">
            <span class="color-swatch" style="background-color: ${c.hex};"></span>
            <strong>${c.hex}</strong>
            <span style="color: var(--text-muted); font-size: 10px;">(${c.nearestTailwind.name})</span>
          </div>
          <span style="color: var(--text-muted);">${c.count}×</span>
        </div>
      `
      )
      .join("");

    // Add click-to-copy on color items
    colorsList.querySelectorAll<HTMLDivElement>(".color-item").forEach((el) => {
      el.addEventListener("click", () => {
        const hex = el.getAttribute("data-hex");
        if (hex) {
          navigator.clipboard.writeText(hex);
          showNotice("success", `Copied color ${hex} to clipboard!`);
        }
      });
    });
  }

  // 2. Typography
  if (analysis.typography.length > 0) {
    typeList.innerHTML = analysis.typography
      .slice(0, 15)
      .map(
        (t) => `
        <div class="typo-item">
          <div style="font-weight: 600; color: white;">${t.fontFamily} (${t.weight})</div>
          <div style="color: var(--text-muted); font-size: 10px;">
            Size: ${t.fontSize}px ${t.lineHeight ? `• Line Height: ${t.lineHeight}` : ""} • ${t.count} elements
          </div>
          <div style="margin-top: 4px; font-style: italic; color: #cbd5e1;">"${t.sampleText}"</div>
        </div>
      `
      )
      .join("");
  }

  // 3. Assets
  if (analysis.assets.length > 0) {
    assetsList.innerHTML = analysis.assets
      .slice(0, 20)
      .map(
        (a) => `
        <div class="asset-item">
          <div>
            <strong>[${a.type}]</strong> ${a.name}
            <div style="color: var(--text-muted); font-size: 10px;">${a.dimensions.width}×${a.dimensions.height}px</div>
          </div>
        </div>
      `
      )
      .join("");
  }

  // 4. Accessibility
  if (analysis.accessibility.issues.length === 0) {
    a11yList.innerHTML = `
      <div style="color: var(--success); padding: 8px;">
        ✅ All evaluated text elements passed WCAG 2.1 AA contrast requirements!
      </div>
    `;
  } else {
    a11yList.innerHTML = analysis.accessibility.issues
      .slice(0, 10)
      .map(
        (iss) => `
        <div class="typo-item" style="border-left: 3px solid var(--error);">
          <div style="font-weight: 600; color: #f87171;">Contrast: ${iss.contrastResult.contrastRatioFormatted} (Fail AA)</div>
          <div style="font-size: 10px; color: var(--text-muted);">Text: "${iss.textSnippet}"</div>
        </div>
      `
      )
      .join("");
  }
}

// Display captured document stats
function displayCapturedDocument(doc: SceneGraphDocument) {
  currentDocument = doc;
  resultSummary.classList.add("active");
  statTotalNodes.textContent = String(doc.diagnostics.totalNodesCaptured);
  statTextNodes.textContent = String(doc.diagnostics.totalTextNodes);
  statFrames.textContent = String(doc.root.children ? doc.root.children.length : 0);
  statDuration.textContent = `${doc.diagnostics.durationMs}ms`;

  populateIntelligence(doc);
}

// Check if there was a recent capture stored
chrome.storage.local.get("frameforge_last_capture", (res) => {
  if (res.frameforge_last_capture) {
    displayCapturedDocument(res.frameforge_last_capture);
  }
});

// Tab navigation handler
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabPanes.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-tab");
    document.getElementById(`pane-${target}`)?.classList.add("active");
  });
});

// Mode radio option click highlight
document.querySelectorAll<HTMLLabelElement>(".mode-option").forEach((opt) => {
  opt.addEventListener("click", () => {
    document.querySelectorAll(".mode-option").forEach((o) => o.classList.remove("selected"));
    opt.classList.add("selected");
  });
});

// Capture Button Click
btnRunCapture.addEventListener("click", async () => {
  const selectedRadio = document.querySelector<HTMLInputElement>('input[name="capture-mode"]:checked');
  const mode = selectedRadio?.value || "VIEWPORT";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showNotice("error", "No active browser tab found.");
    return;
  }

  // Check for restricted URLs
  if (tab.url?.startsWith("chrome://") || tab.url?.includes("chromewebstore.google.com")) {
    showNotice("error", "Chrome forbids extensions on internal and Web Store pages.");
    return;
  }

  if (mode === "SELECTED_ELEMENT") {
    chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" }, () => {
      window.close(); // Close popup so user can pick on the page
    });
    return;
  }

  btnRunCapture.disabled = true;
  btnRunCapture.textContent = "Capturing DOM & Assets...";

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXECUTE_CAPTURE",
      payload: { captureMode: mode },
    });

    if (response?.status === "ok" && response.document) {
      displayCapturedDocument(response.document);
      showNotice("success", "Capture completed successfully!");
    } else {
      showNotice("error", response?.error || "Capture failed.");
    }
  } catch (err: any) {
    showNotice("error", `Could not connect to page: ${err.message}. Try reloading the page.`);
  } finally {
    btnRunCapture.disabled = false;
    btnRunCapture.textContent = "Capture Web Layers";
  }
});

// 1-Click Copy for Figma
btnCopyFigma.addEventListener("click", async () => {
  if (!currentDocument) return;
  const jsonStr = JSON.stringify(currentDocument, null, 2);
  await navigator.clipboard.writeText(jsonStr);
  showNotice("success", "Copied to clipboard! Run FrameForge in Figma and click 'Import'.");
});

// Download JSON
btnDownloadJson.addEventListener("click", () => {
  if (!currentDocument) return;
  const jsonStr = JSON.stringify(currentDocument, null, 2);
  triggerDownload(jsonStr, `frameforge-${Date.now()}.json`);
});

// Copy as SVG fallback
btnCopySvg.addEventListener("click", async () => {
  if (!currentDocument) return;
  const svg = sceneGraphToSvg(currentDocument);
  await navigator.clipboard.writeText(svg);
  showNotice("success", "Copied SVG fallback (paste directly in Figma as vectors)!");
});

// Download DESIGN.md
btnDownloadDesign.addEventListener("click", () => {
  if (!currentDocument) return;
  const md = generateDesignDoc(currentDocument);
  triggerDownload(md, "DESIGN.md", "text/markdown");
});

// Download SKILL.md
btnDownloadSkill.addEventListener("click", () => {
  if (!currentDocument) return;
  const skill = generateSkillDoc(currentDocument);
  triggerDownload(skill, "SKILL.md", "text/markdown");
});

// Toggle In-Page Inspector
btnToggleInspect.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_INSPECT_MODE" });
    window.close();
  }
});
