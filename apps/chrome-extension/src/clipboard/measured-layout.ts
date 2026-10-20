import type { FrameNode, SceneNode as CapturedNode } from '@frameforge/scene-graph';
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph';

interface MeasuredStack {
  vertical: boolean;
  leading: number;
  trailing: number;
  crossLeading: number;
  crossTrailing: number;
  crossAlign: 'MIN' | 'CENTER' | 'MAX';
  gaps: number[];
  children: CapturedNode[];
}
function candidate(frame: FrameNode, vertical: boolean): MeasuredStack | null {
  const children = frame.children.filter(c => c.visible && c.layoutPositioning !== "ABSOLUTE" && (c.bounds.width > 0 || c.bounds.height > 0)).sort((a,b)=>vertical?a.bounds.y-b.bounds.y:a.bounds.x-b.bounds.x);
  if (!children.length) return null;
  const mainSize = vertical ? frame.bounds.height : frame.bounds.width;
  const crossSize = vertical ? frame.bounds.width : frame.bounds.height;
  const main = (c: CapturedNode) => vertical ? c.bounds.y : c.bounds.x;
  const cross = (c: CapturedNode) => vertical ? c.bounds.x : c.bounds.y;
  const length = (c: CapturedNode) => vertical ? c.bounds.height : c.bounds.width;
  const breadth = (c: CapturedNode) => vertical ? c.bounds.width : c.bounds.height;
  const leading = main(children[0]), trailing = mainSize - main(children.at(-1)!) - length(children.at(-1)!);
  const crossLeading = Math.min(...children.map(cross));
  const crossTrailing = crossSize - Math.max(...children.map(c => cross(c) + breadth(c)));
  if ([leading, trailing, crossLeading, crossTrailing].some(p => p < -1)) return null;
  const gaps = children.slice(1).map((c, i) => main(c) - main(children[i]) - length(children[i]));
  // Overlapping layers, including decorative backgrounds/overlays, keep absolute geometry.
  if (gaps.some(g => g < -1)) return null;
  const crossAlign = (['MIN','CENTER','MAX'] as const).find(align => children.every(c => {
    const expected = align === 'MIN' ? crossLeading : align === 'MAX' ? crossSize - crossTrailing - breadth(c) : crossLeading + (crossSize - crossLeading - crossTrailing - breadth(c)) / 2;
    return Math.abs(cross(c) - expected) <= 1;
  }));
  return crossAlign ? { vertical, leading: Math.max(0, leading), trailing: Math.max(0, trailing), crossLeading: Math.max(0, crossLeading), crossTrailing: Math.max(0, crossTrailing), crossAlign, gaps: gaps.map(g => Math.max(0, g)), children } : null;
}

/** Reconstruct normal document flow from geometry, including block layouts and margin gaps. */
export function applyMeasuredLayout(source: FrameNode, target: SceneNode, graph: SceneGraph, allowRows = true): boolean {
  const stack = candidate(source, true) ?? candidate(source, false);
  if (!stack) return allowRows ? applyMeasuredRows(source,target,graph) || applyInsetStack(source,target,graph) : false;
  const { vertical, gaps, children } = stack;
  const flowSet=new Set(children),sourceOrder=source.children.filter(c=>flowSet.has(c));
  const outputs = new Map(source.children.map((child, i) => [child, graph.getNode(target.childIds[i])!]));
  const uniform = !gaps.length || Math.max(...gaps) - Math.min(...gaps) <= 1;
  target.layoutMode = vertical ? 'VERTICAL' : 'HORIZONTAL';
  target.primaryAxisSizing = 'FIXED'; target.counterAxisSizing = 'FIXED';
  target.primaryAxisAlign = 'MIN'; target.counterAxisAlign = stack.crossAlign;
  target.paddingTop = vertical ? stack.leading : stack.crossLeading;
  target.paddingBottom = vertical ? stack.trailing : stack.crossTrailing;
  target.paddingLeft = vertical ? stack.crossLeading : stack.leading;
  target.paddingRight = vertical ? stack.crossTrailing : stack.trailing;
  target.itemSpacing = uniform && gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  // Unequal CSS margins are represented by flow spacers rather than absolute children.
  if (!uniform || children.some((child,i)=>child !== sourceOrder[i])) {
    const ordered: string[] = [];
    children.forEach((child, index) => {
      if (!uniform && index && gaps[index - 1] > 0) {
        const spacer = graph.createNode('FRAME', target.id, { name: 'Spacing', width: vertical ? 1 : gaps[index - 1], height: vertical ? gaps[index - 1] : 1, fills: [], strokes: [] });
        spacer.layoutPositioning = 'AUTO'; ordered.push(spacer.id);
      }
      ordered.push(outputs.get(child)!.id);
    });
    for (const child of source.children) if (!flowSet.has(child)) ordered.push(outputs.get(child)!.id);
    target.childIds = ordered;
  }
  for (const child of source.children) if (!children.includes(child)) outputs.get(child)!.layoutPositioning = 'ABSOLUTE';
  for (const child of children) {
    const output = outputs.get(child)!;
    output.layoutPositioning = 'AUTO';
    const breadth = vertical ? child.bounds.width : child.bounds.height;
    const available = (vertical ? source.bounds.width : source.bounds.height) - stack.crossLeading - stack.crossTrailing;
    if (Math.abs(breadth - available) <= 1) output.layoutAlignSelf = 'STRETCH';
  }
  return true;
}

