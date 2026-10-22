import fs from 'node:fs';
import {Window} from 'happy-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {captureFonts,waitForFonts} from '../src/content/fonts.js';
let win:Window;
const bytes=fs.readFileSync(new URL('../../../fixtures/fonts/RobotoMono.ttf',import.meta.url));
const doc=()=>({root:{type:'FRAME',children:[{type:'TEXT',characters:'Font sample',style:{fontFamily:'Site code',fontWeight:700,fontSize:16},runs:[]}]},diagnostics:{warnings:[]}} as any);
beforeEach(()=>{win=new Window({url:'https://example.com'});for(const [name,value] of Object.entries({document:win.document,location:win.location,CSSStyleSheet:win.CSSStyleSheet}))vi.stubGlobal(name,value);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('captures referenced variable faces with relative URLs and validates binary font data',async()=>{
 win.document.head.innerHTML='<style>@font-face{font-family:"Site code";font-weight:100 700;src:url("/code.ttf") format("truetype")}@font-face{font-family:Unused;src:url("/unused.ttf")}</style>';
 const rule=win.document.styleSheets[0].cssRules[0] as any;
 Object.defineProperty(rule,'style',{value:{getPropertyValue:(name:string)=>({'font-family':'Site code','font-weight':'100 700',src:'url("/code.ttf")'} as any)[name]||''}});
 const fetcher=vi.fn(async()=>new Response(bytes,{headers:{'content-type':'font/ttf'}}));vi.stubGlobal('fetch',fetcher);
 const captured=doc();await captureFonts(captured,new AbortController().signal);
 expect(captured.fonts).toHaveLength(1);expect(captured.fonts[0]).toMatchObject({family:'Site code',weightMin:100,weightMax:700,style:'normal'});
 expect(captured.fonts[0].dataUrl).toMatch(/^data:font\/ttf;base64,/);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('https://example.com/code.ttf');
});
it('does not turn denied or non-font resources into a failed page capture',async()=>{
 win.document.head.innerHTML='<style>@font-face{font-family:"Site code";src:url("/error")}</style>';
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>Error</html>')));
 const captured=doc();await captureFonts(captured,new AbortController().signal);expect(captured.fonts).toBeUndefined();expect(captured.diagnostics.warnings.join(' ')).toContain('Web font unavailable');
});
it('does not fetch fonts for ordinary bundled Inter captures',async()=>{
 const captured=doc();captured.root.children[0].style.fontFamily='Inter';const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await captureFonts(captured,new AbortController().signal);expect(fetcher).not.toHaveBeenCalled();
});
it('cancels font readiness without leaving its timeout pending',async()=>{
 vi.useFakeTimers();Object.defineProperty(win.document,'fonts',{value:{status:'loading',ready:new Promise(()=>{})},configurable:true});
 const controller=new AbortController();const pending=waitForFonts(controller.signal);controller.abort();await expect(pending).rejects.toThrow('cancelled');expect(vi.getTimerCount()).toBe(0);
});
it('skips unused weights and Unicode subsets before fetching font files',async()=>{
 const rule=(weight:string,unicode:string,url:string)=>({type:5,style:{getPropertyValue:(key:string)=>({'font-family':'Site code','font-weight':weight,'unicode-range':unicode,src:'url('+url+')'} as any)[key]||''}});
 Object.defineProperty(win.document,'styleSheets',{value:[{href:'https://example.com/fonts.css',cssRules:[rule('400','','/unused-weight.ttf'),rule('700','U+0400-04FF','/cyrillic.ttf'),rule('700','U+0000-00FF','/latin.ttf')]}]});
 const fetcher=vi.fn(async()=>new Response(bytes));vi.stubGlobal('fetch',fetcher);
 const captured=doc();await captureFonts(captured,new AbortController().signal);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('https://example.com/latin.ttf');expect(captured.fonts).toHaveLength(1);
});
it('discloses timed-out font collection without losing the page capture',async()=>{
 vi.useFakeTimers();Object.defineProperty(win.document,'styleSheets',{value:[{href:'https://example.com/fonts.css',cssRules:[{type:5,style:{getPropertyValue:(key:string)=>({'font-family':'Site code','font-weight':'700',src:'url(/a.ttf),url(/b.ttf),url(/c.ttf)'} as any)[key]||''}}]}]});
 vi.stubGlobal('fetch',vi.fn((_url:string,{signal}:any)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Aborted'))))));
 const captured=doc(),pending=captureFonts(captured,new AbortController().signal);await vi.advanceTimersByTimeAsync(5100);await pending;
 expect(captured.diagnostics.warnings.join(' ')).toContain('resource/time budget');expect(vi.getTimerCount()).toBe(0);
});
