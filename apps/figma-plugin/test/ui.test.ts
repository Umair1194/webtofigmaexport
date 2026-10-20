import fs from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
const html=fs.readFileSync(new URL("../src/ui.html",import.meta.url),"utf8");
function setup() {
  const win=new Window({settings:{enableJavaScriptEvaluation:true}});
  win.document.write(html.replace(/<script>[\s\S]*?<\/script>/,""));
  win.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return win;
}
describe("Importer UI",()=>{
  it("reviews captures as literal text and prevents duplicate import clicks",()=>{
    const win=setup(); const input=win.document.getElementById("json-input") as any;
    input.value=JSON.stringify({title:'<img src=x onerror=alert(1)>',root:{type:"FRAME",bounds:{width:200,height:100}},diagnostics:{warnings:['<b>warning</b>']}});
    (win.document.getElementById("btn-review") as any).click();
    expect(win.document.getElementById("preview-title")!.textContent).toContain("<img");expect(win.document.querySelector("#preview-title img")).toBeNull();
    expect(win.document.querySelector("#preview-warnings b")).toBeNull();
    (win.document.getElementById("btn-import") as any).click();
    expect((win.document.getElementById("btn-import") as any).disabled).toBe(true);expect(win.document.getElementById("btn-cancel")!.hidden).toBe(false);
  });
  it("rejects invalid JSON without keeping a stale preview",()=>{
    const win=setup();const input=win.document.getElementById("json-input") as any;input.value="broken";(win.document.getElementById("btn-review") as any).click();
    expect(win.document.getElementById("preview")!.hidden).toBe(true);expect(win.document.getElementById("status-box")!.className).toContain("error");
  });
  it("handles Figma sandbox replies with a null source using the import request ID",()=>{
    const win=setup();const post=vi.spyOn(win,'postMessage');
    (win.document.getElementById('json-input') as any).value=JSON.stringify({root:{type:'FRAME',bounds:{width:200,height:100}}});
    (win.document.getElementById('btn-review') as any).click();(win.document.getElementById('btn-import') as any).click();
    const requestId=(post.mock.calls[0][0] as any).pluginMessage.requestId;
    win.dispatchEvent(new win.MessageEvent('message',{source:null,data:{pluginMessage:{type:'IMPORT_SUCCESS',requestId,stats:{totalNodes:3,textNodes:1,autoLayoutFrames:0,durationMs:20,warnings:[]}}}}));
    expect(win.document.getElementById('status-box')!.textContent).toContain('Imported 3 layers');expect((win.document.getElementById('btn-import') as any).disabled).toBe(false);
  });
  it("focuses a visible paste field when automatic clipboard reading is blocked",async()=>{
    const win=setup();Object.defineProperty(win.navigator,'clipboard',{value:{readText:vi.fn().mockRejectedValue(new Error('NotAllowedError'))},configurable:true});
    (win.document.getElementById('btn-paste-clipboard') as any).click();for(let i=0;i<5;i++)await Promise.resolve();
    expect(win.document.activeElement?.id).toBe('json-input');expect(win.document.getElementById('status-box')!.textContent).toContain('Press ⌘V');
    const event=new win.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=>JSON.stringify({root:{type:'FRAME',bounds:{width:200,height:100}}})}});
    win.document.getElementById('json-input')!.dispatchEvent(event);expect(win.document.getElementById('preview')!.hidden).toBe(false);
  });

});
it('explains that a full-page iframe placeholder requires a fresh capture',()=>{
  const win=setup();(win.document.getElementById('json-input') as any).value=JSON.stringify({root:{type:'FRAME',bounds:{width:1800,height:1010},children:[{type:'UNSUPPORTED',reason:'CROSS_ORIGIN_IFRAME',bounds:{width:1800,height:1010}}]}});
  (win.document.getElementById('btn-review') as any).click();expect(win.document.getElementById('preview')!.hidden).toBe(true);expect(win.document.getElementById('status-box')!.textContent).toContain('capture again');
});

it('invalidates reviewed data when the paste field is edited',()=>{
  const win=setup(), input=win.document.getElementById('json-input') as any;
  input.value=JSON.stringify({root:{type:'FRAME',bounds:{width:200,height:100}}});
  (win.document.getElementById('btn-review') as any).click();
  input.value='broken';input.dispatchEvent(new win.Event('input'));
  expect(win.document.getElementById('preview')!.hidden).toBe(true);
  (win.document.getElementById('btn-import') as any).click();
  expect(win.document.getElementById('btn-cancel')!.hidden).toBe(true);
});
it('allows captures whose dominant iframe is hidden by an ancestor',()=>{
  const win=setup();(win.document.getElementById('json-input') as any).value=JSON.stringify({root:{type:'FRAME',bounds:{width:200,height:100},children:[{type:'FRAME',visible:false,children:[{type:'UNSUPPORTED',reason:'CROSS_ORIGIN_IFRAME',bounds:{width:200,height:100}}]}]}});
  (win.document.getElementById('btn-review') as any).click();
  expect(win.document.getElementById('preview')!.hidden).toBe(false);
});
