import { MAX_CAPTURED_FONTS, MAX_FONT_BYTES, MAX_TOTAL_FONT_BYTES, type CapturedFont, type SceneGraphDocument, type SceneNode } from '@frameforge/scene-graph';
const family=(value:string)=>value.trim().replace(/^['"]|['"]$/g,'').toLowerCase();
export async function waitForFonts(signal:AbortSignal,timeoutMs=1500):Promise<boolean>{
 if(signal.aborted)throw new Error('Capture cancelled.');
 if(!document.fonts||document.fonts.status!=='loading')return true;
 return new Promise((resolve,reject)=>{
  const finish=(ready:boolean)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve(ready);};
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new Error('Capture cancelled.'));};
  const timer=setTimeout(()=>finish(false),timeoutMs);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted){abort();return;}void document.fonts.ready.then(()=>finish(true),()=>finish(false));
 });
}
async function readUrl(url:string,maxBytes:number,signal:AbortSignal):Promise<Uint8Array>{
 const parsed=new URL(url,document.baseURI);if(!['http:','https:','data:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Unsupported font URL');
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const timer=setTimeout(abort,2000);
 try{
  const response=await fetch(parsed.href,{signal:controller.signal,mode:'cors',credentials:parsed.origin===location.origin?'same-origin':'omit'});
  if(!response.ok||!response.body)throw new Error('Font resource unavailable');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes){await reader.cancel();throw new Error('Font resource exceeds limit');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
}
function fontData(bytes:Uint8Array):string{
 const signature=String.fromCharCode(...bytes.subarray(0,4));
 const format=signature==='wOF2'?'woff2':signature==='wOFF'?'woff':signature==='OTTO'?'otf':bytes[0]===0&&bytes[1]===1&&bytes[2]===0&&bytes[3]===0?'ttf':null;
 if(!format)throw new Error('Unsupported font file');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return 'data:font/'+format+';base64,'+btoa(binary);
}
/** Only fonts referenced by captured text are fetched; no local/system font access is requested. */
async function collectFonts(doc:SceneGraphDocument,signal:AbortSignal):Promise<void>{
 const required:{family:string;weight:number;style:string;text:string}[]=[];
 const used=new Set<string>(),stack:SceneNode[]=[doc.root];
 while(stack.length){const n=stack.pop()!;if(n.type==='FRAME')stack.push(...n.children);if(n.type==='TEXT')for(const style of [n.style,...(n.runs||[]).map(run=>run.style)])if(!/^Inter(?: Variable)?$/i.test(style.fontFamily)||style.fontWeight%100){used.add(family(style.fontFamily));required.push({family:family(style.fontFamily),weight:style.fontWeight,style:style.fontStyle||'normal',text:n.characters});}}
 if(!used.size||required.every(request=>doc.fonts?.some(font=>family(font.family)===request.family&&font.weightMin<=request.weight&&font.weightMax>=request.weight&&font.style===request.style)))return;
 const descriptors:{family:string;weightMin:number;weightMax:number;style:'normal'|'italic';urls:string[]}[]=[];
 const seen=new Set<string>();let sheets=0;
 const scanRules=async(rules:CSSRuleList,base:string,depth:number):Promise<void>=>{
  for(const rule of Array.from(rules)){
   if(signal.aborted)throw new Error('Capture cancelled.');
   if(rule.type===4&&!window.matchMedia((rule as CSSMediaRule).conditionText).matches)continue;
   if(rule.type===12&&typeof CSS!=='undefined'&&!CSS.supports((rule as CSSSupportsRule).conditionText))continue;
   if(rule.type===5){const style=(rule as CSSFontFaceRule).style,name=style.getPropertyValue('font-family');if(!used.has(family(name)))continue;
    const weights=(style.getPropertyValue('font-weight')||'400').trim().split(/\s+/).map(value=>value==='normal'?400:value==='bold'?700:Number(value));
    if(weights.some(value=>!Number.isFinite(value)||value<100||value>900))continue;
    const faceStyle=/^(italic|oblique)/.test(style.getPropertyValue('font-style'))?'italic':'normal';
    const requests=required.filter(request=>request.family===family(name)&&request.style===faceStyle&&request.weight>=weights[0]&&request.weight<=(weights[1]??weights[0]));
    if(!requests.length)continue;
    const unicode=style.getPropertyValue('unicode-range');
    const ranges=unicode.split(',').map(range=>range.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i)).filter(Boolean);
    if(ranges.length&&!requests.some(request=>Array.from(request.text).some(char=>ranges.some(range=>{const low=parseInt(range![1].replace(/\?/g,'0'),16),high=parseInt((range![2]||range![1]).replace(/\?/g,'F'),16),code=char.codePointAt(0)!;return code>=low&&code<=high;}))))continue;
    const urls:string[]=[];for(const match of style.getPropertyValue('src').matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g)){try{urls.push(new URL(match[1]||match[2]||match[3],base).href);}catch{}}
    descriptors.push({family:name.trim().replace(/^['"]|['"]$/g,''),weightMin:weights[0],weightMax:weights[1]??weights[0],style:faceStyle,urls});
   }else if(rule.type===3&&depth<2){const imported=rule as CSSImportRule;if(imported.styleSheet)await scanSheet(imported.styleSheet,depth+1);}
   else if('cssRules' in rule)await scanRules((rule as CSSGroupingRule).cssRules,base,depth);
  }
 };
 const scanSheet=async(sheet:CSSStyleSheet,depth:number):Promise<void>=>{
  const base=sheet.href||document.baseURI,key=sheet.href||'inline-'+sheets;if(seen.has(key)||sheets>=12)return;seen.add(key);sheets++;
  try{await scanRules(sheet.cssRules,base,depth);}
  catch(error){
   if(signal.aborted)throw error;if(!sheet.href)return;
   try{const text=new TextDecoder().decode(await readUrl(sheet.href,128*1024,signal));const parsed=new CSSStyleSheet();parsed.replaceSync(text);await scanRules(parsed.cssRules,base,depth);}catch{if(signal.aborted)throw new Error('Capture cancelled.');}
  }
 };
 for(const sheet of new Set([...Array.from(document.styleSheets),...(document.adoptedStyleSheets||[])]))await scanSheet(sheet,0);
 const fonts:CapturedFont[]=doc.fonts?[...doc.fonts]:[];
 let retained=fonts.reduce((n,font)=>n+Math.ceil(font.dataUrl.length*3/4),0);
 const downloaded=new Map<string,string>();
 for(const item of descriptors){
  if(fonts.length>=MAX_CAPTURED_FONTS)break;
  for(const url of item.urls){
   if(signal.aborted)throw new Error('Capture cancelled.');
   try{
    let dataUrl=downloaded.get(url);if(!dataUrl){const bytes=await readUrl(url,MAX_FONT_BYTES,signal);dataUrl=fontData(bytes);downloaded.set(url,dataUrl);}
    if(fonts.some(font=>family(font.family)===family(item.family)&&font.weightMin===item.weightMin&&font.weightMax===item.weightMax&&font.style===item.style&&font.dataUrl===dataUrl))break;
    const size=Math.ceil(dataUrl.length*3/4);if(retained+size>MAX_TOTAL_FONT_BYTES)break;
    const {urls:_,...descriptor}=item;fonts.push({...descriptor,dataUrl});doc.fonts=fonts;retained+=size;break;
   }catch{if(signal.aborted)throw new Error('Capture cancelled.');}
  }
 }
 if(fonts.length)doc.fonts=fonts;
 for(const name of used)if(!fonts.some(font=>family(font.family)===name))doc.diagnostics.warnings.push('Web font unavailable for export: '+name+'. Native copy will report any substitution.');
}

export async function captureFonts(doc:SceneGraphDocument,signal:AbortSignal):Promise<void>{
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const timer=setTimeout(abort,5000);
 try{await collectFonts(doc,controller.signal);}
 catch{if(signal.aborted)throw new Error('Capture cancelled.');doc.diagnostics.warnings.push('Web-font capture did not complete within its resource/time budget; unavailable faces will use an explicit fallback.');}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
