import { MAX_CAPTURED_FONTS, MAX_FONT_BYTES, MAX_TOTAL_FONT_BYTES } from './types.js';
// Reject malformed nested fields before they can reach Figma API setters.
export function preflightDocument(input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  let count = 0, textBytes = 0, assetBytes = 0;
  const fail = (path: string, message: string) => { if (errors.length < 20) errors.push(`${path}: ${message}`); };
  const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
  const number = (v: unknown, path: string, min = -1e6, max = 1e6) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(path, `expected finite number in ${min}…${max}`);
  };
  const enumeration = (v: unknown, values: string[], path: string) => { if (v !== undefined && !values.includes(v as string)) fail(path, "invalid value"); };
  const color = (c: unknown, path: string) => {
    if (!object(c)) { fail(path, "expected color"); return; }
    for (const key of ["r", "g", "b", "a"]) number(c[key], `${path}.${key}`, 0, 1);
  };
  const list = (v: unknown, path: string, visit: (item: any, path: string) => void) => {
    if (v === undefined) return;
    if (!Array.isArray(v) || v.length > 5000) { fail(path, "expected bounded array"); return; }
    for (let i = 0; i < v.length && errors.length < 20; i++) { if (!object(v[i])) fail(`${path}[${i}]`, "expected object"); else visit(v[i], `${path}[${i}]`); }
  };
  const paints = (v: unknown, path: string) => list(v, path, (p, pp) => {
    enumeration(p.type, ["SOLID", "GRADIENT_LINEAR", "GRADIENT_RADIAL"], `${pp}.type`);
    if (p.type === "SOLID") color(p.color, `${pp}.color`);
    else if (p.type === "GRADIENT_LINEAR" || p.type === "GRADIENT_RADIAL") {
      if(p.gradientTransform !== undefined){if(!object(p.gradientTransform))fail(pp,"expected gradient transform");else for(const key of ["m00","m01","m02","m10","m11","m12"])number(p.gradientTransform[key],pp+".gradientTransform."+key); }
      if(p.type==="GRADIENT_RADIAL"&&!p.gradientTransform)fail(pp,"radial gradient requires geometry");
      if(object(p.gradientTransform)){const t=p.gradientTransform;if(Math.abs(t.m00*t.m11-t.m01*t.m10)<1e-12)fail(pp,"singular gradient transform");}
      number(p.angleDegrees, `${pp}.angleDegrees`);
      if (!Array.isArray(p.stops) || p.stops.length < 2 || p.stops.length > 100) fail(`${pp}.stops`, "expected 2–100 stops");
      list(p.stops, `${pp}.stops`, (stop, sp) => { number(stop.position, `${sp}.position`, 0, 1); color(stop.color, `${sp}.color`); });
    } else fail(pp, "missing paint type");
    if (p.opacity !== undefined) number(p.opacity, `${pp}.opacity`, 0, 1);
  });
  if(input.fonts!==undefined){
    if(!Array.isArray(input.fonts)||input.fonts.length>MAX_CAPTURED_FONTS)fail('fonts','font count budget exceeded');
    else {let total=0;for(const [index,font] of input.fonts.entries()){
      const path='fonts['+index+']';if(!object(font)){fail(path,'expected font');continue;}
      if(typeof font.family!=='string'||!font.family.trim()||font.family.length>256)fail(path+'.family','invalid family');
      number(font.weightMin,path+'.weightMin',100,900);number(font.weightMax,path+'.weightMax',100,900);
      if(font.weightMin>font.weightMax)fail(path,'invalid weight range');
      enumeration(font.style,['normal','italic'],path+'.style');if(!font.style)fail(path,'missing style');
      if(typeof font.dataUrl!=='string'||font.dataUrl.length>Math.ceil(MAX_FONT_BYTES*4/3)+80||!/^data:font\/(?:woff2?|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(font.dataUrl))fail(path+'.dataUrl','invalid or oversized embedded font');
      else total+=font.dataUrl.length;
    }if(total>Math.ceil(MAX_TOTAL_FONT_BYTES*4/3)+MAX_CAPTURED_FONTS*80)fail('fonts','total font budget exceeded');}
  }
  const stack = [{ node: input.root, path: "root", depth: 0 }];
  const seen = new Set<unknown>();
  while (stack.length && errors.length < 20) {
    const { node, path, depth } = stack.pop()!;
    if (!object(node)) { fail(path, "expected node"); continue; }
    if (seen.has(node)) { fail(path, "cyclic or repeated node"); break; } seen.add(node);
    if (++count > 5000 || depth > 80) { fail(path, "node/depth budget exceeded"); break; }
    enumeration(node.type, ["FRAME", "TEXT", "RECTANGLE", "IMAGE", "VECTOR", "LINE", "UNSUPPORTED"], `${path}.type`);
    if (!node.type) fail(path, "missing node type");
    enumeration(node.layoutPositioning, ["AUTO", "ABSOLUTE"], path + ".layoutPositioning");
    if (node.zIndex !== undefined) number(node.zIndex, path + '.zIndex', -2147483648, 2147483647);
    if(node.sizing!==undefined){
      if(!object(node.sizing))fail(path+'.sizing','expected sizing object');
      else {
        for(const axis of ['horizontal','vertical'])enumeration(node.sizing[axis],['FILL','HUG','FIXED'],path+'.sizing.'+axis);
        for(const key of ['grow','minWidth','maxWidth','minHeight','maxHeight'])if(node.sizing[key]!==undefined)number(node.sizing[key],path+'.sizing.'+key,0,1e6);
      }
    }
    if (node.opacity !== undefined) number(node.opacity, `${path}.opacity`, 0, 1);
    if (node.bounds !== undefined) {
      if (!object(node.bounds)) fail(`${path}.bounds`, "expected bounds");
      else for (const key of ["x", "y", "width", "height"]) number(node.bounds[key], `${path}.bounds.${key}`, key === "width" || key === "height" ? 0 : -1e6, 1e6);
    }
    paints(node.fills, `${path}.fills`);
    list(node.strokes, `${path}.strokes`, (stroke, sp) => {
      color(stroke.color, `${sp}.color`); number(stroke.width, `${sp}.width`, 0, 10000);
      enumeration(stroke.alignment, ["INSIDE", "OUTSIDE", "CENTER"], `${sp}.alignment`);
    });
    list(node.effects, `${path}.effects`, (effect, ep) => {
      enumeration(effect.type, ["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"], `${ep}.type`);
      if (!effect.type) fail(ep, "missing effect type");
      number(effect.radius, `${ep}.radius`, 0, 10000);
      if (effect.type?.includes("SHADOW")) {
        color(effect.color, `${ep}.color`); number(effect.spread, `${ep}.spread`, -10000, 10000);
        if (!object(effect.offset)) fail(`${ep}.offset`, "expected offset");
        else { number(effect.offset.x, `${ep}.offset.x`); number(effect.offset.y, `${ep}.offset.y`); }
      }
    });
    if (node.cornerRadius !== undefined) {
      if (!object(node.cornerRadius)) fail(`${path}.cornerRadius`, "expected radii");
      else for (const key of ["topLeft", "topRight", "bottomRight", "bottomLeft"]) number(node.cornerRadius[key], `${path}.cornerRadius.${key}`, 0, 1e6);
    }
    if (node.autoLayout !== undefined) {
      const a = node.autoLayout;
      if (!object(a)) fail(`${path}.autoLayout`, "expected layout");
      else {
        enumeration(a.layoutMode, ["NONE", "HORIZONTAL", "VERTICAL"], `${path}.autoLayout.layoutMode`);
        if (!a.layoutMode) fail(path, "missing layout mode");
        for (const key of ["itemSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) number(a[key], `${path}.autoLayout.${key}`, key === "itemSpacing" ? -10000 : 0, 10000);
        enumeration(a.primaryAxisAlignItems, ["MIN", "MAX", "CENTER", "SPACE_BETWEEN"], `${path}.autoLayout.primaryAxisAlignItems`);
        enumeration(a.counterAxisAlignItems, ["MIN", "MAX", "CENTER", "BASELINE"], `${path}.autoLayout.counterAxisAlignItems`);
        enumeration(a.layoutWrap, ["WRAP", "NO_WRAP"], `${path}.autoLayout.layoutWrap`);
        for (const key of ["primaryAxisSizingMode", "counterAxisSizingMode"]) enumeration(a[key], ["FIXED", "AUTO"], `${path}.autoLayout.${key}`);
      }
    }
    if (node.type === "TEXT") {
      enumeration(node.textAutoResize, ['HEIGHT', 'WIDTH_AND_HEIGHT'], path + '.textAutoResize');
      if (typeof node.characters !== "string") fail(`${path}.characters`, "expected text");
      else textBytes += node.characters.length * 2;
      if (node.fragments !== undefined) {
        let lastEnd = 0;
        list(node.fragments, path + '.fragments', (fragment, fp) => {
          number(fragment.start, fp + '.start', 0, node.characters?.length ?? 0);
          number(fragment.end, fp + '.end', 0, node.characters?.length ?? 0);
          if (!Number.isInteger(fragment.start) || !Number.isInteger(fragment.end) || fragment.start < lastEnd || fragment.end <= fragment.start) fail(fp, 'expected ordered, non-overlapping character ranges');
          lastEnd = fragment.end;
          if (!object(fragment.bounds)) fail(fp + '.bounds', 'expected fragment bounds');
          else for (const key of ['x', 'y', 'width', 'height']) number(fragment.bounds[key], fp + '.bounds.' + key, key === 'width' || key === 'height' ? 0 : -1e6, 1e6);
        });
      }
      if(node.runs!==undefined){let lastEnd=0;list(node.runs,path+'.runs',(run,rp)=>{
        number(run.start,rp+'.start',0,node.characters?.length??0);number(run.end,rp+'.end',0,node.characters?.length??0);
        if(!Number.isInteger(run.start)||!Number.isInteger(run.end)||run.start<lastEnd||run.end<=run.start)fail(rp,'expected ordered text runs');lastEnd=run.end;
        stack.push({node:{type:'TEXT',characters:typeof node.characters==='string'?node.characters.slice(run.start,run.end):'',style:run.style,fills:run.fills},path:rp,depth:depth+1});
      });}
      const style = node.style;
      if (!object(style)) fail(`${path}.style`, "expected typography");
      else {
        if (typeof style.fontFamily !== "string" || !style.fontFamily || style.fontFamily.length > 256) fail(`${path}.style.fontFamily`, "invalid font family");
        number(style.fontSize, `${path}.style.fontSize`, 1, 10000); number(style.fontWeight, `${path}.style.fontWeight`, 100, 900);
        enumeration(style.fontStyle, ["normal", "italic"], `${path}.style.fontStyle`);
        enumeration(style.textAlignHorizontal, ["LEFT", "RIGHT", "CENTER", "JUSTIFIED"], `${path}.style.textAlignHorizontal`);
        enumeration(style.textAlignVertical, ["TOP", "CENTER", "BOTTOM"], `${path}.style.textAlignVertical`);
        enumeration(style.textDecoration, ["NONE", "UNDERLINE", "STRIKETHROUGH"], `${path}.style.textDecoration`);
        enumeration(style.textCase, ["ORIGINAL", "UPPER", "LOWER", "TITLE"], `${path}.style.textCase`);
        for (const key of ["lineHeight", "letterSpacing"]) if (style[key] !== undefined) {
          if (!object(style[key])) fail(`${path}.style.${key}`, "expected metric");
          else { enumeration(style[key].unit, ["PIXELS", "PERCENT"], `${path}.style.${key}.unit`); if (!style[key].unit) fail(path, "missing metric unit"); number(style[key].value, `${path}.style.${key}.value`, key === "lineHeight" ? 0 : -10000, 10000); }
        }
      }
    }
    for (const key of ["dataUrl", "svgContent", "fallbackImageUrl"]) if (node[key] !== undefined) {
      if (typeof node[key] !== "string") fail(`${path}.${key}`, "expected string");
      else assetBytes += node[key].length * 2;
    }
    if (assetBytes > 24 * 1024 * 1024 || textBytes > 2 * 1024 * 1024) { fail(path, "asset/text budget exceeded"); break; }
    if (node.type === "FRAME" && node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.length > 5000) fail(`${path}.children`, "expected bounded children array");
      else node.children.forEach((child: unknown, i: number) => stack.push({ node: child, path: `${path}.children[${i}]`, depth: depth + 1 }));
    }
  }
  return errors;
}
