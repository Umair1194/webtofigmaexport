import { beforeEach, describe, expect, it, vi } from "vitest";

const bounds = { x: 0, y: 0, width: 200, height: 100 };
const text = () => ({ id: "text", name: "Body", type: "TEXT", bounds: { x: 8, y: 10, width: 180, height: 40 }, visible: true, opacity: 1, characters: "A paragraph that wraps", style: { fontFamily: "Inter", fontSize: 16, fontWeight: 400 }, fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }] });
const image = () => ({ id: "img", name: "Photo", type: "IMAGE", bounds, visible: false, opacity: 0.4, objectFit: "CONTAIN", dataUrl: "data:image/png;base64,AQID" });
function doc(children: any[] = [text()]) { return { schemaVersion: "1.0.0", title: "Test", root: { id: "root", name: "Root", type: "FRAME", bounds, visible: true, opacity: 1, fills: [], children } }; }
let figmaMock: any, nodes: any[], messages: any[];
beforeEach(async () => {
  vi.resetModules(); nodes = []; messages = [];
  function create(type: string) {
    const n: any = { type, children: [], width: 100, height: 100, x: 0, y: 0, opacity: 1, visible: true, removed: false,
      setRangeFontName:vi.fn(),setRangeFontSize:vi.fn(),setRangeFills:vi.fn(),setRangeTextDecoration:vi.fn(),setRangeLineHeight:vi.fn(),setRangeLetterSpacing:vi.fn(),
      resize(w: number, h: number) { this.width = w; this.height = h; }, resizeWithoutConstraints(w: number, h: number) { this.resize(w,h); },
      appendChild(child: any) { this.children.push(child); child.parent = this; }, remove() { this.removed = true; for (const c of this.children) c.remove(); },
    }; nodes.push(n); return n;
  }
  figmaMock = {
    showUI: vi.fn(), ui: { postMessage: (m: any) => messages.push(m), onmessage: null },
    createFrame: () => create("FRAME"), createText: () => create("TEXT"), createRectangle: () => create("RECTANGLE"), createLine: () => create("LINE"),
    createNodeFromSvg: vi.fn(() => create("VECTOR")), createImage: vi.fn(() => ({ hash: "image-hash" })), base64Decode: vi.fn(() => new Uint8Array([1,2,3])), loadFontAsync: vi.fn(async () => {}),
    currentPage: { appendChild: vi.fn(), selection: [] }, viewport: { center: { x: 500, y: 400 }, scrollAndZoomIntoView: vi.fn() },
  };
  vi.stubGlobal("figma", figmaMock); vi.stubGlobal("__html__", "");
  await import("../src/code.ts");
});
describe("Figma import regressions", () => {
  it("imports regular editable text at its captured size and selects a centered root", async () => {
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc() });
    const output = nodes.find(n => n.type === "TEXT");
    expect(output.fontName).toEqual({ family: "Inter", style: "Regular" });
    expect([output.width, output.height, output.textAutoResize]).toEqual([180, 40, "NONE"]);
    expect(figmaMock.currentPage.selection[0].x).toBe(400);
    expect(messages.at(-1).type).toBe("IMPORT_SUCCESS");
  });
  it("decodes and caches images using the Figma API and preserves image base properties", async () => {
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc([image(), { ...image(), id: "img2" }]) });
    expect(figmaMock.base64Decode).toHaveBeenCalledTimes(1); expect(figmaMock.createImage).toHaveBeenCalledTimes(1);
    const output = nodes.filter(n => n.type === "FRAME")[1];
    expect(output.opacity).toBe(0.4); expect(output.visible).toBe(false); expect(output.fills[0].scaleMode).toBe("FIT");
  });
  it("rejects malformed nested styles without creating canvas nodes", async () => {
    const bad = text(); (bad.style.fontSize as any) = "huge";
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc([bad]) });
    expect(nodes).toHaveLength(0); expect(messages.at(-1).type).toBe("IMPORT_ERROR");
  });
  it("rolls back every created node when font loading fails", async () => {
    figmaMock.loadFontAsync.mockRejectedValue(new Error("font unavailable"));
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc() });
    expect(nodes.length).toBeGreaterThan(0); expect(nodes.every(n => n.removed)).toBe(true); expect(figmaMock.currentPage.selection).toHaveLength(0);
  });
  it("cancels an in-flight import and prevents concurrent creation", async () => {
    let release!: () => void; figmaMock.loadFontAsync.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const running = figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc() });
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc() }); expect(nodes).toHaveLength(2);
    await figmaMock.ui.onmessage({ type: "CANCEL_IMPORT" }); release(); await running;
    expect(messages.at(-1)).toMatchObject({ type: "IMPORT_ERROR", error: "Import cancelled." }); expect(nodes.every(n => n.removed)).toBe(true);
  });
  it("renders canvas fallback images and LINE nodes rather than silently dropping them", async () => {
    await figmaMock.ui.onmessage({ type: "IMPORT_SCENE_GRAPH", payload: doc([
      { id:"canvas", name:"Chart", type:"UNSUPPORTED", reason:"CANVAS_ELEMENT", description:"Canvas", fallbackImageUrl:image().dataUrl, bounds, opacity:1, visible:true },
      { id:"line", name:"Divider", type:"LINE", bounds, opacity:1, visible:true, strokes:[] },
    ]) });
    expect(figmaMock.createImage).toHaveBeenCalledOnce(); expect(nodes.some(n => n.type === "LINE")).toBe(true); expect(messages.at(-1).type).toBe("IMPORT_SUCCESS");
  });
});

