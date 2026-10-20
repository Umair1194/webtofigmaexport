import { copyNativeCapture } from './native.js';
if(!(window as any).__FRAMEFORGE_CLIPBOARD_READY__){
  (window as any).__FRAMEFORGE_CLIPBOARD_READY__=true;
  chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
    if(message?.type!=='EXECUTE_NATIVE_COPY')return;
    copyNativeCapture(message.document).then(result=>respond({status:'ok',result}),error=>respond({status:'error',error:error instanceof Error?error.message:'Could not copy this capture.'}));
    return true;
  });
}
