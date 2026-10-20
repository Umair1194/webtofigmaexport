export interface ImageFetchOptions { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number; credentials?: RequestCredentials }
export async function fetchImageAsDataUrl(url: string, options: ImageFetchOptions = {}): Promise<{ dataUrl?: string; error?: string }> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  if (!url) return { error: "Empty URL" };
  if (url.startsWith("data:")) {
    if (!/^data:image\//i.test(url)) return { error: "Asset is not an image" };
    return url.length > maxBytes * 1.4 ? { error: "Image exceeds size limit" } : { dataUrl: url };
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, { credentials: options.credentials ?? "omit", mode: "cors", signal: controller.signal });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    let type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const sniff=!type||type==="application/octet-stream";
    if (!type.startsWith("image/")&&!sniff) return { error: "Asset is not an image" };
    if (Number(res.headers.get("content-length")) > maxBytes) throw new Error("Image exceeds size limit");
    if (!res.body) throw new Error("Image response has no body");
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Image exceeds size limit"); }
      chunks.push(part.value);
    }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(sniff){
      const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.subarray(start,end));
      type=bytes.length>=8&&bytes[0]===137&&ascii(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':ascii(0,3)==='GIF'?'image/gif':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':ascii(4,8)==='ftyp'&&['avif','avis'].includes(ascii(8,12))?'image/avif':'';
      if(!type)return {error:'Asset is not a recognized image'};
    }
    let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const dataUrl="data:"+type+";base64,"+btoa(binary);
    return { dataUrl };
  } catch (err) {
    controller.abort();
    return { error: options.signal?.aborted ? "Capture cancelled" : err instanceof Error ? err.message : "Image fetch failed" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
