chrome.runtime.onInstalled.addListener(() => {
  console.log("FrameForge Chrome Extension installed.");
  try {
    chrome.contextMenus.create({
      id: "frameforge-capture-element",
      title: "FrameForge: Select & Capture Element",
      contexts: ["all"],
    });
  } catch (err) {
    // context menu already created
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "frameforge-capture-element" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "START_ELEMENT_PICKER" });
  }
});
