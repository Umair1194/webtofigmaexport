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
  const radius = (value: string) => value.includes("%") ? Math.max(0, parseFloat(value) / 100 * (referenceSize ? Math.min(referenceSize.width, referenceSize.height) : 100)) : Math.max(0, parsePx(value));
  if (individual && (individual.tl || individual.tr || individual.br || individual.bl)) {
    const tl = radius(individual.tl || "0");
    const tr = radius(individual.tr || "0");
    const br = radius(individual.br || "0");
    const bl = radius(individual.bl || "0");
    const isUniform = tl === tr && tr === br && br === bl;
    if (tl === 0 && tr === 0 && br === 0 && bl === 0) return undefined;
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl, isUniform };
  }

  if (!radiusStr || radiusStr === "0px" || radiusStr === "0") {
    return undefined;
  }

  const parts = radiusStr.split("/")[0].trim().split(/\s+/).map(radius);
  if (parts.length === 1) {
    const r = parts[0];
    if (r === 0) return undefined;
    return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r, isUniform: true };
  }
  if (parts.length === 2) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[0], bottomLeft: parts[1], isUniform: false };
  }
  if (parts.length === 3) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[1], isUniform: false };
  }
  if (parts.length >= 4) {
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[3], isUniform: false };
  }

  return undefined;
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
