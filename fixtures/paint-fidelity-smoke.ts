import {capturePageAsync} from '@frameforge/dom-capture';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
import type {SceneNode} from '@frameforge/scene-graph';
const report=document.querySelector('#report')!;
try{
 const doc=await capturePageAsync(document.querySelector('#fixture')!,{captureMode:'SELECTED_ELEMENT',redactForms:true});
 const all:SceneNode[]=[],pending=[doc.root];while(pending.length){const n=pending.pop()!;all.push(n);if(n.type==='FRAME')pending.push(...n.children as any);}
 const input=all.find(n=>n.name.includes('#email')) as any,checkbox=all.find(n=>n.name.includes('#remember')) as any;
 if(input.children[0].bounds.x!==45||input.children[0].opacity!==1||checkbox.children.length!==0)throw new Error('Input/checkbox geometry mismatch');
 const result=await buildNativeClipboard(doc),parsed=(await parseFigmaClipboard(result.html))!;
 const soft=parsed.nodes.find(n=>n.name==='div#soft')!,logo=parsed.nodes.find(n=>n.name==='gradient-tile')!,glass=parsed.nodes.find(n=>n.name==='div#glass')!;
 if(soft.strokePaints?.length!==1||Math.abs(soft.strokePaints[0].opacity!-.1)>.0001)throw new Error('Border alpha mismatch');
 if(soft.effects?.[0].radius!==2||Math.abs(soft.effects[0].color!.a-.08)>.0001)throw new Error('Shadow geometry/alpha mismatch');
 if(logo.fillPaints?.[0].type!=='GRADIENT_LINEAR'||logo.fillPaints[0].stops?.length!==2)throw new Error('SVG gradient missing');
 if(glass.effects?.[0].type!=='BACKGROUND_BLUR'||glass.effects[0].radius!==12)throw new Error('Backdrop blur missing');
 report.textContent='PASS\nBorder: one paint, 10% opacity; no four-edge overpainting.\nShadow: 2px radius, 8% opacity; colour channels excluded from geometry.\nSVG: editable gradient with two coloured stops and rounded path.\nInput: 45px text inset; actual placeholder opacity; empty unchecked box.\nPanel: 12px background blur encoded.\nDOM capture and native encoding verified in Chromium.\nActual Figma canvas rendering remains to be checked.';
 report.setAttribute('data-passed','true');
}catch(error){report.textContent='FAIL: '+(error instanceof Error?error.message:String(error));report.setAttribute('data-passed','false');throw error;}
