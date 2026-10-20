import type { Fill } from '@open-pencil/scene-graph';
import { ellipticalGradientTransform, linearGradientTransformFromAxes } from '@open-pencil/scene-graph/gradient';
import { parseColor } from '@frameforge/style-normalizer';
import svgpath from 'svgpath';
type Point={x:number;y:number};
type Box={x:number;y:number;width:number;height:number};
const documentIds=new WeakMap<Document,Map<string,Element>>();
const property=(el:Element,key:string,fallback='')=>el.getAttribute(key)||(el as SVGElement).style?.getPropertyValue(key)||fallback;
function move(x:number,y:number,tx:string):Point {
  let point={x,y};svgpath(`M${x} ${y}`).transform(tx).abs().iterate(segment=>{if(segment[0]==='M')point={x:segment[1],y:segment[2]};});return point;
}
/** Geometry bounds are supplied by getBBox at capture time; standalone SVG curves use sampled bounds. */
export function localSvgBounds(el:Element,d:string):Box {
  const saved=(el.getAttribute('data-frameforge-bounds')||'').split(',').map(Number);
  if(saved.length===4&&saved.every(Number.isFinite))return {x:saved[0],y:saved[1],width:saved[2],height:saved[3]};
  const points:Point[]=[];let start={x:0,y:0};
  svgpath(d).abs().unshort().unarc().iterate((seg,_i,x,y)=>{
    const v=seg.slice(1) as number[];
    if(seg[0]==='M'){start={x:v[0],y:v[1]};points.push(start);}
    if(seg[0]==='L')points.push({x:v[0],y:v[1]});
    if(seg[0]==='H')points.push({x:v[0],y});
    if(seg[0]==='V')points.push({x,y:v[0]});
    if(seg[0]==='Z')points.push(start);
    if(seg[0]==='C'||seg[0]==='Q')for(let i=0;i<=32;i++){const t=i/32,u=1-t;
      points.push(seg[0]==='C'?{x:u*u*u*x+3*u*u*t*v[0]+3*u*t*t*v[2]+t*t*t*v[4],y:u*u*u*y+3*u*u*t*v[1]+3*u*t*t*v[3]+t*t*t*v[5]}:{x:u*u*x+2*u*t*v[0]+t*t*v[2],y:u*u*y+2*u*t*v[1]+t*t*v[3]});
    }
  });
  if(!points.length)return {x:0,y:0,width:0,height:0};
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
export function resolveSvgGradient(value:string,doc:Document,box:Box,project:(p:Point)=>Point,viewport:{width:number;height:number},opacity:number,warnings:Set<string>):Fill|undefined {
  const ref=value.match(/^url\(["']?[^)]*#([^"')]+)["']?\)/);if(!ref)return;
  let ids=documentIds.get(doc);if(!ids){ids=new Map(Array.from(doc.querySelectorAll('[id]')).map(el=>[el.id||el.getAttribute('id')!,el]));documentIds.set(doc,ids);}
  let gradient=ids.get(ref[1]);if(!gradient||!['linearGradient','radialGradient'].includes(gradient.localName)){warnings.add('Unresolved SVG paint reference: '+ref[1]);return;}
  const chain:Element[]=[];const seen=new Set<Element>();
  while(gradient&&!seen.has(gradient)&&chain.length<8){chain.push(gradient);seen.add(gradient);const href:string|null=gradient.getAttribute('href')||gradient.getAttribute('xlink:href');gradient=href?.startsWith('#')?ids.get(href.slice(1)):undefined;}
  const attr=(key:string,fallback:string)=>chain.map(el=>property(el,key)).find(Boolean)||fallback;
  if(attr('spreadMethod','pad')!=='pad'){warnings.add('Repeating SVG gradients require adjustment.');return;}
  const stopElements=chain.map(el=>Array.from(el.children).filter(c=>c.localName==='stop')).find(stops=>stops.length)||[];
  if(stopElements.length>100){warnings.add('SVG gradient exceeds 100 stops.');return;}
  let last=0;const stops=stopElements.map(el=>{const raw=property(el,'offset','0'),n=parseFloat(raw)/(raw.endsWith('%')?100:1);last=Math.max(last,Math.min(1,Number.isFinite(n)?n:0));const color=parseColor(property(el,'stop-color','black'));color.a*=Math.max(0,Math.min(1,parseFloat(property(el,'stop-opacity','1'))||0));return {position:last,color};});
  if(!stops.length){warnings.add('SVG gradient has no stops.');return;}
  if(stops.length===1)stops.push({...stops[0],position:1});
  const object=attr('gradientUnits','objectBoundingBox')!=='userSpaceOnUse',tx=attr('gradientTransform','');
  const coord=(key:string,fallback:string,axis:'x'|'y')=>{const raw=attr(key,fallback);return parseFloat(raw)/(raw.endsWith('%')?100:1)*(raw.endsWith('%')&&!object?(axis==='x'?viewport.width:viewport.height):1);};
  const map=(x:number,y:number)=>{const p=move(x,y,tx);return project(object?{x:box.x+p.x*box.width,y:box.y+p.y*box.height}:p);};
  let transform;const type=chain[0].localName==='linearGradient'?'GRADIENT_LINEAR':'GRADIENT_RADIAL';
  if(type==='GRADIENT_LINEAR'){
    const x1=coord('x1','0%','x'),y1=coord('y1','0%','y'),x2=coord('x2','100%','x'),y2=coord('y2','0%','y');
    const a=map(x1,y1),b=map(x2,y2),c=map(x1-(y2-y1),y1+(x2-x1));
    transform=linearGradientTransformFromAxes(a,b,{x:c.x-a.x,y:c.y-a.y});
  }else{
    const x=coord('cx','50%','x'),y=coord('cy','50%','y');
    const raw=attr('r','50%'),r=parseFloat(raw)/(raw.endsWith('%')?100:1)*(raw.endsWith('%')&&!object?Math.hypot(viewport.width,viewport.height)/Math.SQRT2:1);
    if(attr('fx',attr('cx','50%'))!==attr('cx','50%')||attr('fy',attr('cy','50%'))!==attr('cy','50%'))warnings.add('SVG focal gradient is approximated with a centred ellipse.');
    transform=ellipticalGradientTransform(map(x,y),map(x+r,y),map(x,y+r));
  }
  return {type,color:{r:0,g:0,b:0,a:1},opacity,visible:true,gradientStops:stops,gradientTransform:transform};
}
