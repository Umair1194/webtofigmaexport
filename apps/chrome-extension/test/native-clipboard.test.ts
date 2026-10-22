import * as textRuntime from "../src/clipboard/text-runtime.js";
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFigmaClipboard } from '@open-pencil/fig/clipboard';
import { buildNativeClipboard, copyNativeCapture } from '../src/clipboard/native.js';
const bounds={x:0,y:0,width:300,height:200};
const base={bounds,visible:true,opacity:1};
function doc(children:any[]=[]):any{return {schemaVersion:'1.0.0',root:{...base,id:'root',name:'Capture',type:'FRAME',fills:[],children},diagnostics:{warnings:[]}};}
const text={...base,bounds:{x:10,y:10,width:100,height:20},id:'text',type:'TEXT',name:'Editable title',characters:'Hello world',style:{fontFamily:'Inter',fontWeight:400,fontSize:16},fills:[{type:'SOLID',color:{r:1,g:0,b:0,a:1}}]};
beforeEach(()=>{vi.stubGlobal('DOMParser',new Window().DOMParser);});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('Native Figma clipboard',()=>{
  it('paints sticky headers above scrolling content while preserving flow order',async()=>{
    const frame=(id:string,y:number,position='AUTO',zIndex?:number)=>({...base,id,name:id,type:'FRAME',bounds:{x:0,y,width:300,height:30},layoutPositioning:position,zIndex,fills:[],children:[]});
    const capture=doc([frame('sticky',0,'ABSOLUTE',30),frame('first',10),frame('second',60),frame('behind',0,'ABSOLUTE',-1)]);
    const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
    const layers=parsed.nodes.filter(n=>['sticky','first','second','behind'].includes(n.name!));
    expect(layers.map(n=>n.name)).toEqual(['behind','first','second','sticky']);
    expect(layers.find(n=>n.name==='sticky')!.stackPositioning).toBe('ABSOLUTE');
    expect(layers.filter(n=>['first','second'].includes(n.name!)).every(n=>n.stackPositioning!=='ABSOLUTE')).toBe(true);
  });
  it('exports nowrap labels as native auto-width text instead of a wrapping fixed-width box',async()=>{
    const capture=doc([{...text,characters:'Editorial accent',textAutoResize:'WIDTH_AND_HEIGHT',bounds:{x:10,y:10,width:97.39,height:15.5}}]);
    capture.root.autoLayout={layoutMode:'VERTICAL',itemSpacing:0,paddingTop:10,paddingLeft:10,paddingBottom:0,paddingRight:0,counterAxisAlignItems:'MIN'};
    const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
    expect(parsed.nodes.find(n=>n.type==='TEXT')!.textAutoResize).toBe('WIDTH_AND_HEIGHT');
    expect(parsed.nodes.find(n=>n.type==='TEXT')!.stackChildAlignSelf).not.toBe('STRETCH');
  });
  it('encodes a hierarchy of editable frames and real text in a Figma binary HTML payload',async()=>{
    const output=await buildNativeClipboard(doc([text]));
    expect(output.html).toContain('data-buffer="<!--(figma)');expect(output.html).not.toContain('schemaVersion');
    const parsed=await parseFigmaClipboard(output.html);expect(parsed).not.toBeNull();
    const title=parsed!.nodes.find(n=>n.type==='TEXT')!;
    expect(title.derivedTextData!.glyphs!.length).toBeGreaterThan(0);
    for(const glyph of title.derivedTextData!.glyphs!) expect(parsed!.blobs[glyph.commandsBlob!]?.length).toBeGreaterThan(0);
    expect(title.derivedTextData!.baselines!.length).toBeGreaterThan(0);
    expect(title.textData?.characters).toBe('Hello world');expect(title.fontName).toMatchObject({family:'Inter',style:'Regular'});
    expect(title.transform).toMatchObject({m02:10,m12:10});expect(title.size).toEqual({x:100,y:20});
    expect(parsed!.nodes.find(n=>n.name==='Capture')!.type).toBe('FRAME');
  });
  it('embeds raster images in blobs without a Figma plugin or remote URL dependency',async()=>{
    const output=await buildNativeClipboard(doc([{...base,id:'image',name:'Photo',type:'IMAGE',objectFit:'CONTAIN',dataUrl:'data:image/png;base64,AQID'}]));
    const parsed=(await parseFigmaClipboard(output.html))!;
    const paint=parsed.nodes.flatMap(n=>n.fillPaints||[]).find(p=>p.type==='IMAGE')!;
    expect(paint.imageScaleMode).toBe('FIT');expect(paint.image?.dataBlob).toBeTypeOf('number');expect([...parsed.blobs[paint.image!.dataBlob!]]).toEqual([1,2,3]);
  });
  it('retains Auto Layout with measured gaps when CSS metadata does not match',async()=>{
    const capture=doc([{...text,bounds:{x:10,y:10,width:100,height:20}},{...text,id:'text2',bounds:{x:10,y:35,width:100,height:20}}]);
    capture.root.autoLayout={layoutMode:'VERTICAL',itemSpacing:5,paddingTop:10,paddingLeft:10,paddingRight:10,paddingBottom:10};
    let result=await buildNativeClipboard(capture),parsed=(await parseFigmaClipboard(result.html))!;
    expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');
    capture.root.children[1].bounds.y=90;
    result=await buildNativeClipboard(capture);parsed=(await parseFigmaClipboard(result.html))!;
    expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');expect(parsed.nodes.find(n=>n.name==='Capture')!.stackSpacing).toBe(60);
  });
  it('converts SVG paths and circles into editable vector geometry',async()=>{
    const output=await buildNativeClipboard(doc([{...base,id:'svg',name:'Icon',type:'VECTOR',svgContent:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#ff0000" d="M0 0L20 0L10 20Z"/><circle cx="10" cy="10" r="3" stroke="black" fill="none"/></svg>'}]));
    const parsed=(await parseFigmaClipboard(output.html))!, vectors=parsed.nodes.filter(n=>n.type==='VECTOR');
    expect(vectors).toHaveLength(2);expect(vectors[0].fillGeometry?.[0].commandsBlob).toBeTypeOf('number');expect(vectors[1].strokeGeometry?.[0].commandsBlob).toBeTypeOf('number');expect(output.warnings).toEqual([]);
  });
  it('rejects incomplete iframe captures rather than copying a misleading empty design',async()=>{
    await expect(buildNativeClipboard(doc([{...base,type:'UNSUPPORTED',reason:'CROSS_ORIGIN_IFRAME'}]))).rejects.toThrow('Embedded preview was not captured');
  });
  it('writes text/html clipboard data instead of scene JSON',async()=>{
    const write=vi.fn(async()=>{});vi.stubGlobal('navigator',{clipboard:{write}});vi.stubGlobal('ClipboardItem',class{constructor(public data:any){}});
    await copyNativeCapture(doc([text]));
    const item=write.mock.calls[0][0][0];expect(item.data['text/html'].type).toBe('text/html');expect(await item.data['text/plain'].text()).not.toContain('schemaVersion');
  });
});

it('shapes body, semibold, bold and italic text into distinct visible glyphs while retaining TEXT types',async()=>{
  const capture=doc([400,600,700].flatMap((weight,i)=>[false,true].map((italic,j)=>({...text,id:'text'+i+j,name:'Face '+weight+' '+italic,bounds:{x:0,y:i*60+j*25,width:290,height:24},characters:'Pet owner — You stay private',style:{fontFamily:'Inter',fontWeight:weight,fontSize:16,fontStyle:italic?'italic':'normal',lineHeight:{unit:'PIXELS',value:24}}}))));
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  const texts=parsed.nodes.filter(n=>n.type==='TEXT');expect(texts).toHaveLength(6);
  const signatures=texts.map(n=>{
    expect(n.derivedTextData!.glyphs!.length).toBeGreaterThan(10);
    const glyph=n.derivedTextData!.glyphs![0];return [...parsed.blobs[glyph.commandsBlob!]].join(',');
  });
  expect(new Set(signatures).size).toBe(6);
});
it('applies measured Auto Layout to block form sections with unequal spacing',async()=>{
  const capture=doc([text,{...text,id:'second',name:'Option',bounds:{x:10,y:50,width:100,height:20}},{...text,id:'third',name:'Continue',bounds:{x:10,y:120,width:100,height:20}}]);
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  const root=parsed.nodes.find(n=>n.name==='Capture')!;
  expect(root.stackMode).toBe('VERTICAL');expect(root.stackSpacing).toBe(0);
  const spacers=parsed.nodes.filter(n=>n.name==='Spacing');expect(spacers.map(n=>n.size!.y)).toEqual([20,50]);
  expect(parsed.nodes.filter(n=>n.type==='TEXT').every(n=>n.stackPositioning!=='ABSOLUTE')).toBe(true);
});
it('keeps overlapping decorative layers out of flow Auto Layout',async()=>{
  const capture=doc([{...text,bounds:{x:0,y:0,width:200,height:100}},{...text,id:'overlap',bounds:{x:50,y:20,width:200,height:100}}]);
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).not.toBe('VERTICAL');
  expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).not.toBe('HORIZONTAL');
});
it('exports stroke silhouettes with nonzero thickness plus editable centerline topology',async()=>{
  const capture=doc([{...base,id:'icon',name:'Icon',type:'VECTOR',svgContent:'<svg viewBox="0 0 24 24" fill="none" stroke="#c2410c" stroke-width="2" stroke-linecap="round"><path d="M4 12L20 12"/></svg>'}]);
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  const vector=parsed.nodes.find(n=>n.type==='VECTOR')!;
  expect((vector.vectorData as any).vectorNetworkBlob).toBeTypeOf('number');
  const blob=parsed.blobs[vector.strokeGeometry![0].commandsBlob!], coords:number[]=[];
  const view=new DataView(blob.buffer,blob.byteOffset,blob.byteLength);let offset=0;
  while(offset<blob.length){const command=blob[offset++];if(command===0)continue;expect([1,2,4]).toContain(command);const pairs=command===4?3:1;for(let i=0;i<pairs;i++){offset+=4;coords.push(view.getFloat32(offset,true));offset+=4;}}
  expect(Math.max(...coords)-Math.min(...coords)).toBeGreaterThan(10); // Width 300: scaled stroke is 25 pixels tall.
  expect(vector.strokePaints![0].color!.r).toBeGreaterThan(.7);
});

it('blocks copying invisible text if the text shaper fails',async()=>{
  vi.spyOn(textRuntime,'createTextRuntime').mockReturnValue({shapeText:()=>null,textDecorations:()=>[]});
  await expect(buildNativeClipboard(doc([text]))).rejects.toThrow('Export stopped to avoid copying invisible text');
});
it('preserves a single browser heading line even when fallback font metrics would wrap it',async()=>{
  const heading={...text,name:'Heading',characters:'What brings you to Petopus?',bounds:{x:0,y:0,width:310,height:36},style:{fontFamily:'Inter',fontSize:32,fontWeight:700,lineHeight:{unit:'PIXELS',value:40}},fragments:[{start:0,end:27,bounds:{x:0,y:0,width:310,height:36}}]};
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(doc([heading]))).html))!;
  const title=parsed.nodes.find(n=>n.type==='TEXT')!;
  expect(title.derivedTextData!.baselines).toHaveLength(1);expect(title.derivedTextData!.baselines![0].width).toBeCloseTo(310,3);
  expect(new Set(title.derivedTextData!.glyphs!.map(g=>g.position.y)).size).toBe(1);
});
it('preserves separate line origins for the continuation after a strong inline phrase',async()=>{
  const line={...text,characters:'private visible',bounds:{x:0,y:0,width:180,height:42},fragments:[{start:0,end:8,bounds:{x:120,y:0,width:60,height:18}},{start:8,end:15,bounds:{x:0,y:24,width:49,height:18}}]};
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(doc([line]))).html))!;
  const output=parsed.nodes.find(n=>n.type==='TEXT')!,baselines=output.derivedTextData!.baselines!;
  expect(baselines).toHaveLength(2);expect(baselines[0].position.x).toBe(120);expect(baselines[1].position.x).toBe(0);expect(baselines[1].position.y-baselines[0].position.y).toBeCloseTo(24);
  expect(baselines.map(b=>b.firstCharacter)).toEqual([0,8]);
  expect(output.derivedTextData!.logicalIndexToCharacterOffsetMap![0]).toBe(0);expect(output.derivedTextData!.logicalIndexToCharacterOffsetMap![8]).toBe(0);
});
it('does not create extra lines beyond the measured legacy heading height',async()=>{
  const line={...text,characters:'What brings you to Petopus?',bounds:{x:0,y:0,width:250,height:36},style:{fontFamily:'Inter',fontSize:32,fontWeight:700,lineHeight:{unit:'PIXELS',value:40}}};
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(doc([line]))).html))!;
  expect(parsed.nodes.find(n=>n.type==='TEXT')!.derivedTextData!.baselines).toHaveLength(1);
});
it('rejects malformed and overlapping fragment character ranges before export',async()=>{
  const line={...text,fragments:[{start:0,end:7,bounds},{start:5,end:100,bounds}]};
  await expect(buildNativeClipboard(doc([line]))).rejects.toThrow('Invalid capture');
});
it('applies nested Auto Layout while retaining a positioned badge as absolute',async()=>{
  const child=(id:string,x:number,y:number,w:number,h:number,position='AUTO')=>({...base,id,name:id,type:'FRAME',bounds:{x,y,width:w,height:h},fills:[],children:[],layoutPositioning:position});
  const capture=doc([{...child('Card',0,0,300,180),children:[child('Title',20,20,260,30),child('Body',20,60,260,40),child('Badge',250,5,40,20,'ABSOLUTE')]}]);
  const result=await buildNativeClipboard(capture),parsed=(await parseFigmaClipboard(result.html))!;
  expect(parsed.nodes.find(n=>n.name==='Card')!.stackMode).toBe('VERTICAL');expect(parsed.nodes.find(n=>n.name==='Badge')!.stackPositioning).toBe('ABSOLUTE');expect(result.stats.autoLayout).toBeGreaterThanOrEqual(2);
});
it('reconstructs wrapped nested rows as editable Auto Layout groups',async()=>{
  const child=(id:string,x:number,y:number)=>({...base,id,name:id,type:'FRAME',bounds:{x,y,width:120,height:50},fills:[],children:[]});
  const result=await buildNativeClipboard(doc([child('A',10,10),child('B',150,10),child('C',10,80),child('D',150,80)]));
  const parsed=(await parseFigmaClipboard(result.html))!;expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');
  expect(parsed.nodes.filter(n=>n.name==='Row 1'||n.name==='Row 2').every(n=>n.stackMode==='HORIZONTAL')).toBe(true);
  expect(parsed.nodes.filter(n=>n.name==='Row 1'||n.name==='Row 2')).toHaveLength(2);expect(result.stats.autoLayout).toBe(3);
});
it('rejects excessive text before shaping can freeze the popup or page',async()=>{
  await expect(buildNativeClipboard(doc([{...text,characters:'a'.repeat(200001)}]))).rejects.toThrow('too much text');
});

