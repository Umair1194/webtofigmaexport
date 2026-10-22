import type {SceneGraph,SceneNode} from '@open-pencil/scene-graph';
import {sceneNodeToKiwi} from '@open-pencil/fig/node-change';
import type {exportScheduler} from './scheduling.js';

/** Native capture graphs contain frames/shapes/text, with no component/instance definitions. */
export async function serializeCapture(root:SceneNode,parentGuid:Parameters<typeof sceneNodeToKiwi>[1],graph:SceneGraph,blobs:Uint8Array[],runtime:NonNullable<Parameters<typeof sceneNodeToKiwi>[6]>['runtime'],scheduler:ReturnType<typeof exportScheduler>){
  const counter={value:100};
  const options={fontDigestMap:new Map(),glyphBlobMap:new Map(),componentPropertyDefinitionsById:new Map(),runtime,writeChildren:false};
  const changes:ReturnType<typeof sceneNodeToKiwi>=[];
  const stack=[{node:root,parentGuid,index:0}];
  while(stack.length){
    const wait=scheduler.checkpoint();if(wait)await wait;
    const item=stack.pop()!;
    const records=sceneNodeToKiwi(item.node,item.parentGuid,item.index,counter,graph,blobs,options);
    changes.push(...records);
    const children=graph.getChildren(item.node.id).filter(child=>!child.internalOnly&&child.sharedStyleType===null);
    for(let i=children.length-1;i>=0;i--)stack.push({node:children[i],parentGuid:records[0].guid!,index:i});
  }
  return changes;
}
