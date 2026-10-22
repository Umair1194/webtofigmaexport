import { validateSceneGraph } from '@frameforge/scene-graph';
export function installCopyBroker(){
  const jobs=new Map<string,{requestId:string;cancelled:boolean;started:boolean}>();
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(!['COPY_CAPTURE_IN_PAGE','CANCEL_COPY_IN_PAGE'].includes(message?.type))return;
    const tabId=sender.tab?.id,frameId=sender.frameId;
    if(typeof tabId!=='number'||typeof frameId!=='number'){respond({status:'error',error:'Copy must start from a webpage.'});return;}
    const key=tabId+':'+frameId;
    if(message.type==='CANCEL_COPY_IN_PAGE'){
      const job=jobs.get(key);
      if(job&&job.requestId===message.requestId){
        job.cancelled=true;
        if(job.started)void chrome.tabs.sendMessage(tabId,{type:'CANCEL_NATIVE_COPY',requestId:job.requestId},{frameId}).catch(()=>{});
      }
      respond({status:'ok'});return;
    }
    if(jobs.has(key)){respond({status:'error',error:'An export is already running in this frame.'});return;}
    if(typeof message.requestId!=='string'||message.requestId.length>80){respond({status:'error',error:'Invalid export request.'});return;}
    const job={requestId:message.requestId,cancelled:false,started:false};jobs.set(key,job);
    void(async()=>{
      try{
        if(new TextEncoder().encode(JSON.stringify(message.document)).byteLength>8*1024*1024)throw new Error('Capture exceeds the copy limit. Choose a smaller area.');
        const validation=validateSceneGraph(message.document);
        if(!validation.valid||!validation.document)throw new Error('The capture could not be read. Capture again.');
        await chrome.scripting.executeScript({target:{tabId,frameIds:[frameId]},files:['clipboard.js']});
        if(job.cancelled)throw new Error('Export cancelled. Your capture is still saved.');
        job.started=true;
        respond(await chrome.tabs.sendMessage(tabId,{type:'EXECUTE_NATIVE_COPY',document:validation.document,requestId:job.requestId},{frameId}));
      }catch(error){respond({status:'error',error:error instanceof Error?error.message:'Could not copy from this page.'});}
      finally{if(jobs.get(key)===job)jobs.delete(key);}
    })();return true;
  });
}