it('encodes every captured image fitting mode using valid binary enum values',async()=>{
  for(const [objectFit,expected] of [['FILL','STRETCH'],['CONTAIN','FIT'],['COVER','FILL']] as const){
    const output=await buildNativeClipboard(doc([{...base,id:'image',name:'Photo',type:'IMAGE',objectFit,dataUrl:'data:image/png;base64,AQID'}]));
    const parsed=(await parseFigmaClipboard(output.html))!;
    expect(parsed.nodes.flatMap(n=>n.fillPaints||[]).find(p=>p.type==='IMAGE')!.imageScaleMode).toBe(expected);
  }
});
it('preserves gradient types, affine geometry, layer order and stop transparency in native data',async()=>{
  const {parseFills}=await import('@frameforge/style-normalizer');
  const capture=doc();capture.root.fills=parseFills({backgroundImage:'radial-gradient(circle at 25% 50%, rgba(255, 0, 0, .5), transparent), linear-gradient(45deg, blue 20%, white 80%)',backgroundColor:'black'},bounds);
  const result=await buildNativeClipboard(capture),parsed=(await parseFigmaClipboard(result.html))!;
  const fills=parsed.nodes.find(n=>n.name==='Capture')!.fillPaints!;
  expect(fills.map(p=>p.type)).toEqual(['GRADIENT_RADIAL','GRADIENT_LINEAR','SOLID']);
  expect(fills[0].stops![0].color.a).toBeCloseTo(.5);
  expect(fills[0].transform!.m00).toBeCloseTo(capture.root.fills[0].gradientTransform.m00);
  expect(fills[1].transform!.m01).toBeCloseTo(capture.root.fills[1].gradientTransform.m01);
});
it('retains flow Auto Layout when children have differing cross-axis insets',async()=>{
  const capture=doc([{...text,bounds:{x:10,y:10,width:100,height:20}},{...text,id:'right',bounds:{x:170,y:50,width:100,height:20}}]);
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');
  expect(parsed.nodes.filter(n=>n.name==='Row')).toHaveLength(2);
  expect(parsed.nodes.find(n=>n.name==='Row')!.stackHorizontalPadding).toBe(10);
  expect(parsed.nodes.filter(n=>n.name==='Row').every(n=>n.stackPrimarySizing==='RESIZE_TO_FIT_WITH_IMPLICIT_SIZE')).toBe(true);
});
it('uses visual flow order for CSS-reordered children without changing measured coordinates',async()=>{
  const capture=doc([{...text,id:'bottom',name:'Bottom',bounds:{x:10,y:50,width:100,height:20}},{...text,id:'top',name:'Top',bounds:{x:10,y:10,width:100,height:20}}]);
  const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
  expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');
  expect(parsed.nodes.find(n=>n.name==='Top')!.transform!.m12).toBe(10);
  expect(parsed.nodes.find(n=>n.name==='Bottom')!.transform!.m12).toBe(50);
});

