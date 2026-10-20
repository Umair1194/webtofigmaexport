import { fetchImageAsDataUrl } from '@frameforge/asset-pipeline';

/** Fetch images with extension host permissions, without forwarding page cookies or headers. */
export function installAssetBroker() {
  const pending = new Map<string, AbortController>();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['FETCH_CAPTURE_IMAGE', 'CANCEL_CAPTURE_IMAGE'].includes(message?.type)) return;
    if (typeof sender.tab?.id !== 'number' || typeof sender.frameId !== 'number' || typeof message.requestId !== 'string' || !/^asset-[\w-]{8,100}$/.test(message.requestId)) {
      respond({error:'Image requests must originate from a captured page.'}); return;
    }
    const key = `${sender.tab.id}:${sender.frameId}:${message.requestId}`;
    if (message.type === 'CANCEL_CAPTURE_IMAGE') { pending.get(key)?.abort(); respond({status:'ok'}); return; }
    let url: URL;
    try { url = new URL(message.url); } catch { respond({error:'Invalid image URL.'}); return; }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) { respond({error:'Unsupported image URL.'}); return; }
    if (pending.size >= 8 || pending.has(key)) { respond({error:'Image download queue is full.'}); return; }
    const controller = new AbortController(); pending.set(key, controller);
    void fetchImageAsDataUrl(url.href, {signal:controller.signal, timeoutMs:8000})
      .then(respond, () => respond({error:'Image download failed.'}))
      .finally(() => pending.delete(key));
    return true;
  });
}
