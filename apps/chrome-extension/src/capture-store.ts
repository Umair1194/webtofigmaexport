import type { SceneGraphDocument } from '@frameforge/scene-graph';
async function request(message: Record<string,unknown>) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.status !== 'ok') throw new Error(result?.error || 'Capture storage is unavailable.');
  return result;
}
export async function saveCapture(document: SceneGraphDocument) { await request({ type:'SAVE_CAPTURE', document }); }
export async function clearSavedCapture(captureId: string): Promise<boolean> { return (await request({ type:'CLEAR_SAVED_CAPTURE', captureId })).cleared; }
