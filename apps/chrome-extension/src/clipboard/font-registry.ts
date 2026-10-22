import {create,type Font} from 'fontkit';
import {Buffer} from 'buffer';
import type {CapturedFont,TypographyStyle} from '@frameforge/scene-graph';
const normalize=(family:string)=>family.trim().replace(/^['"]|['"]$/g,'').toLowerCase();
export class FontRegistry {
 private parsed=new Map<CapturedFont,Font|null>();
 private resolved=new Map<string,Font>();
 private selected=new Map<string,Font>();
 constructor(private assets:CapturedFont[],private warnings:Set<string>){}
 resolve(style:TypographyStyle,text:string,id=''):string {
  if(/^Inter(?: Variable)?$/i.test(style.fontFamily)&&!this.assets.some(asset=>normalize(asset.family)===normalize(style.fontFamily))){
    if(style.fontWeight%100)this.warnings.add('Inter weight '+style.fontWeight+' approximated with the nearest bundled weight; editable spacing may differ.');
    return 'Inter';
  }
  const italic=style.fontStyle==='italic';
  for(const [index,asset] of this.assets.entries()){
   if(normalize(asset.family)!==normalize(style.fontFamily)||asset.style!==(italic?'italic':'normal')||style.fontWeight<asset.weightMin||style.fontWeight>asset.weightMax)continue;
   try{
    let original=this.parsed.get(asset);if(original===undefined){try{original=create(Buffer.from(asset.dataUrl.split(',')[1],'base64')) as Font;}catch{original=null;}this.parsed.set(asset,original);}
    if(!original)continue;
    const family=original.familyName||asset.family,key=index+':'+style.fontWeight+':'+italic;
    let font=this.resolved.get(key);
    if(!font){
     font=original;const axes=font.variationAxes||{};const values:Record<string,number>={};
     if(axes.wght)values.wght=Math.max(axes.wght.min,Math.min(axes.wght.max,style.fontWeight));
     if(axes.ital)values.ital=italic?1:0;
     if(Object.keys(values).length)font=font.getVariation(values);
     // A face must cover the text it will shape, rather than silently exporting missing glyphs.
     if([...new Set(Array.from(text))].some(char=>!/\s/u.test(char)&&!font!.hasGlyphForCodePoint(char.codePointAt(0)!)))continue;
     this.resolved.set(key,font);
    }else if([...new Set(Array.from(text))].some(char=>!/\s/u.test(char)&&!font!.hasGlyphForCodePoint(char.codePointAt(0)!)))continue;
    this.selected.set(id+':'+normalize(family)+':'+style.fontWeight+':'+italic,font);
    this.warnings.add('Preserved web font '+family+'. Make it available in Figma to edit without font substitution.');
    return family;
   }catch{/* Broken or unsupported fonts fall back without producing invisible text. */}
  }
  this.warnings.add('Substituted '+style.fontFamily+' '+style.fontWeight+(italic?' Italic':'')+' with Inter: matching web-font data was unavailable, unsupported, or missing required glyphs. Wrapping may differ after editing.');
  return 'Inter';
 }
 variations(node:{id:string;fontFamily:string;fontWeight:number;italic:boolean}):{axis:string;value:number}[]{
  const font=this.face(node);return font?.variationAxes?.wght?[{axis:'wght',value:node.fontWeight}]:[];
 }
 face(node:{id:string;fontFamily:string;fontWeight:number;italic:boolean}):Font|undefined {
  return this.selected.get(node.id+':'+normalize(node.fontFamily)+':'+node.fontWeight+':'+node.italic);
 }
}
