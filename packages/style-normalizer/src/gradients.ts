import { converter, interpolateWithPremultipliedAlpha } from 'culori';
const validColor=converter('rgb');
import type { LinearGradientPaint, RGBAColor } from '@frameforge/scene-graph';
import { parseColor } from './color.js';

export interface GradientSize { width: number; height: number }
export function splitCssLayers(value: string): string[] {
  const result: string[] = []; let depth=0, start=0, quote='';
  for(let i=0;i<value.length;i++) {
    const c=value[i];
    if(quote){if(c===quote && value[i-1]!== '\\')quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='(')depth++; else if(c===')')depth--;
    else if(c===',' && depth===0){result.push(value.slice(start,i).trim());start=i+1;}
  }
  result.push(value.slice(start).trim());return result.filter(Boolean);
}
function tokens(value:string):string[]{
  return value.match(/(?:[^\s(]+\([^)]*\)|[^\s]+)/g)||[];
}
function length(value:string, reference:number):number|undefined {
  if(!/^-?(?:\d*\.)?\d+(?:%|px)?$/.test(value))return undefined;
  return parseFloat(value)/(value.endsWith('%')?100:reference);
}
function stops(parts:string[], reference:number, mode?:string):LinearGradientPaint['stops']|undefined {
  const raw:{position:number|undefined;color:RGBAColor;css:string}[]=[];
  for(const part of parts){
    const [color,...positions]=tokens(part);
    // Standalone interpolation hints cannot be represented by ordinary Figma stops.
    if(!color || !validColor(color) || length(color,reference)!==undefined || positions.length>2)return undefined;
    const parsed=parseColor(color);
    if(!positions.length)raw.push({position:undefined,color:parsed,css:color});
    else for(const token of positions){const position=length(token,reference);if(position===undefined)return undefined;raw.push({position,color:parsed,css:color});}
  }
  if(raw.length<2 || raw.length>100)return undefined;
  raw[0].position??=0;raw.at(-1)!.position??=1;
  // CSS fix-up: constrain explicit positions, then distribute each omitted run between its neighbours.
  let previous=raw[0].position!;
  for(const stop of raw)if(stop.position!==undefined){stop.position=Math.max(previous,stop.position);previous=stop.position;}
  for(let i=0;i<raw.length-1;i++)if(raw[i+1].position===undefined){let end=i+1;while(raw[end].position===undefined)end++;for(let j=i+1;j<end;j++)raw[j].position=raw[i].position!+(raw[end].position!-raw[i].position!)*(j-i)/(end-i);i=end-1;}
  const interpolation=mode || (raw.some(s=>/^(?:oklab|oklch|lab|lch|color)\(/.test(s.css))?'oklab':'rgb');
  const sampled=interpolation!=='rgb'||raw.some((s,i)=>i>0&&s.color.a!==raw[i-1].color.a);
  if(!sampled)return raw.map(s=>({position:s.position!,color:s.color}));
  if(raw.length>40)return undefined;
  const result:LinearGradientPaint['stops']=[],steps=Math.min(16,Math.max(1,Math.floor((100-raw.length*2)/(raw.length-1))));
  const rgb=converter('rgb'),clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
  for(let i=0;i<raw.length-1;i++){
    const a=raw[i],b=raw[i+1],interpolate=interpolateWithPremultipliedAlpha([a.css,b.css],interpolation);
    for(let j=0;j<=steps;j++){
      const t=j/steps,alpha=a.color.a+(b.color.a-a.color.a)*t;
      // A zero-alpha endpoint's RGB is undefined in premultiplied space. Carry the adjacent hue.
      const c=rgb(interpolate(alpha===0?(t===0?.000001:.999999):t))!;
      result.push({position:a.position!+(b.position!-a.position!)*t,color:{r:clamp(c.r),g:clamp(c.g),b:clamp(c.b),a:alpha}});
    }
  }
  return result;
}
function normalize(paint:LinearGradientPaint):LinearGradientPaint {
  const lo=Math.min(0,paint.stops[0].position),hi=Math.max(1,paint.stops.at(-1)!.position),span=hi-lo;
  const t=paint.gradientTransform!;
  if(lo!==0||hi!==1){
    // Linear t'= (t-lo)/(hi-lo). Radial extension is handled by callers rejecting negative radii.
    t.m00/=span;t.m01/=span;t.m02=(t.m02-lo)/span;
    paint.stops=paint.stops.map(s=>({...s,position:(s.position-lo)/span}));
  }
  return paint;
}
function angle(value:string,size:GradientSize):number|undefined {
  const unit=value.match(/^(-?(?:\d*\.)?\d+)(deg|turn|grad|rad)$/);
  if(unit)return Number(unit[1])*({deg:1,turn:360,grad:.9,rad:180/Math.PI}[unit[2]]!);
  if(!value.startsWith('to '))return undefined;
  const words=value.slice(3).split(/\s+/);if(words.some(w=>!['left','right','top','bottom'].includes(w)))return undefined;
  const x=words.includes('right')?1:words.includes('left')?-1:0,y=words.includes('bottom')?1:words.includes('top')?-1:0;
  if(!x&&!y)return undefined;
  // CSS corner directions make the gradient line perpendicular to the corner's diagonal.
  return Math.atan2(x*(y?size.height:1),-y*(x?size.width:1))*180/Math.PI;
}
function interpolation(parts:string[]):string|undefined {
  if(!/\bin\s/.test(parts[0]))return undefined;
  const match=parts[0].match(/(?:^|\s)in (srgb-linear|srgb|oklab|lab)$/);
  if(!match)return 'unsupported';
  parts[0]=parts[0].slice(0,match.index).trim();if(!parts[0])parts.shift();
  return {srgb:'rgb','srgb-linear':'lrgb',oklab:'oklab',lab:'lab'}[match[1]];
}
export function parseLinearGradient(value:string,size:GradientSize={width:100,height:100}):LinearGradientPaint|undefined {
  const match=value.trim().match(/^linear-gradient\((.*)\)$/i);if(!match)return undefined;
  const parts=splitCssLayers(match[1]), mode=interpolation(parts);if(mode==='unsupported'||!parts.length)return undefined;
  const direction=angle(parts[0].toLowerCase(),size);
  const angleDegrees=direction??180;if(direction!==undefined)parts.shift();
  if(parts.some(p=>/\bin (?:oklab|oklch|srgb|hsl|lab|lch)\b/.test(p)))return undefined;
  const w=Math.max(.01,size.width),h=Math.max(.01,size.height),rad=angleDegrees*Math.PI/180,dx=Math.sin(rad),dy=-Math.cos(rad);
  const line=Math.abs(w*dx)+Math.abs(h*dy),parsed=stops(parts,line,mode);if(!parsed)return undefined;
  const m00=w*dx/line,m01=h*dy/line;
  return normalize({type:'GRADIENT_LINEAR',angleDegrees,stops:parsed,visible:true,gradientTransform:{m00,m01,m02:.5-(m00+m01)/2,m10:-w*dy/line,m11:h*dx/line,m12:.5-(-w*dy+h*dx)/line/2}});
}
export function parseRadialGradient(value:string,size:GradientSize={width:100,height:100}):LinearGradientPaint|undefined {
  const match=value.trim().match(/^radial-gradient\((.*)\)$/i);if(!match)return undefined;
  const parts=splitCssLayers(match[1]),mode=interpolation(parts);if(mode==='unsupported'||!parts.length)return undefined;let header='';
  if(/^(circle|ellipse|closest-|farthest-|at\b|[-.\d])/.test(parts[0]))header=parts.shift()!;
  const [shapePart,positionPart]=header.split(/\s*\bat\b\s*/);const shape=tokens(shapePart||'');
  const w=Math.max(.01,size.width),h=Math.max(.01,size.height);
  const position=(positionPart||'center center').split(/\s+/);
  if(position.length>2)return undefined;
  if(position.length===1)position.push('center');
  if(['top','bottom'].includes(position[0])||['left','right'].includes(position[1]))position.reverse();
  const axis=(v:string,ref:number)=>v==='center'?.5:['left','top'].includes(v)?0:['right','bottom'].includes(v)?1:length(v,ref);
  const cx=axis(position[0],w),cy=axis(position[1],h);if(cx===undefined||cy===undefined)return undefined;
  const circle=shape.includes('circle'), keyword=shape.find(t=>/^(closest|farthest)-(side|corner)$/.test(t))||'farthest-corner';
  if(shape.some(t=>!['circle','ellipse',keyword].includes(t)&&length(t,w)===undefined))return undefined;
  const xs=[Math.abs(cx*w),Math.abs((1-cx)*w)],ys=[Math.abs(cy*h),Math.abs((1-cy)*h)],closest=keyword.startsWith('closest');
  const x=closest?Math.min(...xs):Math.max(...xs),y=closest?Math.min(...ys):Math.max(...ys);
  let rx=x,ry=y;
  if(circle){rx=ry=keyword.endsWith('corner')?Math.hypot(x,y):closest?Math.min(x,y):Math.max(x,y);}
  else if(keyword.endsWith('corner')){rx*=Math.SQRT2;ry*=Math.SQRT2;}
  const explicit=shape.filter(t=>length(t,w)!==undefined);
  if(explicit.length){if(circle&&explicit[0].endsWith('%'))return undefined;rx=length(explicit[0],w)!*w;ry=circle?rx:explicit[1]?length(explicit[1],h)!*h:NaN;}
  if(!(rx>0&&ry>0))return undefined;
  const parsed=stops(parts,rx,mode);if(!parsed||parsed.some(s=>s.position<0||s.position>1))return undefined;
  return {type:'GRADIENT_RADIAL',angleDegrees:0,stops:parsed,visible:true,gradientTransform:{m00:w/(2*rx),m01:0,m02:.5-cx*w/(2*rx),m10:0,m11:h/(2*ry),m12:.5-cy*h/(2*ry)}};
}
