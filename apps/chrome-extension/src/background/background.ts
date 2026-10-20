chrome.runtime.onInstalled.addListener(() => {
  console.log("FrameForge Chrome Extension installed.");
  try {
    chrome.contextMenus.create({
      id: "frameforge-capture-element",
      title: "FrameForge: Select & Capture Element",
      contexts: ["all"],
    });
    chrome.contextMenus.create({
      id: "frameforge-capture-viewport",
      title: "FrameForge: Capture Current Viewport",
      contexts: ["all"],
    });
    chrome.contextMenus.create({
      id: "frameforge-toggle-inspect",
      title: "FrameForge: Toggle In-Page Inspector",
      contexts: ["all"],
    });
  } catch (err) {
    // context menu already created
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "frameforge-capture-element") {
    chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
  } else if (info.menuItemId === "frameforge-capture-viewport") {
    chrome.tabs.sendMessage(tab.id, {
      type: "EXECUTE_CAPTURE",
      payload: { captureMode: "VIEWPORT" },
    });
  } else if (info.menuItemId === "frameforge-toggle-inspect") {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_INSPECT_MODE" });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "capture-viewport") {
    chrome.tabs.sendMessage(tab.id, {
      type: "EXECUTE_CAPTURE",
      payload: { captureMode: "VIEWPORT" },
    });
  } else if (command === "select-element") {
    chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
  } else if (command === "toggle-inspect") {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_INSPECT_MODE" });
  }
});
