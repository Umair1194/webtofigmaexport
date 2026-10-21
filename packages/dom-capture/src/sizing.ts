import type {BaseNode} from '@frameforge/scene-graph';

/** Typed computed values retain auto/% where resolved getComputedStyle sizes are pixels. */
export function captureSizing(element:Element, style:CSSStyleDeclaration):BaseNode['sizing'] {
  let values:{get(name:string):{toString():string}|undefined}|undefined;
  try {values=(element as Element & {computedStyleMap?():typeof values}).computedStyleMap?.();}catch{}
  if(!values)return;
  const raw=(name:string)=>values?.get(name)?.toString().toLowerCase()||'';
  const parent=element.parentElement?window.getComputedStyle(element.parentElement):undefined;
  const flexRow=parent?.display.includes('flex')&&!parent.flexDirection.startsWith('column');
  const width=raw('width'),height=raw('height');
  const block=['block','flow-root','flex','grid','list-item'].includes(style.display);
  const sizing:NonNullable<BaseNode['sizing']>={
    horizontal:width==='auto'?(block&&!flexRow?'FILL':'HUG'):/%|vw|calc\(|min\(|max\(|clamp\(/.test(width)?'FILL':width.endsWith('px')?'FIXED':undefined,
    vertical:height==='auto'?'HUG':height.endsWith('px')?'FIXED':undefined,
    grow:Math.max(0,parseFloat(style.flexGrow)||0),
  };
  for(const [axis,before,after] of [['Width','Left','Right'],['Height','Top','Bottom']] as const){
    const extra=style.boxSizing==='border-box'?0:(parseFloat(style['padding'+before as 'paddingLeft'])||0)+(parseFloat(style['padding'+after as 'paddingRight'])||0)+(parseFloat(style['border'+before+'Width' as 'borderLeftWidth'])||0)+(parseFloat(style['border'+after+'Width' as 'borderRightWidth'])||0);
    for(const kind of ['min','max'] as const){
      const key=(kind+axis) as 'minWidth'|'maxWidth'|'minHeight'|'maxHeight',value=style[key];
      if(/^\d+(?:\.\d+)?px$/.test(value))sizing[key]=parseFloat(value)+extra;
    }
    const min=sizing['min'+axis as 'minWidth'],max=sizing['max'+axis as 'maxWidth'];
    if(min!==undefined&&max!==undefined&&min>max)sizing['max'+axis as 'maxWidth']=min;
  }
  return sizing;
}
