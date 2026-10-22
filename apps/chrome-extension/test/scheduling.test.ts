import {afterEach,expect,it,vi} from 'vitest';
import {exportScheduler} from '../src/clipboard/scheduling.js';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('services timer turns as well as prioritized scheduler continuations',async()=>{
 let time=0;vi.spyOn(performance,'now').mockImplementation(()=>time);
 const yieldTask=vi.fn(async()=>{});vi.stubGlobal('scheduler',{yield:yieldTask});
 const timer=vi.spyOn(globalThis,'setTimeout');const schedule=exportScheduler();
 for(let i=0;i<4;i++){time+=9;await schedule.checkpoint();}
 expect(yieldTask).toHaveBeenCalledTimes(3);expect(timer).toHaveBeenCalledTimes(1);
});
it('checks cancellation again after a scheduled continuation',async()=>{
 const controller=new AbortController();const schedule=exportScheduler(controller.signal);
 const pending=schedule.checkpoint(true)!;controller.abort();await expect(pending).rejects.toThrow('Export cancelled');
});
