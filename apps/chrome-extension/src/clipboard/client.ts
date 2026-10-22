import type { SceneGraphDocument } from '@frameforge/scene-graph';
import type { NativeClipboardResult } from './native.js';
/** Keep the font/geometry encoder out of the content script injected into every page. */
export async function copyCaptureInPage(document: SceneGraphDocument,signal?:AbortSignal): Promise<Omit<NativeClipboardResult,'html'>> {
  if(signal?.aborted)throw new Error('Export cancelled. Your capture is still saved.');
  const requestId=crypto.randomUUID();
  const cancel=async()=>{try{await chrome.runtime.sendMessage({type:'CANCEL_COPY_IN_PAGE',requestId});}catch{/* Capture remains saved if the context was invalidated. */}};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    const pending=chrome.runtime.sendMessage({type:'COPY_CAPTURE_IN_PAGE',document,requestId});
    if(signal?.aborted)void cancel();
    // Wait for the page job to settle; never report cancellation while it might still commit.
    const result=await pending;
    if(result?.status!=='ok')throw new Error(result?.error||'Could not copy. Open the extension and try Copy to Figma.');
    return result.result;
  }finally{signal?.removeEventListener('abort',cancel);}
}
