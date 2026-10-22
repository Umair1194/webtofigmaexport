import { beforeEach, expect, it, vi } from 'vitest';
import { installCopyBroker } from '../src/background/copy-broker.js';
let dispatch:any;
const capture={id:'test',schemaVersion:'1.0.0',root:{type:'FRAME',bounds:{x:0,y:0,width:100,height:100},children:[],fills:[]}};
beforeEach(()=>{vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>dispatch=fn}},scripting:{executeScript:vi.fn(async()=>[])},tabs:{sendMessage:vi.fn(async()=>({status:'ok',result:{warnings:[],stats:{layers:1,text:0,autoLayout:0}}}))}});installCopyBroker();});
const request=(document:any=capture,sender:any={tab:{id:4},frameId:0})=>new Promise<any>(resolve=>dispatch({type:'COPY_CAPTURE_IN_PAGE',document,requestId:'copy-test'},sender,resolve));
it('loads the native encoder only when a page requests a copy and targets that frame',async()=>{expect((await request()).status).toBe('ok');expect(chrome.scripting.executeScript).toHaveBeenCalledWith({target:{tabId:4,frameIds:[0]},files:['clipboard.js']});expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(4,expect.objectContaining({type:'EXECUTE_NATIVE_COPY'}),{frameId:0});});
it('rejects invalid data and requests without a page before loading the encoder',async()=>{expect((await request({})).status).toBe('error');expect((await request(capture,{})).status).toBe('error');expect(chrome.scripting.executeScript).not.toHaveBeenCalled();});
it('returns injection failures for popup recovery without pretending the copy succeeded',async()=>{(chrome.scripting.executeScript as any).mockRejectedValue(new Error('Page navigated'));expect(await request()).toEqual({status:'error',error:'Page navigated'});});
it('cancels during encoder injection before dispatching a clipboard job',async()=>{
 let finish!:(value:any)=>void;(chrome.scripting.executeScript as any).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=request();dispatch({type:'CANCEL_COPY_IN_PAGE',requestId:'copy-test'},{tab:{id:4},frameId:0},()=>{});
 finish([]);expect((await pending).error).toContain('cancelled');expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
});
it('routes running cancellation only to the owning tab, frame and request',async()=>{
 let finish!:(value:any)=>void;(chrome.tabs.sendMessage as any).mockImplementation((_tab:any,msg:any)=>msg.type==='EXECUTE_NATIVE_COPY'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({status:'ok'}));
 const pending=request();for(let i=0;i<10;i++)await Promise.resolve();
 dispatch({type:'CANCEL_COPY_IN_PAGE',requestId:'copy-test'},{tab:{id:9},frameId:0},()=>{});
 dispatch({type:'CANCEL_COPY_IN_PAGE',requestId:'wrong'},{tab:{id:4},frameId:0},()=>{});
 expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
 dispatch({type:'CANCEL_COPY_IN_PAGE',requestId:'copy-test'},{tab:{id:4},frameId:0},()=>{});
 expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(4,{type:'CANCEL_NATIVE_COPY',requestId:'copy-test'},{frameId:0});
 finish({status:'error',error:'Export cancelled.'});await pending;
});
