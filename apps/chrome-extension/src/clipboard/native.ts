import {FontRegistry} from './font-registry.js';
import {exportScheduler} from './scheduling.js';
import {serializeCapture} from './serialize.js';
import { resolveSvgGradient, localSvgBounds } from './svg-paints.js';
import { vectorNetwork, strokeOutline } from "./vector-geometry.js";
import { applyMeasuredLayout } from "./measured-layout.js";
import {applyResponsiveSizing} from './responsive-sizing.js';
import { createTextRuntime } from "./text-runtime.js";
import { SceneGraphDocument, SceneNode as CapturedNode, TextFragment, Paint, validateSceneGraph } from '@frameforge/scene-graph';
import { hasDominantIframePlaceholder } from '@frameforge/shared-protocol';
import { parseColor } from '@frameforge/style-normalizer';
import { SceneGraph, computeImageHash, type Fill, type SceneNode } from '@open-pencil/scene-graph';
import { initCodec } from '@open-pencil/kiwi/fig/codec';
import { encodeFigmaClipboard, embedClipboardImages } from '@open-pencil/fig/clipboard';
import { makeDocumentNodeChange, makeCanvasNodeChange, encodePathCommandsBlob, type OutlineCommand } from '@open-pencil/fig/node-change';
import svgpath from 'svgpath';

const black = { r: 0, g: 0, b: 0, a: 1 };
function solid(color = black): Fill { return { type: 'SOLID', color:{...color,a:1}, opacity: color.a, visible: true }; }
function paint(p: Paint, width=100, height=100): Fill {
  if (p.type === 'SOLID') return { ...solid({...p.color,a:1}), opacity: p.opacity ?? p.color.a, visible: p.visible !== false };
  const rad = (p.angleDegrees ?? 180)*Math.PI/180, dx=Math.sin(rad), dy=-Math.cos(rad), line=Math.max(.01,Math.abs(width*dx)+Math.abs(height*dy)), c=width*dx/line,s=height*dy/line;
  return { type: p.type, color: black, opacity: 1, visible: p.visible !== false, gradientStops: p.stops,
    gradientTransform: p.gradientTransform ?? { m00:c,m01:s,m02:(1-c-s)/2,m10:-width*dy/line,m11:height*dx/line,m12:.5-(-width*dy+height*dx)/line/2 } };
}
function dataBytes(url: string): Uint8Array {
  const comma = url.indexOf(',');
  if (comma < 0 || !url.startsWith('data:image/')) throw new Error('Missing embedded image');
  return url.slice(0, comma).includes(';base64') ? Uint8Array.from(atob(url.slice(comma+1)), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(url.slice(comma+1)));
}
function metric(value: {unit: string; value: number} | undefined, size: number): number | null {
  return value ? value.unit === 'PERCENT' ? size * value.value / 100 : value.value : null;
}

