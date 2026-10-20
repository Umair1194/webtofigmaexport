// Synthetic DOM throughput only; this does not measure browser layout or Figma.
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'frameforge-benchmark-'));
const output = path.join(directory, 'capture.mjs');
try {
  await build({ entryPoints:['packages/dom-capture/src/index.ts'],bundle:true,format:'esm',platform:'node',outfile:output,alias:Object.fromEntries(['scene-graph','style-normalizer'].map(name=>[`@frameforge/${name}`,path.resolve(`packages/${name}/src/index.ts`)])) });
  const {capturePageAsync} = await import(pathToFileURL(output).href);
  const results=[];
  for(const size of [100,1000,2500]) {
    const durations=[];let count=0;
    for(let run=0;run<5;run++) {
      const win=new Window({width:1440,height:900});globalThis.window=win;globalThis.document=win.document;globalThis.Node=win.Node;
      for(let i=0;i<size;i++){const el=win.document.createElement('div');el.getBoundingClientRect=()=>({left:0,top:i*20,width:200,height:20});win.document.body.appendChild(el);}
      win.document.body.getBoundingClientRect=()=>({left:0,top:0,width:1440,height:size*20});
      const started=performance.now();const doc=await capturePageAsync(win.document.body,{captureMode:'FULL_PAGE'});durations.push(performance.now()-started);count=doc.diagnostics.totalNodesCaptured;win.happyDOM.abort();
    }
    durations.sort((a,b)=>a-b);results.push({sourceElements:size,capturedNodes:count,p50Ms:Math.round(durations[2]),maxMs:Math.round(durations[4])});
  }
  console.log(JSON.stringify({node:process.version,platform:process.platform,results},null,2));
} finally { await fs.rm(directory,{recursive:true,force:true}); }
