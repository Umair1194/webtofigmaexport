import type { TextFragment } from "@frameforge/scene-graph";
import { create, type Font, type Glyph } from 'fontkit';
import { Buffer } from 'buffer';
import type { SceneNode } from '@open-pencil/scene-graph';
import type { FigNodeChangeExportRuntime, OutlineCommand, ShapedText } from '@open-pencil/fig/node-change';
import { fontFaces } from "./font-faces.js";

const faces = new Map<string, Font>();
function face(node: SceneNode): Font {
  const weight=Math.max(100,Math.min(900,Math.round(node.fontWeight/100)*100));
  const key = `${weight}:${node.italic}`;
  let font = faces.get(key);
  if (!font) {
    font = create(Buffer.from(fontFaces[weight+':'+node.italic])) as Font;
    faces.set(key, font);
  }
  return font;
}

function outline(glyph: Glyph, scale: number): OutlineCommand[] {
  return glyph.path.commands.map(({ command, args: a }) => {
    // Font outlines use upward-positive Y; the serializer takes browser coordinates.
    switch (command) {
      case 'moveTo': return { type: 'M', x: a[0] * scale, y: -a[1] * scale };
      case 'lineTo': return { type: 'L', x: a[0] * scale, y: -a[1] * scale };
      case 'quadraticCurveTo': return { type: 'Q', x1: a[0] * scale, y1: -a[1] * scale, x: a[2] * scale, y: -a[3] * scale };
      case 'bezierCurveTo': return { type: 'C', x1: a[0] * scale, y1: -a[1] * scale, x2: a[2] * scale, y2: -a[3] * scale, x: a[4] * scale, y: -a[5] * scale };
      case 'closePath': return { type: 'Z' };
    }
  });
}