// Keep native Auto Layout only when a simple fixed-size stack matches measured positions.
function useLayout(node: Extract<CapturedNode, {type:'FRAME'}>): boolean {
  const a = node.autoLayout;
  if (!a || a.layoutMode === 'NONE' || a.layoutWrap === 'WRAP' || a.counterAxisAlignItems === 'BASELINE') return false;
  const vertical = a.layoutMode === 'VERTICAL', children = node.children.filter(c => c.visible && c.layoutPositioning !== "ABSOLUTE");
  const mainSize = vertical ? node.bounds.height : node.bounds.width, crossSize = vertical ? node.bounds.width : node.bounds.height;
  const leading = vertical ? a.paddingTop : a.paddingLeft, trailing = vertical ? a.paddingBottom : a.paddingRight;
  const crossLeading = vertical ? a.paddingLeft : a.paddingTop, crossTrailing = vertical ? a.paddingRight : a.paddingBottom;
  const used = children.reduce((sum,c)=>sum+(vertical?c.bounds.height:c.bounds.width),0);
  let gap = a.itemSpacing, cursor = leading;
  const remaining = mainSize-leading-trailing-used-gap*Math.max(0,children.length-1);
  if(a.primaryAxisAlignItems === 'CENTER') cursor += remaining/2;
  if(a.primaryAxisAlignItems === 'MAX') cursor += remaining;
  if(a.primaryAxisAlignItems === 'SPACE_BETWEEN' && children.length > 1) gap = (mainSize-leading-trailing-used)/(children.length-1);
  return children.every(c => {
    const main = vertical ? c.bounds.y : c.bounds.x, cross = vertical ? c.bounds.x : c.bounds.y, length = vertical ? c.bounds.height : c.bounds.width;
    const crossLength = vertical ? c.bounds.width : c.bounds.height;
    const expectedCross = a.counterAxisAlignItems === 'MAX' ? crossSize-crossTrailing-crossLength : a.counterAxisAlignItems === 'CENTER' ? crossLeading+(crossSize-crossLeading-crossTrailing-crossLength)/2 : crossLeading;
    const matches = Math.abs(main-cursor)<=1 && Math.abs(cross-expectedCross)<=1;
    cursor += length+gap; return matches;
  });
}

