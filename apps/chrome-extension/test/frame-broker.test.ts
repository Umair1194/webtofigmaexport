import { beforeEach, describe, expect, it, vi } from "vitest";
let dispatch:any,send:any;
const parent={tab:{id:7},frameId:0}, child={tab:{id:7},frameId:12};
const token='fframe-12345678-1234-1234-1234-123456789012';
beforeEach(async()=>{vi.resetModules();send=vi.fn(async()=>({status:"ok",document:{root:{}}}));vi.stubGlobal('chrome',{scripting:{executeScript:vi.fn(async()=>[])},runtime:{onMessage:{addListener:(fn:any)=>{dispatch=fn;}}},tabs:{sendMessage:send}});const {installFrameBroker}=await import('../src/background/frame-broker.js');installFrameBroker();});
async function settle(){for(let i=0;i<15;i++)await Promise.resolve();}
describe('Embedded-frame broker',()=>{
  it('passes full-page mode and a larger bounded node budget to the preview',async()=>{
    dispatch({type:'REGISTER_CAPTURE_FRAME',token},child,vi.fn());
    dispatch({type:'CAPTURE_CHILD_FRAME',token,depth:1,captureMode:'FULL_PAGE',maxNodes:11950},parent,vi.fn());await settle();
    expect(send).toHaveBeenCalledWith(7,{type:'CAPTURE_EMBEDDED_FRAME',payload:{captureMode:'FULL_PAGE',maxNodes:11950,frameDepth:1,autoCopy:false}},{frameId:12});
  });
  it('routes capture to the identified child and returns content only via extension messaging',async()=>{
    const response=vi.fn();expect(dispatch({type:'CAPTURE_CHILD_FRAME',token,depth:1,maxNodes:100},parent,response)).toBe(true);
    dispatch({type:'REGISTER_CAPTURE_FRAME',token},child,vi.fn());await settle();
    expect(send).toHaveBeenCalledWith(7,expect.objectContaining({type:'CAPTURE_EMBEDDED_FRAME'}),{frameId:12});expect(response).toHaveBeenCalledWith(expect.objectContaining({status:'ok'}));
  });
  it('handles registration arriving before the capture request',async()=>{
    dispatch({type:'REGISTER_CAPTURE_FRAME',token},child,vi.fn());const response=vi.fn();dispatch({type:'CAPTURE_CHILD_FRAME',token,depth:1},parent,response);await settle();expect(response).toHaveBeenCalledWith(expect.objectContaining({status:'ok'}));
  });
  it('does not accept a frame identity from another tab',async()=>{
    vi.useFakeTimers();const response=vi.fn();dispatch({type:'CAPTURE_CHILD_FRAME',token,depth:1},parent,response);dispatch({type:'REGISTER_CAPTURE_FRAME',token},{tab:{id:8},frameId:12},vi.fn());await vi.advanceTimersByTimeAsync(2001);expect(send).not.toHaveBeenCalled();expect(response).toHaveBeenCalledWith(expect.objectContaining({status:'error'}));vi.useRealTimers();
  });
  it('cancels a waiting frame request without starting capture',async()=>{
    const response=vi.fn();dispatch({type:'CAPTURE_CHILD_FRAME',token,depth:1},parent,response);dispatch({type:'CANCEL_CHILD_FRAME',token},parent,vi.fn());await settle();expect(send).not.toHaveBeenCalled();expect(response).toHaveBeenCalledWith({status:'error',error:'Capture cancelled.'});
  });
});

it('prepares permitted child frames before token identification',async()=>{
  const response=vi.fn();expect(dispatch({type:'PREPARE_CAPTURE_FRAMES'},parent,response)).toBe(true);await settle();
  expect(chrome.scripting.executeScript).toHaveBeenCalledWith({target:{tabId:7,allFrames:true},files:['content.js']});expect(response).toHaveBeenCalledWith({status:'ok'});
});
it('reports child-frame injection denial to the capture instead of hiding the cause',async()=>{
  (chrome.scripting.executeScript as any).mockRejectedValue(new Error('Host access denied'));
  const response=vi.fn();dispatch({type:'PREPARE_CAPTURE_FRAMES'},parent,response);await settle();expect(response).toHaveBeenCalledWith({status:'error',error:'Host access denied'});
});
