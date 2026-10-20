const nativeCopy=vi.hoisted(()=>vi.fn(async()=>[]));
vi.mock("../src/clipboard/client.js",()=>({copyCaptureInPage:nativeCopy}));
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
const fetchImage = vi.hoisted(() => vi.fn());
vi.mock("@frameforge/asset-pipeline", () => ({fetchImageAsDataUrl:fetchImage}));
vi.mock("@frameforge/dom-capture", () => ({capturePageAsync:capture}));
let win: Window, listener: any, stored: any;
beforeEach(async () => {
  vi.resetModules(); nativeCopy.mockReset().mockResolvedValue({warnings:[],stats:{layers:1,text:0,autoLayout:0}}); stored = null; capture.mockReset(); fetchImage.mockReset();
  win = new Window({width:800,height:600});
  vi.stubGlobal("navigator",win.navigator);
  vi.stubGlobal("window",win);vi.stubGlobal("document",win.document);vi.stubGlobal("MouseEvent",win.MouseEvent);
  vi.stubGlobal("requestAnimationFrame",win.requestAnimationFrame.bind(win));vi.stubGlobal("cancelAnimationFrame",win.cancelAnimationFrame.bind(win));
  vi.stubGlobal("chrome", {runtime:{sendMessage:vi.fn(async(message:any)=>{if(message.type==='SAVE_CAPTURE'){await chrome.storage.local.set({frameforge_last_capture:message.document});return {status:'ok'};}if(message.type==='CLEAR_SAVED_CAPTURE'){stored=null;return {status:'ok',cleared:true};}return {status:'ok'};}),onMessage:{addListener:(fn:any)=>{listener=fn;}}},storage:{local:{set:vi.fn(async (value:any)=>{stored=value;})}}});
  capture.mockResolvedValue({id:"capture-test",root:{type:"FRAME",children:[]},diagnostics:{totalNodesCaptured:2,warnings:[],durationMs:0}});
  await import("../src/content/content.ts");
});
async function settle() { for(let i=0;i<45;i++) await Promise.resolve(); }
describe("Extension interaction regressions", () => {
  it("captures the clicked element even without a preceding hover and persists the result", async () => {
    const selected=win.document.createElement("section");selected.style.outline="3px solid red";const originalOutline=selected.style.outline;win.document.body.append(selected);
    listener({type:"START_ELEMENT_PICKER"},null,vi.fn());
    selected.dispatchEvent(new win.MouseEvent("click",{bubbles:true})); await settle();
    expect(capture).toHaveBeenCalledWith(selected,expect.objectContaining({captureMode:"SELECTED_ELEMENT"}));
    expect(chrome.storage.local.set).toHaveBeenCalled();expect(stored).toBeNull();expect(selected.style.outline).toBe(originalOutline);
    expect(win.document.getElementById("frameforge-panel")).toBeNull();
  });
  it("Escape cancels selection and detaches click interception", async () => {
    const selected=win.document.createElement("div");win.document.body.append(selected);
    listener({type:"START_ELEMENT_PICKER"},null,vi.fn());win.document.dispatchEvent(new win.KeyboardEvent("keydown",{key:"Escape"}));
    selected.dispatchEvent(new win.MouseEvent("click",{bubbles:true}));await settle();expect(capture).not.toHaveBeenCalled();
  });
  it("repeated inspector toggles remove their event listeners", () => {
    const add=vi.spyOn(win.document,"addEventListener"),remove=vi.spyOn(win.document,"removeEventListener");
    for(let i=0;i<6;i++) listener({type:"TOGGLE_INSPECT_MODE"},null,vi.fn());
    expect(add.mock.calls.filter(c=>c[0]==="mousemove")).toHaveLength(3);expect(remove.mock.calls.filter(c=>c[0]==="mousemove")).toHaveLength(3);
  });
  it("reports storage failures instead of acknowledging a completed capture", async () => {
    (chrome.storage.local.set as any).mockRejectedValue(new Error("Storage quota exceeded"));
    const respond=vi.fn();listener({type:"EXECUTE_CAPTURE"},null,respond);await settle();
    expect(respond).toHaveBeenCalledWith({status:"error",error:"Storage quota exceeded"});
  });
  it("deduplicates repeated image downloads and bounds concurrent requests", async () => {
    let inflight=0, peak=0;
    fetchImage.mockImplementation(async()=>{inflight++;peak=Math.max(peak,inflight);await Promise.resolve();inflight--;return {dataUrl:"data:image/png;base64,AQID"};});
    capture.mockResolvedValue({root:{type:"FRAME",children:Array.from({length:12},(_,i)=>({type:"IMAGE",name:"Asset",srcUrl:"https://example.com/"+(i%6)+".png"}))},diagnostics:{totalNodesCaptured:13,warnings:[],durationMs:0}});
    const respond=vi.fn();listener({type:"EXECUTE_CAPTURE"},null,respond);for(let i=0;i<30;i++)await Promise.resolve();
    expect(fetchImage).toHaveBeenCalledTimes(6);expect(peak).toBeLessThanOrEqual(4);expect(respond).toHaveBeenCalledWith(expect.objectContaining({status:"ok"}));
  });

  it("automatically copies and removes its notice after a successful capture", async () => {
    const write=vi.fn(async()=>{});Object.defineProperty(win.navigator,"clipboard",{value:{writeText:write},configurable:true});
    const respond=vi.fn();listener({type:"EXECUTE_CAPTURE"},null,respond);for(let i=0;i<30;i++)await Promise.resolve();
    expect(nativeCopy).toHaveBeenCalledOnce();expect(win.document.getElementById("frameforge-panel")).toBeNull();
    expect(chrome.storage.local.set).toHaveBeenCalled();expect(stored).toBeNull();
  });
  it("does not store or copy captures belonging to an embedded frame", async () => {
    const write=vi.fn(async()=>{});Object.defineProperty(win.navigator,"clipboard",{value:{writeText:write},configurable:true});
    const respond=vi.fn();listener({type:"CAPTURE_EMBEDDED_FRAME",payload:{autoCopy:false}},null,respond);for(let i=0;i<30;i++)await Promise.resolve();
    expect(stored).toBeNull();expect(nativeCopy).not.toHaveBeenCalled();expect(respond).toHaveBeenCalledWith(expect.objectContaining({status:"ok"}));
  });

});
it('preserves a saved capture and reports copied=false when page clipboard access fails',async()=>{
  nativeCopy.mockRejectedValue(new Error('Clipboard blocked'));
  const respond=vi.fn();listener({type:'EXECUTE_CAPTURE'},null,respond);await settle();
  expect(stored.frameforge_last_capture.id).toBe('capture-test');expect(respond).toHaveBeenCalledWith(expect.objectContaining({status:'ok',copied:false}));expect(win.document.getElementById('frameforge-panel')!.textContent).toContain('Clipboard blocked');
});
it('keeps copy success distinct from a failed saved-capture cleanup',async()=>{
  const original=(chrome.runtime.sendMessage as any).getMockImplementation();
  (chrome.runtime.sendMessage as any).mockImplementation(async(message:any)=>message.type==='CLEAR_SAVED_CAPTURE'?{status:'error',error:'Storage unavailable'}:original(message));
  const respond=vi.fn();listener({type:'EXECUTE_CAPTURE'},null,respond);await settle();
  expect(respond).toHaveBeenCalledWith(expect.objectContaining({status:'ok',copied:true}));expect(stored).not.toBeNull();expect(win.document.getElementById('frameforge-panel')!.textContent).toContain('could not be cleared');
});
