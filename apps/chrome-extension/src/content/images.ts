import { fetchImageAsDataUrl } from '@frameforge/asset-pipeline';
type ImageResult = {dataUrl?:string;error?:string};
const maxChars = Math.ceil(2 * 1024 * 1024 * 4 / 3) + 256;

function rasterize(image: CanvasImageSource, width:number, height:number): string | undefined {
  const scale = Math.min(1, 2048 / Math.max(width,height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
  const context = canvas.getContext('2d'); if(!context)return;
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const png = canvas.toDataURL('image/png');
  return png.startsWith('data:image/png') && png.length <= maxChars ? png : undefined;
}
async function normalizeRaster(result:ImageResult, signal:AbortSignal):Promise<ImageResult> {
  if(!result.dataUrl || /^data:image\/(?:png|jpeg|jpg|svg\+xml)[;,]/i.test(result.dataUrl))return result;
  // Figma recipients need a portable raster, rather than browser-only encodings such as AVIF.
  let bitmap:ImageBitmap|undefined;
  try {
    if(signal.aborted)return {error:'Capture cancelled'};
    const blob = await (await fetch(result.dataUrl,{signal})).blob();
    bitmap=await createImageBitmap(blob);
    if(signal.aborted)return {error:'Capture cancelled'};
    const dataUrl=rasterize(bitmap,bitmap.width,bitmap.height);
    return dataUrl?{dataUrl}:{error:'Converted image exceeds the image budget'};
  } catch {return {error:'Image format could not be decoded'};}
  finally {bitmap?.close();}
}
async function fetchThroughExtension(url:string,signal:AbortSignal):Promise<ImageResult> {
  if(signal.aborted)return {error:'Capture cancelled'};
  const requestId='asset-'+Array.from(crypto.getRandomValues(new Uint32Array(2)),n=>n.toString(16)).join('-');
  const cancel=()=>{void chrome.runtime.sendMessage({type:'CANCEL_CAPTURE_IMAGE',requestId}).catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    const result=await chrome.runtime.sendMessage({type:'FETCH_CAPTURE_IMAGE',requestId,url});
    return signal.aborted?{error:'Capture cancelled'}:result?.dataUrl?result:{error:result?.error||'Image fetch unavailable'};
  } catch {return {error:'Extension could not fetch the image'};}
  finally {signal.removeEventListener('abort',cancel);}
}
export async function loadCaptureImage(url:string,signal:AbortSignal):Promise<ImageResult> {
  // Same-origin requests may use the page's existing session; cross-origin requests omit credentials.
  let result=await fetchImageAsDataUrl(url,{signal,timeoutMs:3500,credentials:'same-origin'});
  if(!result.dataUrl && !signal.aborted && /^https?:/i.test(url))result=await fetchThroughExtension(url,signal);
  if(result.dataUrl)return normalizeRaster(result,signal);
  if(signal.aborted)return {error:'Capture cancelled'};
  // Already-loaded readable images can survive expiring URLs or a failed network retry.
  for(const image of Array.from(document.images))if((image.currentSrc||image.src)===url && image.complete && image.naturalWidth>0){
    try {const dataUrl=rasterize(image,image.naturalWidth,image.naturalHeight);if(dataUrl)return {dataUrl};}catch{/* A tainted canvas must remain inaccessible. */}
  }
  return result;
}
