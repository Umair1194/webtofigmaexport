// Local UI harness. Chrome APIs and clipboard are simulated; native encoding is real.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve('apps/chrome-extension/dist');
const fixture=()=>{
  let index=0;
  const text=(characters,x,y,width,size=14)=>({id:'text-'+(++index),name:characters,type:'TEXT',bounds:{x,y,width,height:size+4},visible:true,opacity:1,characters,fragments:[{start:0,end:characters.length,bounds:{x:0,y:0,width,height:size+4}}],style:{fontFamily:'Inter',fontWeight:400,fontSize:size},fills:[{type:'SOLID',color:{r:.1,g:.14,b:.1,a:1}}]});
  const children=[text('What brings you to Petopus?',24,24,440,28),text('Choose the account that fits.',24,68,320),text('Pet owner',24,116,180),text('Registered guest',24,156,180),text('Continue as registered guest',24,220,260)];
  return {schemaVersion:'1.0.0',id:'preview-capture',title:'Petopus — Account setup',url:'https://petopus.app/setup',capturedAt:new Date().toISOString(),captureMode:'VIEWPORT',viewport:{width:1440,height:1000,scrollX:0,scrollY:0,devicePixelRatio:1},root:{id:'root',type:'FRAME',name:'Account setup',bounds:{x:0,y:0,width:500,height:300},visible:true,opacity:1,children,fills:[]},diagnostics:{totalNodesCaptured:6,totalTextNodes:5,totalImages:0,totalVectors:0,totalUnsupported:0,warnings:[],durationMs:1280}};
};
http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/popup.js'){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(directory,'popup.js')));return;}
  if(url.pathname==='/preview-chrome.js'){
    const state=url.searchParams.get('state')||'empty';
    response.setHeader('Content-Type','text/javascript');response.end(`(()=>{const fixture=${JSON.stringify(fixture())};let saved=${state==='empty'?'null':'fixture'};document.body.dataset.savedCapture=saved?'saved':'empty';window.close=()=>{document.body.dataset.closed='true';};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{${state==='failure'?"throw new Error('Clipboard access denied. Your capture is still saved.');":"document.body.dataset.clipboard='written';"}},writeText:async()=>{document.body.dataset.clipboard='written';}}});window.chrome={runtime:{getManifest:()=>({version:'1.6.0'}),onMessage:{addListener:()=>{}},sendMessage:async message=>{if(message.type==='CLEAR_SAVED_CAPTURE'){const cleared=saved?.id===message.captureId;if(cleared)saved=null;document.body.dataset.savedCapture=saved?'saved':'empty';return {status:'ok',cleared};}return {status:'ok'};}},storage:{local:{get:async()=>({frameforge_last_capture:saved})}},tabs:{query:async()=>[{id:1,url:'https://petopus.app/setup',title:'Petopus — Account setup'}],sendMessage:async(_id,message)=>{if(message.type==='PING')return {status:'PONG'};if(message.type==='EXECUTE_CAPTURE'){saved=fixture;document.body.dataset.savedCapture='saved';return {status:'ok',document:fixture};}if(message.type==='START_ELEMENT_PICKER')return {status:'picker_started'};return {status:'inspect_toggled',active:true};}},scripting:{executeScript:async()=>[]}};})();`);return;
  }
  const state=url.searchParams.get('state')||'empty';
  response.setHeader('Content-Type','text/html');response.end(fs.readFileSync(path.join(directory,'popup.html'),'utf8').replace('<script type="module" src="popup.js"></script>',`<script src="preview-chrome.js?state=${encodeURIComponent(state)}"></script><script type="module" src="popup.js"></script>`));
}).listen(38474,'127.0.0.1',()=>console.log('Extension UI harness: http://127.0.0.1:38474/?state=empty (also ready, failure). Simulated Chrome/clipboard; no user data.'));
