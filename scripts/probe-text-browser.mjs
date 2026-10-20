import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { build } from 'esbuild';
const directory=path.join(os.tmpdir(),'frameforge-text-fragments');
fs.mkdirSync(directory,{recursive:true});
await build({entryPoints:['scripts/probe-text-browser-entry.ts'],bundle:true,outfile:path.join(directory,'probe.js'),platform:'browser',loader:{'.woff2':'binary'},alias:{'@frameforge/scene-graph':'./packages/scene-graph/src/index.ts','@frameforge/style-normalizer':'./packages/style-normalizer/src/index.ts','@frameforge/shared-protocol':'./packages/shared-protocol/src/index.ts'}});
fs.copyFileSync('fixtures/text-layout-smoke.html',path.join(directory,'index.html'));
console.log('Built browser regression fixture: '+directory);
if(process.argv.includes('--serve')){
  http.createServer((request,response)=>{
    const name=request.url==='/probe.js'?'probe.js':'index.html';
    response.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/html');
    response.end(fs.readFileSync(path.join(directory,name)));
  }).listen(38473,'127.0.0.1',()=>console.log('Open http://127.0.0.1:38473 and check PASS. This is a DOM/export test, not Figma rendering.'));
}
