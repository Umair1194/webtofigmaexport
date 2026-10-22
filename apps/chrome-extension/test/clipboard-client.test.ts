import {afterEach,expect,it,vi} from 'vitest';
import {copyCaptureInPage} from '../src/clipboard/client.js';
afterEach(()=>vi.unstubAllGlobals());
it('routes cancellation with the same request ID and waits for the page job to settle',async()=>{
 const controller=new AbortController();let finish!:(result:any)=>void;
 const send=vi.fn((msg:any)=>msg.type==='COPY_CAPTURE_IN_PAGE'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({status:'ok'}));
 vi.stubGlobal('chrome',{runtime:{sendMessage:send}});
 const pending=copyCaptureInPage({} as any,controller.signal);let settled=false;void pending.catch(()=>{settled=true;});
 controller.abort();await Promise.resolve();expect(settled).toBe(false);
 expect(send.mock.calls[1][0]).toEqual({type:'CANCEL_COPY_IN_PAGE',requestId:send.mock.calls[0][0].requestId});
 finish({status:'error',error:'Export cancelled'});await expect(pending).rejects.toThrow('cancelled');
});
it('reports actual clipboard success if cancellation arrived after commit',async()=>{
 const controller=new AbortController();let finish!:(result:any)=>void;
 vi.stubGlobal('chrome',{runtime:{sendMessage:(msg:any)=>msg.type==='COPY_CAPTURE_IN_PAGE'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({status:'ok'})}});
 const pending=copyCaptureInPage({} as any,controller.signal);controller.abort();finish({status:'ok',result:{stats:{layers:1},warnings:[]}});
 expect(await pending).toMatchObject({stats:{layers:1}});
});
