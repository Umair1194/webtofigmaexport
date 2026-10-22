import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturePage, capturePageAsync } from "../src/capture.js";
import { validateSceneGraph } from "@frameforge/scene-graph";
let win: Window;
function geometry(el: any, x: number, y: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left:x, top:y, x,y,width,height,right:x+width,bottom:y+height });
}
beforeEach(() => {
  win = new Window({ width:800, height:600 });
  vi.stubGlobal("window", win); vi.stubGlobal("document", win.document); vi.stubGlobal("Node", win.Node);
  win.document.title = "Capture test";
  geometry(win.document.body, 8, -200, 784, 1800);
  Object.defineProperty(win.document.body, "scrollHeight", {value:2000});
  Object.defineProperty(win, "scrollY", {value:208});
});
function child(tag = "div") { const el=win.document.createElement(tag); geometry(el,20,-100,200,50); win.document.body.append(el); return el; }
describe("DOM capture integration", () => {
  it('captures a long loaded page beyond the old capture limit',()=>{
    geometry(win.document.body,0,0,800,60000);Object.defineProperty(win.document.documentElement,'scrollHeight',{value:60000});
    const fragment=win.document.createDocumentFragment();
    for(let i=0;i<3000;i++){const p=win.document.createElement('p');if(i===2999)p.textContent='Final section after Product promotion';geometry(p,0,i*20,700,20);fragment.append(p);}win.document.body.append(fragment);
    const result=capturePage(win.document.body as any,{captureMode:'FULL_PAGE'});
    expect(result.diagnostics.totalNodesCaptured).toBeGreaterThan(2500);
    expect(result.diagnostics.warnings.join(' ')).not.toContain('maximum node capture limit');
    expect(JSON.stringify(result.root)).toContain('Final section after Product promotion');
    expect(validateSceneGraph(result).valid).toBe(true);
  });
  it('expands the main scroll pane and its ancestors only in full-page mode',()=>{
    geometry(win.document.body,0,0,800,600);
    const pane=child();geometry(pane,0,60,800,540);pane.style.cssText='overflow-y:auto;height:540px';
    Object.defineProperties(pane,{clientHeight:{value:540},scrollHeight:{value:8000},scrollTop:{value:1000}});
    const tail=win.document.createElement('div');geometry(tail,0,7000,800,60);pane.append(tail);
    const full:any=capturePage(win.document.body as any,{captureMode:'FULL_PAGE'});
    const expanded=full.root.children[0].children[0];
    expect(expanded.bounds.height).toBe(8000);expect(expanded.children[0].bounds.y).toBe(7940);
    expect(full.root.bounds.height).toBeGreaterThanOrEqual(8060);
    const viewport:any=capturePage(win.document.body as any,{captureMode:'VIEWPORT'});
    expect(viewport.root.children[0].children[0].bounds.height).toBe(540);
    expect(viewport.root.bounds.height).toBe(600);
  });
  it('retains sticky stacking priority and clips scrollable panes',()=>{
    const panel=child();panel.style.cssText='overflow-y:auto';
    const sticky=win.document.createElement('header');sticky.style.cssText='position:sticky;top:0;z-index:30';geometry(sticky,20,0,200,30);panel.append(sticky);
    const output:any=capturePage(panel as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0];
    expect(output.clipsContent).toBe(true);
    expect(output.children[0]).toMatchObject({layoutPositioning:'ABSOLUTE',zIndex:30});
    const normalized:any=validateSceneGraph(capturePage(panel as any,{captureMode:'SELECTED_ELEMENT'})).document;
    expect(normalized.root.children[0].children[0].zIndex).toBe(30);
  });
  it('keeps nowrap labels width-hugging while ordinary paragraphs remain height-resizing',()=>{
    const badge=child('span');badge.style.cssText='display:inline-flex;white-space:nowrap';badge.textContent='Editorial accent';
    const output:any=capturePage(badge as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0];
    expect(output.children[0].textAutoResize).toBe('WIDTH_AND_HEIGHT');
    const paragraph=child('p');paragraph.textContent='A normal paragraph that may wrap.';
    const wrapped:any=capturePage(paragraph as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0];
    expect(wrapped.children[0].textAutoResize).toBe('HEIGHT');
  });
  it("normalizes viewport and full-page root bounds at nonzero scroll", () => {
    child();
    const viewport=capturePage(win.document.body as any,{captureMode:"VIEWPORT"});
    expect(viewport.root.bounds).toEqual({x:0,y:0,width:800,height:600}); expect(viewport.root.clipsContent).toBe(true);
    const full=capturePage(win.document.body as any,{captureMode:"FULL_PAGE"});
    expect(full.root.bounds.height).toBe(2000); expect(full.root.children[0].bounds.y).toBe(8);
    expect(validateSceneGraph(full).valid).toBe(true);
  });
  it("sizes selected non-frame images to their measured bounds", () => {
    const image=child("img"); image.setAttribute("src","https://example.com/a.png");
    const capture=capturePage(image as any,{captureMode:"SELECTED_ELEMENT"});
    expect(capture.root.bounds).toEqual({x:0,y:0,width:200,height:50}); expect(capture.root.children[0].bounds.x).toBe(0);
  });
  it("preserves opacity zero and enforces a total generated-node budget", () => {
    const invisible=child(); invisible.style.opacity="0";
    const captured=capturePage(win.document.body as any); expect(captured.root.children[0].type).toBe("FRAME");
    expect((captured.root.children[0] as any).children[0].opacity).toBe(0);
    for(let i=0;i<30;i++) child("input").setAttribute("placeholder","Value");
    const limited=capturePage(win.document.body as any,{maxNodes:10});
    expect(limited.diagnostics.totalNodesCaptured).toBeLessThanOrEqual(10); expect(limited.diagnostics.warnings.join()).toContain("partial");
  });
  it("cancels async traversal before emitting a document", async () => {
    const controller=new AbortController(); controller.abort();
    await expect(capturePageAsync(win.document.body as any,{signal:controller.signal})).rejects.toThrow("cancelled");
  });
  it("retains inline text spaces and shadow-root content", () => {
    const el=child(); el.append("Hello ",win.document.createElement("span")," world");
    el.children[0].textContent="bold"; geometry(el.children[0],60,0,40,20);
    const shadow=child(); const root=shadow.attachShadow({mode:"open"}); const inside=win.document.createElement("p");inside.textContent="Shadow content";geometry(inside,20,0,180,30);root.appendChild(inside);
    const result=capturePage(win.document.body as any);
    const texts:string[]=[]; const stack:any[]=[result.root];while(stack.length){ const n=stack.pop();if(n.type==="TEXT")texts.push(n.characters);if(n.children)stack.push(...n.children); }
    expect(texts).toContain("Hello "); expect(texts).toContain(" world"); expect(texts).toContain("Shadow content");
  });
});
it('retains positioned decorations separately from normal-flow nested content',()=>{
  const card=child();card.style.position='relative';card.style.backgroundImage='url(https://example.com/cover.png)';
  const badge=win.document.createElement('span');badge.style.position='absolute';geometry(badge,150,0,20,20);card.append(badge);
  const output=capturePage(card as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0] as any;
  expect(output.children.find((n:any)=>n.name==='Background Image').layoutPositioning).toBe('ABSOLUTE');expect(output.children.find((n:any)=>n.sourceTag==='SPAN'||n.name==='span').layoutPositioning).toBe('ABSOLUTE');
});

