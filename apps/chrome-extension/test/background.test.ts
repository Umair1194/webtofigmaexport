import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
it.each([true,false])('reports shortcut clipboard outcome truthfully (copied: %s)',async(copied)=>{
  vi.resetModules();let command:any;
  const action={setBadgeText:vi.fn(async()=>{}),setBadgeBackgroundColor:vi.fn(async()=>{}),setTitle:vi.fn(async()=>{})};
  vi.stubGlobal('chrome',{runtime:{onMessage:{addListener:vi.fn()},onInstalled:{addListener:vi.fn()}},tabs:{query:vi.fn(async()=>[{id:8}]),sendMessage:vi.fn(async(_id:any,message:any)=>message.type==='PING'?{status:'PONG'}:{status:'ok',copied})},scripting:{executeScript:vi.fn()},action,contextMenus:{onClicked:{addListener:vi.fn()}},commands:{onCommand:{addListener:(fn:any)=>command=fn}}});
  await import('../src/background/background.js');await command('capture-viewport');for(let i=0;i<25;i++)await Promise.resolve();
  expect(action.setTitle).toHaveBeenCalledWith({tabId:8,title:copied?'FrameForge: Copied — paste on the Figma canvas':'FrameForge: Capture saved — open FrameForge to copy'});
});
