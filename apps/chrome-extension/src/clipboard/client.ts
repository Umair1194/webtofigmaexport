import type { SceneGraphDocument } from '@frameforge/scene-graph';
import type { NativeClipboardResult } from './native.js';
/** Keep the font/geometry encoder out of the content script injected into every page. */
export async function copyCaptureInPage(document: SceneGraphDocument): Promise<Omit<NativeClipboardResult,'html'>> {
  const result=await chrome.runtime.sendMessage({type:'COPY_CAPTURE_IN_PAGE',document});
  if(result?.status!=='ok')throw new Error(result?.error||'Could not copy. Open the extension and try Copy to Figma.');
  return result.result;
}
