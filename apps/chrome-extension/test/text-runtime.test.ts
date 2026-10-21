import {expect,it,vi} from 'vitest';
const probe=vi.hoisted(()=>({layouts:0,paths:0}));
vi.mock('../src/clipboard/font-faces.js',()=>({fontFaces:{'400:false':new Uint8Array([1]),'700:false':new Uint8Array([2])}}));
vi.mock('fontkit',()=>({create:()=>{
 const glyph={id:1,codePoints:[97],get path(){probe.paths++;return {commands:[{command:'moveTo',args:[0,0]},{command:'lineTo',args:[500,700]}]};}};
 return {unitsPerEm:1000,ascent:800,descent:-200,lineGap:0,layout:(text:string)=>{probe.layouts++;return {advanceWidth:500*text.length,glyphs:Array.from(text,()=>glyph),positions:Array.from(text,()=>({xAdvance:500,xOffset:0,yOffset:0}))};}};
}}));
import {createTextRuntime} from '../src/clipboard/text-runtime.js';
function node(id:string,size=16,weight=400):any{return {id,name:id,text:'aaa',fontWeight:weight,italic:false,fontSize:size,lineHeight:20,letterSpacing:0,textCase:'ORIGINAL',styleRuns:[],width:100,height:20,textAlignVertical:'TOP',textAlignHorizontal:'LEFT'};}
function runtime(){return createTextRuntime(new Set(),new Map(['a','b','large','bold'].map(id=>[id,[{start:0,end:3,bounds:{x:0,y:0,width:48,height:20}}]])));}
it('reuses repeated font work without sharing mutable output glyph geometry',()=>{
 const r=runtime();const first=r.shapeText(node('a'))!;const layouts=probe.layouts,paths=probe.paths;
 first.glyphs[0].commands[1].x=999;
 const second=r.shapeText(node('b'))!;
 expect(probe.layouts).toBe(layouts);expect(probe.paths).toBe(paths);
 expect(second.glyphs[0].commands[1].x).not.toBe(999);
 expect(second.glyphs[0].fontSize).toBe(16);
});
it('keeps font face, size and measured position independent across cached labels',()=>{
 const r=runtime();const small=r.shapeText(node('a'))!,large=r.shapeText(node('large',32))!,bold=r.shapeText(node('bold',16,700))!;
 expect(large.glyphs[0].fontSize).toBe(32);expect(small.glyphs[0].fontSize).toBe(16);
 expect(large.glyphs[0].commands[1].y).toBe(2*small.glyphs[0].commands[1].y);
 expect(bold.glyphs).toHaveLength(3);
});
it('discards text shaping caches between exports',()=>{
 runtime().shapeText(node('a'));const before=probe.layouts;
 runtime().shapeText(node('a'));expect(probe.layouts).toBeGreaterThan(before);
});