function svgLayers(svg: string, parent: SceneNode, graph: SceneGraph, warnings: Set<string>) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Invalid SVG');
  const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const scaleX = parent.width / (vb[2] || parseFloat(root.getAttribute('width') || '') || parent.width);
  const scaleY = parent.height / (vb[3] || parseFloat(root.getAttribute('height') || '') || parent.height);
  let made = 0;
  function visit(el: Element, transform: string, opacity: number) {
    const tag = el.localName, get = (key: string, fallback: string): string => {
      let current: Element | null = el;
      while(current) { const value=current.getAttribute(key); if(value) return value; current=current.parentElement; }
      return fallback;
    }, num = (key: string) => parseFloat(el.getAttribute(key)||'0');
    if (['defs','clipPath','mask','script','style','foreignObject'].includes(tag)) return;
    const tx = transform + ' ' + (el.getAttribute('transform') || '');
    const alpha = opacity * parseFloat(el.getAttribute('opacity') || '1');
    let d = el.getAttribute('d') || '';
    if(tag==='rect') { const x=num('x'),y=num('y'),w=num('width'),h=num('height'),rx=Math.min(w/2,Math.max(0,num('rx')||num('ry'))),ry=Math.min(h/2,Math.max(0,num('ry')||num('rx')));d=rx&&ry?`M${x+rx} ${y}H${x+w-rx}A${rx} ${ry} 0 0 1 ${x+w} ${y+ry}V${y+h-ry}A${rx} ${ry} 0 0 1 ${x+w-rx} ${y+h}H${x+rx}A${rx} ${ry} 0 0 1 ${x} ${y+h-ry}V${y+ry}A${rx} ${ry} 0 0 1 ${x+rx} ${y}Z`:`M${x} ${y}h${w}v${h}h${-w}Z`; }
    if(tag==='line') d=`M${num('x1')} ${num('y1')}L${num('x2')} ${num('y2')}`;
    if(tag==='polyline' || tag==='polygon') d='M'+(el.getAttribute('points')||'')+(tag==='polygon'?'Z':'');
    if(tag==='circle' || tag==='ellipse') { const cx=num('cx'),cy=num('cy'),rx=tag==='circle'?num('r'):num('rx'),ry=tag==='circle'?num('r'):num('ry'); d=`M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${2*rx} 0a${rx} ${ry} 0 1 0 ${-2*rx} 0Z`; }
    if(d) {
      const path=svgpath(d).transform(tx).translate(-(vb[0]||0),-(vb[1]||0)).scale(scaleX,scaleY).abs().unshort().unarc();
      const commands: OutlineCommand[]=[];
      path.iterate((seg,_index,x,y)=>{
        const t=seg[0].toUpperCase(),v=seg.slice(1) as number[];
        if(t==='M'||t==='L')commands.push({type:t,x:v[0],y:-v[1]});
        if(t==='H')commands.push({type:'L',x:v[0],y:-y});
        if(t==='V')commands.push({type:'L',x,y:-v[0]});
        if(t==='C')commands.push({type:t,x1:v[0],y1:-v[1],x2:v[2],y2:-v[3],x:v[4],y:-v[5]});
        if(t==='Q')commands.push({type:t,x1:v[0],y1:-v[1],x:v[2],y:-v[3]});
        if(t==='Z')commands.push({type:'Z'});
      });
      const fill=get('fill',tag==='line'?'none':'black'), stroke=get('stroke','none');
      const child=graph.createNode('VECTOR',parent.id,{name:el.getAttribute('id')||tag,width:parent.width,height:parent.height,opacity:alpha,fills:[],strokes:[]});
      const box=localSvgBounds(el,d),project=(p:{x:number;y:number})=>{let point=p;svgpath(`M${p.x} ${p.y}`).transform(tx).translate(-(vb[0]||0),-(vb[1]||0)).scale(scaleX,scaleY).abs().iterate(seg=>{if(seg[0]==='M')point={x:seg[1]/parent.width,y:seg[2]/parent.height};});return point;};
      const svgPaint=(value:string,opacity:number)=>value.startsWith('url(')?resolveSvgGradient(value,doc,box,project,{width:vb[2]||parent.width,height:vb[3]||parent.height},opacity,warnings):{...solid(parseColor(value)),opacity:parseColor(value).a*opacity};
      if(fill!=='none'){const p=svgPaint(fill,parseFloat(get('fill-opacity','1')));if(p)child.fills=[p];}
      if(stroke!=='none'){const p=svgPaint(stroke,parseFloat(get('stroke-opacity','1')));if(p)child.strokes=[{...p,weight:parseFloat(get('stroke-width','1'))*Math.min(scaleX,scaleY),align:'CENTER'}];}
      const geometry={windingRule:get('fill-rule','nonzero')==='evenodd'?'EVENODD' as const:'NONZERO' as const,commandsBlob:encodePathCommandsBlob(commands)};
      if(child.fills.length)child.fillGeometry=[geometry];
      child.vectorNetwork=vectorNetwork(commands,!!child.fills.length,geometry.windingRule);
      if(child.strokes.length){
        const cap=get('stroke-linecap','butt'), join=get('stroke-linejoin','miter');
        child.strokeCap=cap==='round'?'ROUND':cap==='square'?'SQUARE':'NONE';
        child.strokeJoin=join==='round'?'ROUND':join==='bevel'?'BEVEL':'MITER';
        child.strokeGeometry=[{windingRule:'NONZERO',commandsBlob:encodePathCommandsBlob(strokeOutline(commands,child.strokes[0].weight,cap,join))}];
      }
      made++;
    } else if(!['svg','g','title','desc'].includes(tag)) warnings.add('Unsupported SVG element: '+tag);
    if(el.hasAttribute('clip-path')||el.hasAttribute('mask'))warnings.add('SVG clipping and masks require manual adjustment.');
    for(const child of Array.from(el.children))visit(child,tx,alpha);
  }
  visit(root,'',1);
  if(!made)warnings.add('SVG contains no supported vector shapes: '+parent.name);
}

