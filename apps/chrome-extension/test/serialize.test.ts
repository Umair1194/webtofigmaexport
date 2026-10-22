import {expect,it} from 'vitest';
import {SceneGraph} from '@open-pencil/scene-graph';
import {sceneNodeToKiwi} from '@open-pencil/fig/node-change';
import {serializeCapture} from '../src/clipboard/serialize.js';
import {exportScheduler} from '../src/clipboard/scheduling.js';
import {createTextRuntime} from '../src/clipboard/text-runtime.js';
it('matches recursive serialization records and glyph blobs, including hierarchy and styled text',async()=>{
 const graph=new SceneGraph(),page=graph.addPage('Test');
 const root=graph.createNode('FRAME',page.id,{name:'Root',width:400,height:300,layoutMode:'VERTICAL',itemSpacing:12});
 for(let i=0;i<3;i++){
  const frame=graph.createNode('FRAME',root.id,{name:'Row '+i,x:10,y:i*50,width:350,height:40});
  graph.createNode('TEXT',frame.id,{name:'Label '+i,text:'Shared label '+i,fontFamily:'Inter',fontSize:16,fontWeight:400,width:180,height:24,textAutoResize:'HEIGHT',styleRuns:[{start:0,length:6,style:{fontWeight:700}}]});
  graph.createNode('RECTANGLE',frame.id,{name:'Shape '+i,x:220,width:24,height:24,fills:[{type:'SOLID',color:{r:1,g:.2,b:.3,a:1},opacity:1,visible:true}]});
 }
 const guid={sessionID:0,localID:1},legacyBlobs:Uint8Array[]=[],cooperativeBlobs:Uint8Array[]=[];
 const legacy=sceneNodeToKiwi(root,guid,0,{value:100},graph,legacyBlobs,{fontDigestMap:new Map(),runtime:createTextRuntime(new Set())});
 const candidate=await serializeCapture(root,guid,graph,cooperativeBlobs,createTextRuntime(new Set()),exportScheduler());
 expect(candidate).toEqual(legacy);expect(cooperativeBlobs).toEqual(legacyBlobs);
});