it('gives display:contents wrappers virtual bounds without moving their descendants',()=>{
 const wrapper=child();wrapper.id='virtual';wrapper.style.display='contents';geometry(wrapper,0,0,0,0);
 for(const y of [20,60]){const box=win.document.createElement('div');box.style.backgroundColor='red';geometry(box,10,y,100,30);wrapper.append(box);}
 const captured=capturePage(win.document.body as any,{captureMode:'VIEWPORT'});let virtual:any;
 const walk=(n:any)=>{if(n.name.includes('virtual'))virtual=n;for(const c of n.children||[])walk(c);};walk(captured.root);
 expect(virtual.bounds.width).toBe(100);expect(virtual.bounds.height).toBe(70);expect(virtual.children.map((c:any)=>[c.bounds.x,c.bounds.y])).toEqual([[0,0],[0,40]]);
});
it('preserves fractional coordinates through deeply nested wrappers',()=>{
 const parent=child();geometry(parent,20.25,30.25,200.5,100.5);
 const nested=win.document.createElement('div');geometry(nested,20.75,30.75,100.25,40.25);parent.append(nested);
 const output=capturePage(parent as any,{captureMode:'SELECTED_ELEMENT'});
 const frame:any=output.root.children[0];expect(frame.bounds.width).toBe(200.5);expect(frame.children[0].bounds).toEqual({x:.5,y:.5,width:100.25,height:40.25});
});

it('uses input padding and captures unchecked checkboxes without a text value',()=>{
 const input=child('input') as any;input.placeholder='you@example.com';input.style.cssText='font-size:16px;line-height:24px;padding-left:44px;padding-right:12px;border:1px solid #ccc;';geometry(input,20,20,300,48);
 const capture=capturePage(input,{captureMode:'SELECTED_ELEMENT',redactForms:true}),frame:any=capture.root.children[0];
 expect(frame.children[0].bounds).toEqual({x:45,y:12,width:242,height:24});
 input.type='checkbox';input.checked=false;input.value='on';
 const checkbox:any=capturePage(input,{captureMode:'SELECTED_ELEMENT',redactForms:true}).root.children[0];expect(checkbox.children).toEqual([]);
});
it('retains supported backdrop blur and avoids applying SVG root opacity twice',()=>{
 const panel=child();panel.style.setProperty('backdrop-filter','blur(12px)');
 const output:any=capturePage(panel as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0];expect(output.effects).toContainEqual({type:'BACKGROUND_BLUR',radius:12,visible:true});
 const svg=win.document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.opacity='.5';svg.innerHTML='<rect width="20" height="20"/>';geometry(svg,0,0,20,20);win.document.body.append(svg);
 const vector:any=capturePage(svg as any,{captureMode:'SELECTED_ELEMENT'}).root.children[0];expect(vector.opacity).toBe(.5);expect(vector.svgContent).toContain('opacity="1"');
});
