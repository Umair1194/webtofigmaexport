import { validateSceneGraph } from '@frameforge/scene-graph';

const key = 'frameforge_last_capture';

/** Serialize our writes and conditional clears across popup, picker, and shortcuts. */
export function installCaptureStore() {
  let queue = Promise.resolve();
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!['SAVE_CAPTURE','CLEAR_SAVED_CAPTURE'].includes(message?.type)) return;
    const operation = queue.then(async () => {
      if (message.type === 'SAVE_CAPTURE') {
        if (new TextEncoder().encode(JSON.stringify(message.document)).byteLength > 8 * 1024 * 1024) throw new Error('Capture exceeds 8 MB. Choose a smaller area.');
        const result = validateSceneGraph(message.document);
        if (!result.valid || !result.document) throw new Error('Could not save an invalid capture.');
        await chrome.storage.local.set({ [key]: result.document });
        respond({ status: 'ok' });
      } else {
        if (typeof message.captureId !== 'string') throw new Error('Capture identity is missing.');
        const stored = await chrome.storage.local.get(key);
        const matches = stored[key]?.id === message.captureId;
        if (matches) await chrome.storage.local.remove(key);
        respond({ status: 'ok', cleared: matches });
      }
    });
    queue = operation.catch(error => { respond({ status: 'error', error: error instanceof Error ? error.message : 'Capture storage is unavailable.' }); });
    return true;
  });
}
