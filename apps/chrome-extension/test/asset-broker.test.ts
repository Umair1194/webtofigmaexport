import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const download=vi.hoisted(()=>vi.fn());
vi.mock('@frameforge/asset-pipeline',()=>({fetchImageAsDataUrl:download}));
import {installAssetBroker} from '../src/background/asset-broker.js';
let dispatch:any;
const sender={tab:{id:4},frameId:0};
const message={type:'FETCH_CAPTURE_IMAGE',requestId:'asset-12345678',url:'https://cdn.example/image.png'};
beforeEach(()=>{download.mockReset().mockResolvedValue({dataUrl:'data:image/png;base64,AQID'});vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>dispatch=fn}}});installAssetBroker();});
afterEach(()=>vi.unstubAllGlobals());
const request=(msg:any=message,owner:any=sender)=>new Promise<any>(resolve=>dispatch(msg,owner,resolve));
it('fetches a bounded image in the extension context without page credentials',async()=>{expect((await request()).dataUrl).toContain('data:image/png');expect(download).toHaveBeenCalledWith(message.url,expect.objectContaining({timeoutMs:8000,signal:expect.any(AbortSignal)}));});
it('rejects senderless, credential-bearing and non-HTTP requests',async()=>{for(const [msg,owner] of [[message,{}],[{...message,url:'file:///etc/passwd'},sender],[{...message,url:'https://user:pass@example.com/a'},sender]])expect((await request(msg,owner)).error).toBeTruthy();expect(download).not.toHaveBeenCalled();});
it('scopes cancellation to the originating tab and frame',async()=>{
  let signal:AbortSignal;download.mockImplementation((_url:string,opts:any)=>{signal=opts.signal;return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({error:'cancelled'})));});
  const pending=request();await request({type:'CANCEL_CAPTURE_IMAGE',requestId:message.requestId},{tab:{id:8},frameId:0});expect(signal!.aborted).toBe(false);
  await request({type:'CANCEL_CAPTURE_IMAGE',requestId:message.requestId});expect(signal!.aborted).toBe(true);expect((await pending).error).toBe('cancelled');
});