it('exports a styled multiline paragraph as one editable TEXT with style overrides and two baselines',async()=>{
 const capture=doc([{...text,characters:'Hello world again',bounds:{x:10,y:10,width:260,height:48},fragments:[{start:0,end:6,bounds:{x:0,y:0,width:48,height:20}},{start:6,end:11,bounds:{x:48,y:0,width:45,height:20}},{start:11,end:17,bounds:{x:0,y:24,width:48,height:20}}],runs:[{start:0,end:6,style:{fontFamily:'Inter',fontSize:16,fontWeight:400},fills:text.fills},{start:6,end:11,style:{fontFamily:'Inter',fontSize:16,fontWeight:700},fills:text.fills},{start:11,end:17,style:{fontFamily:'Inter',fontSize:16,fontWeight:400},fills:text.fills}]}]);
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;const texts=parsed.nodes.filter(n=>n.type==='TEXT');expect(texts).toHaveLength(1);
 expect(texts[0].textData!.characters).toBe('Hello world again');expect(texts[0].textData!.styleOverrideTable!.some(s=>s.fontName?.style==='Bold')).toBe(true);expect(texts[0].derivedTextData!.baselines).toHaveLength(2);
 expect(texts[0].derivedTextData!.logicalIndexToCharacterOffsetMap![6]).toBeCloseTo(48);
});
it('serializes reflowing paragraph boxes and capped responsive frames into native sizing fields',async()=>{
 const capture=doc([{...text,bounds:{x:0,y:0,width:300,height:42},textAutoResize:'HEIGHT'}]);
 capture.root.sizing={vertical:'HUG',maxWidth:440};
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
 expect(parsed.nodes.find(n=>n.type==='TEXT')!.textAutoResize).toBe('HEIGHT');
 expect(parsed.nodes.find(n=>n.name==='Capture')!.maxSize?.value?.x).toBe(440);
});
it('preserves nested colour and font overrides in the actual clipboard payload',async()=>{
 const capture=doc([{...text,characters:'Outer bold end',runs:[{start:0,end:6,style:text.style,fills:text.fills},{start:6,end:10,style:{...text.style,fontWeight:700},fills:[{type:'SOLID',color:{r:117/255,g:56/255,b:120/255,a:1}}]},{start:10,end:14,style:text.style,fills:text.fills}]}]);
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
 const overrides=parsed.nodes.find(n=>n.type==='TEXT')!.textData!.styleOverrideTable!;
 expect(overrides.some(style=>style.fontName?.style==='Bold'&&Math.abs(style.fillPaints![0].color!.r-117/255)<.001)).toBe(true);
});
it('applies row Auto Layout when a centered last grid row differs in width and source order',async()=>{
 const block=(id:string,x:number,y:number,w:number):any=>({...base,id,name:id,type:'FRAME',bounds:{x,y,width:w,height:30},fills:[],children:[]});
 const capture=doc([block('last',100,60,80),block('right',160,10,80),block('left',20,10,80)]);
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
 expect(parsed.nodes.find(n=>n.name==='Capture')!.stackMode).toBe('VERTICAL');expect(parsed.nodes.filter(n=>n.name.startsWith('Row '))).toHaveLength(2);
});