/** Represent regular wrapped/grid rows as nested editable Auto Layout frames. */
function applyMeasuredRows(source: FrameNode, target: SceneNode, graph: SceneGraph): boolean {
  const flow=source.children.filter(c=>c.visible && c.layoutPositioning!=='ABSOLUTE' && c.bounds.width>0 && c.bounds.height>0).sort((a,b)=>a.bounds.y-b.bounds.y||a.bounds.x-b.bounds.x);
  if(flow.length<3)return false;
  const rows: CapturedNode[][]=[];
  for(const child of flow){
    const previous=rows.at(-1), last=previous?.at(-1);
    if(last && child.bounds.y < Math.max(...previous!.map(c=>c.bounds.y+c.bounds.height))-1){
      previous!.push(child);
    }else rows.push([child]);
  }
  if(rows.length<2 || rows.every(row=>row.length===1))return false;
  for(const row of rows)row.sort((a,b)=>a.bounds.x-b.bounds.x);
  const groups: FrameNode[]=rows.map((children,i)=>{
    const x=0, y=Math.min(...children.map(c=>c.bounds.y));
    return {type:'FRAME',id:source.id+':row:'+i,name:'Row '+(i+1),visible:true,opacity:1,fills:[],bounds:{x,y,width:source.bounds.width,height:Math.max(...children.map(c=>c.bounds.y+c.bounds.height))-y},children:children.map(c=>({...c,bounds:{...c.bounds,x:c.bounds.x-x,y:c.bounds.y-y}}))};
  });
  if(groups.some(group=>!candidate(group,false)))return false;
  const absolute=source.children.filter(c=>!flow.includes(c));
  const projected={...source,children:[...groups,...absolute]};
  if(!candidate(projected,true))return false;
  const outputs=new Map(source.children.map((c,i)=>[c,graph.getNode(target.childIds[i])!]));
  const rowOutputs=groups.map((group,i)=>{
    const row=graph.createNode('FRAME',target.id,{name:group.name,x:group.bounds.x,y:group.bounds.y,width:group.bounds.width,height:group.bounds.height,fills:[],strokes:[]});
    rows[i].forEach((original,j)=>{const child=outputs.get(original)!;graph.reparentNode(child.id,row.id);child.x=group.children[j].bounds.x;child.y=group.children[j].bounds.y;});
    applyMeasuredLayout(group,row,graph,false);return row;
  });
  target.childIds=[...rowOutputs.map(n=>n.id),...absolute.map(c=>outputs.get(c)!.id)];
  return applyMeasuredLayout(projected,target,graph,false);
}

/** Preserve differing cross-axis insets with editable row/column wrappers. */
function applyInsetStack(source:FrameNode,target:SceneNode,graph:SceneGraph):boolean {
  const flow=source.children.filter(c=>c.visible&&c.layoutPositioning!=='ABSOLUTE'&&c.bounds.width>0&&c.bounds.height>0);
  if(flow.length<2)return false;
  for(const vertical of [true,false]){
    const ordered=[...flow].sort((a,b)=>vertical?a.bounds.y-b.bounds.y:a.bounds.x-b.bounds.x);
    const groups:FrameNode[]=ordered.map((child,i)=>({type:'FRAME',id:source.id+':inset:'+i,name:vertical?'Row':'Column',visible:true,opacity:1,fills:[],bounds:vertical?{x:0,y:child.bounds.y,width:source.bounds.width,height:child.bounds.height}:{x:child.bounds.x,y:0,width:child.bounds.width,height:source.bounds.height},children:[{...child,bounds:{...child.bounds,x:vertical?child.bounds.x:0,y:vertical?0:child.bounds.y}}]}));
    if(groups.some(group=>!candidate(group,vertical)))continue;
    const absolute=source.children.filter(c=>!flow.includes(c)),projected={...source,children:[...groups,...absolute]};
    if(!candidate(projected,vertical))continue;
    const outputs=new Map(source.children.map((c,i)=>[c,graph.getNode(target.childIds[i])!]));
    const wrappers=groups.map((group,i)=>{
      const wrapper=graph.createNode('FRAME',target.id,{name:group.name,x:group.bounds.x,y:group.bounds.y,width:group.bounds.width,height:group.bounds.height,fills:[],strokes:[]});
      const child=outputs.get(ordered[i])!;graph.reparentNode(child.id,wrapper.id);child.x=group.children[0].bounds.x;child.y=group.children[0].bounds.y;
      applyMeasuredLayout(group,wrapper,graph,false);return wrapper;
    });
    target.childIds=[...wrappers.map(n=>n.id),...absolute.map(c=>outputs.get(c)!.id)];
    return applyMeasuredLayout(projected,target,graph,false);
  }
  return false;
}
