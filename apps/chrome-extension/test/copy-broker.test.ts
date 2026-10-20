import { beforeEach, expect, it, vi } from 'vitest';
import { installCopyBroker } from '../src/background/copy-broker.js';
let dispatch:any;
const capture={id:'test',schemaVersion:'1.0.0',root:{type:'FRAME',bounds:{x:0,y:0,width:100,height:100},children:[],fills:[]}};
beforeEach(()=>{vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>dispatch=fn}},scripting:{executeScript:vi.fn(async()=>[])},tabs:{sendMessage:vi.fn(async()=>({status:'ok',result:{warnings:[],stats:{layers:1,text:0,autoLayout:0}}}))}});installCopyBroker();});
const request=(document:any=capture,sender:any={tab:{id:4},frameId:0})=>new Promise<any>(resolve=>dispatch({type:'COPY_CAPTURE_IN_PAGE',document},sender,resolve));
it('loads the native encoder only when a page requests a copy and targets that frame',async()=>{expect((await request()).status).toBe('ok');expect(chrome.scripting.executeScript).toHaveBeenCalledWith({target:{tabId:4,frameIds:[0]},files:['clipboard.js']});expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(4,expect.objectContaining({type:'EXECUTE_NATIVE_COPY'}),{frameId:0});});
it('rejects invalid data and requests without a page before loading the encoder',async()=>{expect((await request({})).status).toBe('error');expect((await request(capture,{})).status).toBe('error');expect(chrome.scripting.executeScript).not.toHaveBeenCalled();});
it('returns injection failures for popup recovery without pretending the copy succeeded',async()=>{(chrome.scripting.executeScript as any).mockRejectedValue(new Error('Page navigated'));expect(await request()).toEqual({status:'error',error:'Page navigated'});});
