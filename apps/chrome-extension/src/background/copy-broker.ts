import { validateSceneGraph } from '@frameforge/scene-graph';
export function installCopyBroker(){
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type!=='COPY_CAPTURE_IN_PAGE')return;
    const tabId=sender.tab?.id,frameId=sender.frameId;
    if(typeof tabId!=='number'||typeof frameId!=='number'){respond({status:'error',error:'Copy must start from a webpage.'});return;}
    void(async()=>{
      try{
        if(new TextEncoder().encode(JSON.stringify(message.document)).byteLength>8*1024*1024)throw new Error('Capture exceeds the copy limit. Choose a smaller area.');
        const validation=validateSceneGraph(message.document);
        if(!validation.valid||!validation.document)throw new Error('The capture could not be read. Capture again.');
        await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},files:['clipboard.js']});
        respond(await chrome.tabs.sendMessage(tabId,{type:'EXECUTE_NATIVE_COPY',document:validation.document},{frameId}));
      }catch(error){respond({status:'error',error:error instanceof Error?error.message:'Could not copy from this page.'});}
    })();return true;
  });
}