import { Window } from "happy-dom";
import { capturePage } from "@frameforge/dom-capture";
it("reconstructs a document produced by the actual capture engine", async () => {
  const win=new Window({width:800,height:600});
  vi.stubGlobal("window",win);vi.stubGlobal("document",win.document);vi.stubGlobal("Node",win.Node);
  win.document.body.innerHTML='<main style="padding:24px"><h1 style="font:400 32px Inter">Editable heading</h1><p>Body copy</p></main>';
  for(const el of [win.document.body,...win.document.querySelectorAll('main,h1,p')]) (el as any).getBoundingClientRect=()=>({left:0,top:0,width:400,height:200});
  const captured=capturePage(win.document.body as any,{captureMode:"VIEWPORT"});
  await figmaMock.ui.onmessage({type:"IMPORT_SCENE_GRAPH",payload:captured});
  expect(messages.at(-1).type).toBe("IMPORT_SUCCESS");
  expect(nodes.some(n=>n.type==="TEXT" && n.characters==="Editable heading")).toBe(true);
  expect(figmaMock.currentPage.selection[0].width).toBe(800);
});

it("times out a stalled font service and removes incomplete layers", async () => {
  vi.useFakeTimers();
  try {
    figmaMock.loadFontAsync.mockImplementation(()=>new Promise(()=>{}));
    const running=figmaMock.ui.onmessage({type:"IMPORT_SCENE_GRAPH",payload:doc(),requestId:"font-timeout"});
    await vi.advanceTimersByTimeAsync(15001);await running;
    expect(messages.at(-1)).toMatchObject({type:"IMPORT_ERROR",requestId:"font-timeout"});expect(messages.at(-1).error).toContain("timed out");expect(nodes.every(n=>n.removed)).toBe(true);
  } finally { vi.useRealTimers(); }
});
it("rejects an old full-page iframe placeholder before creating a misleading blank canvas",async()=>{
  await figmaMock.ui.onmessage({type:'IMPORT_SCENE_GRAPH',requestId:'old-capture',payload:doc([{id:'iframe',name:'Embedded preview',type:'UNSUPPORTED',reason:'CROSS_ORIGIN_IFRAME',description:'Iframe',bounds,visible:true,opacity:1}])});
  expect(nodes).toHaveLength(0);expect(messages.at(-1)).toMatchObject({type:'IMPORT_ERROR',requestId:'old-capture'});expect(messages.at(-1).error).toContain('capture again');
});

it('imports rich paragraph ranges into one editable text layer',async()=>{
 const source:any=text();source.runs=[{start:0,end:1,style:{fontFamily:'Inter',fontWeight:700,fontSize:16},fills:source.fills}];
 await figmaMock.ui.onmessage({type:'IMPORT_SCENE_GRAPH',payload:doc([source])});
 const outputs=nodes.filter(n=>n.type==='TEXT');expect(outputs).toHaveLength(1);expect(outputs[0].setRangeFontName).toHaveBeenCalledWith(0,1,{family:'Inter',style:'Bold'});expect(messages.at(-1).type).toBe('IMPORT_SUCCESS');
});
