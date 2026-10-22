import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFrames, captureEmbeddedFrames } from "../src/content/frames.js";
const box={x:0,y:0,width:300,height:200};
function document(){return {schemaVersion:'1.0.0',root:{id:'root',name:'Root',type:'FRAME',bounds:box,fills:[],children:[]},diagnostics:{totalNodesCaptured:1,totalTextNodes:0,totalImages:0,totalVectors:0,totalUnsupported:0,durationMs:0,warnings:[]}} as any;}
let win:Window;
beforeEach(()=>{win=new Window();vi.stubGlobal('window',win);});
describe('Embedded content composition',()=>{
  it('replaces an iframe placeholder with editable child content without posting captured data to the page',async()=>{
    const main=document(),embedded=document();embedded.root.children=[{id:'text',name:'Text',type:'TEXT',bounds:box,characters:'Preview content',style:{fontFamily:'Inter',fontWeight:400,fontSize:16},fills:[]}];embedded.diagnostics.totalNodesCaptured=2;embedded.diagnostics.totalTextNodes=1;
    const frame:any={contentWindow:{postMessage:vi.fn()}};const key='fframe-12345678-1234-1234-1234-123456789012';
    main.root.children=[{id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1,attributes:{frameKey:key}}];main.diagnostics.totalUnsupported=1;
    vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({status:'ok',document:embedded}))}});
    await captureEmbeddedFrames(main,new Map([[key,frame]]),new AbortController().signal,0);
    expect(main.root.children[0].type).toBe('FRAME');expect(main.root.children[0].children[0].children[0].characters).toBe('Preview content');
    expect(main.diagnostics.totalTextNodes).toBe(1);expect(frame.contentWindow.postMessage.mock.calls[0][0]).toEqual({type:'FRAMEFORGE_IDENTIFY_FRAME',token:key});
  });
});

it('discovers iframes inside the selected shadow host itself',()=>{
  const host=win.document.createElement('div');win.document.body.append(host);
  host.attachShadow({mode:'open'}).innerHTML='<iframe></iframe>';
  const result=collectFrames(host as any);
  expect(result.frames.size).toBe(1);
  expect(result.keys.get(host.shadowRoot!.querySelector('iframe') as any)).toBeTruthy();
});
it.each(['budget','depth','identity'])('explains skipped embedded capture: %s',async(reason)=>{
  const main=document();main.root.children=[{id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1}];
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({status:'ok'}))}});
  await captureEmbeddedFrames(main,new Map(),new AbortController().signal,reason==='depth'?4:0,reason==='budget'?1:2500);
  expect(main.diagnostics.warnings.join(' ')).toContain(reason==='budget'?'node limit':reason==='depth'?'depth limit':'could not be matched');
});
it('preserves the specific preparation error when extension messaging fails',async()=>{
  const main=document();main.root.children=[{id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1}];
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>{throw new Error('Extension context invalidated');})}});
  await captureEmbeddedFrames(main,new Map(),new AbortController().signal,0);
  expect(main.diagnostics.warnings.join(' ')).toContain('Extension context invalidated');
});
it('reports invalid child field paths without substituting a permission error or composing rejected data',async()=>{
  const main=document(),embedded=document();const key='fframe-12345678-1234-1234-1234-123456789012';
  embedded.root.bounds={...box,width:-1};
  const placeholder={id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1,attributes:{frameKey:key}};
  main.root.children=[placeholder];
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({status:'ok',document:embedded}))}});
  await captureEmbeddedFrames(main,new Map([[key,{contentWindow:{postMessage:vi.fn()}} as any]]),new AbortController().signal,0);
  expect(main.root.children[0]).toBe(placeholder);
  const warning=main.diagnostics.warnings.join(' ');
  expect(warning).toContain('Frame returned invalid content: root.bounds.width: expected finite number');
  expect(warning).not.toContain('Allow FrameForge access');
});
it('accepts an embedded scene containing a normalized Chromium-sized fully rounded corner',async()=>{
  const {parseCornerRadius}=await import('@frameforge/style-normalizer');
  const main=document(),embedded=document();const key='fframe-12345678-1234-1234-1234-123456789012';
  embedded.root.cornerRadius=parseCornerRadius('3.40282e+38px',undefined,box);
  main.root.children=[{id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1,attributes:{frameKey:key}}];
  vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({status:'ok',document:embedded}))}});
  await captureEmbeddedFrames(main,new Map([[key,{contentWindow:{postMessage:vi.fn()}} as any]]),new AbortController().signal,0);
  expect(main.root.children[0].type).toBe('FRAME');
  expect(main.root.children[0].children[0].cornerRadius.topLeft).toBeCloseTo(100);
  expect(main.diagnostics.warnings).toEqual([]);
});
it('retains embedded web fonts when composing an editable preview',async()=>{
 const main=document(),embedded=document(),key='fframe-12345678-1234-1234-1234-123456789012';
 const font={family:'Lora',weightMin:400,weightMax:700,style:'normal',dataUrl:'data:font/ttf;base64,AQID'};embedded.fonts=[font];
 main.root.children=[{id:'iframe',type:'UNSUPPORTED',name:'iframe',reason:'CROSS_ORIGIN_IFRAME',bounds:box,visible:true,opacity:1,attributes:{frameKey:key}}];
 vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({status:'ok',document:embedded}))}});
 await captureEmbeddedFrames(main,new Map([[key,{contentWindow:{postMessage:vi.fn()}} as any]]),new AbortController().signal,0);
 expect(main.fonts).toEqual([font]);expect(main.root.children[0].type).toBe('FRAME');
});
