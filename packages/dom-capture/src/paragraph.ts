import type { SceneNode, TextNode, TextFragment, TypographyStyle } from '@frameforge/scene-graph';

/** Consolidate text-only inline markup, retaining editable style ranges and measured glyph lines. */
export function mergeParagraph(children:SceneNode[], width:number, style:TypographyStyle, paddingLeft=0, paddingRight=0):TextNode|undefined {
  const pieces:{node:TextNode;x:number;y:number}[]=[];
  function collect(node:SceneNode,x:number,y:number):boolean {
    if(!node.visible||node.opacity===0)return true;
    x+=node.bounds.x;y+=node.bounds.y;
    if(node.opacity!==1||node.layoutPositioning==='ABSOLUTE')return false;
    if(node.type==='TEXT'){pieces.push({node,x,y});return true;}
    if(node.type!=='FRAME'||node.fills.some(p=>p.visible!==false&&(p.type!=='SOLID'||p.color.a>0))||node.strokes?.length||node.effects?.length||node.clipsContent)return false;
    return node.children.every(child=>collect(child,x,y));
  }
  if(!children.every(child=>collect(child,0,0))||pieces.length<2||pieces.length>500)return;
  if(pieces.some(p=>p.node.fragments?.length)&&pieces.some(p=>p.node.characters.trim()&&!p.node.fragments?.length))return;
  // Different case transforms can change UTF-16 lengths; keep those layouts separate for now.
  if(pieces.some(p=>p.node.style.textCase!==style.textCase))return;
  const x=Math.min(paddingLeft,...pieces.map(p=>p.x)),y=Math.min(...pieces.map(p=>p.y));
  const right=Math.max(width-paddingRight,...pieces.map(p=>p.x+p.node.bounds.width));
  const bottom=Math.max(...pieces.map(p=>p.y+p.node.bounds.height));
  let characters='';const fragments:TextFragment[]=[],runs:NonNullable<TextNode['runs']>=[];
  for(const piece of pieces){
    const start=characters.length;characters+=piece.node.characters;
    runs.push({start,end:characters.length,style:piece.node.style,fills:piece.node.fills});
    for(const fragment of piece.node.fragments||[])fragments.push({...fragment,start:start+fragment.start,end:start+fragment.end,bounds:{...fragment.bounds,x:piece.x-x+fragment.bounds.x,y:piece.y-y+fragment.bounds.y}});
  }
  return {type:'TEXT',id:pieces[0].node.id+':paragraph',name:'Paragraph',bounds:{x,y,width:Math.max(.01,right-x),height:Math.max(.01,bottom-y)},visible:true,opacity:1,characters,fragments:fragments.length?fragments:undefined,runs,style,fills:pieces[0].node.fills};
}
