import {expect,it} from 'vitest';
import {applyResponsiveSizing} from '../src/clipboard/responsive-sizing.js';
const child=(name:string,width:number,height=40,sizing:any={}):any=>({name,type:'FRAME',visible:true,bounds:{x:0,y:0,width,height},sizing});
const output=(width:number,height=40):any=>({width,height,layoutPositioning:'AUTO',layoutAlignSelf:'AUTO',layoutGrow:0,minWidth:null,maxWidth:null,minHeight:null,maxHeight:null});
const parent=(layoutMode='VERTICAL'):any=>({layoutMode,primaryAxisSizing:'FIXED',counterAxisSizing:'FIXED',paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0,itemSpacing:0,childIds:[]});
it('fills a capped content width while preserving explicit fixed-size children',()=>{
 const a=child('paragraph',440,40,{horizontal:'FILL'}),b=child('fixed',500,40,{horizontal:'FIXED'}),ao=output(440),bo=output(500);ao.maxWidth=440;
 const source:any={bounds:{width:500,height:80},children:[a,{...b,bounds:{...b.bounds,y:40}}]};
 const fixed=source.children[1];const target=parent();applyResponsiveSizing(source,target,new Map([[a,ao],[fixed,bo]]));
 expect(ao.layoutAlignSelf).toBe('STRETCH');expect(bo.layoutAlignSelf).toBe('AUTO');
});
it('grows regular flexible columns in proportion and does not invent growth for spare space',()=>{
 const a=child('a',240,40,{horizontal:'FILL'}),b=child('b',240,40,{horizontal:'FILL'});b.bounds.x=260;
 const source:any={bounds:{width:500,height:40},children:[a,b]},target=parent('HORIZONTAL');target.itemSpacing=20;
 const ao=output(240),bo=output(240);applyResponsiveSizing(source,target,new Map([[a,ao],[b,bo]]));
 expect(ao.layoutGrow).toBe(.5);expect(bo.layoutGrow).toBe(.5);
 ao.layoutGrow=bo.layoutGrow=0;source.bounds.width=600;applyResponsiveSizing(source,target,new Map([[a,ao],[b,bo]]));
 expect(ao.layoutGrow).toBe(0);
});
it('hugs content-driven height only when its measured size is reproduced',()=>{
 const a=child('a',100),source:any={bounds:{width:100,height:40},sizing:{vertical:'HUG'},children:[a]},target=parent();
 applyResponsiveSizing(source,target,new Map([[a,output(100)]]));expect(target.primaryAxisSizing).toBe('HUG');
 target.primaryAxisSizing='FIXED';source.bounds.height=80;applyResponsiveSizing(source,target,new Map([[a,output(100)]]));expect(target.primaryAxisSizing).toBe('FIXED');
});
