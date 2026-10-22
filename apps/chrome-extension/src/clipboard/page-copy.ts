import { copyNativeCapture } from './native.js';
if(!(window as any).__FRAMEFORGE_CLIPBOARD_READY__){
  (window as any).__FRAMEFORGE_CLIPBOARD_READY__=true;
  let active:{id:string;controller:AbortController;committing:boolean}|null=null;
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message?.type==='CANCEL_NATIVE_COPY'){
      if(active&&active.id===message.requestId&&!active.committing)active.controller.abort();
      respond({status:'ok'});return;
    }
    if(message?.type!=='EXECUTE_NATIVE_COPY')return;
    if(typeof message.requestId!=='string'||!message.requestId||message.requestId.length>80){respond({status:'error',error:'Invalid export request.'});return;}
    if(active){respond({status:'error',error:'An export is already running.'});return;}
    const job={id:message.requestId,controller:new AbortController(),committing:false};active=job;
    copyNativeCapture(message.document,{signal:job.controller.signal,onClipboardWrite:()=>{job.committing=true;}})
      .then(result=>respond({status:'ok',result}),error=>respond({status:'error',error:error instanceof Error?error.message:'Could not copy this capture.'}))
      .finally(()=>{if(active===job)active=null;});
    return true;
  });
}
