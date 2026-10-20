interface Identity { tabId: number; frameId: number }
interface Job { owner: Identity; resolve: (identity: Identity) => void; reject: (error: Error) => void }
const waiting = new Map<string, Job>();
const early = new Map<string, Identity & { expires: number }>();
const running = new Map<string, { owner: Identity; child: Identity }>();

export function installFrameBroker() {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    const tabId = sender.tab?.id, frameId = sender.frameId;
    if (msg.type === "PREPARE_CAPTURE_FRAMES" && typeof tabId === "number") {
      chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content.js"] })
        .then(() => respond({ status: "ok" }), error => respond({ status: "error", error: error.message }));
      return true;
    }
    if (typeof tabId !== "number" || typeof frameId !== "number" || typeof msg.token !== "string") return;
    const token = msg.token;
    if (!/^fframe-[\w-]{20,80}$/.test(token)) return;
    if (msg.type === "REGISTER_CAPTURE_FRAME") {
      const job = waiting.get(token);
      if (job && job.owner.tabId === tabId && job.owner.frameId !== frameId) { waiting.delete(token); job.resolve({ tabId, frameId }); }
      else if (early.size < 64) early.set(token, { tabId, frameId, expires: Date.now() + 3000 });
      respond({ status: "ok" }); return;
    }
    if (msg.type === "CANCEL_CHILD_FRAME") {
      const pending = waiting.get(token);
      if (pending && pending.owner.tabId === tabId && pending.owner.frameId === frameId) { waiting.delete(token); pending.reject(new Error("Capture cancelled.")); }
      const job = running.get(token);
      if (job && job.owner.tabId === tabId && job.owner.frameId === frameId) void chrome.tabs.sendMessage(tabId, { type: "CANCEL_CAPTURE" }, { frameId: job.child.frameId }).catch(() => {});
      respond({ status: "ok" }); return;
    }
    if (msg.type !== "CAPTURE_CHILD_FRAME") return;
    if (waiting.size + running.size >= 64 || waiting.has(token) || running.has(token)) { respond({ status: "error", error: "Frame request limit reached" }); return; }
    for (const [key, identity] of early) if (identity.expires < Date.now()) early.delete(key);
    const owner = { tabId, frameId };
    const execute = async () => {
      let identityTimer: ReturnType<typeof setTimeout> | undefined;
      let captureTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const child = await new Promise<Identity>((resolve, reject) => {
          const identity = early.get(token); early.delete(token);
          if (identity && identity.expires >= Date.now() && identity.tabId === tabId && identity.frameId !== frameId) { resolve(identity); return; }
          waiting.set(token, { owner, resolve, reject });
          identityTimer = setTimeout(() => { waiting.delete(token); reject(new Error("No extension access to embedded preview. Reload this page after reloading the extension.")); }, 2000);
        });
        clearTimeout(identityTimer);
        running.set(token, { owner, child });
        const depth = Number.isInteger(msg.depth) ? msg.depth : 5;
        if (depth > 4 || depth < 1) throw new Error("Embedded frame depth limit reached");
        const maxNodes = Math.max(2, Math.min(2500, Number(msg.maxNodes) || 2500));
        const capture = chrome.tabs.sendMessage(tabId, { type: "CAPTURE_EMBEDDED_FRAME", payload: { captureMode: "VIEWPORT", maxNodes, frameDepth: depth, autoCopy: false } }, { frameId: child.frameId });
        const timeout = new Promise<never>((_, reject) => { captureTimer = setTimeout(() => { void chrome.tabs.sendMessage(tabId, { type: "CANCEL_CAPTURE" }, { frameId: child.frameId }).catch(() => {}); reject(new Error("Embedded preview capture timed out")); }, 20000); });
        respond(await Promise.race([capture, timeout]));
      } catch (error) { respond({ status: "error", error: error instanceof Error ? error.message : "Embedded preview unavailable" }); }
      finally { clearTimeout(identityTimer); clearTimeout(captureTimer); waiting.delete(token); running.delete(token); }
    };
    void execute(); return true;
  });
}
