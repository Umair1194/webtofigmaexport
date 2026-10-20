// Browser DOM -> capture -> native clipboard -> decoded paint comparison; no clipboard writes.
import {capturePage} from '@frameforge/dom-capture';
import {buildNativeClipboard} from '../apps/chrome-extension/src/clipboard/native.js';
import {parseFigmaClipboard} from '@open-pencil/fig/clipboard';
const cases=[
  ['Non-square diagonal','linear-gradient(45deg, #f97316, #2563eb)'],
  ['CSS corner direction','linear-gradient(to bottom right, #f97316, #2563eb)'],
  ['Omitted and double stops','linear-gradient(90deg, #ef4444 20%, #22c55e, #3b82f6 80%, #fff 80% 100%)'],
  ['Pixels outside the box','linear-gradient(90deg, #ef4444 -80px, #3b82f6 400px)'],
  ['Off-centre ellipse','radial-gradient(ellipse 140px 60px at 25% 75%, #fff, #2563eb)'],
  ['Circle, farthest corner','radial-gradient(circle at 30% 40%, #f97316, #1e1b4b)'],
  ['Transparency and layers','linear-gradient(45deg, rgba(255,0,0,.7), transparent), linear-gradient(90deg, #2563eb, #fff)'],
  ['Modern CSS colours','linear-gradient(90deg, oklch(65% .2 35), color(srgb .1 .3 1))'],
];
const main=document.querySelector('main')!;
const report=document.querySelector('#report')!;
const escaped=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
let count=0;const notes:string[]=[];
for(const [label,css] of cases){
  const section=document.createElement('section');section.innerHTML=`<h2>${label}</h2><div class="pair"><div class="source swatch"></div><div class="decoded swatch"></div></div>`;main.append(section);
  const source=section.querySelector<HTMLElement>('.source')!;source.style.backgroundImage=css;source.style.backgroundColor='#fff';
  const doc=capturePage(source,{captureMode:'SELECTED_ELEMENT'});
  const output=await buildNativeClipboard(doc),decoded=(await parseFigmaClipboard(output.html))!;
  const paints=decoded.nodes.find(n=>n.name!=='Page Capture'&&n.fillPaints?.some(p=>p.type?.startsWith('GRADIENT')))?.fillPaints||[];
  if(!paints.some(p=>p.type?.startsWith('GRADIENT')))throw new Error('Missing native gradient: '+label);
  let defs='',rects='';
  for(const [i,p] of [...paints].reverse().entries()){
    if(p.type==='SOLID'){const c=p.color!;rects+=`<rect width="320" height="100" fill="rgb(${c.r*255} ${c.g*255} ${c.b*255})" opacity="${p.opacity}"/>`;continue;}
    const t=p.transform!,det=t.m00*t.m11-t.m01*t.m10,a=t.m11/det,b=-t.m10/det,c=-t.m01/det,d=t.m00/det;
    const matrix=`matrix(${a} ${b} ${c} ${d} ${-a*t.m02-c*t.m12} ${-b*t.m02-d*t.m12})`;
    const stops=p.stops!.map(s=>`<stop offset="${s.position}" stop-color="rgb(${s.color.r*255} ${s.color.g*255} ${s.color.b*255})" stop-opacity="${s.color.a}"/>`).join('');
    const id='g'+count+'-'+i,tag=p.type==='GRADIENT_RADIAL'?'radialGradient':'linearGradient',axis=p.type==='GRADIENT_RADIAL'?'cx=".5" cy=".5" r=".5"':'x1="0" y1=".5" x2="1" y2=".5"';
    defs+=`<${tag} id="${id}" ${axis} gradientTransform="${matrix}">${stops}</${tag}>`;
    rects+=`<rect width="320" height="100" fill="url(#${id})"/>`;
  }
  section.querySelector('.decoded')!.innerHTML=`<svg viewBox="0 0 320 100"><defs>${defs}</defs>${rects}</svg>`;
  notes.push(...output.warnings);count++;
}
report.textContent=`${count} real-browser captures encoded and decoded. Left: CSS source. Right: decoded native paints rendered as SVG. This checks paint data, not Figma canvas acceptance. ${[...new Set(notes)].map(escaped).join(' ')}`;
report.setAttribute('data-passed',String(count));
