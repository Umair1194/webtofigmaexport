import fs from 'node:fs';
import {expect,it} from 'vitest';
import {FontRegistry} from '../src/clipboard/font-registry.js';
import {buildNativeClipboard} from '../src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
import {validateSceneGraph,type CapturedFont} from '@frameforge/scene-graph';
const asset=(file:string,family:string,style:'normal'|'italic'='normal'):CapturedFont=>({family,style,weightMin:file==='RobotoMono'?100:400,weightMax:700,dataUrl:'data:font/ttf;base64,'+fs.readFileSync(new URL('../../../fixtures/fonts/'+file+'.ttf',import.meta.url)).toString('base64')});
const fonts=[asset('RobotoMono','Code alias'),asset('Lora','Lora'),asset('Lora-Italic','Lora','italic')];
it('resolves CSS aliases to real font families and applies variable weights',()=>{
 const warnings=new Set<string>(),registry=new FontRegistry(fonts,warnings);
 expect(registry.resolve({fontFamily:'Code alias',fontWeight:650,fontSize:16},'Editable code','code')).toBe('Roboto Mono');
 const face=registry.face({id:'code',fontFamily:'Roboto Mono',fontWeight:650,italic:false})!;
 expect(face.familyName).toBe('Roboto Mono');expect(face.variationCoords).toEqual([650]);
 expect(registry.resolve({fontFamily:'Lora',fontWeight:700,fontSize:16,fontStyle:'italic'},'Italic heading','heading')).toBe('Lora');
 expect(registry.face({id:'heading',fontFamily:'Lora',fontWeight:700,italic:true})!.italicAngle).not.toBe(0);
 expect([...warnings].some(w=>w.startsWith('Substituted'))).toBe(false);
});
it('falls back explicitly for missing families, styles, glyph coverage and corrupt data',()=>{
 const warnings=new Set<string>(),registry=new FontRegistry([...fonts,{...fonts[0],family:'Broken',dataUrl:'data:font/woff2;base64,AQID'}],warnings);
 for(const [family,text,style] of [['Unknown','Hello','normal'],['Code alias','Hello','italic'],['Code alias','漢字','normal'],['Broken','Hello','normal']] as const)
  expect(registry.resolve({fontFamily:family,fontWeight:400,fontSize:16,fontStyle:style},text)).toBe('Inter');
 expect([...warnings].filter(w=>w.startsWith('Substituted'))).toHaveLength(4);
});
it('exports original family metadata and distinct real glyph shapes, including mixed styles',async()=>{
 const text=(id:string,family:string,weight=400,style:'normal'|'italic'='normal')=>({id,type:'TEXT',name:id,bounds:{x:0,y:0,width:300,height:32},characters:'Editable family sample',visible:true,opacity:1,fills:[],style:{fontFamily:family,fontWeight:weight,fontSize:20,fontStyle:style},fragments:[{start:0,end:22,bounds:{x:0,y:0,width:260,height:28}}]});
 const mono=text('mono','Code alias'),serif=text('serif','Lora',700),italic=text('italic','Lora',400,'italic');
 (serif as any).runs=[{start:9,end:15,style:{fontFamily:'Code alias',fontWeight:700,fontSize:20},fills:[]}];
 const input:any={schemaVersion:'1.0.0',fonts,root:{id:'root',name:'Fonts',type:'FRAME',bounds:{x:0,y:0,width:400,height:200},fills:[],children:[mono,serif,italic]},diagnostics:{warnings:[]}};
 expect(validateSceneGraph(input).valid).toBe(true);
 const result=await buildNativeClipboard(input),parsed=(await parseFigmaClipboard(result.html))!;
 const monoNode=parsed.nodes.find(n=>n.name==='mono')!,serifNode=parsed.nodes.find(n=>n.name==='serif')!,italicNode=parsed.nodes.find(n=>n.name==='italic')!;
 expect(monoNode.fontName?.family).toBe('Roboto Mono');expect(serifNode.fontName).toMatchObject({family:'Lora',style:'Bold'});expect(italicNode.fontName).toMatchObject({family:'Lora',style:'Italic'});
 expect(JSON.stringify(serifNode.textData?.styleOverrideTable)).toContain('Roboto Mono');
 expect(parsed.blobs[monoNode.derivedTextData!.glyphs![0].commandsBlob!]).not.toEqual(parsed.blobs[serifNode.derivedTextData!.glyphs![0].commandsBlob!]);
 expect(result.warnings.some(w=>w.startsWith('Substituted'))).toBe(false);
});
it('rejects malformed or over-budget embedded fonts while retaining valid captures',()=>{
 const input:any={root:{type:'FRAME',children:[]},fonts};expect(validateSceneGraph(input).valid).toBe(true);
 expect(validateSceneGraph({...input,fonts:[{...fonts[0],weightMin:800,weightMax:100}]}).valid).toBe(false);
 expect(validateSceneGraph({...input,fonts:Array(13).fill(fonts[0])}).valid).toBe(false);
 expect(validateSceneGraph({...input,fonts:[{...fonts[0],dataUrl:'https://example.com/font.woff2'}]}).valid).toBe(false);
 expect(validateSceneGraph({...input,fonts:[{...fonts[0],dataUrl:'data:font/ttf;base64,'+'A'.repeat(400000)}]}).valid).toBe(false);
});
