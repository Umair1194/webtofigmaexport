import { installAssetBroker } from './asset-broker.js';
installAssetBroker();
import { installCopyBroker } from "./copy-broker.js";
installCopyBroker();
import { installCaptureStore } from "./capture-store.js";
installCaptureStore();
import { installFrameBroker } from "./frame-broker.js";
installFrameBroker();
async function runCaptureAction(tabId: number, type: string) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" }, { frameId: 0 }).catch(() => null);
    if (ping?.status !== "PONG") await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] });
    await chrome.action.setBadgeText({ tabId, text: "…" });
    const response = await chrome.tabs.sendMessage(tabId, { type, ...(type === "EXECUTE_CAPTURE" ? { payload: { captureMode: "VIEWPORT" } } : {}) }, { frameId: 0 });
    if (response?.status === "error") throw new Error(response.error);
    await chrome.action.setBadgeText({ tabId, text: type === "EXECUTE_CAPTURE" ? "✓" : "" });
    const title = type === 'EXECUTE_CAPTURE' ? response?.copied ? 'Copied — paste on the Figma canvas' : 'Capture saved — open FrameForge to copy' : type === 'TOGGLE_INSPECT_MODE' ? response?.active ? 'Inspector on — press Esc to close' : 'Inspector off' : 'Choose an element — press Esc to cancel';
    await chrome.action.setBadgeBackgroundColor({tabId,color:'#355d42'});
    await chrome.action.setTitle({ tabId, title: 'FrameForge: '+title });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b91c1c" });
    await chrome.action.setTitle({ tabId, title: error instanceof Error ? error.message : "FrameForge could not access this page. Open the extension for help." });
  }
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title] of [
      ["frameforge-capture-element", "FrameForge: Select & Capture Element"],
      ["frameforge-capture-viewport", "FrameForge: Capture Current Viewport"],
      ["frameforge-toggle-inspect", "FrameForge: Toggle In-Page Inspector"],
    ]) chrome.contextMenus.create({ id, title, contexts: ["all"] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const type = info.menuItemId === "frameforge-capture-element" ? "START_ELEMENT_PICKER" : info.menuItemId === "frameforge-capture-viewport" ? "EXECUTE_CAPTURE" : "TOGGLE_INSPECT_MODE";
  void runCaptureAction(tab.id, type);
});
chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const types: Record<string, string> = { "capture-viewport": "EXECUTE_CAPTURE", "select-element": "START_ELEMENT_PICKER", "toggle-inspect": "TOGGLE_INSPECT_MODE" };
  if (types[command]) void runCaptureAction(tab.id, types[command]);
});
