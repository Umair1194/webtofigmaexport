import {capturePageAsync} from '@frameforge/dom-capture';
import {validateSceneGraph} from '@frameforge/scene-graph';
import {captureFonts} from '../apps/chrome-extension/src/content/fonts.js';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
const fixture=document.querySelector('#fixture')!,run=document.querySelector<HTMLButtonElement>('#run')!,copy=document.querySelector<HTMLButtonElement>('#copy')!,status=document.querySelector('#status')!;
let html='';
run.onclick=async()=>{
 run.disabled=copy.disabled=true;
 try{
  const controller=new AbortController();await document.fonts.ready;
  const start=performance.now();const doc=await capturePageAsync(fixture,{captureMode:'SELECTED_ELEMENT',inferAutoLayout:true});await captureFonts(doc,controller.signal);
  const validation=validateSceneGraph(doc);if(!validation.valid)throw new Error(validation.errors.join('; '));
  const native=await buildNativeClipboard(doc);const decoded=await parseFigmaClipboard(native.html);if(!decoded)throw new Error('No decoded payload');
  const texts=decoded.nodes.filter(n=>n.type==='TEXT');
  const heading=texts.find(n=>n.textData?.characters==='Preserve the original type.')!;
  const paragraph=texts.find(n=>n.textData?.characters?.startsWith('This paragraph'))!;
  const variable=texts.find(n=>n.textData?.characters?.startsWith('Variable weight'))!;
  const checks={threeFacesCaptured:doc.fonts?.length===3,headingFamily:heading?.fontName?.family==='Lora',headingBold:heading?.fontName?.style==='Bold',paragraphOneLayer:!!paragraph,mixedMonoFamily:paragraph?.textData?.styleOverrideTable?.some(s=>s.fontName?.family==='Roboto Mono')===true,italicStyle:paragraph?.textData?.styleOverrideTable?.some(s=>s.fontName?.style==='Italic')===true,variableFamily:variable?.fontName?.family==='Roboto Mono',variableWeight:(variable as any)?.fontVariations?.some((axis:any)=>axis.value===650)===true,drawable:texts.every(n=>n.derivedTextData?.glyphs?.length),fallbackWarned:native.warnings.some(w=>w.includes('Substituted Unavailable example')),noAvailableFontSubstitution:!native.warnings.some(w=>/^Substituted (Lora|Code alias)/.test(w))};
  const report={checkedAt:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight},passed:Object.values(checks).every(Boolean),checks,elapsedMs:performance.now()-start,fontAssets:doc.fonts?.map(({dataUrl,...font})=>({...font,encodedBytes:dataUrl.length})),stats:native.stats,warnings:native.warnings,texts:texts.map(n=>({name:n.name,characters:n.textData?.characters,fontName:n.fontName,fontVariations:n.fontVariations,size:n.size,baselines:n.derivedTextData?.baselines,overrides:n.textData?.styleOverrideTable})),limitations:['Engine harness, not installed Chrome messaging or Figma-host rendering.','Original font data shapes glyphs but is not installed in Figma by clipboard paste.']};
  html=native.html;document.querySelector('#report')!.textContent=JSON.stringify(report,null,2);document.querySelector('#native-html')!.textContent=html;
  document.documentElement.dataset.result=report.passed?'pass':'fail';status.textContent=report.passed?'Font checks passed. Ready for an actual Figma paste.':'Font check failed; see report.';
 }catch(error){status.textContent=String(error);document.documentElement.dataset.result='fail';}
 finally{run.disabled=false;copy.disabled=!html;}
};
copy.onclick=async()=>{try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'})})]);status.textContent='Copied. Paste on a disposable Figma page to check actual font editing.';}catch(error){status.textContent=String(error);}};
await document.fonts.ready;run.disabled=false;status.textContent='Ready. Run the font checks.';
