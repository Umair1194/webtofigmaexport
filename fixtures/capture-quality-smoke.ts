import {capturePageAsync} from '@frameforge/dom-capture';
import {loadCaptureImage} from '../apps/chrome-extension/src/content/images.js';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
import type {SceneNode} from '@frameforge/scene-graph';
const report=document.querySelector('#report')!;
try {
 let brokerRequests=0;
 (window as any).chrome={runtime:{sendMessage:async(message:any)=>{if(message.type==='FETCH_CAPTURE_IMAGE'){brokerRequests++;return (await fetch('/broker-image')).json();}return {status:'ok'};}}};
 const local=new Image();local.src='/image.png';await local.decode();
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;canvas.getContext('2d')!.drawImage(local,0,0);
 const webp=document.querySelector<HTMLImageElement>('#webp')!;webp.src=canvas.toDataURL('image/webp');
 await Promise.all(Array.from(document.images).map(img=>img.decode()));
 const doc=await capturePageAsync(document.querySelector('#fixture')!,{captureMode:'SELECTED_ELEMENT'});
 let paragraph:any;const stack:SceneNode[]=[doc.root];let embedded=0;
 while(stack.length){const node=stack.pop()!;if(node.type==='FRAME')stack.push(...node.children);if(node.type==='TEXT'&&node.characters.startsWith('This paragraph'))paragraph=node;
 if(node.type==='IMAGE'&&node.srcUrl){const result=await loadCaptureImage(node.srcUrl,new AbortController().signal);if(!result.dataUrl)throw new Error(result.error);node.dataUrl=result.dataUrl;embedded++;}}
 if(!paragraph?.runs?.some((r:any)=>r.style.fontWeight===700)||!paragraph.characters.includes('\n')||!paragraph.characters.includes('keeps its bold'))throw new Error('Paragraph styles or line break missing');
 const output=await buildNativeClipboard(doc),parsed=(await parseFigmaClipboard(output.html))!;
 const paragraphs=parsed.nodes.filter(n=>n.type==='TEXT'&&n.textData?.characters.startsWith('This paragraph'));
 if(paragraphs.length!==1||!paragraphs[0].textData!.styleOverrideTable?.some(s=>s.fontName?.style==='Bold'))throw new Error('Paragraph was split or lost its bold style');
 const imagePaints=parsed.nodes.flatMap(n=>n.fillPaints||[]).filter(p=>p.type==='IMAGE');
 if(imagePaints.length!==2||imagePaints.some(p=>p.image?.dataBlob===undefined))throw new Error('Raster payload missing');
 for(const paint of imagePaints){const bytes=parsed.blobs[paint.image!.dataBlob!];if(bytes[0]!==137||bytes[1]!==80)throw new Error('Portable PNG conversion missing');const image=new Image();image.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'}));document.querySelector('#decoded')!.append(image);}
 const layouts=parsed.nodes.filter(n=>n.stackMode==='VERTICAL'||n.stackMode==='HORIZONTAL').length;
 if(brokerRequests!==1||layouts<4)throw new Error('Broker recovery or nested layout missing');
 report.textContent=`PASS\nOne paragraph TEXT layer; bold style ranges and explicit newline preserved.\n${paragraphs[0].derivedTextData!.baselines!.length} measured paragraph lines; ${layouts} Auto Layout frames.\n${embedded} raster images embedded; ${brokerRequests} CORS failure recovered through the test broker.\nWebP converted to PNG. Decoded clipboard images shown below.\nChrome messaging is simulated by a local server. Actual Figma rendering is unverified.`;
 report.setAttribute('data-passed','true');
} catch(error){report.textContent='FAIL: '+(error instanceof Error?error.message:String(error));report.setAttribute('data-passed','false');throw error;}
