const nativeCopy=vi.hoisted(()=>vi.fn());
vi.mock('../src/clipboard/native.js',()=>({copyNativeCapture:nativeCopy}));
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { afterEach, expect, it, vi } from 'vitest';
const exported={warnings:[],stats:{layers:12,text:4,autoLayout:6}};
const documentCapture=()=>({schemaVersion:'1.0.0',id:'capture-1',title:'Petopus · Account setup',url:'https://example.com',capturedAt:new Date().toISOString(),captureMode:'VIEWPORT',root:{id:'root',name:'Page',type:'FRAME',bounds:{x:0,y:0,width:800,height:600},children:[],fills:[],visible:true,opacity:1},diagnostics:{totalNodesCaptured:1,totalTextNodes:0,totalImages:0,totalVectors:0,totalUnsupported:0,warnings:[],durationMs:120}});
async function settle(){for(let i=0;i<55;i++)await Promise.resolve();}
async function setup({saved=null as any,injected=true,initialGet=undefined as any}={}){
  vi.resetModules();vi.useFakeTimers();nativeCopy.mockReset().mockResolvedValue(exported);
  const win=new Window();win.document.write(fs.readFileSync(new URL('../popup.html',import.meta.url),'utf8'));win.close=vi.fn();
  const state={saved,failCleanup:false};const listeners:any[]=[];
  const send=vi.fn(async(_id:number,message:any)=>{
    if(message.type==='PING')return injected?{status:'PONG'}:null;
    if(message.type==='EXECUTE_CAPTURE'){state.saved=documentCapture();return {status:'ok',document:state.saved};}
    return {status:'ok'};
  });
  const runtimeSend=vi.fn(async(message:any)=>{
    if(message.type==='CLEAR_SAVED_CAPTURE'){
      if(state.failCleanup)return {status:'error',error:'Storage unavailable'};
      const cleared=state.saved?.id===message.captureId;if(cleared)state.saved=null;return {status:'ok',cleared};
    }
    return {status:'ok'};
  });
  const query=vi.fn(async()=>[{id:10,url:'https://example.com',title:'Petopus'}]);
  const inject=vi.fn(async()=>{injected=true;return [];});
  vi.stubGlobal('window',win);vi.stubGlobal('document',win.document);vi.stubGlobal('navigator',win.navigator);
  vi.stubGlobal('chrome',{runtime:{getManifest:()=>({version:'1.3.0'}),sendMessage:runtimeSend,onMessage:{addListener:(fn:any)=>listeners.push(fn)}},scripting:{executeScript:inject},tabs:{query,sendMessage:send},storage:{local:{get:initialGet||vi.fn(async()=>({frameforge_last_capture:state.saved}))}}});
  await import('../src/popup/popup.ts');await settle();
  const click=(id:string)=>(win.document.getElementById(id) as any).click();
  return {win,state,send,runtimeSend,query,inject,listeners,click};
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it.each([true,false])('captures, copies, clears saved data and closes (already injected: %s)',async(injected)=>{
  const ui=await setup({injected});ui.click('btn-run-capture');await settle();
  expect(nativeCopy).toHaveBeenCalledWith(expect.objectContaining({id:'capture-1'}),expect.objectContaining({signal:expect.any(AbortSignal),onClipboardWrite:expect.any(Function)}));
  expect(ui.send).toHaveBeenCalledWith(10,expect.objectContaining({type:'EXECUTE_CAPTURE',payload:expect.objectContaining({captureMode:'VIEWPORT',autoCopy:false,requestId:expect.any(String)})}),{frameId:0});
  expect(ui.runtimeSend).toHaveBeenCalledWith({type:'CLEAR_SAVED_CAPTURE',captureId:'capture-1'});expect(ui.state.saved).toBeNull();
  expect(ui.win.document.getElementById('copy-success')!.hidden).toBe(false);
  expect(ui.win.document.getElementById('success-stats')!.textContent).toContain('6 Auto Layout');
  if(!injected)expect(ui.inject).toHaveBeenCalledWith({target:{tabId:10,allFrames:true},files:['content.js']});
  await vi.advanceTimersByTimeAsync(1100);expect(ui.win.close).toHaveBeenCalledOnce();
});
it('clears a previously saved capture only after the clipboard write succeeds',async()=>{
  const ui=await setup({saved:documentCapture()});let release!: (value:any)=>void;
  nativeCopy.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  ui.click('btn-copy-figma');ui.click('btn-copy-figma');await settle();
  expect(nativeCopy).toHaveBeenCalledTimes(1);expect(ui.runtimeSend).not.toHaveBeenCalled();expect(ui.state.saved).not.toBeNull();
  release(exported);await settle();expect(ui.state.saved).toBeNull();
});
it('keeps the saved capture and restores controls after a clipboard failure',async()=>{
  const ui=await setup({saved:documentCapture()});nativeCopy.mockRejectedValue(new Error('Clipboard access denied'));
  ui.click('btn-copy-figma');await settle();
  expect(ui.runtimeSend).not.toHaveBeenCalled();expect(ui.state.saved).not.toBeNull();expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('Clipboard access denied');
  expect((ui.win.document.getElementById('btn-copy-figma') as any).disabled).toBe(false);
});
it('reports copy success separately when saved-capture cleanup fails',async()=>{
  const ui=await setup({saved:documentCapture()});ui.state.failCleanup=true;ui.click('btn-copy-figma');await settle();
  expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('Copied to Figma');expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('could not be cleared');expect(ui.state.saved).not.toBeNull();expect(ui.win.close).not.toHaveBeenCalled();
});
it('preserves a newer capture saved while an older capture is copying',async()=>{
  const ui=await setup({saved:documentCapture()});nativeCopy.mockImplementation(async()=>{ui.state.saved={...documentCapture(),id:'newer-capture'};return exported;});
  ui.click('btn-copy-figma');await settle();expect(ui.state.saved.id).toBe('newer-capture');expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('newer capture');
});
it('does not resurrect stale startup data after successful copy and cleanup',async()=>{
  let release!:(value:any)=>void;const initialGet=vi.fn(()=>new Promise(resolve=>{release=resolve;}));
  const ui=await setup({initialGet});ui.click('btn-run-capture');await settle();release({frameforge_last_capture:documentCapture()});await settle();
  expect(ui.state.saved).toBeNull();expect(ui.win.document.getElementById('result-summary')!.classList.contains('active')).toBe(false);
});
it('recovers from tab-query errors without leaving capture controls disabled',async()=>{
  const ui=await setup();ui.query.mockRejectedValueOnce(new Error('Tab unavailable'));ui.click('btn-run-capture');await settle();expect((ui.win.document.getElementById('btn-run-capture') as any).disabled).toBe(false);expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('Tab unavailable');
});
it('keeps export notes readable after cleanup and leaves Done usable',async()=>{
  const ui=await setup({saved:documentCapture()});nativeCopy.mockResolvedValue({...exported,warnings:['Substituted a font.']});ui.click('btn-copy-figma');await settle();
  expect(ui.state.saved).toBeNull();expect(ui.win.document.getElementById('success-review')!.hidden).toBe(false);expect((ui.win.document.getElementById('btn-done') as any).disabled).toBe(false);
  await vi.advanceTimersByTimeAsync(1500);expect(ui.win.close).not.toHaveBeenCalled();ui.click('btn-done');expect(ui.win.close).toHaveBeenCalledOnce();
});
it('supports keyboard navigation between secondary detail tabs',async()=>{
  const ui=await setup({saved:documentCapture()});const tab=ui.win.document.getElementById('tab-colors')!;tab.dispatchEvent(new ui.win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));expect(ui.win.document.activeElement!.id).toBe('tab-typography');expect(ui.win.document.getElementById('pane-typography')!.classList.contains('active')).toBe(true);
});
it('offers cancellation while capture is pending and restores controls afterwards',async()=>{
  const ui=await setup();let finish!:(value:any)=>void;
  ui.send.mockImplementation(async(_id:any,message:any)=>{
    if(message.type==='PING')return {status:'PONG'};
    if(message.type==='EXECUTE_CAPTURE')return new Promise(resolve=>{finish=resolve;});
    if(message.type==='CANCEL_CAPTURE'){finish({status:'error',error:'Capture cancelled.'});return {status:'ok'};}
    return {status:'ok'};
  });
  ui.click('btn-run-capture');await settle();expect(ui.win.document.getElementById('btn-cancel-capture')!.hidden).toBe(false);
  ui.click('btn-cancel-capture');await settle();expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('cancelled');expect((ui.win.document.getElementById('btn-run-capture') as any).disabled).toBe(false);expect(nativeCopy).not.toHaveBeenCalled();
});
function incompleteCapture(){const doc=documentCapture();doc.root.children=[{id:'iframe',name:'Preview',type:'UNSUPPORTED',reason:'CROSS_ORIGIN_IFRAME',bounds:{...doc.root.bounds},visible:true,opacity:1}] as any;doc.diagnostics.warnings=['Embedded preview unavailable: Host access denied'];return doc;}
it('marks a saved dominant iframe capture incomplete and exposes its diagnostic without copying',async()=>{
  const ui=await setup({saved:incompleteCapture()});
  expect(ui.win.document.getElementById('result-status')!.textContent).toBe('Embedded design missing');
  expect((ui.win.document.getElementById('btn-copy-figma') as any).disabled).toBe(true);
  expect(ui.win.document.querySelector('#result-summary details')!.hasAttribute('open')).toBe(true);
  expect(ui.win.document.getElementById('capture-warnings')!.textContent).toContain('Host access denied');
  ui.click('btn-copy-figma');await settle();expect(nativeCopy).not.toHaveBeenCalled();expect(ui.state.saved).not.toBeNull();
  expect((ui.win.document.getElementById('btn-run-capture') as any).disabled).toBe(false);
});
it('does not auto-copy or delete a new capture missing the embedded design',async()=>{
  const ui=await setup();ui.send.mockImplementation(async(_id:any,message:any)=>{
    if(message.type==='PING')return {status:'PONG'};
    if(message.type==='EXECUTE_CAPTURE'){ui.state.saved=incompleteCapture();return {status:'ok',document:ui.state.saved};}
    return {status:'ok'};
  });ui.click('btn-run-capture');await settle();
  expect(nativeCopy).not.toHaveBeenCalled();expect(ui.state.saved).not.toBeNull();
  expect(ui.win.document.getElementById('result-status')!.textContent).toBe('Embedded design missing');
});
it('provides a direct retry for a saved incomplete capture and replaces it after a successful fresh copy',async()=>{
  const old=incompleteCapture();old.capturedAt='2026-10-21T17:14:05.000Z';
  const ui=await setup({saved:old});
  expect(ui.win.document.getElementById('btn-retry-capture')!.hidden).toBe(false);
  expect(ui.win.document.getElementById('btn-copy-figma')!.hidden).toBe(true);
  expect(ui.win.document.getElementById('capture-recorded')!.textContent).toContain('Saved ');
  expect(ui.win.document.getElementById('capture-recorded')!.textContent).toContain('21');
  ui.click('btn-retry-capture');await settle();
  expect(ui.send).toHaveBeenCalledWith(10,expect.objectContaining({type:'EXECUTE_CAPTURE'}),{frameId:0});
  expect(nativeCopy).toHaveBeenCalledOnce();expect(ui.state.saved).toBeNull();
  expect(ui.win.document.getElementById('copy-success')!.hidden).toBe(false);
});
it('cancels pending native preparation without deleting the saved capture and allows retry',async()=>{
 const ui=await setup({saved:documentCapture()});
 nativeCopy.mockImplementation((_doc:any,options:any)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('Export cancelled. Your capture is still saved.')))));
 ui.click('btn-copy-figma');await settle();expect(ui.win.document.getElementById('btn-cancel-capture')!.hidden).toBe(false);
 ui.click('btn-cancel-capture');await settle();
 expect(ui.state.saved).not.toBeNull();expect(ui.runtimeSend).not.toHaveBeenCalled();
 expect(ui.win.document.getElementById('notice-banner')!.textContent).toContain('Export cancelled');
 expect((ui.win.document.getElementById('btn-copy-figma') as any).disabled).toBe(false);
 nativeCopy.mockResolvedValue(exported);ui.click('btn-copy-figma');await settle();expect(ui.state.saved).toBeNull();
});
it('stops offering cancellation once the clipboard write has begun',async()=>{
 const ui=await setup({saved:documentCapture()});let finish!:(value:any)=>void;let signal:AbortSignal;
 nativeCopy.mockImplementation((_doc:any,options:any)=>{signal=options.signal;options.onClipboardWrite();return new Promise(resolve=>{finish=resolve;});});
 ui.click('btn-copy-figma');await settle();expect(ui.win.document.getElementById('btn-cancel-capture')!.hidden).toBe(true);
 ui.click('btn-cancel-capture');expect(signal!.aborted).toBe(false);finish(exported);await settle();expect(ui.state.saved).toBeNull();
});
