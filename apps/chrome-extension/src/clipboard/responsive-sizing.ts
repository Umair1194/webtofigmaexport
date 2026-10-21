import type {FrameNode, SceneNode as CapturedNode} from '@frameforge/scene-graph';
import type {SceneNode} from '@open-pencil/scene-graph';

/** Only enable sizing that reproduces the captured dimensions before any editing. */
export function applyResponsiveSizing(source:FrameNode,target:SceneNode,outputs:Map<CapturedNode,SceneNode>) {
  if(target.layoutMode==='NONE')return;
  const vertical=target.layoutMode==='VERTICAL';
  const children=source.children.filter(child=>child.visible&&outputs.get(child)?.layoutPositioning!=='ABSOLUTE');
  const bounded=(value:number,node:SceneNode,axis:'Width'|'Height')=>Math.min(node['max'+axis as 'maxWidth']??Infinity,Math.max(node['min'+axis as 'minWidth']??0,value));
  const crossAvailable=(vertical?source.bounds.width:source.bounds.height)-(vertical?target.paddingLeft+target.paddingRight:target.paddingTop+target.paddingBottom);
  for(const child of children){
    const out=outputs.get(child)!;
    const hint=vertical?child.sizing?.horizontal:child.sizing?.vertical;
    const breadth=vertical?child.bounds.width:child.bounds.height;
    if(hint!=='FIXED'&&Math.abs(breadth-bounded(crossAvailable,out,vertical?'Width':'Height'))<=1)out.layoutAlignSelf='STRETCH';
    else if(hint==='FIXED')out.layoutAlignSelf='AUTO';
  }
  const flexible=children.filter(child=>(child.sizing?.grow||0)>0||(vertical?child.sizing?.vertical:child.sizing?.horizontal)==='FILL');
  const main=(node:CapturedNode)=>vertical?node.bounds.height:node.bounds.width;
  const available=(vertical?source.bounds.height:source.bounds.width)-(vertical?target.paddingTop+target.paddingBottom:target.paddingLeft+target.paddingRight)-target.itemSpacing*Math.max(0,children.length-1);
  const free=available-children.filter(child=>!flexible.includes(child)).reduce((sum,child)=>sum+main(child),0);
  if(flexible.length&&Math.abs(flexible.reduce((sum,child)=>sum+main(child),0)-free)<=1){
    const explicit=flexible.every(child=>(child.sizing?.grow||0)>0);
    const weight=(child:CapturedNode)=>explicit?child.sizing!.grow!:main(child);
    const total=flexible.reduce((sum,child)=>sum+weight(child),0);
    if(total>0&&flexible.every(child=>Math.abs(main(child)-free*weight(child)/total)<=1))for(const child of flexible)outputs.get(child)!.layoutGrow=weight(child)/total;
  }
  // Content-driven height can propagate paragraph growth without inventing width hugging.
  if(source.sizing?.vertical==='HUG'&&children.length){
    const ordered=[...children].sort((a,b)=>a.bounds.y-b.bounds.y);
    const gaps=ordered.slice(1).reduce((sum,child,i)=>sum+Math.max(0,child.bounds.y-ordered[i].bounds.y-ordered[i].bounds.height),0);
    const expected=vertical?target.paddingTop+target.paddingBottom+children.reduce((sum,child)=>sum+child.bounds.height,0)+gaps:target.paddingTop+target.paddingBottom+Math.max(...children.map(child=>child.bounds.height));
    if(Math.abs(bounded(expected,target,'Height')-source.bounds.height)<=1){
      if(vertical)target.primaryAxisSizing='HUG';else target.counterAxisSizing='HUG';
      // Native font/inside-stroke rounding must not shrink a freshly pasted capture.
      // It may grow with text; the captured height remains its conservative floor.
      target.minHeight=Math.max(target.minHeight??0,source.bounds.height);
    }
  }
}