/** Shape real glyphs on TEXT nodes, without flattening them into VECTOR layers. */
export function createTextRuntime(warnings: Set<string>, measured = new Map<string, TextFragment[]>()): FigNodeChangeExportRuntime {
  // Cache only within this export. Bound text and outline retention on large/unique pages.
  const layouts = new Map<Font, Map<string, ReturnType<Font['layout']>>>();
  const outlines = new WeakMap<Glyph, Map<number, OutlineCommand[]>>();
  let layoutEntries = 0, layoutCharacters = 0, outlineEntries = 0, outlineCommands = 0;
  const features = { liga: true, kern: true };
  const layout = (font: Font, value: string) => {
    const cached = layouts.get(font)?.get(value);
    if (cached) return cached;
    const result = font.layout(value, features);
    if (layoutEntries < 256 && value.length <= 512 && layoutCharacters + value.length <= 32768) {
      let entries = layouts.get(font); if (!entries) layouts.set(font, entries = new Map());
      entries.set(value, result); layoutEntries++; layoutCharacters += value.length;
    }
    return result;
  };
  const glyphOutline = (glyph: Glyph, scale: number) => {
    const cached = outlines.get(glyph)?.get(scale);
    if (cached) return cached;
    const result = outline(glyph, scale);
    if (outlineEntries < 1024 && outlineCommands + result.length <= 40000) {
      let entries = outlines.get(glyph); if (!entries) outlines.set(glyph, entries = new Map());
      entries.set(scale, result); outlineEntries++; outlineCommands += result.length;
    }
    return result;
  };
  return {
    shapeText(node): ShapedText {
      const font = face(node), scale = node.fontSize / font.unitsPerEm;
      const lineHeight = node.lineHeight ?? (font.ascent - font.descent + font.lineGap) * scale;
      const text = node.textCase === 'UPPER' ? node.text.toUpperCase() : node.textCase === 'LOWER' ? node.text.toLowerCase() : node.textCase === 'TITLE' ? node.text.replace(/\b\p{L}/gu, c => c.toUpperCase()) : node.text;
      const widthOf = (value: string, current=node) => {
        const f=face(current),sc=current.fontSize/f.unitsPerEm, run = layout(f, value);
        return run.advanceWidth * sc + Math.max(0, run.glyphs.length - 1) * current.letterSpacing;
      };
      // Line records keep UTF-16 character offsets, including spaces and explicit newlines.
      const fragments = text.length === node.text.length ? measured.get(node.id) : undefined;
      const lines: { text: string; start: number; bounds?: TextFragment['bounds'] }[] = fragments?.map(fragment => ({ text: text.slice(fragment.start, fragment.end), start: fragment.start, bounds: fragment.bounds })) ?? [];
      // Legacy captures have no per-line geometry. Never invent an extra wrapped line
      // in a measured one-line box; fitting width is safer than overlapping the next layer.
      const capacity = Math.max(1, Math.round(node.height / lineHeight));
      if (!fragments?.length) warnings.add('Some text uses approximate line positions (legacy capture or generated/form text). Recapture ordinary page text for accurate inline wrapping.');
      let paragraphStart = 0;
      if (!fragments?.length) for (const paragraph of text.split('\n')) {
        let start = 0, line = '';
        for (const token of paragraph.match(/\s+|\S+/gu) || []) {
          if (line.trim() && token.trim() && lines.length < capacity - 1 && widthOf(line + token) > node.width + 1) {
            lines.push({ text: line, start: paragraphStart + start });
            start += line.length; line = token;
          } else line += token;
        }
        lines.push({ text: line, start: paragraphStart + start });
        paragraphStart += paragraph.length + 1;
      }
      const blockHeight = lines.length * lineHeight;
      const top = node.textAlignVertical === 'CENTER' ? (node.height - blockHeight) / 2 : node.textAlignVertical === 'BOTTOM' ? node.height - blockHeight : 0;
      const ascent = font.ascent * scale;
      const firstBaseline = top + (lineHeight - (font.ascent - font.descent) * scale) / 2 + ascent;
      const glyphs: ShapedText['glyphs'] = [], baselines: ShapedText['baselines'] = [];
      const offsets = new Array<number>(node.text.length).fill(0);
      lines.forEach((line, lineIndex) => {
        const styled={...node,...node.styleRuns.find(run=>line.start>=run.start&&line.start<run.start+run.length)?.style};
        const font=face(styled),scale=styled.fontSize/font.unitsPerEm,ascent=font.ascent*scale;
        const lineHeight=styled.lineHeight??(font.ascent-font.descent+font.lineGap)*scale;
        const run = layout(font, line.text), width = widthOf(line.text,styled);
        const horizontalScale = line.bounds ? (width > 0 ? line.bounds.width / width : 1) : Math.min(1, node.width / (width || 1));
        const drawnWidth = width * horizontalScale;
        let x = line.bounds?.x ?? (node.textAlignHorizontal === 'CENTER' ? (node.width - drawnWidth) / 2 : node.textAlignHorizontal === 'RIGHT' ? node.width - drawnWidth : 0);
        const baselineY = line.bounds ? line.bounds.y + (line.bounds.height - (font.ascent - font.descent) * scale) / 2 + ascent : firstBaseline + lineIndex * lineHeight;
        const left = x;
        let character = line.start;
        run.glyphs.forEach((glyph, index) => {
          const p = run.positions[index], advance = (p.xAdvance * scale + (index < run.glyphs.length - 1 ? styled.letterSpacing : 0)) * horizontalScale;
          const charLength = Math.max(1, glyph.codePoints.reduce((n, cp) => n + (cp > 0xffff ? 2 : 1), 0));
          if (glyph.id === 0) warnings.add('Some characters are unavailable in the bundled font: ' + node.name);
          const commands = glyphOutline(glyph, scale).map(command => ({ ...command, ...(command.x === undefined ? {} : { x: command.x * horizontalScale }), ...(command.x1 === undefined ? {} : { x1: command.x1 * horizontalScale }), ...(command.x2 === undefined ? {} : { x2: command.x2 * horizontalScale }) }));
          glyphs.push({ commands, x: x + p.xOffset * scale * horizontalScale, y: baselineY - p.yOffset * scale, fontSize: styled.fontSize, firstCharacter: character, advance });
          for (let j = 0; j < charLength && character + j < offsets.length; j++) offsets[character + j] = x - left;
          character += charLength; x += advance;
        });
        baselines.push({ firstCharacter: line.start, endCharacter: line.start + line.text.length, position: { x: left, y: baselineY }, width: drawnWidth, lineY: line.bounds ? line.bounds.y + (line.bounds.height - lineHeight) / 2 : top + lineIndex * lineHeight, lineHeight, lineAscent: ascent });
      });
      // Several styled fragments can share one browser line inside a single paragraph layer.
      const merged:ShapedText['baselines']=[];
      for(const baseline of baselines){
        const previous=merged.at(-1);
        if(previous&&Math.abs(previous.position.y-baseline.position.y)<1){
          const left=Math.min(previous.position.x,baseline.position.x),right=Math.max(previous.position.x+previous.width,baseline.position.x+baseline.width);
          for(let i=previous.firstCharacter;i<previous.endCharacter;i++)offsets[i]+=previous.position.x-left;
          for(let i=baseline.firstCharacter;i<baseline.endCharacter;i++)offsets[i]+=baseline.position.x-left;
          previous.position.x=left;previous.width=right-left;previous.endCharacter=Math.max(previous.endCharacter,baseline.endCharacter);
        }else merged.push({...baseline,position:{...baseline.position}});
      }
      return { glyphs, baselines:merged, logicalIndexToCharacterOffsetMap: offsets };
    },
    textDecorations(node, glyphs) {
      return glyphs.flatMap(glyph=>{
        const style=node.styleRuns.find(run=>(glyph.firstCharacter??0)>=run.start&&(glyph.firstCharacter??0)<run.start+run.length)?.style;
        const decoration=style?.textDecoration??node.textDecoration,size=glyph.fontSize||node.fontSize;
        return decoration==='NONE'?[]:[{firstCharacter:glyph.firstCharacter??0,x:glyph.x,y:decoration==='UNDERLINE'?glyph.y+size*.1:glyph.y-size*.3,width:glyph.advance??0,height:Math.max(1,size/16)}];
      });
    }
  };
}