export interface NativeExportStats { layers: number; text: number; autoLayout: number; }
export interface NativeClipboardResult { html: string; warnings: string[]; stats: NativeExportStats; }
export interface NativeExportOptions { signal?: AbortSignal; onClipboardWrite?: () => void; }
export async function buildNativeClipboard(input: SceneGraphDocument, options: NativeExportOptions = {}): Promise<NativeClipboardResult> {
  const scheduler=exportScheduler(options.signal);scheduler.check();
  const validation=validateSceneGraph(input);
  if(!validation.valid || !validation.document)throw new Error('Invalid capture: '+validation.errors.join('; '));
  const doc=validation.document;
  if(hasDominantIframePlaceholder(doc.root))throw new Error('Embedded preview was not captured. Review the capture details in FrameForge for the specific failure, then capture again.');
  await initCodec();
  await scheduler.checkpoint(true);
  const graph=new SceneGraph(), page=graph.addPage('Web capture'), warnings=new Set(doc.diagnostics.warnings);
  const fontRegistry=new FontRegistry(doc.fonts||[],warnings);
  const textFragments = new Map<string, TextFragment[]>();
  let textCharacters = 0;
  function* visit(source: CapturedNode, parentId: string): Generator<void,SceneNode> {
    yield;
    if(source.type === "TEXT" && (textCharacters += source.characters.length) > 200000) throw new Error("This capture contains too much text to copy at once. Choose a smaller section.");
    const target=graph.createNode(source.type==='IMAGE'||source.type==='UNSUPPORTED'||source.type==='VECTOR'?'FRAME':source.type,parentId,{
      name:source.name,x:source.bounds.x,y:source.bounds.y,width:Math.max(.01,source.bounds.width),height:Math.max(.01,source.bounds.height),visible:source.visible,opacity:source.opacity,layoutPositioning:source.layoutPositioning || "AUTO",fills:[],strokes:[],clipsContent:false
    });
    for(const key of ['minWidth','maxWidth','minHeight','maxHeight'] as const)if(source.sizing?.[key]!==undefined)target[key]=source.sizing[key]!;
    if('fills' in source)target.fills=(source.fills||[]).map(p=>paint(p,source.bounds.width,source.bounds.height));
    if('cornerRadius' in source && source.cornerRadius)Object.assign(target,{independentCorners:true,topLeftRadius:source.cornerRadius.topLeft,topRightRadius:source.cornerRadius.topRight,bottomLeftRadius:source.cornerRadius.bottomLeft,bottomRightRadius:source.cornerRadius.bottomRight});
    if('effects' in source)target.effects=(source.effects||[]).map(e=>({...e,color:'color' in e?e.color:black,offset:'offset' in e?e.offset:{x:0,y:0},spread:'spread' in e?e.spread:0,visible:e.visible!==false}));
    if('strokes' in source && source.strokes?.length){
      const firstColor=JSON.stringify(source.strokes[0].color);
      if(source.strokes.some(s=>JSON.stringify(s.color)!==firstColor))warnings.add('Different border colours per edge use the first shared stroke paint: '+source.name);
      const stroke=source.strokes[0];target.strokes=[{...solid(stroke.color),weight:stroke.width,align:stroke.alignment}];
      const first=source.strokes[0];target.strokeWeight=first.width;target.strokeAlign=first.alignment;
      if(source.strokes.some(s=>s.side)) {target.independentStrokeWeights=true;for(const [side,key] of [['TOP','borderTopWeight'],['RIGHT','borderRightWeight'],['BOTTOM','borderBottomWeight'],['LEFT','borderLeftWeight']] as const)target[key]=source.strokes.find(s=>s.side===side)?.width||0;}
      if(first.style==='dashed')target.dashPattern=[first.width*3,first.width*2];
      if(first.style==='dotted')target.dashPattern=[first.width,first.width];
    }
    if(source.type==='TEXT')Object.assign(target,{text:source.characters,fontFamily:fontRegistry.resolve(source.style,source.characters,target.id),fontSize:source.style.fontSize,fontWeight:source.style.fontWeight,italic:source.style.fontStyle==='italic',textAutoResize:'NONE',lineHeight:metric(source.style.lineHeight,source.style.fontSize),letterSpacing:metric(source.style.letterSpacing,source.style.fontSize)||0,textAlignHorizontal:source.style.textAlignHorizontal||'LEFT',textAlignVertical:source.style.textAlignVertical||'TOP',textCase:source.style.textCase||'ORIGINAL',textDecoration:source.style.textDecoration||'NONE'});
    if(source.type==='TEXT' && source.runs?.length)target.styleRuns=source.runs.map(run=>({start:run.start,length:run.end-run.start,style:{fontFamily:fontRegistry.resolve(run.style,source.characters,target.id),fontWeight:run.style.fontWeight,italic:run.style.fontStyle==='italic',fontSize:run.style.fontSize,lineHeight:metric(run.style.lineHeight,run.style.fontSize),letterSpacing:metric(run.style.letterSpacing,run.style.fontSize)||0,textDecoration:run.style.textDecoration||'NONE',fills:run.fills.map(p=>paint(p,source.bounds.width,source.bounds.height))}}));
    if(source.type==='TEXT'){
      target.fontVariations=fontRegistry.variations(target);
      for(const run of target.styleRuns)run.style.fontVariations=fontRegistry.variations({...target,...run.style});
    }
    if(source.type==='TEXT' && source.textAutoResize)target.textAutoResize=source.textAutoResize;
    if(source.type==='TEXT' && source.fragments?.length) textFragments.set(target.id, source.fragments);
    if(source.type==='FRAME') {
      target.clipsContent=!!source.clipsContent;
      for(const child of source.children)yield* visit(child,target.id);
      const outputs=new Map(source.children.map((child,i)=>[child,graph.getNode(target.childIds[i])!]));
      if(useLayout(source)){const a=source.autoLayout!;Object.assign(target,{layoutMode:a.layoutMode,itemSpacing:a.itemSpacing,paddingTop:a.paddingTop,paddingRight:a.paddingRight,paddingBottom:a.paddingBottom,paddingLeft:a.paddingLeft,primaryAxisAlign:a.primaryAxisAlignItems||'MIN',counterAxisAlign:a.counterAxisAlignItems||'MIN',primaryAxisSizing:'FIXED',counterAxisSizing:'FIXED'});applyResponsiveSizing(source,target,outputs);}
      else if(!applyMeasuredLayout(source,target,graph) && source.autoLayout && source.autoLayout.layoutMode!=='NONE') warnings.add('Preserved measured positions for overlapping or irregular content: '+source.name);
      for (const child of source.children) if (child.type === 'TEXT' && child.textAutoResize === 'WIDTH_AND_HEIGHT') {
        // Cross-axis stretch wins over native auto-width in Figma and reintroduces
        // wrapping when the host's font metrics differ by a fraction of a pixel.
        const output = outputs.get(child)!;
        output.layoutAlignSelf = 'AUTO'; output.layoutGrow = 0;
      }
      // Figma sibling order is paint order. Move resolved overlays without changing
      // the sequence of normal Auto Layout children (including generated spacers).
      const paintRank = new Map(source.children.map(child => {
        const output = outputs.get(child)!;
        return [output.id, target.layoutMode === 'NONE' || output.layoutPositioning === 'ABSOLUTE'
          ? child.zIndex ?? (child.layoutPositioning === 'ABSOLUTE' ? .5 : 0) : 0];
      }));
      target.childIds.sort((a,b)=>(paintRank.get(a)??0)-(paintRank.get(b)??0));
    }
    if(source.type==='VECTOR')try{svgLayers(source.svgContent,target,graph,warnings);}catch{warnings.add('SVG could not be converted: '+source.name);}
    if(source.type==='IMAGE'||source.type==='UNSUPPORTED') {
      if(source.type==='IMAGE'&&source.objectFit==='NONE')warnings.add('Image object-fit:none uses a cover approximation: '+source.name);
      const url=source.type==='IMAGE'?source.dataUrl:source.fallbackImageUrl;
      target.clipsContent=true;
      try {
        if(!url)throw new Error('Missing image data');
        const bytes=dataBytes(url);
        if(/^data:image\/svg\+xml[;,]/i.test(url))svgLayers(new TextDecoder().decode(bytes),target,graph,warnings);
        else {const hash=computeImageHash(bytes);graph.images.set(hash,bytes);target.fills=[{...solid(),type:'IMAGE',imageHash:hash,imageScaleMode:source.type==='IMAGE'&&source.objectFit==='CONTAIN'?'FIT':source.type==='IMAGE'&&source.objectFit==='FILL'?'CROP':'FILL',imageTransform:{m00:1,m01:0,m02:0,m10:0,m11:1,m12:0}}];}
      }catch{target.fills=[solid({r:.8,g:.8,b:.82,a:1})];warnings.add('Missing image or unsupported element: '+source.name);}
    }
    return target;
  }
  const iterator=visit(doc.root,page.id);let step=iterator.next();
  while(!step.done){const wait=scheduler.checkpoint();if(wait)await wait;step=iterator.next();}
  const root=step.value, docGuid={sessionID:0,localID:0}, pageGuid={sessionID:0,localID:1}, blobs:Uint8Array[]=[];
  const changes=[makeDocumentNodeChange(docGuid),makeCanvasNodeChange(pageGuid,docGuid,'!','Web capture'),...await serializeCapture(root,pageGuid,graph,blobs,createTextRuntime(warnings,textFragments,node=>fontRegistry.face(node)),scheduler)];
  for (const change of changes) {
    if (change.type === 'TEXT' && change.textAutoResize === 'WIDTH_AND_HEIGHT') {
      // The serializer also materializes stretch inherited from the parent.
      // Native auto-width labels must remain intrinsic on both axes.
      delete change.stackChildAlignSelf; delete change.stackChildPrimaryGrow;
    }
    const fontNames=[change.fontName,...(change.textData?.styleOverrideTable||[]).map(style=>style.fontName),...(change.derivedTextData?.fontMetaData||[]).map(font=>font.key)];
    for(const name of fontNames)if(name?.style==='Regular Italic')name.style='Italic';
    // OpenPencil scene enum CROP differs from the binary schema STRETCH.
    for(const p of [...(change.fillPaints||[]),...(change.strokePaints||[])]) if(p.imageScaleMode === "CROP") p.imageScaleMode="STRETCH";
    if (change.type === 'TEXT' && change.textData?.characters.trim()) {
      const drawable = change.derivedTextData?.glyphs?.some(g => g.commandsBlob !== undefined && blobs[g.commandsBlob]?.length > 1);
      if (!drawable) throw new Error('Text could not be shaped for "' + change.name + '". Export stopped to avoid copying invisible text.');
    }
  }
  await scheduler.checkpoint(true);
  embedClipboardImages(changes,blobs,graph.images);
  const html=encodeFigmaClipboard(changes,blobs,Math.floor(Math.random()*0x7fffffff));
  await scheduler.checkpoint(true);
  return {html,warnings:[...warnings],stats:{layers:changes.filter(n=>n.type!=="DOCUMENT"&&n.type!=="CANVAS").length,text:changes.filter(n=>n.type==="TEXT").length,autoLayout:changes.filter(n=>n.stackMode==="HORIZONTAL"||n.stackMode==="VERTICAL").length}};
}

export async function copyNativeCapture(doc: SceneGraphDocument, options: NativeExportOptions = {}): Promise<Omit<NativeClipboardResult,"html">> {
  const result=await buildNativeClipboard(doc,options);
  if(options.signal?.aborted)throw new Error("Export cancelled. Your capture is still saved.");
  options.onClipboardWrite?.();
  await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([result.html],{type:'text/html'}),'text/plain':new Blob(['FrameForge: paste onto the Figma canvas'],{type:'text/plain'})})]);
  return {warnings:result.warnings,stats:result.stats};
}
