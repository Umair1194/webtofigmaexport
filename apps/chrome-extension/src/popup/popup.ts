import { copyNativeCapture } from '../clipboard/native.js';
import { clearSavedCapture } from '../capture-store.js';
import { SceneGraphDocument, validateSceneGraph } from '@frameforge/scene-graph';
import { hasDominantIframePlaceholder, analyzeSceneGraph, generateDesignDoc, generateSkillDoc, sceneGraphToSvg } from '@frameforge/shared-protocol';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const btnRunCapture = element<HTMLButtonElement>('btn-run-capture');
const btnCopyFigma = element<HTMLButtonElement>('btn-copy-figma');
const resultSummary = element('result-summary'), noticeBanner = element('notice-banner');
const colorsList = element('colors-list'), typeList = element('type-list'), assetsList = element('assets-list'), a11yList = element('a11y-list');
const lists = [colorsList,typeList,assetsList,a11yList];
let currentDocument: SceneGraphDocument | null = null;
let busy = false, completed = false, restricted = false, revision = 0;
let captureTab: number | null = null, requestId: string | null = null;
let copyController: AbortController | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function mode() { return document.querySelector<HTMLInputElement>('input[name="capture-mode"]:checked')?.value || 'VIEWPORT'; }
function actionLabel() { return mode() === 'SELECTED_ELEMENT' ? 'Choose element' : currentDocument ? 'Capture again' : 'Capture & copy'; }
function setBusy(value: boolean, label?: string) {
  busy = value; document.body.classList.toggle('busy',value);
  document.querySelector('main')?.setAttribute('aria-busy',String(value));
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button'))) button.disabled = value || completed;
  element<HTMLFieldSetElement>('capture-options').disabled = value || completed;
  btnRunCapture.disabled = value || completed || restricted;
  element<HTMLButtonElement>('btn-retry-capture').disabled = value || completed || restricted;
  btnCopyFigma.disabled = value || !currentDocument || hasDominantIframePlaceholder(currentDocument.root);
  element('capture-action-label').textContent = label || actionLabel();
  if(value&&copyController&&!copyController.signal.aborted)element<HTMLButtonElement>('btn-cancel-capture').disabled=false;
  if(completed)element<HTMLButtonElement>('btn-done').disabled=false;
  for (const id of ['btn-download-json','btn-copy-svg','btn-download-design','btn-download-skill','btn-clear-capture']) element<HTMLButtonElement>(id).disabled = value || !currentDocument;
}
function showNotice(type: 'success'|'error'|'warning', message: string) {
  clearTimeout(noticeTimer);
  noticeBanner.className = 'notice-banner active notice-' + type;
  noticeBanner.textContent = message;
  if(type==='success')noticeTimer=setTimeout(()=>noticeBanner.classList.remove('active'),5000);
}
function resetCapture() {
  revision++; currentDocument=null; resultSummary.classList.remove('active'); document.body.classList.remove('has-capture');
  element('capture-source').textContent=''; element('capture-warnings').replaceChildren();
  for(const list of lists)list.replaceChildren();
  for(const details of Array.from(resultSummary.querySelectorAll('details')))details.open=false;
  setBusy(busy);
}
function displayCapturedDocument(doc: SceneGraphDocument) {
  revision++; currentDocument=doc; resultSummary.classList.add('active'); document.body.classList.add('has-capture');
  element('stat-total-nodes').textContent=doc.diagnostics.totalNodesCaptured.toLocaleString();
  element('stat-text-nodes').textContent=doc.diagnostics.totalTextNodes.toLocaleString();
  element('stat-frames').textContent='On copy';
  element('stat-duration').textContent=doc.diagnostics.durationMs>=1000?(doc.diagnostics.durationMs/1000).toFixed(1)+'s':doc.diagnostics.durationMs+'ms';
  let host='';try{host=new URL(doc.url).hostname;}catch{}
  element('capture-source').textContent=doc.title+(host?' · '+host:'')+' · '+Math.round(doc.root.bounds.width)+' × '+Math.round(doc.root.bounds.height);
  const recorded=new Date(doc.capturedAt);
  element('capture-recorded').textContent=Number.isFinite(recorded.getTime())?'Saved '+recorded.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}):'Saved capture';
  const warnings=element('capture-warnings');warnings.replaceChildren();warnings.hidden=!doc.diagnostics.warnings.length;
  for(const warning of doc.diagnostics.warnings){const li=document.createElement('li');li.textContent=warning;warnings.appendChild(li);}
  const incomplete=hasDominantIframePlaceholder(doc.root);
  resultSummary.classList.toggle('incomplete',incomplete);
  element('result-status').textContent=incomplete?'Embedded design missing':'Ready to copy';
  element('result-recovery').hidden=!incomplete;
  btnCopyFigma.hidden=incomplete;
  element('btn-retry-capture').hidden=!incomplete;
  if(incomplete){
    resultSummary.querySelector('details')?.setAttribute('open','');
    showNotice('warning','The embedded design is missing. Review the capture details below, then capture again.');
  }
  populateIntelligence(doc);setBusy(busy);
}
function triggerDownload(content: string, filename: string, type = 'application/json') {
  const url=URL.createObjectURL(new Blob([content],{type})), link=document.createElement('a');
  link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function item(container: HTMLElement, text: string, className = "typo-item") {
  const element = document.createElement("div"); element.className = className; element.textContent = text; container.appendChild(element); return element;
}
async function copyText(text: string, success: string) {
  if(busy||completed)return;
  try { await navigator.clipboard.writeText(text); showNotice("success", success); }
  catch { showNotice("error", "Clipboard unavailable. Focus this popup and try copying again."); }
}
function populateIntelligence(doc: SceneGraphDocument) {
  const analysis = analyzeSceneGraph(doc);
  for (const list of [colorsList, typeList, assetsList, a11yList]) list.replaceChildren();
  for (const color of analysis.colors.slice(0, 30)) {
    const button = document.createElement("button"); button.className = "color-item";
    button.textContent = color.hex + " · " + color.nearestTailwind.name + " · " + color.count + "×";
    button.setAttribute("aria-label", "Copy " + color.hex);
    const swatch = document.createElement("span"); swatch.className = "color-swatch"; swatch.style.backgroundColor = color.hex; button.prepend(swatch);
    button.addEventListener("click", () => copyText(color.hex, "Copied " + color.hex)); colorsList.appendChild(button);
  }
  for (const t of analysis.typography.slice(0, 30)) item(typeList, t.fontFamily + " · " + t.weight + " · " + t.fontSize + "px · " + (t.lineHeight || "auto") + "\n“" + t.sampleText + "”");
  for (const asset of analysis.assets.slice(0, 50)) item(assetsList, asset.type + " · " + asset.name + " · " + asset.dimensions.width + " × " + asset.dimensions.height);
  for (const issue of analysis.accessibility.issues.slice(0, 50)) item(a11yList, issue.contrastResult.contrastRatioFormatted + (issue.contrastResult.uncertain ? " · Review manually" : " · Below AA") + "\n“" + issue.textSnippet + "”");
  if (!analysis.colors.length) item(colorsList, "No solid colors found.");
  if (!analysis.typography.length) item(typeList, "No editable text found.");
  if (!analysis.assets.length) item(assetsList, "No images or vectors found.");
  if (!analysis.accessibility.issues.length) item(a11yList, analysis.accessibility.totalChecked ? "Evaluated text passed AA contrast checks. This is not a full accessibility audit." : "No text could be evaluated.");
}


function isRestrictedUrl(url?: string) {
  try { const parsed=new URL(url || ''); return !['http:','https:','file:'].includes(parsed.protocol) || parsed.hostname==='chromewebstore.google.com' || (parsed.hostname==='chrome.google.com'&&parsed.pathname.startsWith('/webstore')); }
  catch { return true; }
}
async function connect(tabId: number) {
  const ping=await chrome.tabs.sendMessage(tabId,{type:'PING'},{frameId:0}).catch(()=>null);
  if(ping?.status==='PONG')return;
  await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['content.js']});
  const response=await chrome.tabs.sendMessage(tabId,{type:'PING'},{frameId:0});
  if(response?.status!=='PONG')throw new Error('Could not connect to this page. Refresh it, then try again.');
}
async function activeTab() {
  if(typeof chrome==='undefined'||!chrome.tabs)throw new Error('Open the installed extension on a webpage to capture it.');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id===undefined)throw new Error('No active tab found. Open a webpage and try again.');
  if(isRestrictedUrl(tab.url))throw new Error('This page cannot be captured. Open a regular website and try again.');
  return tab as chrome.tabs.Tab & {id:number};
}
async function loadSavedCapture(expectedRevision = revision) {
  if(typeof chrome==='undefined'||!chrome.storage?.local)return;
  try {
    const stored=await chrome.storage.local.get('frameforge_last_capture');
    if(revision!==expectedRevision || completed)return;
    if(stored.frameforge_last_capture){
      const result=validateSceneGraph(stored.frameforge_last_capture);
      if(result.valid&&result.document)displayCapturedDocument(result.document);
      else showNotice('warning','The saved capture could not be read. Make a new capture.');
    }
  }catch{if(revision===expectedRevision)showNotice('warning','Saved captures are unavailable. Try capturing this page again.');}
}
async function initialize() {
  const shortcut=/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)?'⌘ V':'Ctrl V';
  for(const key of Array.from(document.querySelectorAll('.paste-shortcut')))key.textContent=shortcut;
  element('app-version').textContent=typeof chrome!=='undefined'&&chrome.runtime?.getManifest?'v'+chrome.runtime.getManifest().version:'Preview';
  await Promise.allSettled([loadSavedCapture(),(async()=>{
    if(typeof chrome==='undefined'||!chrome.tabs){element('page-origin').textContent='Open the extension on a webpage';element('site-state').textContent='Preview';return;}
    try{
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      restricted=isRestrictedUrl(tab?.url);element('page-title').textContent=tab?.title || 'Current page';
      let origin='';try{const url=new URL(tab?.url||'');origin=url.protocol==='file:'?'Local file':url.hostname;}catch{origin='Browser page';}
      element('page-origin').textContent=origin;element('site-state').textContent=restricted?'Unavailable':'Ready';element('site-state').classList.toggle('blocked',restricted);
      setBusy(busy);
    }catch{element('page-origin').textContent='Could not read the active tab';element('site-state').textContent='Retry';}
  })()]);
}
async function performCopy(doc: SceneGraphDocument, tabId?: number) {
  if(hasDominantIframePlaceholder(doc.root))throw new Error('The embedded design is missing. Review the capture details below, then capture again.');
  setBusy(true,'Preparing editable layers…');
  const controller=new AbortController();copyController=controller;
  const cancel=element<HTMLButtonElement>('btn-cancel-capture');cancel.hidden=false;cancel.disabled=false;
  let exported;
  try{exported=await copyNativeCapture(doc,{signal:controller.signal,onClipboardWrite:()=>{copyController=null;cancel.hidden=true;element('capture-action-label').textContent='Copying to clipboard…';}});}
  finally{copyController=null;cancel.hidden=true;}
  // Clipboard success and storage cleanup are distinct outcomes. A cleanup failure must
  // never be described as a failed copy, and another capture must never be deleted.
  let cleared: boolean;
  try{cleared=await clearSavedCapture(doc.id);}
  catch{showNotice('warning','Copied to Figma. The saved capture could not be cleared. You can discard it here.');return;}
  if(tabId===undefined){try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab?.id;}catch{/* Clipboard and cleanup already succeeded. */}}
  if(tabId!==undefined)await chrome.tabs.sendMessage(tabId,{type:'CAPTURE_COPIED',id:doc.id},{frameId:0}).catch(()=>{});
  resetCapture();
  if(!cleared){await loadSavedCapture();if(currentDocument){showNotice('success','Copied to Figma. A newer capture has been kept.');return;}}
  completed=true;element('capture-view').hidden=true;element('copy-success').hidden=false;
  const stats=exported.stats;element('success-stats').textContent=stats.layers+' layers · '+stats.autoLayout+' Auto Layout '+(stats.autoLayout===1?'frame':'frames');
  const warnings=element('success-warnings');warnings.replaceChildren();
  for(const warning of exported.warnings){const li=document.createElement('li');li.textContent=warning;warnings.appendChild(li);}
  element('success-review').hidden=!exported.warnings.length;element('btn-done').hidden=!exported.warnings.length;
  if(!exported.warnings.length)setTimeout(()=>window.close(),1100);
}
btnRunCapture.addEventListener('click',async()=>{
  if(busy||completed)return;
  revision++;noticeBanner.classList.remove('active');setBusy(true,'Connecting to page…');
  try{
    const tab=await activeTab();captureTab=tab.id;await connect(tab.id);
    if(mode()==='SELECTED_ELEMENT'){
      const response=await chrome.tabs.sendMessage(tab.id,{type:'START_ELEMENT_PICKER'},{frameId:0});
      if(response?.status!=='picker_started')throw new Error(response?.error||'Could not start selection. Refresh the page and retry.');
      window.close();return;
    }
    requestId=crypto.randomUUID();setBusy(true,'Reading page…');element('btn-cancel-capture').hidden=false;element<HTMLButtonElement>('btn-cancel-capture').disabled=false;
    const response=await chrome.tabs.sendMessage(tab.id,{type:'EXECUTE_CAPTURE',payload:{captureMode:mode(),autoCopy:false,requestId}},{frameId:0});
    if(response?.status!=='ok'||!response.document)throw new Error(response?.error||'Capture failed. Try a smaller area.');
    const validation=validateSceneGraph(response.document);
    if(!validation.valid||!validation.document)throw new Error('The page returned an unreadable capture. Try a smaller area.');
    displayCapturedDocument(validation.document);await performCopy(validation.document,tab.id);
  }catch(error){showNotice('error',error instanceof Error?error.message:'Capture failed. Try again.');}
  finally{captureTab=null;requestId=null;element('btn-cancel-capture').hidden=true;setBusy(false);}
});
element('btn-retry-capture').addEventListener('click',()=>btnRunCapture.click());
btnCopyFigma.addEventListener('click',async()=>{
  if(busy||!currentDocument||completed)return;
  const doc=currentDocument;revision++;setBusy(true,'Preparing editable layers…');
  try{await performCopy(doc);}catch(error){showNotice('error',error instanceof Error?error.message:'Could not copy. Your capture is still saved; try again.');}
  finally{setBusy(false);}
});
element('btn-cancel-capture').addEventListener('click',async()=>{
  if(copyController){copyController.abort();element<HTMLButtonElement>('btn-cancel-capture').disabled=true;element('capture-action-label').textContent='Cancelling export…';return;}
  if(captureTab===null)return;element<HTMLButtonElement>('btn-cancel-capture').disabled=true;element('capture-action-label').textContent='Cancelling…';
  try{await chrome.tabs.sendMessage(captureTab,{type:'CANCEL_CAPTURE'},{frameId:0});}catch{showNotice('error','Could not reach the page to cancel. Refresh it if capture does not stop.');}
});
element('btn-toggle-inspect').addEventListener('click',async()=>{
  if(busy||completed)return;setBusy(true,'Connecting to page…');
  try{const tab=await activeTab();await connect(tab.id);const response=await chrome.tabs.sendMessage(tab.id,{type:'TOGGLE_INSPECT_MODE'},{frameId:0});if(response?.status!=='inspect_toggled')throw new Error(response?.error||'Could not start the inspector.');window.close();}
  catch(error){showNotice('error',error instanceof Error?error.message:'Could not inspect this page.');}
  finally{setBusy(false);}
});
element('btn-clear-capture').addEventListener('click',async()=>{
  if(busy||!currentDocument)return;const id=currentDocument.id;revision++;setBusy(true);
  try{const cleared=await clearSavedCapture(id);resetCapture();if(!cleared)await loadSavedCapture();showNotice('success',cleared?'Saved capture discarded.':'A newer capture has been kept.');}
  catch{showNotice('error','Could not discard the saved capture. Try again.');}finally{setBusy(false);}
});
element('btn-done').addEventListener('click',()=>window.close());
for(const label of Array.from(document.querySelectorAll('.mode-option')))label.addEventListener('change',()=>{for(const option of Array.from(document.querySelectorAll('.mode-option')))option.classList.toggle('selected',!!option.querySelector<HTMLInputElement>('input')?.checked);element('capture-action-label').textContent=actionLabel();});
const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-btn'));
tabs.forEach((tab,index)=>{
  tab.id='tab-'+tab.dataset.tab;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','pane-'+tab.dataset.tab);tab.setAttribute('aria-selected',String(index===0));tab.tabIndex=index===0?0:-1;
  tab.addEventListener('click',()=>{tabs.forEach(t=>{const selected=t===tab;t.classList.toggle('active',selected);t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;});for(const pane of Array.from(document.querySelectorAll('.tab-pane')))pane.classList.toggle('active',pane.id==='pane-'+tab.dataset.tab);});
  tab.addEventListener('keydown',event=>{const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();tabs[next].click();tabs[next].focus();}});
});
for(const pane of Array.from(document.querySelectorAll('.tab-pane'))){pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',pane.id.replace('pane-','tab-'));}
element('btn-download-json').addEventListener('click',()=>{if(!busy&&currentDocument)triggerDownload(JSON.stringify(currentDocument,null,2),'frameforge-'+Date.now()+'.json');});
element('btn-download-design').addEventListener('click',()=>{if(!busy&&currentDocument)triggerDownload(generateDesignDoc(currentDocument),'DESIGN.md','text/markdown');});
element('btn-download-skill').addEventListener('click',()=>{if(!busy&&currentDocument)triggerDownload(generateSkillDoc(currentDocument),'SKILL.md','text/markdown');});
element('btn-copy-svg').addEventListener('click',async()=>{
  if(busy||!currentDocument)return;setBusy(true);
  try{const svg=sceneGraphToSvg(currentDocument);await navigator.clipboard.writeText(svg);showNotice('success','SVG markup copied. Use Copy to Figma for native layers.');}
  catch{showNotice('error','Could not copy SVG. Try again.');}finally{setBusy(false);}
});
if(typeof chrome!=='undefined'&&chrome.runtime?.onMessage)chrome.runtime.onMessage.addListener((message,sender)=>{
  if(message?.type==='CAPTURE_PROGRESS'&&busy&&requestId&&message.requestId===requestId&&sender.tab?.id===captureTab&&sender.frameId===0&&typeof message.stage==='string')element('capture-action-label').textContent=message.stage;
});
void initialize();
