import {Window} from 'happy-dom';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const download=vi.hoisted(()=>vi.fn());
vi.mock('@frameforge/asset-pipeline',()=>({fetchImageAsDataUrl:download}));
import {loadCaptureImage} from '../src/content/images.js';
let win:Window;
beforeEach(()=>{win=new Window({url:'https://page.example'});vi.stubGlobal('document',win.document);download.mockReset();vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({dataUrl:'data:image/png;base64,AQID'}))}});});
afterEach(()=>vi.unstubAllGlobals());
it('recovers a page CORS failure through the private extension broker',async()=>{
 download.mockResolvedValue({error:'Failed to fetch'});
 expect((await loadCaptureImage('https://cdn.example/a.png',new AbortController().signal)).dataUrl).toContain('image/png');
 expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({type:'FETCH_CAPTURE_IMAGE',url:'https://cdn.example/a.png'}));
});
it('uses page session credentials only under same-origin fetch rules',async()=>{download.mockResolvedValue({dataUrl:'data:image/png;base64,AQID'});await loadCaptureImage('https://page.example/private.png',new AbortController().signal);expect(download).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({credentials:'same-origin'}));expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();});
it('converts browser raster formats into portable PNG and releases decoding resources',async()=>{
 download.mockResolvedValue({dataUrl:'data:image/webp;base64,AQID'});const close=vi.fn();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1,2,3]))));vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:400,height:200,close})));
 vi.spyOn(win.HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);vi.spyOn(win.HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AQID');
 expect((await loadCaptureImage('https://cdn.example/a.webp',new AbortController().signal)).dataUrl).toContain('image/png');expect(close).toHaveBeenCalledOnce();
});
it('does not start a broker retry after cancellation',async()=>{download.mockResolvedValue({error:'Capture cancelled'});const controller=new AbortController();controller.abort();expect((await loadCaptureImage('https://cdn.example/a.png',controller.signal)).error).toContain('cancelled');expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();});
