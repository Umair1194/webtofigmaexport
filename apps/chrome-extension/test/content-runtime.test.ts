import { afterEach, expect, it, vi } from 'vitest';
import { registerFrameIdentityListener } from '../src/content/frames.js';
import { notifyRuntime } from '../src/content/runtime.js';
afterEach(()=>vi.unstubAllGlobals());
const token='fframe-12345678-1234-1234-1234-123456789012';
function frame(send: ReturnType<typeof vi.fn>){
  const parent={},listeners=new Set<(event:any)=>Promise<void>>();
  const win={parent,top:{},addEventListener:vi.fn((_type:string,fn:any)=>listeners.add(fn)),removeEventListener:vi.fn((_type:string,fn:any)=>listeners.delete(fn))};
  vi.stubGlobal('window',win);vi.stubGlobal('chrome',{runtime:{sendMessage:send}});
  const dispose=registerFrameIdentityListener();
  const event={source:parent,data:{type:'FRAMEFORGE_IDENTIFY_FRAME',token}};
  return {win,listeners,event,dispose,dispatch:async(e=event)=>{for(const listener of [...listeners])await listener(e);}};
}
it.each(['throw','reject'])('retires an invalidated frame listener on a synchronous/asynchronous failure: %s',async(mode)=>{
  const send=vi.fn(()=>{const error=new Error('Extension context invalidated.');if(mode==='throw')throw error;return Promise.reject(error);});
  const ui=frame(send);await expect(ui.dispatch()).resolves.toBeUndefined();
  expect(ui.listeners.size).toBe(0);await ui.dispatch();expect(send).toHaveBeenCalledOnce();
});
it('retains a live listener after a transient registration error, with explicit cleanup',async()=>{
  const send=vi.fn().mockRejectedValueOnce(new Error('Service unavailable')).mockResolvedValue({status:'ok'});
  const ui=frame(send);await ui.dispatch();await ui.dispatch();expect(send).toHaveBeenCalledTimes(2);
  ui.dispose();expect(ui.listeners.size).toBe(0);
});
it('accepts identity tokens only from the direct parent and ignores top-level messages',async()=>{
  const send=vi.fn().mockResolvedValue({status:'ok'});const ui=frame(send);
  await ui.dispatch({...ui.event,source:{}});await ui.dispatch({...ui.event,data:{...ui.event.data,token:'invalid'}});
  (ui.win as any).top=ui.win;await ui.dispatch();expect(send).not.toHaveBeenCalled();
});
it.each(['throw','reject'])('best-effort notifications tolerate invalidated contexts: %s',async(mode)=>{
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(()=>{const error=new Error('Extension context invalidated.');if(mode==='throw')throw error;return Promise.reject(error);})}});
  await expect(notifyRuntime({type:'CANCEL_CAPTURE_IMAGE'})).resolves.toBeUndefined();
});
