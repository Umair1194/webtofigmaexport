import { capturePageAsync } from '../packages/dom-capture/src/capture.js';
import { buildNativeClipboard } from '../apps/chrome-extension/src/clipboard/native.js';
import { parseFigmaClipboard } from '@open-pencil/fig/clipboard';
(async()=>{
  const report=document.getElementById('report')!;
  try {
    await document.fonts.ready;
    const capture=await capturePageAsync(document.getElementById('fixture')!,{captureMode:'SELECTED_ELEMENT',inferAutoLayout:true});
    const texts:any[]=[];const stack:any[]=[capture.root];while(stack.length){const n=stack.pop();if(n.type==='TEXT')texts.push(n);if(n.children)stack.push(...n.children);}
    const heading=texts.find(n=>n.characters.includes('What brings'));
    const continuation=texts.find(n=>n.characters.includes('You choose'));
    if(heading.fragments?.length!==1)throw Error('Browser heading did not stay on one line');
    if(continuation.fragments?.length<2||continuation.fragments[0].bounds.x<10)throw Error('Browser inline continuation did not retain an indented first line');
    const output=await buildNativeClipboard(capture),parsed=(await parseFigmaClipboard(output.html))!;
    const title=parsed.nodes.find(n=>n.textData?.characters===heading.characters)!;
    const note=parsed.nodes.find(n=>n.textData?.characters===continuation.characters)!;
    if(title.derivedTextData?.baselines?.length!==1)throw Error('Native heading gained a line');
    const lines=note.derivedTextData!.baselines!;
    if(Math.abs(lines[0].position.x-continuation.fragments[0].bounds.x)>.01)throw Error('Native inline first-line indent changed');
    if(Math.abs(lines[1].position.x-continuation.fragments[1].bounds.x)>.01)throw Error('Native inline second-line indent changed');
    const lineDelta=lines[1].position.y-lines[0].position.y;
    if(Math.abs(lineDelta-(continuation.fragments[1].bounds.y-continuation.fragments[0].bounds.y))>1)throw Error('Native line spacing changed');
    report.textContent='PASS: real browser DOM capture → native clipboard\n'+JSON.stringify({headingLines:1,inlineLineOrigins:lines.map(l=>l.position.x),inlineBaselineSpacing:lineDelta,editableTextLayers:parsed.nodes.filter(n=>n.type==='TEXT').length},null,2);
    document.documentElement.dataset.result='pass';
  }catch(error){report.textContent='FAIL: '+(error as Error).stack;document.documentElement.dataset.result='fail';}
})();