it('exports translucent CSS borders as one shared stroke paint, without stacking four copies',async()=>{
 const capture=doc();capture.root.strokes=['TOP','RIGHT','BOTTOM','LEFT'].map(side=>({side,color:{r:.04,g:.1,b:.12,a:.08},width:1,alignment:'INSIDE'}));
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;
 const frame=parsed.nodes.find(n=>n.name==='Capture')!;expect(frame.strokePaints).toHaveLength(1);expect(frame.strokePaints![0].opacity).toBeCloseTo(.08);expect(frame.strokePaints![0].color!.a).toBe(1);
});
it('preserves SVG gradient stops, rounded geometry, alpha and even-odd holes',async()=>{
 const svg='<svg viewBox="0 0 24 24"><defs><linearGradient id="logo"><stop offset="0" stop-color="#92dbaa"/><stop offset="1" stop-color="#a59ad9" stop-opacity=".6"/></linearGradient></defs><rect width="24" height="24" rx="5" fill="url(#logo)"/><path fill="rgba(0,0,0,.1)" fill-rule="evenodd" d="M2 2H22V22H2ZM6 6H18V18H6Z"/><path fill="none" stroke="rgba(0,0,0,.2)" stroke-opacity=".5" d="M2 12H22"/></svg>';
 const result=await buildNativeClipboard(doc([{...base,id:'logo',name:'Logo',type:'VECTOR',svgContent:svg}])),parsed=(await parseFigmaClipboard(result.html))!;
 const vectors=parsed.nodes.filter(n=>n.type==='VECTOR');expect(vectors[0].fillPaints![0].type).toBe('GRADIENT_LINEAR');expect(vectors[0].fillPaints![0].stops![1].color.a).toBeCloseTo(.6);expect(vectors[1].fillPaints![0].opacity).toBeCloseTo(.1);expect(vectors[2].strokePaints![0].opacity).toBeCloseTo(.1);expect(result.warnings).toEqual([]);
 expect(vectors[1].fillGeometry![0].windingRule).toBe('ODD');
});
it('resolves inherited SVG user-space gradients and radial paints',async()=>{
 const svg='<svg viewBox="0 0 100 50"><defs><linearGradient id="base"><stop stop-color="red"/><stop offset="100%" stop-color="blue"/></linearGradient><linearGradient id="derived" href="#base" gradientUnits="userSpaceOnUse" x1="10" x2="90" gradientTransform="translate(0 5)"/><radialGradient id="radial"><stop stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient></defs><path fill="url(#derived)" d="M10 5H90V45H10Z"/><circle cx="50" cy="25" r="20" fill="url(#radial)"/></svg>';
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(doc([{...base,id:'svg',name:'Icon',type:'VECTOR',svgContent:svg}]))).html))!;
 const fills=parsed.nodes.filter(n=>n.type==='VECTOR').map(n=>n.fillPaints![0]);expect(fills.map(p=>p.type)).toEqual(['GRADIENT_LINEAR','GRADIENT_RADIAL']);expect(fills[0].transform!.m00).toBeCloseTo(1.25);expect(fills[0].stops).toHaveLength(2);
});
it('retains backdrop-blur effect data and one region with both even-odd contours',async()=>{
 const capture=doc();capture.root.effects=[{type:'BACKGROUND_BLUR',radius:12,visible:true}];
 const parsed=(await parseFigmaClipboard((await buildNativeClipboard(capture)).html))!;expect(parsed.nodes.find(n=>n.name==='Capture')!.effects![0]).toMatchObject({type:'BACKGROUND_BLUR',radius:12});
 const {vectorNetwork}=await import('../src/clipboard/vector-geometry.js');
 const network=vectorNetwork([{type:'M',x:0,y:0},{type:'L',x:20,y:0},{type:'L',x:20,y:-20},{type:'Z'},{type:'M',x:5,y:-5},{type:'L',x:15,y:-5},{type:'L',x:15,y:-15},{type:'Z'}],true,'EVENODD');
 expect(network.regions).toHaveLength(1);expect(network.regions[0].loops).toHaveLength(2);expect(network.regions[0].windingRule).toBe('EVENODD');
});
it('stops an export cancelled during glyph serialization without writing the clipboard',async()=>{
 const write=vi.fn();vi.stubGlobal('navigator',{clipboard:{write}});
 const controller=new AbortController();let shaped=0;
 const original=textRuntime.createTextRuntime;
 vi.spyOn(textRuntime,'createTextRuntime').mockImplementation((...args)=>{
  const runtime=original(...args);return {...runtime,shapeText(node){if(++shaped===1)setTimeout(()=>controller.abort(),0);return runtime.shapeText(node);}};
 });
 const capture=doc(Array.from({length:250},(_,i)=>({...text,id:'text-'+i,bounds:{...text.bounds,y:i*24},characters:'An editable text label '+i})));
 await expect(copyNativeCapture(capture,{signal:controller.signal})).rejects.toThrow('Export cancelled');
 expect(shaped).toBeGreaterThan(0);expect(shaped).toBeLessThan(250);expect(write).not.toHaveBeenCalled();
});
it('rejects previously saved captures whose node budget truncated the page',async()=>{
 const capture=doc([text]);capture.diagnostics.warnings=['Reached maximum node capture limit; capture is partial.'];
 await expect(buildNativeClipboard(capture)).rejects.toThrow('capture is incomplete');
});
