import {afterEach,expect,it,vi} from 'vitest';
const copy=vi.hoisted(()=>vi.fn());vi.mock('../src/clipboard/native.js',()=>({copyNativeCapture:copy}));
async function setup(){vi.resetModules();copy.mockReset();let dispatch:any;vi.stubGlobal('window',{});vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:(fn:any)=>dispatch=fn}}});await import('../src/clipboard/page-copy.js');return (message:any)=>new Promise<any>(resolve=>dispatch(message,{},resolve));}
afterEach(()=>vi.unstubAllGlobals());
it('cancels only the active export request and rejects duplicate jobs',async()=>{
 const send=await setup();let signal:AbortSignal;
 copy.mockImplementation((_doc:any,options:any)=>{signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Export cancelled'))));});
 const pending=send({type:'EXECUTE_NATIVE_COPY',requestId:'first',document:{}});
 expect((await send({type:'EXECUTE_NATIVE_COPY',requestId:'second',document:{}})).error).toContain('already running');
 await send({type:'CANCEL_NATIVE_COPY',requestId:'wrong'});expect(signal!.aborted).toBe(false);
 await send({type:'CANCEL_NATIVE_COPY',requestId:'first'});expect((await pending).error).toContain('cancelled');
 expect(copy).toHaveBeenCalledOnce();
});
it('ignores late cancellation once clipboard commit has begun',async()=>{
 const send=await setup();let signal:AbortSignal;let finish!:(result:any)=>void;
 copy.mockImplementation((_doc:any,options:any)=>{signal=options.signal;options.onClipboardWrite();return new Promise(resolve=>{finish=resolve;});});
 const pending=send({type:'EXECUTE_NATIVE_COPY',requestId:'first',document:{}});
 await send({type:'CANCEL_NATIVE_COPY',requestId:'first'});expect(signal!.aborted).toBe(false);
 finish({stats:{layers:1},warnings:[]});expect((await pending).status).toBe('ok');
});
it('handles cancellation without an active job and rejects missing request IDs',async()=>{
 const send=await setup();expect((await send({type:'CANCEL_NATIVE_COPY'})).status).toBe('ok');
 expect((await send({type:'EXECUTE_NATIVE_COPY',document:{}})).status).toBe('error');expect(copy).not.toHaveBeenCalled();
});
