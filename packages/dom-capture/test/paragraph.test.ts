import {expect,it} from 'vitest';
import {mergeParagraph} from '../src/paragraph.js';
const style={fontFamily:'Inter',fontSize:16,fontWeight:400};
const text=(id:string,characters:string,x:number,y:number,weight=400):any=>({type:'TEXT',id,name:id,visible:true,opacity:1,bounds:{x,y,width:characters.length*8,height:20},characters,style:{...style,fontWeight:weight},fills:[{type:'SOLID',color:{r:0,g:0,b:0,a:1}}],fragments:[{start:0,end:characters.length,bounds:{x:0,y:0,width:characters.length*8,height:20}}]});
it('keeps an inline-styled, wrapped paragraph as one string with style ranges and line geometry',()=>{
 const p=mergeParagraph([text('a','Hello ',0,0),text('b','world',48,0,700),text('c',' again',0,24)],200,style)!;
 expect(p.characters).toBe('Hello world again');expect(p.bounds.width).toBe(200);expect(p.runs!.map(r=>[r.start,r.end,r.style.fontWeight])).toEqual([[0,6,400],[6,11,700],[11,17,400]]);
 expect(p.fragments!.map(f=>[f.start,f.bounds.x,f.bounds.y])).toEqual([[0,0,0],[6,48,0],[11,0,24]]);
});
it('retains decorated inline frames rather than discarding their background',()=>{
 const decorated:any={type:'FRAME',id:'decorated',visible:true,opacity:1,bounds:{x:40,y:0,width:50,height:20},fills:[{type:'SOLID',color:{r:1,g:0,b:0,a:1}}],children:[text('b','world',0,0)]};
 expect(mergeParagraph([text('a','Hello ',0,0),decorated],200,style)).toBeUndefined();
});
it('retains a whitespace text piece between styled sibling spans',()=>{
 const p=mergeParagraph([text('a','Hello',0,0),text('space',' ',40,0),text('b','world',48,0,700)],200,style)!;
 expect(p.characters).toBe('Hello world');expect(p.runs![1]).toMatchObject({start:5,end:6});
});
it('preserves deeply nested runs and their colours through repeated paragraph consolidation',()=>{
 const purple=[{type:'SOLID',color:{r:.46,g:.22,b:.47,a:1}}];
 const nested=mergeParagraph([text('a','outer ',0,0),{...text('b','bold',48,0,700),fills:purple}],200,style)!;
 const outer=mergeParagraph([text('prefix','Before ',0,0),{...nested,bounds:{...nested.bounds,x:56}},text('after',' after',0,24)],400,style)!;
 expect(outer.characters).toBe('Before outer bold after');
 expect(outer.runs!.find(r=>r.start===13)).toMatchObject({end:17,style:{fontWeight:700},fills:purple});
});
it('keeps a lone block paragraph at its content width and moves measured ink into line-box coordinates',()=>{
 const p=mergeParagraph([text('a','One paragraph',0,2)],440,style,0,0,{x:0,y:0,width:440,height:24})!;
 expect(p.bounds).toEqual({x:0,y:0,width:440,height:24});expect(p.textAutoResize).toBe('HEIGHT');
 expect(p.fragments![0].bounds.y).toBe(2);expect(p.characters).toBe('One paragraph');
 expect(mergeParagraph([text('a','Inline',0,2)],440,style)).toBeUndefined();
});
