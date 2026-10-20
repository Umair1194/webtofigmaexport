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
