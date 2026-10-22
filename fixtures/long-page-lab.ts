import {capturePageAsync, captureNodeLimit} from '@frameforge/dom-capture';
import {validateSceneGraph, type SceneGraphDocument} from '@frameforge/scene-graph';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {captureEmbeddedFrames, collectFrames} from '../apps/chrome-extension/src/content/frames.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
const child=new URL(location.href).searchParams.has('child');
const fixture=document.querySelector('#fixture')!,report=document.querySelector('#report')!;
let ready:Promise<void>=Promise.resolve();
async function capture(mode:'FULL_PAGE'|'VIEWPORT',maxNodes?:number){return capturePageAsync(document.body,{captureMode:mode,maxNodes,inferAutoLayout:true});}
if(child){
 fixture.innerHTML='<div class="app"><header class="bar">Long component reference</header><main class="pane"><h1>Loaded reference content</h1></main></div>';
 const pane=document.querySelector('.pane')!;
 for(let i=0;i<3000;i++){const p=document.createElement('p');p.textContent='Reference row '+i;pane.append(p);if(i===1200){const h=document.createElement('h2');h.textContent='Product promotion';pane.append(h);}if(i===2500){const h=document.createElement('h2');h.textContent='After promotion: remaining components';pane.append(h);}}
 const footer=document.createElement('h2');footer.textContent='Final page section';pane.append(footer);
 (window as any).captureLongDocument=capture;
 report.textContent='3000 loaded rows; the final sections are below the old layer cutoff.';
}else{
 const iframe=document.createElement('iframe');iframe.src='/long-page-lab?child=1';iframe.title='Long editable preview';ready=new Promise(resolve=>iframe.onload=()=>resolve());fixture.append(iframe);
 report.textContent='Ready to verify a long page inside a viewport-sized preview iframe.';
}
document.querySelector<HTMLButtonElement>('#run')!.onclick=async()=>{
 try{
  await ready;await document.fonts.ready;
  const started=performance.now();let doc:SceneGraphDocument;
  if(child)doc=await capture('FULL_PAGE');
  else{
   const frames=collectFrames(document.body);doc=await capturePageAsync(document.body,{captureMode:'FULL_PAGE',frameKeys:frames.keys});
   // Exercise real composition and message parameters locally. Chrome routing is unit-tested.
   (window as any).chrome={runtime:{sendMessage:async(msg:any)=>msg.type==='CAPTURE_CHILD_FRAME'?{status:'ok',document:await (document.querySelector('iframe')!.contentWindow as any).captureLongDocument(msg.captureMode,msg.maxNodes)}:{status:'ok'}}};
   await captureEmbeddedFrames(doc,frames.frames,new AbortController().signal,0,captureNodeLimit({captureMode:'FULL_PAGE'}),'FULL_PAGE');
  }
  const validated=validateSceneGraph(doc);if(!validated.valid)throw Error(validated.errors.join(';'));
  const result=await buildNativeClipboard(doc),decoded=(await parseFigmaClipboard(result.html))!;
  const texts=decoded.nodes.filter(n=>n.type==='TEXT').map(n=>n.textData?.characters||'');
  const checks={beyondOldLimit:doc.diagnostics.totalNodesCaptured>5000,fullHeight:doc.root.bounds.height>70000,productPromotion:texts.includes('Product promotion'),afterPromotion:texts.includes('After promotion: remaining components'),lastRow:texts.includes('Reference row 2999'),finalSection:texts.includes('Final page section'),notTruncated:!doc.diagnostics.warnings.some(w=>w.includes('maximum node capture limit'))};
  report.textContent=JSON.stringify({passed:Object.values(checks).every(Boolean),checks,elapsedMs:performance.now()-started,bounds:doc.root.bounds,stats:result.stats,diagnostics:doc.diagnostics},null,2);
  document.querySelector('#native-html')!.textContent=result.html;
 }catch(e){report.textContent=JSON.stringify({error:String(e)});}
};
