import { parseLinearGradient, parseRadialGradient, splitCssLayers, type GradientSize } from './gradients.js';
import {
  CornerRadius,
  RGBAColor,
  Paint,
  ShadowEffect,
  StrokeStyle,
} from "@frameforge/scene-graph";
import { parseColor } from "./color.js";

export function parsePx(val: string): number {
  if (!val) return 0;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : 0;
}

export function parseCornerRadius(
  radiusStr: string,
  individual?: { tl?: string; tr?: string; br?: string; bl?: string },
  referenceSize?: { width: number; height: number }
): CornerRadius | undefined {
  const extent = referenceSize ? Math.max(0, Math.min(referenceSize.width, referenceSize.height)) : 100;
  const radius = (value: string) => {
    // Chromium can serialize a fully rounded CSS radius as an enormous px value.
    // Handle the common computed infinity expression without leaking NaN/Infinity.
    if (/^calc\(\s*infinity\s*\*\s*1px\s*\)$/i.test(value.trim())) return 1e150;
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    const result = value.includes("%") ? parsed / 100 * extent : parsed;
    return Number.isFinite(result) ? Math.min(1e150, Math.max(0, result)) : 0;
  };
  let values: number[];
  if (individual && (individual.tl || individual.tr || individual.br || individual.bl)) {
    values = [individual.tl, individual.tr, individual.br, individual.bl].map(value => radius(value || "0"));
  } else {
    if (!radiusStr || radiusStr === "0px" || radiusStr === "0") return;
    // Keep a computed calc() value together when expanding CSS shorthand.
    const parts = (radiusStr.split("/")[0].trim().match(/calc\([^)]*\)|[^\s]+/g) || []).map(radius);
    if (!parts.length) return;
    values = [parts[0], parts[1] ?? parts[0], parts[2] ?? parts[0], parts[3] ?? parts[1] ?? parts[0]];
  }
  let [tl, tr, br, bl] = values;
  if (referenceSize && Number.isFinite(referenceSize.width) && Number.isFinite(referenceSize.height)) {
    const width = Math.max(0, referenceSize.width), height = Math.max(0, referenceSize.height);
    // CSS scales all adjacent circular corners by one shared factor to prevent overlap.
    const ratio = (size: number, sum: number) => sum > 0 ? size / sum : 1;
    const scale = Math.min(1, ratio(width, tl + tr), ratio(width, bl + br), ratio(height, tl + bl), ratio(height, tr + br));
    [tl, tr, br, bl] = values.map(value => value * scale);
  }
  // Standalone calls without element dimensions still obey the scene contract.
  [tl, tr, br, bl] = [tl, tr, br, bl].map(value => Math.min(1e6, value));
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) return;
  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl, isUniform: tl === tr && tr === br && br === bl };
}

export function parseBorders(
  computedStyle: CSSStyleDeclaration | Record<string, string>
): StrokeStyle[] | undefined {
  const strokes: StrokeStyle[] = [];
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
    const record = computedStyle as Record<string, string>;
    const width = parsePx(record["border" + side + "Width"] || computedStyle.borderWidth || "0");
    const style = record["border" + side + "Style"] || computedStyle.borderStyle || "none";
    const color = parseColor(record["border" + side + "Color"] || computedStyle.borderColor || "transparent");
    if (width > 0 && style !== "none" && style !== "hidden" && color.a > 0) strokes.push({ side: side.toUpperCase() as StrokeStyle["side"], color, width, alignment: "INSIDE", style: style === "dashed" ? "dashed" : style === "dotted" ? "dotted" : "solid" });
  }
  return strokes.length ? strokes : undefined;
}

export function parseBackgroundImageUrl(bgImageStr: string): string | undefined {
  if (!bgImageStr || bgImageStr === "none" || !bgImageStr.includes("url(")) {
    return undefined;
  }
  const match = bgImageStr.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
  return match ? match[1] : undefined;
}

export { parseLinearGradient } from './gradients.js';
export function parseFills(computedStyle: CSSStyleDeclaration | Record<string,string>, size?: GradientSize): Paint[] {
  const fills: Paint[]=[];
  for(const layer of splitCssLayers(computedStyle.backgroundImage || '')) {
    const gradient=parseLinearGradient(layer,size) || parseRadialGradient(layer,size);
    if(gradient)fills.push(gradient);
  }
  const color=parseColor(computedStyle.backgroundColor || 'transparent');
  if(color.a>0)fills.push({type:'SOLID',color,opacity:color.a,visible:true});
  return fills;
}

export function parseBoxShadows(shadowStr: string): ShadowEffect[] {
  if (!shadowStr || shadowStr === "none") return [];

  const effects:ShadowEffect[]=[];
  for(const shadow of splitCssLayers(shadowStr)){
    // Whitespace inside colour functions belongs to the colour, never the shadow geometry.
    const tokens:string[]=[];let depth=0,start=0;
    for(let i=0;i<=shadow.length;i++){const c=shadow[i];if(c==='(')depth++;if(c===')')depth--;if(i===shadow.length||(/\s/.test(c)&&depth===0)){const token=shadow.slice(start,i).trim();if(token)tokens.push(token);start=i+1;}}
    const inset=tokens.includes('inset'),parts=tokens.filter(t=>t!=='inset');
    const isLength=(t:string)=>/^-?(?:\d*\.)?\d+(?:px)?$/.test(t);
    const lengths=parts.filter(isLength).map(Number.parseFloat),colors=parts.filter(t=>!isLength(t));
    if(lengths.length<2||lengths.length>4||colors.length>1||lengths[2]<0)continue;
    const color=parseColor(colors[0]||'black');
    if(color.a===0)continue;
    effects.push({type:inset?'INNER_SHADOW':'DROP_SHADOW',color,offset:{x:lengths[0],y:lengths[1]},radius:lengths[2]||0,spread:lengths[3]||0,visible:true});
  }
  return effects;
}
